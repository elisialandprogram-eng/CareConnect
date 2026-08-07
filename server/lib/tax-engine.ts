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
}

export interface TaxCalculation {
  ratePercent: number;
  taxableSubtotal: number;
  amount: number;
}

export interface TaxBreakdown {
  serviceTaxRate: number;
  serviceTaxableSubtotal: number;
  serviceTax: number;
  platformTaxRate: number;
  platformTaxableSubtotal: number;
  platformTax: number;
  totalTax: number;
  taxVersion: string;
  calculatedAt: string;
  serviceRuleId: string | null;
  platformRuleId: string | null;
}

export interface TaxCalculationInput {
  /** Provider-delivered charges: base, visit, travel, emergency, add-ons. */
  serviceSubtotal: number;
  /** Platform-generated charges: platform/gateway/admin/convenience fees. */
  platformSubtotal: number;
  /** A promotion reduces both buckets proportionally. */
  discount?: number | null;
  serviceTaxRatePercent?: number | null;
  platformTaxRatePercent?: number | null;
  serviceRuleId?: string | null;
  platformRuleId?: string | null;
}

const finite = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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
  const discount = Math.min(gross, Math.max(0, finite(input.discount)));
  const discountRatio = gross > 0 ? discount / gross : 0;

  const serviceTaxableSubtotal = round2(serviceGross * (1 - discountRatio));
  const platformTaxableSubtotal = round2(platformGross * (1 - discountRatio));
  const serviceTaxRate = Math.max(0, finite(input.serviceTaxRatePercent));
  const platformTaxRate = Math.max(0, finite(input.platformTaxRatePercent));
  const serviceTax = round2(serviceTaxableSubtotal * (serviceTaxRate / 100));
  const platformTax = round2(platformTaxableSubtotal * (platformTaxRate / 100));

  return {
    serviceTaxRate,
    serviceTaxableSubtotal,
    serviceTax,
    platformTaxRate,
    platformTaxableSubtotal,
    platformTax,
    totalTax: round2(serviceTax + platformTax),
    taxVersion: TAX_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    serviceRuleId: input.serviceRuleId ?? null,
    platformRuleId: input.platformRuleId ?? null,
  };
}

/**
 * Backwards-compatible scalar result for old callers. The calculation still
 * goes through the canonical engine; new code should use calculateTaxBreakdown.
 */
export function calculateTax(
  taxableSubtotal: number,
  serviceRatePercent?: number | null,
  platformRatePercent?: number | null,
): TaxCalculation {
  const result = calculateTaxBreakdown({
    serviceSubtotal: taxableSubtotal,
    platformSubtotal: 0,
    serviceTaxRatePercent: serviceRatePercent,
    platformTaxRatePercent: platformRatePercent,
  });
  return {
    ratePercent: result.serviceTaxRate,
    taxableSubtotal: result.serviceTaxableSubtotal,
    amount: result.totalTax,
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
 * Missing rules intentionally resolve to 0% and emit a warning. We never
 * substitute another country's configuration.
 */
export async function loadTaxRules(
  subServiceId: string | null | undefined,
  countryCode: string | null | undefined,
  at = new Date(),
): Promise<TaxRuleSet> {
  const country = String(countryCode ?? "").trim().toUpperCase();
  if (!country) {
    console.warn("[tax-engine] missing country configuration; using 0% tax");
    return {};
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

  if (subServiceId && !service) {
    console.warn(`[tax-engine] no active service tax rule for sub_service=${subServiceId}, country=${country}; using 0%`);
  }
  if (!platform) {
    console.warn(`[tax-engine] no active platform tax rule for country=${country}; using 0%`);
  }

  return {
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
  return calculateTaxBreakdown({
    ...input,
    // A missing service rule is explicitly 0%; never fall back to another
    // country's setting or the legacy sub_services.tax_percentage field.
    serviceTaxRatePercent: rules.serviceRule ? rules.serviceRule.taxRate : 0,
    // The input fallback is used by the simulator and legacy platform setting
    // callers when a rule row has not yet been created.
    platformTaxRatePercent: rules.platformRule?.taxRate
      ?? input.platformTaxRatePercent
      ?? 0,
    serviceRuleId: rules.serviceRule?.id ?? null,
    platformRuleId: rules.platformRule?.id ?? null,
  });
}