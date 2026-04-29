import type { Service, SubService } from "@shared/schema";

export type VisitType = "online" | "home" | "clinic";

export interface DiscountInput {
  type: "percent" | "fixed";
  value: number;
  code?: string;
}

export interface PricingInput {
  subService?: Pick<
    SubService,
    "basePrice" | "platformFee" | "taxPercentage" | "pricingType" | "durationMinutes"
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
  isEmergency?: boolean;
  packagePrice?: number | null;
  currency?: string;
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
  total: number;
  perSession: number;
  sessions: number;
  currency: string;
  lines: PricingLine[];
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFinalPrice(input: PricingInput): PricingBreakdown {
  const sessions = Math.max(1, Math.floor(input.sessions ?? 1));
  const currency = input.currency || "USD";
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

  const platformFeePerSession =
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

  const taxRate = num(sub?.taxPercentage, 0) / 100;

  const usePackage = typeof input.packagePrice === "number" && input.packagePrice > 0;

  const baseTotal = usePackage ? num(input.packagePrice, 0) : basePerSession * sessions;
  const platformFeeTotal = platformFeePerSession * sessions;
  const visitTypeFeeTotal = visitTypeFeePerSession * sessions;
  const surgeTotal = usePackage ? 0 : surgePerSession * sessions;
  const emergencyTotal = emergencyFeePerSession * sessions;

  const preDiscount = baseTotal + platformFeeTotal + visitTypeFeeTotal + surgeTotal + emergencyTotal;

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
  const taxAmount = taxableSubtotal * taxRate;
  const total = taxableSubtotal + taxAmount;

  const lines: PricingLine[] = [];
  lines.push({
    label: usePackage
      ? "Package price"
      : sessions > 1
      ? `Base (${sessions} × ${round2(basePerSession)})`
      : "Base price",
    amount: round2(baseTotal),
  });
  if (platformFeeTotal > 0) lines.push({ label: "Platform fee", amount: round2(platformFeeTotal) });
  if (visitTypeFeeTotal > 0) {
    const lbl =
      visitType === "home" ? "Home visit fee" : visitType === "clinic" ? "Clinic fee" : "Telemedicine fee";
    lines.push({ label: lbl, amount: round2(visitTypeFeeTotal) });
  }
  if (surgeTotal > 0) lines.push({ label: `Surge (×${surgeMultiplier})`, amount: round2(surgeTotal) });
  if (emergencyTotal > 0) lines.push({ label: "Emergency fee", amount: round2(emergencyTotal) });
  if (discountAmount > 0) {
    const label = input.discount?.code
      ? `Discount (${input.discount.code})`
      : input.discount?.type === "percent"
      ? `Discount (${input.discount.value}%)`
      : "Discount";
    lines.push({ label, amount: -round2(discountAmount) });
  }
  if (taxAmount > 0) lines.push({ label: `Tax (${num(sub?.taxPercentage, 0)}%)`, amount: round2(taxAmount) });

  return {
    base: round2(baseTotal),
    platformFee: round2(platformFeeTotal),
    visitTypeFee: round2(visitTypeFeeTotal),
    surge: round2(surgeTotal),
    emergencyFee: round2(emergencyTotal),
    taxableSubtotal: round2(taxableSubtotal),
    tax: round2(taxAmount),
    discount: round2(discountAmount),
    total: round2(total),
    perSession: round2(usePackage ? total / sessions : total / sessions),
    sessions,
    currency,
    lines,
  };
}
