/**
 * service-currency-guard.ts
 *
 * Enforces P-FINAL Rule 1: service prices must be stored in the provider's
 * native currency. USD is never a valid service currency for HU or IR providers.
 *
 * Call assertNativeCurrency() at service create and update time.
 * It throws a ServiceCurrencyError that routes should map to HTTP 422.
 */

export class ServiceCurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceCurrencyError";
  }
}

/**
 * Derive the required native currency for a given country code.
 * Mirrors server/middleware/country.ts:countryCurrency() exactly.
 */
export function nativeCurrencyForCountry(
  countryCode: string | null | undefined,
): string {
  if (countryCode === "HU") return "HUF";
  if (countryCode === "IR") return "IRR";
  return "USD";
}

/**
 * Validate that the supplied currency (if any) matches the provider's native
 * currency, and that prices are not suspiciously small for zero-decimal currencies
 * (which would indicate they were entered as USD amounts rather than native units).
 *
 * @param currency   The currency value supplied in the request body (may be undefined).
 * @param price      The price value supplied (checked for USD-scale entries on HUF/IRR).
 * @param countryCode The provider's country code (e.g. "HU", "IR").
 *
 * @throws ServiceCurrencyError when the guard detects a violation.
 */
export function assertNativeCurrency(
  currency: string | null | undefined,
  price: number | string | null | undefined,
  countryCode: string | null | undefined,
): void {
  const expected = nativeCurrencyForCountry(countryCode);

  // 1. Explicit currency mismatch — reject outright.
  if (currency && currency.toUpperCase() !== expected) {
    throw new ServiceCurrencyError(
      `Currency mismatch: providers in country "${countryCode ?? "unknown"}" must use ` +
      `${expected} (received "${currency.toUpperCase()}"). ` +
      `Set the price in ${expected} and omit the currency field — it is set automatically.`,
    );
  }

  // 2. Scale guard for zero-decimal currencies (HUF, IRR).
  // A price of 5 HUF or 10 IRR is almost certainly a USD amount entered by mistake.
  // We warn (and reject) anything under the minimum plausible native amount.
  // HUF: minimum 100 Ft (≈ $0.27) — realistic floor for any healthcare service.
  // IRR: minimum 10,000 ﷼ (≈ $0.24).
  const priceNum = Number(price ?? 0);
  if (Number.isFinite(priceNum) && priceNum > 0) {
    if (expected === "HUF" && priceNum < 100) {
      throw new ServiceCurrencyError(
        `Price ${priceNum} is too small for HUF. ` +
        `Prices for Hungarian providers must be in Forint (e.g. 5000 for 5,000 Ft). ` +
        `Did you accidentally enter a USD amount?`,
      );
    }
    if (expected === "IRR" && priceNum < 10_000) {
      throw new ServiceCurrencyError(
        `Price ${priceNum} is too small for IRR. ` +
        `Prices for Iranian providers must be in Rial (e.g. 2000000 for 2,000,000 ﷼). ` +
        `Did you accidentally enter a USD amount?`,
      );
    }
  }
}
