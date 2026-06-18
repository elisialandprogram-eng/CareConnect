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
import { round2 } from "./math";
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
  /** Additional charges applied by payment method rule */
  paymentSurcharge: number;
  /** Platform-level travel fee applied (home visits) */
  engineTravelFee: number;
  /** Final amount the patient pays (in bookingCurrency) */
  patientPayable: number;
  /** Gross platform revenue (fees + commission, in bookingCurrency) */
  platformRevenue: number;
  /** Net provider earnings after commission (in bookingCurrency) */
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
  if (rule.feeType === "percent") {
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
  return round2(fee);
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

function applyPaymentRule(rule: PaymentMethodRule | undefined, subtotal: number): number {
  if (!rule) return 0;
  const val = n(rule.surchargeValue, 0);
  const disc = n(rule.discountValue, 0);
  let surcharge = 0;
  if (rule.surchargeType === "percent") surcharge += subtotal * (val  / 100);
  if (rule.surchargeType === "fixed")   surcharge += val;
  if (rule.discountType  === "percent") surcharge -= subtotal * (disc / 100);
  if (rule.discountType  === "fixed")   surcharge -= disc;
  return round2(surcharge);
}

function computeTravelFee(
  rules: TravelFeeRule[],
  visitType: string,
  distanceKm: number | null | undefined,
  ctx: { countryCode?: string | null; providerType?: string | null }
): number {
  if (visitType !== "home") return 0;
  const applicable = rules.filter(r =>
    (!r.countryCode   || r.countryCode   === ctx.countryCode) &&
    (!r.providerType  || r.providerType  === ctx.providerType)
  );
  if (!applicable.length) return 0;
  const rule = applicable[0];
  const dist = distanceKm ?? 0;
  if (rule.feeType === "flat")     return round2(n(rule.flatAmount, 0));
  if (rule.feeType === "distance") return round2(dist * n(rule.perKmRate, 0));
  if (rule.feeType === "radius") {
    const radius = n(rule.radiusKm, 0);
    return dist <= radius ? 0 : round2((dist - radius) * n(rule.perKmRate, 0));
  }
  return round2(n(rule.flatAmount, 0));
}

// ── Main engine ──────────────────────────────────────────────────────────────

export async function runRevenueEngine(input: RevenueEngineInput): Promise<RevenueEngineResult> {
  const rules = input._preloaded ?? await loadRevenueRules();

  // P-FINAL: Resolve booking and provider currencies (Rules 1 & 2).
  // All amounts calculated below are in bookingCurrency.
  const bookingCurrency  = input.bookingCurrency  || input.currency || "USD";
  const providerCurrency = input.providerCurrency || bookingCurrency;

  // 1. Base pricing via legacy kernel (handles membership, promo, surge, tax)
  const base: PricingBreakdown = computeFinalPrice({ ...input, currency: bookingCurrency });
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
  const commissionAmount = round2(base.base * (commissionRate / 100));
  if (commRule) {
    appliedRules.push({
      ruleType: "commission",
      ruleName: commRule.name,
      impact: membershipReduction > 0
        ? `${baseCommissionRate}% − ${membershipReduction}% member reduction = ${commissionRate}% → ${commissionAmount} ${bookingCurrency}`
        : `${commissionRate}% commission = ${commissionAmount} ${bookingCurrency}`,
    });
  }

  // 4. Payment surcharge
  const pmRule = rules.paymentMethodRules.find(r =>
    r.paymentMethod === (input.paymentMethod ?? "cash") &&
    (!r.allowedCountries?.length || r.allowedCountries.includes(input.countryCode ?? ""))
  );
  const paymentSurcharge = applyPaymentRule(pmRule, base.total);
  if (pmRule && paymentSurcharge !== 0) {
    appliedRules.push({
      ruleType: "payment_method",
      ruleName: pmRule.label,
      impact: `Surcharge/discount ${paymentSurcharge} ${bookingCurrency}`,
    });
  }

  // 5. Travel fee
  const engineTravelFee = computeTravelFee(
    rules.travelFeeRules,
    input.visitType,
    input.travelDistanceKm,
    ctx
  );
  if (engineTravelFee > 0) {
    const tfRule = rules.travelFeeRules[0];
    appliedRules.push({
      ruleType: "travel_fee",
      ruleName: tfRule?.name ?? "Travel fee",
      impact: `Travel fee ${engineTravelFee} ${bookingCurrency}`,
    });
  }

  // 6. Final patient payable (in bookingCurrency)
  // base.total already contains base.platformFee from computeFinalPrice.
  // When the engine overrides with a rule-based fee, add the delta so the
  // patient is actually charged the rule amount, not the sub-service default.
  const platformFeeDelta = round2(enginePlatformFee - base.platformFee);
  const patientPayable = round2(base.total + platformFeeDelta + paymentSurcharge + engineTravelFee);

  // 7. Provider earnings = base - commission (in bookingCurrency)
  const providerEarnings = round2(base.base - commissionAmount);

  // 8. Platform revenue = fees + commission + surcharge (in bookingCurrency)
  const platformRevenue = round2(enginePlatformFee + commissionAmount + Math.max(0, paymentSurcharge));

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
      const amount = round2(platformRevenue * (pct / 100) + fixed);
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

  return {
    ...base,
    platformFee: round2(enginePlatformFee),
    paymentSurcharge,
    engineTravelFee,
    patientPayable,
    platformRevenue,
    providerEarnings,
    commissionRate,
    commissionAmount,
    revenueShares,
    appliedRules,
    bookingCurrency,
    providerCurrency,
    finalTotalUsd,
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

  // P-FINAL: Resolve currencies (Rules 1 & 2)
  const bookingCurrency  = input.bookingCurrency  || input.currency || "USD";
  const providerCurrency = input.providerCurrency || bookingCurrency;

  const base = computeFinalPrice({ ...input, currency: bookingCurrency });
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
  const commissionAmount = round2(base.base * (commissionRate / 100));
  if (commRule) appliedRules.push({ ruleType: "commission", ruleName: commRule.name, impact: `${commissionRate}%` });

  const pmRule = rules.paymentMethodRules.find(r =>
    r.paymentMethod === (input.paymentMethod ?? "cash") &&
    (!r.allowedCountries?.length || r.allowedCountries.includes(input.countryCode ?? ""))
  );
  const paymentSurcharge = applyPaymentRule(pmRule, base.total);

  const engineTravelFee = computeTravelFee(rules.travelFeeRules, input.visitType, input.travelDistanceKm, ctx);
  const platformFeeDelta = round2(enginePlatformFee - base.platformFee);
  const patientPayable  = round2(base.total + platformFeeDelta + paymentSurcharge + engineTravelFee);
  const providerEarnings= round2(base.base - commissionAmount);
  const platformRevenue = round2(enginePlatformFee + commissionAmount + Math.max(0, paymentSurcharge));

  const revenueShares: RevenueShare[] = rules.revenueShareRules
    .filter(r => (!r.countryCode || r.countryCode === input.countryCode))
    .map(r => ({
      participantType: r.participantType,
      label: r.name,
      amount: round2(platformRevenue * (n(r.sharePercent, 0) / 100) + n(r.fixedAmount, 0)),
      percent: n(r.sharePercent, 0),
    }));

  // P-FINAL Rule 7: finalTotalUsd for reporting (use caller-supplied rates if available)
  let finalTotalUsd = patientPayable;
  if (bookingCurrency !== "USD" && input.rates) {
    const rate = n(input.rates[bookingCurrency], 1);
    finalTotalUsd = rate > 0 ? round2(patientPayable / rate) : patientPayable;
  }

  return {
    ...base,
    platformFee: round2(enginePlatformFee),
    paymentSurcharge,
    engineTravelFee,
    patientPayable,
    platformRevenue,
    providerEarnings,
    commissionRate,
    commissionAmount,
    revenueShares,
    appliedRules,
    bookingCurrency,
    providerCurrency,
    finalTotalUsd,
  };
}
