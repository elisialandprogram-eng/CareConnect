import type { Service, SubService } from "@shared/schema";
import { round2, roundBookingAmount } from "./math";

export type VisitType = "online" | "home" | "clinic";

export interface DiscountInput {
  type: "percent" | "fixed";
  value: number;
  code?: string;
}

/** Applied when the patient holds an active membership package */
export interface MembershipDiscountInput {
  serviceDiscountPercent: number;  // e.g. 15 = 15% off base
  platformFeeDiscount:    number;  // e.g. 50 = 50% off platform fee
  label:                  string;  // shown in invoice lines
  userPackageId:          string;  // stored on appointment
}

export interface PricingInput {
  subService?: Pick<
    SubService,
    "basePrice" | "platformFee" | "pricingType" | "durationMinutes"
  > | null;
  service?: Pick<
    Service,
    | "price"
    | "duration"
    | "platformFeeOverride"
    | "homeVisitFee"
    | "clinicFee"
    | "telemedicineFee"
    | "emergencyFee"
  > | null;
  visitType: VisitType;
  sessions?: number;
  surgeMultiplier?: number;
  discount?: DiscountInput | null;
  membershipDiscount?: MembershipDiscountInput | null;
  isEmergency?: boolean;
  packagePrice?: number | null;
  currency?: string;
  /** Revenue Engine supplies final platform fees before applying tax. */
  deferTax?: boolean;
}

export interface PricingLine {
  label: string;
  amount: number;
}

export interface PricingBreakdown {
  base: number;
  platformFee: number;
  visitTypeFee: number;
  surge: number;
  emergencyFee: number;
  taxableSubtotal: number;
  tax: number;
  discount: number;
  membershipDiscount: number;
  total: number;
  perSession: number;
  sessions: number;
  currency: string;
  lines: PricingLine[];
  /** Set when a membership package was applied */
  appliedPackageId?: string;
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function computeFinalPrice(input: PricingInput): PricingBreakdown {
  const sessions = Math.max(1, Math.floor(input.sessions ?? 1));
  const currency = input.currency || "USD";
  const roundAmount = (value: number) => roundBookingAmount(value, currency);
  const visitType = input.visitType;

  const sub = input.subService || null;
  const svc = input.service || null;

  const subBase = num(sub?.basePrice, 0);
  const customPrice = num(svc?.price, 0);
  const pricingType = sub?.pricingType ?? "fixed";
  const durationMin = num(svc?.duration ?? sub?.durationMinutes ?? 30, 30);

  let basePerSession = customPrice > 0 ? customPrice : subBase;

  if (pricingType === "hourly" && customPrice > 0) {
    basePerSession = customPrice * (durationMin / 60);
  }

  const rawPlatformFeePerSession =
    svc?.platformFeeOverride !== null && svc?.platformFeeOverride !== undefined
      ? num(svc.platformFeeOverride, 0)
      : num(sub?.platformFee, 0);

  let visitTypeFeePerSession = 0;
  if (visitType === "home") visitTypeFeePerSession = num(svc?.homeVisitFee, 0);
  else if (visitType === "clinic") visitTypeFeePerSession = num(svc?.clinicFee, 0);
  else if (visitType === "online") visitTypeFeePerSession = num(svc?.telemedicineFee, 0);

  const emergencyFeePerSession = input.isEmergency ? num(svc?.emergencyFee, 0) : 0;

  const surgeMultiplier = Math.max(1, input.surgeMultiplier ?? 1);
  const surgePerSession = (basePerSession + visitTypeFeePerSession) * (surgeMultiplier - 1);

  const usePackage = typeof input.packagePrice === "number" && input.packagePrice > 0;

  const baseTotal = usePackage ? num(input.packagePrice, 0) : basePerSession * sessions;

  // ── Membership discount on base price ─────────────────────────────────────
  const mem = input.membershipDiscount ?? null;
  let membershipBaseDiscount = 0;
  let platformFeePerSession = rawPlatformFeePerSession;

  if (mem && !usePackage) {
    const svcDiscPct = Math.min(100, Math.max(0, mem.serviceDiscountPercent));
    membershipBaseDiscount = baseTotal * (svcDiscPct / 100);

    const pfDiscPct = Math.min(100, Math.max(0, mem.platformFeeDiscount));
    platformFeePerSession = rawPlatformFeePerSession * (1 - pfDiscPct / 100);
  }

  const platformFeeTotal = platformFeePerSession * sessions;
  const visitTypeFeeTotal = visitTypeFeePerSession * sessions;
  const surgeTotal = usePackage ? 0 : surgePerSession * sessions;
  const emergencyTotal = emergencyFeePerSession * sessions;

  const effectiveBase = baseTotal - membershipBaseDiscount;
  const preDiscount = effectiveBase + platformFeeTotal + visitTypeFeeTotal + surgeTotal + emergencyTotal;

  // ── Promo code discount ────────────────────────────────────────────────────
  let discountAmount = 0;
  if (input.discount) {
    if (input.discount.type === "percent") {
      discountAmount = preDiscount * (Math.min(100, Math.max(0, input.discount.value)) / 100);
    } else {
      discountAmount = Math.max(0, input.discount.value);
    }
    discountAmount = Math.min(discountAmount, preDiscount);
  }

  const taxableSubtotal = Math.max(0, preDiscount - discountAmount);
  // Tax is owned exclusively by server/lib/tax-engine.ts. This pricing kernel
  // only derives pre-tax components; the revenue engine adds the resolved tax
  // snapshot after all platform/payment/travel adjustments are known.
  const taxAmount = 0;
  const total = taxableSubtotal + taxAmount;

  const lines: PricingLine[] = [];

  lines.push({
    label: usePackage
      ? "Package price"
      : sessions > 1
       ? `Base (${sessions} × ${roundAmount(basePerSession)})`
      : "Base price",
    amount: roundAmount(baseTotal),
  });

  // Membership discount line
  if (membershipBaseDiscount > 0 && mem) {
    lines.push({ label: `${mem.label} (membership)`, amount: -roundAmount(membershipBaseDiscount) });
  }

  const visitFeeLabel =
    visitType === "home" ? "Home visit fee" : visitType === "clinic" ? "Clinic fee" : "Telemedicine fee";
  lines.push({ label: visitFeeLabel, amount: roundAmount(visitTypeFeeTotal) });

  lines.push({ label: "Platform fee", amount: roundAmount(platformFeeTotal) });

  if (surgeTotal > 0) lines.push({ label: `Surge (×${surgeMultiplier})`, amount: roundAmount(surgeTotal) });
  if (emergencyTotal > 0) lines.push({ label: "Emergency fee", amount: roundAmount(emergencyTotal) });

  if (discountAmount > 0) {
    const label = input.discount?.code
      ? `Discount (${input.discount.code})`
      : input.discount?.type === "percent"
      ? `Discount (${input.discount.value}%)`
      : "Discount";
    lines.push({ label, amount: -roundAmount(discountAmount) });
  }

  return {
    base: roundAmount(baseTotal),
    platformFee: roundAmount(platformFeeTotal),
    visitTypeFee: roundAmount(visitTypeFeeTotal),
    surge: roundAmount(surgeTotal),
    emergencyFee: roundAmount(emergencyTotal),
    taxableSubtotal: roundAmount(taxableSubtotal),
    tax: roundAmount(taxAmount),
    discount: roundAmount(discountAmount),
    membershipDiscount: roundAmount(membershipBaseDiscount),
    total: roundAmount(total),
    perSession: roundAmount(total / sessions),
    sessions,
    currency,
    lines,
    ...(mem ? { appliedPackageId: mem.userPackageId } : {}),
  };
}
