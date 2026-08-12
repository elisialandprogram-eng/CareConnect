export type FirstPartyPaymentMethod = "card" | "wallet" | "cash" | "bank_transfer";

/**
 * Normalize the selected payment rail before it reaches pricing, booking,
 * payment creation, or settlement. Card is the only safe default because it
 * matches quote calculation and does not silently create an unpaid offline
 * booking.
 */
export function resolvePaymentMethod(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  // Preserve configured third-party rails so the availability registry can
  // validate them. Only an omitted/invalid value gets the canonical default.
  // Stripe is the UI/provider name for the card rail; persist one canonical
  // value so payment guards and settlement cannot disagree about the method.
  if (normalized === "stripe" || normalized === "credit_card") return "card";
  return normalized || "card";
}