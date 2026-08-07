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
  return normalized || "card";
}