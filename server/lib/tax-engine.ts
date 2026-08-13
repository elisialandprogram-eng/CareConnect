/**
 * Canonical tax engine.
 *
 * This module is the only place where tax rates are resolved and tax amounts
 * are calculated. Pricing supplies already-separated service and platform
 * charge buckets; every downstream consumer reads the resulting snapshot.
 */

import { round2 } from "./math";

export const TAX_ENGINE_VERSION = "tax-v2";

export interface ServiceTaxRule {
  id: string;
  subServiceId: string;
  countryCode: string;
  taxRate: number;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  isActive: boolean;
}

export interface PlatformTaxRule {
  id: string;
  countryCode: string;
  taxRate: number;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  isActive: boolean;
  taxName?: string | null;
}

export interface TaxRuleSet {
  serviceRule?: ServiceTaxRule | null;
  platformRule?: PlatformTaxRule | null;
  countryCode?: string | null;
}

export class TaxConfigurationError extends Error {
  readonly code = "TAX_CONFIGURATION_MISSING";
  readonly countryCode: string;
  readonly subServiceId: string | null;
  readonly missingDomains: Array<"service" | "platform">;

  constructor(opts: {
    countryCode: string;
    subServiceId?: string | null;
    missingDomains: Array<"service" | "platform">;
  }) {
    super(`Required ${opts.missingDomains.join(" and ")} tax configuration is missing for country ${opts.countryCode}`);
    this.name = "TaxConfigurationError";
    this.countryCode = opts.countryCode;
    this.subServiceId = opts.subServiceId ?? null;
    this.missingDomains = opts.missingDomains;
  }
}

export interface TaxBreakdown {
  countryCode: string | null;
  serviceTaxRate: number;
  serviceTaxableSubtotal: number;
  serviceTax: number;
  serviceTaxAmount: number;
  platformTaxRate: number;
  platformTaxableSubtotal: number;
  platformTax: number;
  platformTaxAmount: number;
  totalTax: number;
  taxVersion: string;
  taxEngineVersion: string;
  calculatedAt: string;
  serviceRuleId: string | null;
  platformRuleId: string | null;
}

export interface TaxCalculationInput {
  /** Provider-delivered charges: base, visit, travel, emergency, add-ons. */
  serviceSubtotal: number;
  /** Platform-generated charges: platform/gateway/admin/convenience fees. */
  platformSubtotal: number;
  /** Booking currency. Zero-decimal currencies must not retain fractional tax units. */
  currency?: string | null;
  /** A promotion reduces both buckets proportionally. */
  discount?: number | null;
  /** Payment-method discounts reduce the taxable base by policy. */
  paymentDiscount?: number | null;
  serviceTaxRatePercent?: number | null;
  platformTaxRatePercent?: number | null;
  serviceRuleId?: string | null;
  platformRuleId?: string | null;
}

const finite = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ZERO_DECIMAL_CURRENCIES = new Set(["HUF", "IRR", "JPY", "KRW"]);

/**
 * Tax amounts are returned in booking currency. HUF/IRR have no fractional
 * unit, so truncating here prevents the display formatter from turning a
 * fractional amount such as 256.5 into 257 Ft. USD/EUR/GBP retain cent
 * precision and use normal two-decimal rounding.
 */
function roundTaxAmount(amount: number, currency?: string | null): number {
  const normalized = String(currency ?? "USD").trim().toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(normalized)
    ? Math.trunc(Math.max(0, amount))
    : round2(amount);
}

/**
 * Calculate service and platform tax independently.
 *
 * The discount allocation is deliberately here, not in pricing, so no caller
 * can accidentally apply a country tax rate to the other tax domain.
 */
export function calculateTaxBreakdown(input: TaxCalculationInput): TaxBreakdown {
  const serviceGross = Math.max(0, finite(input.serviceSubtotal));
  const platformGross = Math.max(0, finite(input.platformSubtotal));
  const gross = serviceGross + platformGross;
  const discount = Math.min(
    gross,
    Math.max(0, finite(input.discount)) + Math.max(0, finite(input.paymentDiscount)),
  );
  const discountRatio = gross > 0 ? discount / gross : 0;

  const serviceTaxableSubtotal = round2(serviceGross * (1 - discountRatio));
  const platformTaxableSubtotal = round2(platformGross * (1 - discountRatio));
  const serviceTaxRate = Math.max(0, finite(input.serviceTaxRatePercent));
  const platformTaxRate = Math.max(0, finite(input.platformTaxRatePercent));
  const serviceTax = roundTaxAmount(
    serviceTaxableSubtotal * (serviceTaxRate / 100),
    input.currency,
  );
  const platformTax = roundTaxAmount(
    platformTaxableSubtotal * (platformTaxRate / 100),
    input.currency,
  );

  return {
    countryCode: null,
    serviceTaxRate,
    serviceTaxableSubtotal,
    serviceTax,
    serviceTaxAmount: serviceTax,
    platformTaxRate,
    platformTaxableSubtotal,
    platformTax,
    platformTaxAmount: platformTax,
    totalTax: roundTaxAmount(serviceTax + platformTax, input.currency),
    taxVersion: TAX_ENGINE_VERSION,
    taxEngineVersion: TAX_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    serviceRuleId: input.serviceRuleId ?? null,
    platformRuleId: input.platformRuleId ?? null,
  };
}

function activeAt(
  from: unknown,
  to: unknown,
  at: Date,
): boolean {
  const effectiveFrom = from ? new Date(String(from)) : null;
  const effectiveTo = to ? new Date(String(to)) : null;
  return (!effectiveFrom || effectiveFrom <= at) && (!effectiveTo || effectiveTo >= at);
}

/**
 * Resolve exactly one country-specific service rule and one platform rule.
 * Missing rules are returned as missing and emit a warning. The booking
 * engine rejects them for real quotes/bookings; an explicit 0% row remains
 * valid and distinguishable from missing configuration.
 */
export async function loadTaxRules(
  subServiceId: string | null | undefined,
  countryCode: string | null | undefined,
  at = new Date(),
): Promise<TaxRuleSet> {
  const country = String(countryCode ?? "").trim().toUpperCase();
  if (!country) {
    console.warn("[tax-engine] missing country configuration");
    return { countryCode: null, serviceRule: null, platformRule: null };
  }

  const { pool } = await import("../db") as any;
  const [serviceRows, platformRows] = await Promise.all([
    subServiceId
      ? pool.query(
          `SELECT id, sub_service_id, country_code, tax_rate, effective_from, effective_to, is_active
           FROM sub_service_tax_rules
           WHERE sub_service_id = $1
             AND country_code::text = $2
             AND is_active = true
           ORDER BY effective_from DESC NULLS LAST, updated_at DESC NULLS LAST
           LIMIT 20`,
          [subServiceId, country],
        )
      : Promise.resolve({ rows: [] }),
    pool.query(
      `SELECT id, country AS country_code, tax_rate, effective_from, effective_to, is_active, tax_name
       FROM tax_settings
       WHERE country = $1 AND is_active = true
       ORDER BY effective_from DESC NULLS LAST, year DESC NULLS LAST, id DESC`,
      [country],
    ),
  ]);

  const service = serviceRows.rows.find((row: any) =>
    activeAt(row.effective_from, row.effective_to, at),
  );
  const platform = platformRows.rows.find((row: any) =>
    activeAt(row.effective_from, row.effective_to, at),
  );

  return {
    countryCode: country,
    serviceRule: service
      ? {
          id: String(service.id),
          subServiceId: String(service.sub_service_id),
          countryCode: String(service.country_code),
          taxRate: finite(service.tax_rate),
          effectiveFrom: service.effective_from,
          effectiveTo: service.effective_to,
          isActive: Boolean(service.is_active),
        }
      : null,
    platformRule: platform
      ? {
          id: String(platform.id),
          countryCode: String(platform.country_code),
          taxRate: finite(platform.tax_rate),
          effectiveFrom: platform.effective_from,
          effectiveTo: platform.effective_to,
          isActive: Boolean(platform.is_active),
          taxName: platform.tax_name,
        }
      : null,
  };
}

export function calculateResolvedTax(
  input: TaxCalculationInput,
  rules: TaxRuleSet,
): TaxBreakdown {
  const result = calculateTaxBreakdown({
    ...input,
    // A missing service rule is explicitly 0%; never fall back to another
    // country's setting or an ad-hoc rate.
    serviceTaxRatePercent: rules.serviceRule ? rules.serviceRule.taxRate : 0,
    // Platform tax is canonical too: only the active country rule is valid.
    // Missing configuration intentionally means 0%; never use a caller-
    // supplied legacy or ad-hoc rate as a fallback.
    platformTaxRatePercent: rules.platformRule?.taxRate ?? 0,
    serviceRuleId: rules.serviceRule?.id ?? null,
    platformRuleId: rules.platformRule?.id ?? null,
  });
  return { ...result, countryCode: rules.countryCode ?? null };
}

/**
 * A configured 0% row is valid. An absent row is a financial configuration
 * error for real quotes/bookings and must not be silently treated as 0%.
 */
export function assertTaxConfiguration(
  rules: TaxRuleSet,
  opts: { countryCode?: string | null; subServiceId?: string | null; requireServiceRule: boolean },
): void {
  const country = String(opts.countryCode ?? rules.countryCode ?? "").trim().toUpperCase();
  const missingDomains: Array<"service" | "platform"> = [];
  if (opts.requireServiceRule && !rules.serviceRule) missingDomains.push("service");
  if (!rules.platformRule) missingDomains.push("platform");
  if (missingDomains.length > 0) {
    throw new TaxConfigurationError({
      countryCode: country || "UNKNOWN",
      subServiceId: opts.subServiceId,
      missingDomains,
    });
  }
}