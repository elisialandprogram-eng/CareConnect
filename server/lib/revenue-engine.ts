/**
 * server/lib/revenue-engine.ts
 *
 * THE single source of truth for all appointment financial calculations.
 *
 * All amounts are in USD. The engine:
 *   1. Loads active rules from the DB (platform_fee_rules, commission_rules,
 *      payment_method_rules, travel_fee_rules, revenue_share_rules)
 *   2. Applies them in priority order
 *   3. Returns a comprehensive breakdown covering every money flow:
 *      patient payable, provider earnings, platform revenue, tax, surcharges
 *
 * Legacy computeFinalPrice() is still used as the base calculation kernel.
 * The engine augments it with rule-driven overrides for platform fees,
 * commissions, payment surcharges, and travel fees.
 */

import { computeFinalPrice, type PricingInput, type PricingBreakdown } from "./pricing";
import { round2, roundBookingAmount } from "./math";
import {
  TAX_ENGINE_VERSION,
  calculateResolvedTax,
  loadTaxRules,
  assertTaxConfiguration,
  type TaxBreakdown,
  type TaxRuleSet,
} from "./tax-engine";
import type {
  PlatformFeeRule,
  CommissionRule,
  PaymentMethodRule,
  TravelFeeRule,
  RevenueShareRule,
} from "@shared/schema";

// ── Input / Output types ─────────────────────────────────────────────────────

export interface RevenueEngineInput extends PricingInput {
  paymentMethod?: string | null;
  countryCode?: string | null;
  providerId?: string | null;
  providerType?: string | null;
  serviceCategory?: string | null;
  travelDistanceKm?: number | null;
  /**
   * RX-02: Membership `reduced_commission` benefit.
   * Number of percentage POINTS to subtract from the matched commission rule rate.
   * E.g. if commission rule = 10% and membershipReducedCommissionPercent = 3,
   * effective commission = max(0, 10 - 3) = 7%.
   */
  membershipReducedCommissionPercent?: number | null;
  /** Pre-loaded rules (used by simulator to avoid extra DB round-trips) */
  _preloaded?: RevenueRuleSet;
  /**
   * P-FINAL Rule 1 & 2: Native booking currency (ISO code, e.g. "HUF", "IRR", "USD").
   * Service prices and all returned amounts are in this currency.
   * All percentage-based fees are calculated in this currency.
   * Fixed USD fees from rules are skipped (Rule 3 compliance).
   */
  bookingCurrency?: string | null;
  /**
   * P-FINAL Rule 1: Provider's native currency — mirrors bookingCurrency
   * for domestic bookings; stored as a snapshot on the appointment.
   */
  providerCurrency?: string | null;
  /**
   * P-FINAL Rule 7: Current exchange rates (USD base, e.g. { HUF: 365, IRR: 42000 }).
   * Supplied so the engine can compute finalTotalUsd without a DB round-trip.
   */
  rates?: Record<string, number> | null;
  /** Selected catalog sub-service used for country-specific tax resolution. */
  subServiceId?: string | null;
  /** Pre-resolved tax rules for simulations/tests. */
  _taxRules?: TaxRuleSet;
}

export interface RevenueShare {
  participantType: string;
  label: string;
  amount: number;
  percent: number;
}

export interface AppliedRule {
  ruleType: string;
  ruleName: string;
  impact: string;
}

export interface RevenueEngineResult extends PricingBreakdown {
  taxBreakdown: TaxBreakdown;
  /** Gross service-related subtotal before promo/payment discounts. */
  serviceGrossSubtotal: number;
  /** Additional charges applied by payment method rule */
  paymentSurcharge: number;
  /** Platform-level travel fee applied (home visits) */
  engineTravelFee: number;
  /** Final amount the patient pays (in bookingCurrency) */
  patientPayable: number;
  /** Gross platform revenue (fees + commission, in bookingCurrency) */
  platformRevenue: number;
  /** Provider gross earnings before provider-borne deductions (in bookingCurrency). */
  providerGrossEarnings: number;
  /** Canonical provider net earnings after provider-borne deductions (in bookingCurrency). */
  providerEarnings: number;
  /** Effective commission rate % applied */
  commissionRate: number;
  /** Commission amount deducted from provider (in bookingCurrency) */
  commissionAmount: number;
  /** Revenue split participants */
  revenueShares: RevenueShare[];
  /** Audit trail of which rules were applied */
  appliedRules: AppliedRule[];
  /** P-FINAL Rule 2: ISO currency code all amounts above are denominated in */
  bookingCurrency: string;
  /** P-FINAL Rule 1: Provider's native currency (snapshot) */
  providerCurrency: string;
  /** P-FINAL Rule 7: patientPayable expressed in USD at booking-time rates — for reporting only */
  finalTotalUsd: number;
  /** Immutable booking-contract metadata written with the appointment. */
  pricingEngineVersion: string;
  taxEngineVersion: string;
  pricingCalculatedAt: string;
}

export const PRICING_ENGINE_VERSION = "pricing-v3";

/** Used by quote and promo validation paths without creating a second kernel. */
export async function calculatePrePromoSubtotal(
  input: RevenueEngineInput,
): Promise<number> {
  const result = await runRevenueEngine({ ...input, discount: null });
  return result.taxableSubtotal;
}

export interface RevenueRuleSet {
  platformFeeRules: PlatformFeeRule[];
  commissionRules: CommissionRule[];
  paymentMethodRules: PaymentMethodRule[];
  travelFeeRules: TravelFeeRule[];
  revenueShareRules: RevenueShareRule[];
}

// ── Rule cache ────────────────────────────────────────────────────────────────
// Rules change infrequently (admin UI only). Cache for 30 s to eliminate
// 5 DB round-trips per booking without sacrificing responsiveness.
let _rulesCache: { data: RevenueRuleSet; expiresAt: number } | null = null;
const RULES_CACHE_TTL_MS = 30_000;

/**
 * Bust the in-memory rule cache immediately.
 * Call this whenever admin creates/updates/deletes any rule table row
 * so the next booking picks up the change within one request cycle.
 */
export function invalidateRevenueRulesCache(): void {
  _rulesCache = null;
}

// ── Rule loader ──────────────────────────────────────────────────────────────

export async function loadRevenueRules(): Promise<RevenueRuleSet> {
  if (_rulesCache && Date.now() < _rulesCache.expiresAt) return _rulesCache.data;

  // Use raw SQL (not Drizzle) to avoid timestamp vs timestamptz cast issues
  // on Supabase. Pool returns snake_case — we manually map to camelCase below.
  const { pool } = await import("../db") as any;

  const [pfr, cr, pmr, tfr, rsr] = await Promise.all([
    pool.query(`
      SELECT * FROM platform_fee_rules
      WHERE enabled = true
        AND (effective_from IS NULL OR effective_from <= NOW())
        AND (effective_to   IS NULL OR effective_to   >= NOW())
      ORDER BY priority ASC
    `),
    pool.query(`
      SELECT * FROM commission_rules
      WHERE enabled = true
        AND (effective_from IS NULL OR effective_from <= NOW())
        AND (effective_to   IS NULL OR effective_to   >= NOW())
      ORDER BY priority ASC
    `),
    pool.query(`
      SELECT * FROM payment_method_rules
      WHERE enabled = true AND maintenance_mode = false
      ORDER BY priority ASC
    `),
    pool.query(`
      SELECT * FROM travel_fee_rules
      WHERE enabled = true
        AND (effective_from IS NULL OR effective_from <= NOW())
        AND (effective_to   IS NULL OR effective_to   >= NOW())
      ORDER BY priority ASC
    `),
    pool.query(`
      SELECT * FROM revenue_share_rules
      WHERE enabled = true
        AND (effective_from IS NULL OR effective_from <= NOW())
        AND (effective_to   IS NULL OR effective_to   >= NOW())
      ORDER BY priority ASC
    `),
  ]);

  // Camelize snake_case column names from raw SQL results
  const cam = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      out[camel] = v;
    }
    return out;
  };

  const data: RevenueRuleSet = {
    platformFeeRules:   pfr.rows.map(cam)  as PlatformFeeRule[],
    commissionRules:    cr.rows.map(cam)   as CommissionRule[],
    paymentMethodRules: pmr.rows.map(cam)  as PaymentMethodRule[],
    travelFeeRules:     tfr.rows.map(cam)  as TravelFeeRule[],
    revenueShareRules:  rsr.rows.map(cam)  as RevenueShareRule[],
  };

  console.log(
    `[revenue-engine] rules loaded — pf:${data.platformFeeRules.length}` +
    ` comm:${data.commissionRules.length}` +
    ` pm:${data.paymentMethodRules.length}` +
    ` tf:${data.travelFeeRules.length}` +
    ` rs:${data.revenueShareRules.length}`
  );

  _rulesCache = { data, expiresAt: Date.now() + RULES_CACHE_TTL_MS };
  return data;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: unknown, fb = 0): number => {
  if (v === null || v === undefined || v === "") return fb;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fb;
};

function matchesScope(
  rule: Pick<PlatformFeeRule, "targetScope" | "countryCode" | "providerType" | "serviceCategory" | "modality">,
  ctx: { countryCode?: string | null; providerType?: string | null; serviceCategory?: string | null; modality?: string | null }
): boolean {
  if (rule.targetScope === "global") return true;
  if (rule.targetScope === "country")       return !rule.countryCode    || rule.countryCode    === ctx.countryCode;
  if (rule.targetScope === "provider_type") return !rule.providerType   || rule.providerType   === ctx.providerType;
  if (rule.targetScope === "category")      return !rule.serviceCategory|| rule.serviceCategory=== ctx.serviceCategory;
  if (rule.targetScope === "modality")      return !rule.modality       || rule.modality       === ctx.modality;
  return false;
}

function applyFeeRule(rule: PlatformFeeRule, base: number, bookingCurrency?: string): number {
  const pct   = n(rule.percentValue, 0);
  const fixed = n(rule.fixedAmount,  0);
  let fee = 0;
  // Historical rows use both "percent" and "percentage"; treat them as the
  // same persisted rule type so legacy admin configuration remains effective.
  if (rule.feeType === "percent" || rule.feeType === "percentage") {
    fee = base * (pct / 100);
  } else if (rule.feeType === "fixed") {
    // P-FINAL Rule 3: Fixed USD fees are banned for non-USD booking currencies.
    // They are exchange-rate sensitive and violate pricing stability.
    // Log a compliance warning and treat as 0 — convert the rule to percentage.
    if (bookingCurrency && bookingCurrency !== "USD") {
      console.warn(
        `[revenue-engine] Rule-3 violation: fee rule "${rule.name}" uses feeType=fixed ` +
        `(fixed_amount=${fixed} USD) but booking currency is ${bookingCurrency}. ` +
        `Fixed USD fees are banned. Treating as 0 — please convert to percentage.`
      );
      fee = 0;
    } else {
      fee = fixed;
    }
  } else if (rule.feeType === "hybrid") {
    // For hybrid in non-USD: apply percent component only; skip fixed USD component.
    const fixedComponent = (bookingCurrency && bookingCurrency !== "USD") ? 0 : fixed;
    fee = base * (pct / 100) + fixedComponent;
  }
  // Only apply min/max if explicitly set to a positive value.
  // A stored value of 0 means "not configured" (the form defaults to 0),
  // NOT "cap the fee at zero". Treating 0 as a cap would silently zero out
  // every platform fee rule, which is the bug we are fixing here.
  const minFeeParsed = n(rule.minFee, 0);
  const maxFeeParsed = n(rule.maxFee, 0);
  if (minFeeParsed > 0) fee = Math.max(fee, minFeeParsed);
  if (maxFeeParsed > 0) fee = Math.min(fee, maxFeeParsed);
  return roundBookingAmount(fee, bookingCurrency);
}

function selectCommissionRule(
  rules: CommissionRule[],
  ctx: { providerId?: string | null; providerType?: string | null; serviceCategory?: string | null; countryCode?: string | null }
): CommissionRule | null {
  // Most specific first: provider_specific > category_specific > tier > global
  const specificity: Record<string, number> = {
    provider_specific: 0,
    category_specific: 1,
    promotional:       2,
    tier:              3,
    global:            4,
  };
  const active = rules
    .filter(r => {
      if (r.commissionType === "provider_specific") return r.providerId === ctx.providerId;
      if (r.commissionType === "category_specific") return !r.serviceCategory || r.serviceCategory === ctx.serviceCategory;
      if (r.commissionType === "tier")              return !r.providerType    || r.providerType    === ctx.providerType;
      if (r.commissionType === "global")            return true;
      return true;
    })
    .filter(r => !r.countryCode || r.countryCode === ctx.countryCode);
  active.sort((a, b) => (specificity[a.commissionType] ?? 9) - (specificity[b.commissionType] ?? 9));
  return active[0] ?? null;
}

function paymentAdjustmentParts(
  rule: PaymentMethodRule | undefined,
  subtotal: number,
  bookingCurrency?: string,
): { surcharge: number; discount: number } {
  if (!rule) return { surcharge: 0, discount: 0 };
  const val = n(rule.surchargeValue, 0);
  const disc = n(rule.discountValue, 0);
  let surcharge = 0;
  let discount = 0;
  if (rule.surchargeType === "percent") surcharge += subtotal * (val / 100);
  if (rule.surchargeType === "fixed") surcharge += val;
  if (rule.discountType === "percent") discount += subtotal * (disc / 100);
  if (rule.discountType === "fixed") discount += disc;
  return {
    surcharge: roundBookingAmount(surcharge, bookingCurrency),
    discount: roundBookingAmount(discount, bookingCurrency),
  };
}

function replaceTaxLines(
  lines: PricingBreakdown["lines"],
  tax: TaxBreakdown,
): PricingBreakdown["lines"] {
  return [
    ...lines.filter(line => !/^tax\b/i.test(line.label)),
    { label: `Service tax (${tax.serviceTaxRate}%)`, amount: tax.serviceTax },
    { label: `Platform tax (${tax.platformTaxRate}%)`, amount: tax.platformTax },
    { label: "Total tax", amount: tax.totalTax },
  ];
}

function computeTravelFee(
  rules: TravelFeeRule[],
  visitType: string,
  distanceKm: number | null | undefined,
  ctx: { countryCode?: string | null; providerType?: string | null },
  bookingCurrency?: string,
): number {
  if (visitType !== "home") return 0;
  const applicable = rules.filter(r =>
    (!r.countryCode   || r.countryCode   === ctx.countryCode) &&
    (!r.providerType  || r.providerType  === ctx.providerType)
  );
  if (!applicable.length) return 0;
  const rule = applicable[0];
  const dist = distanceKm ?? 0;
  if (rule.feeType === "flat")     return roundBookingAmount(n(rule.flatAmount, 0), bookingCurrency);
  if (rule.feeType === "distance") return roundBookingAmount(dist * n(rule.perKmRate, 0), bookingCurrency);
  if (rule.feeType === "radius") {
    const radius = n(rule.radiusKm, 0);
    return dist <= radius ? 0 : roundBookingAmount((dist - radius) * n(rule.perKmRate, 0), bookingCurrency);
  }
  return roundBookingAmount(n(rule.flatAmount, 0), bookingCurrency);
}

// ── Main engine ──────────────────────────────────────────────────────────────

export async function runRevenueEngine(input: RevenueEngineInput): Promise<RevenueEngineResult> {
  const rules = input._preloaded ?? await loadRevenueRules();
  const taxRules = input._taxRules ?? await loadTaxRules(input.subServiceId, input.countryCode);
  if (!input._taxRules) {
    assertTaxConfiguration(taxRules, {
      countryCode: input.countryCode,
      subServiceId: input.subServiceId,
      requireServiceRule: Boolean(input.subServiceId),
    });
  }

  // P-FINAL: Resolve booking and provider currencies (Rules 1 & 2).
  // All amounts calculated below are in bookingCurrency.
  const bookingCurrency  = input.bookingCurrency  || input.currency || "USD";
  const providerCurrency = input.providerCurrency || bookingCurrency;
  const roundAmount = (value: number) => roundBookingAmount(value, bookingCurrency);

  // 1. Base pricing via legacy kernel (handles membership, promo, surge, tax)
  const base: PricingBreakdown = computeFinalPrice({ ...input, currency: bookingCurrency, deferTax: true });
  const appliedRules: AppliedRule[] = [];

  const ctx = {
    countryCode:     input.countryCode    ?? null,
    providerType:    input.providerType   ?? null,
    serviceCategory: input.serviceCategory ?? null,
    modality:        input.visitType,
  };

  // 2. Platform fee override from rules engine (replaces hardcoded fee if rule found)
  //    P-FINAL Rule 3: applyFeeRule warns + zeroes fixed fees for non-USD currencies.
  let enginePlatformFee = base.platformFee;
  const pfRule = rules.platformFeeRules.find(r => matchesScope(r, ctx));
  if (pfRule) {
    enginePlatformFee = applyFeeRule(pfRule, base.base, bookingCurrency);
    console.log(`[revenue-engine] platform fee rule matched: "${pfRule.name}" → ${enginePlatformFee} ${bookingCurrency} (base=${base.base})`);
    appliedRules.push({
      ruleType: "platform_fee",
      ruleName: pfRule.name,
      impact: `Fee overridden to ${enginePlatformFee} ${bookingCurrency}`,
    });
  } else {
    console.log(`[revenue-engine] no platform fee rule matched (${rules.platformFeeRules.length} total rules, ctx scope=${ctx.countryCode ?? "any"}/${ctx.providerType ?? "any"})`);
  }

  // 3. Commission rule
  const commRule = selectCommissionRule(rules.commissionRules, {
    providerId: input.providerId,
    providerType: input.providerType,
    serviceCategory: input.serviceCategory,
    countryCode: input.countryCode,
  });
  // When no commission rule is configured by the admin, commission is 0 —
  // the engine never silently applies a hardcoded default rate.
  const baseCommissionRate = commRule ? n(commRule.commissionPercent, 0) : 0;
  // RX-02: apply membership reduced_commission benefit (subtracts percentage points)
  const membershipReduction = Math.max(0, input.membershipReducedCommissionPercent ?? 0);
  const commissionRate   = Math.max(0, baseCommissionRate - membershipReduction);
  const commissionAmount = roundAmount(base.base * (commissionRate / 100));
  if (commRule) {
    appliedRules.push({
      ruleType: "commission",
      ruleName: commRule.name,
      impact: membershipReduction > 0
        ? `${baseCommissionRate}% − ${membershipReduction}% member reduction = ${commissionRate}% → ${commissionAmount} ${bookingCurrency}`
        : `${commissionRate}% commission = ${commissionAmount} ${bookingCurrency}`,
    });
  }

  // 4. Travel fee
  // Travel is a service-related charge, so it must be known before payment
  // adjustments and tax bases are calculated.
  const engineTravelFee = computeTravelFee(
    rules.travelFeeRules,
    input.visitType,
    input.travelDistanceKm,
    ctx,
    bookingCurrency,
  );
  if (engineTravelFee > 0) {
    const tfRule = rules.travelFeeRules[0];
    appliedRules.push({
      ruleType: "travel_fee",
      ruleName: tfRule?.name ?? "Travel fee",
      impact: `Travel fee ${engineTravelFee} ${bookingCurrency}`,
    });
  }

  // 5. Payment surcharge/discount
  // Policy: payment discounts reduce the taxable base; surcharges increase the
  // platform taxable bucket. Calculate against the final pre-payment subtotal
  // so quote and booking cannot diverge when travel/platform fees are present.
  const pmRule = rules.paymentMethodRules.find(r =>
    r.paymentMethod === (input.paymentMethod ?? "cash") &&
    (!r.allowedCountries?.length || r.allowedCountries.includes(input.countryCode ?? ""))
  );
  const platformFeeDelta = roundAmount(enginePlatformFee - base.platformFee);
  const paymentBase = roundAmount(Math.max(0, base.total + platformFeeDelta + engineTravelFee));
  const paymentParts = paymentAdjustmentParts(pmRule, paymentBase, bookingCurrency);
  const paymentSurcharge = roundAmount(paymentParts.surcharge - paymentParts.discount);
  if (pmRule && paymentSurcharge !== 0) {
    appliedRules.push({
      ruleType: "payment_method",
      ruleName: pmRule.label,
      impact: `Surcharge/discount ${paymentSurcharge} ${bookingCurrency}`,
    });
  }

  // 6. Final patient payable (in bookingCurrency)
  // base.total already contains base.platformFee from computeFinalPrice.
  // When the engine overrides with a rule-based fee, add the delta so the
  // patient is actually charged the rule amount, not the sub-service default.
  const serviceGrossSubtotal = roundAmount(Math.max(
    0,
    base.base - base.membershipDiscount + base.visitTypeFee + base.surge + base.emergencyFee + engineTravelFee,
  ));
  const taxBreakdown = calculateResolvedTax({
    serviceSubtotal: serviceGrossSubtotal,
    platformSubtotal: Math.max(0, enginePlatformFee + paymentParts.surcharge),
    currency: bookingCurrency,
    discount: base.discount,
    paymentDiscount: paymentParts.discount,
    // Rates are supplied only by calculateResolvedTax() from canonical rules.
    serviceTaxRatePercent: 0,
    platformTaxRatePercent: 0,
  }, taxRules);
  const taxableSubtotal = roundAmount(base.taxableSubtotal + platformFeeDelta + paymentSurcharge + engineTravelFee);
  const total = roundAmount(taxableSubtotal + taxBreakdown.totalTax);
  const patientPayable = total;

  // 7. Provider economics are independent from the patient total. Service
  // charges and service tax belong to the provider; platform tax does not.
  // The tax engine has already allocated discounts across the two domains, so
  // serviceTaxableSubtotal is the authoritative provider service base.
  const providerGrossEarnings = roundAmount(
    taxBreakdown.serviceTaxableSubtotal + taxBreakdown.serviceTax,
  );
  const providerEarnings = roundAmount(Math.max(0, providerGrossEarnings - commissionAmount));

  // 8. Platform revenue = fees + commission + surcharge (in bookingCurrency)
  const platformRevenue = roundAmount(enginePlatformFee + commissionAmount + Math.max(0, paymentSurcharge));

  // 9. Revenue shares
  const revenueShares: RevenueShare[] = rules.revenueShareRules
    .filter(r =>
      (!r.countryCode    || r.countryCode    === input.countryCode) &&
      (!r.providerType   || r.providerType   === input.providerType) &&
      (!r.serviceCategory|| r.serviceCategory=== input.serviceCategory)
    )
    .map(r => {
      const pct = n(r.sharePercent, 0);
      const fixed = n(r.fixedAmount, 0);
      const amount = roundAmount(platformRevenue * (pct / 100) + fixed);
      return {
        participantType: r.participantType,
        label: r.name,
        amount,
        percent: pct,
      };
    });

  // P-FINAL Rule 7: Compute USD equivalent of patientPayable for reporting only.
  // Exchange rates are caller-supplied to avoid an extra DB round-trip.
  let finalTotalUsd = patientPayable;
  if (bookingCurrency !== "USD" && input.rates) {
    const rate = n(input.rates[bookingCurrency], 1);
    finalTotalUsd = rate > 0 ? round2(patientPayable / rate) : patientPayable;
  }

  // 10. Update the lines array to reflect engine overrides.
  // computeFinalPrice() uses base.platformFee in its lines; the engine may have
  // overridden this via a rule. We must update the line so the stored
  // pricingBreakdown.lines accurately matches the actual amounts charged to the patient.
  let updatedLines = base.lines.map(l =>
    /platform\s*fee/i.test(l.label)
       ? { ...l, amount: roundAmount(enginePlatformFee) }
      : l,
  );
  if (engineTravelFee > 0) {
    const taxIdx = updatedLines.findIndex(l => /^tax\b/i.test(l.label));
    const travelLine = { label: "Travel fee", amount: engineTravelFee };
    if (taxIdx >= 0) updatedLines.splice(taxIdx, 0, travelLine);
    else updatedLines.push(travelLine);
  }
  updatedLines = replaceTaxLines(updatedLines, taxBreakdown);
  // Inject payment surcharge / method discount line before Tax when non-zero.
  if (paymentSurcharge !== 0) {
    const taxIdx = updatedLines.findIndex(l => /^service tax|^platform tax|^total tax/i.test(l.label));
    const pmLabel = paymentSurcharge > 0 ? "Payment surcharge" : "Payment discount";
    const pmLine = { label: pmLabel, amount: paymentSurcharge };
    if (taxIdx >= 0) {
      updatedLines.splice(taxIdx, 0, pmLine);
    } else {
      updatedLines.push(pmLine);
    }
  }

  return {
    ...base,
    serviceGrossSubtotal,
    lines: updatedLines,
    taxableSubtotal,
    tax: taxBreakdown.totalTax,
    total,
     perSession: roundAmount(total / base.sessions),
    taxBreakdown,
    platformFee: round2(enginePlatformFee),
    paymentSurcharge,
    engineTravelFee,
    patientPayable,
    platformRevenue,
    providerGrossEarnings,
    providerEarnings,
    commissionRate,
    commissionAmount,
    revenueShares,
    appliedRules,
    bookingCurrency,
    providerCurrency,
    finalTotalUsd,
    pricingEngineVersion: PRICING_ENGINE_VERSION,
    taxEngineVersion: TAX_ENGINE_VERSION,
    pricingCalculatedAt: new Date().toISOString(),
  };
}

/**
 * Lightweight sync version using pre-loaded rules (no DB access).
 * Used by the revenue simulator for instant feedback.
 */
export function runRevenueEngineSync(
  input: RevenueEngineInput & { _preloaded: RevenueRuleSet }
): RevenueEngineResult {
  const rules = input._preloaded;
  // The synchronous path is used by admin simulation and tests. When callers
  // explicitly provide resolved tax rules, enforce the same distinction as the
  // async quote/booking path: an absent rule is not a valid 0% configuration.
  // Callers that intentionally exercise only the pre-tax pricing kernel omit
  // _taxRules and therefore remain usable without database tax configuration.
  if (input._taxRules) {
    assertTaxConfiguration(input._taxRules, {
      countryCode: input.countryCode,
      subServiceId: input.subServiceId,
      requireServiceRule: Boolean(input.subServiceId),
    });
  }

  // P-FINAL: Resolve currencies (Rules 1 & 2)
  const bookingCurrency  = input.bookingCurrency  || input.currency || "USD";
  const providerCurrency = input.providerCurrency || bookingCurrency;
  const roundAmount = (value: number) => roundBookingAmount(value, bookingCurrency);

  const base = computeFinalPrice({ ...input, currency: bookingCurrency, deferTax: true });
  const appliedRules: AppliedRule[] = [];

  const ctx = {
    countryCode:     input.countryCode    ?? null,
    providerType:    input.providerType   ?? null,
    serviceCategory: input.serviceCategory ?? null,
    modality:        input.visitType,
  };

  let enginePlatformFee = base.platformFee;
  const pfRule = rules.platformFeeRules.find(r => matchesScope(r, ctx));
  if (pfRule) {
    enginePlatformFee = applyFeeRule(pfRule, base.base, bookingCurrency);
    appliedRules.push({ ruleType: "platform_fee", ruleName: pfRule.name, impact: `${enginePlatformFee} ${bookingCurrency}` });
  }

  const commRule = selectCommissionRule(rules.commissionRules, {
    providerId: input.providerId, providerType: input.providerType,
    serviceCategory: input.serviceCategory, countryCode: input.countryCode,
  });
  // No commission rule configured → 0% (never silently apply a hardcoded rate).
  const commissionRate   = commRule ? n(commRule.commissionPercent, 0) : 0;
   const commissionAmount = roundAmount(base.base * (commissionRate / 100));
  if (commRule) appliedRules.push({ ruleType: "commission", ruleName: commRule.name, impact: `${commissionRate}%` });

   const engineTravelFee = computeTravelFee(rules.travelFeeRules, input.visitType, input.travelDistanceKm, ctx, bookingCurrency);
  if (engineTravelFee > 0) {
    const tfRule = rules.travelFeeRules[0];
    appliedRules.push({
      ruleType: "travel_fee",
      ruleName: tfRule?.name ?? "Travel fee",
      impact: `Travel fee ${engineTravelFee} ${bookingCurrency}`,
    });
  }

  const pmRule = rules.paymentMethodRules.find(r =>
    r.paymentMethod === (input.paymentMethod ?? "cash") &&
    (!r.allowedCountries?.length || r.allowedCountries.includes(input.countryCode ?? ""))
  );
   const platformFeeDelta = roundAmount(enginePlatformFee - base.platformFee);
   const paymentBase = roundAmount(Math.max(0, base.total + platformFeeDelta + engineTravelFee));
   const paymentParts = paymentAdjustmentParts(pmRule, paymentBase, bookingCurrency);
   const paymentSurcharge = roundAmount(paymentParts.surcharge - paymentParts.discount);
 
   const serviceGrossSubtotal = roundAmount(Math.max(
    0,
    base.base - base.membershipDiscount + base.visitTypeFee + base.surge + base.emergencyFee + engineTravelFee,
  ));
  const taxBreakdown = calculateResolvedTax({
    serviceSubtotal: serviceGrossSubtotal,
    platformSubtotal: Math.max(0, enginePlatformFee + paymentSurcharge),
    currency: bookingCurrency,
    discount: base.discount,
    paymentDiscount: paymentParts.discount,
    // Rates are supplied only by calculateResolvedTax() from canonical rules.
    serviceTaxRatePercent: 0,
    platformTaxRatePercent: 0,
  }, input._taxRules ?? {});
   const taxableSubtotal = roundAmount(base.taxableSubtotal + platformFeeDelta + paymentSurcharge + engineTravelFee);
   const total = roundAmount(taxableSubtotal + taxBreakdown.totalTax);
  const patientPayable  = total;
   const providerGrossEarnings = roundAmount(
    taxBreakdown.serviceTaxableSubtotal + taxBreakdown.serviceTax,
  );
   const providerEarnings = roundAmount(Math.max(0, providerGrossEarnings - commissionAmount));
   const platformRevenue = roundAmount(enginePlatformFee + commissionAmount + Math.max(0, paymentSurcharge));

  const revenueShares: RevenueShare[] = rules.revenueShareRules
    .filter(r => (!r.countryCode || r.countryCode === input.countryCode))
    .map(r => ({
      participantType: r.participantType,
      label: r.name,
       amount: roundAmount(platformRevenue * (n(r.sharePercent, 0) / 100) + n(r.fixedAmount, 0)),
      percent: n(r.sharePercent, 0),
    }));

  // P-FINAL Rule 7: finalTotalUsd for reporting (use caller-supplied rates if available)
  let finalTotalUsd = patientPayable;
  if (bookingCurrency !== "USD" && input.rates) {
    const rate = n(input.rates[bookingCurrency], 1);
    finalTotalUsd = rate > 0 ? round2(patientPayable / rate) : patientPayable;
  }

  // Update lines to reflect engine overrides (same as async version above).
  let updatedLinesSy = base.lines.map(l =>
    /platform\s*fee/i.test(l.label)
       ? { ...l, amount: roundAmount(enginePlatformFee) }
      : l,
  );
  if (engineTravelFee > 0) {
    const taxIdx = updatedLinesSy.findIndex(l => /^tax\b/i.test(l.label));
    const travelLine = { label: "Travel fee", amount: engineTravelFee };
    if (taxIdx >= 0) updatedLinesSy.splice(taxIdx, 0, travelLine);
    else updatedLinesSy.push(travelLine);
  }
  updatedLinesSy = replaceTaxLines(updatedLinesSy, taxBreakdown);
  if (paymentSurcharge !== 0) {
    const taxIdx = updatedLinesSy.findIndex(l => /^service tax|^platform tax|^total tax/i.test(l.label));
    const pmLabel = paymentSurcharge > 0 ? "Payment surcharge" : "Payment discount";
    const pmLine = { label: pmLabel, amount: paymentSurcharge };
    if (taxIdx >= 0) {
      updatedLinesSy.splice(taxIdx, 0, pmLine);
    } else {
      updatedLinesSy.push(pmLine);
    }
  }

  return {
    ...base,
    serviceGrossSubtotal,
    lines: updatedLinesSy,
    taxableSubtotal,
    tax: taxBreakdown.totalTax,
    total,
     perSession: roundAmount(total / base.sessions),
    taxBreakdown,
    platformFee: round2(enginePlatformFee),
    paymentSurcharge,
    engineTravelFee,
    patientPayable,
    platformRevenue,
    providerGrossEarnings,
    providerEarnings,
    commissionRate,
    commissionAmount,
    revenueShares,
    appliedRules,
    bookingCurrency,
    providerCurrency,
    finalTotalUsd,
    pricingEngineVersion: PRICING_ENGINE_VERSION,
    taxEngineVersion: TAX_ENGINE_VERSION,
    pricingCalculatedAt: new Date().toISOString(),
  };
}
