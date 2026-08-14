/**
 * Canonical currency policy shared by server calculations and client displays.
 *
 * Amounts passed to these helpers are full currency units, never minor units.
 * USD/EUR/GBP use two fractional digits. HUF/IRR/JPY/KRW are zero-decimal
 * currencies and use half-up rounding (256.5 -> 257).
 */

export type CurrencyCode = "USD" | "HUF" | "IRR" | "GBP" | "EUR" | "JPY" | "KRW";

export const ZERO_DECIMAL_CURRENCIES = new Set<CurrencyCode>(["HUF", "IRR", "JPY", "KRW"]);

export const CURRENCY_CONFIGS: Record<CurrencyCode, {
  locale: string;
  symbol: string;
  fractionDigits: number;
}> = {
  USD: { locale: "en-US", symbol: "$", fractionDigits: 2 },
  HUF: { locale: "hu-HU", symbol: "Ft", fractionDigits: 0 },
  IRR: { locale: "fa-IR", symbol: "﷼", fractionDigits: 0 },
  GBP: { locale: "en-GB", symbol: "£", fractionDigits: 2 },
  EUR: { locale: "de-DE", symbol: "€", fractionDigits: 2 },
  JPY: { locale: "ja-JP", symbol: "¥", fractionDigits: 0 },
  KRW: { locale: "ko-KR", symbol: "₩", fractionDigits: 0 },
};

/** Development/fallback rates used only when live rates are unavailable. */
export const DEFAULT_EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  HUF: 365,
  IRR: 42000,
  GBP: 0.79,
  EUR: 0.92,
  JPY: 155,
  KRW: 1380,
};

/** Number of minor units represented by one full currency unit. */
export function currencyMinorUnitFactor(code: string | null | undefined): number {
  return 10 ** currencyFractionDigits(code);
}

export function normalizeCurrencyCode(code: string | null | undefined): CurrencyCode {
  const normalized = String(code ?? "USD").trim().toUpperCase() as CurrencyCode;
  return normalized in CURRENCY_CONFIGS ? normalized : "USD";
}

export function currencyFractionDigits(code: string | null | undefined): number {
  return CURRENCY_CONFIGS[normalizeCurrencyCode(code)].fractionDigits;
}

/** Half-up rounding for positive and negative monetary values. */
export function roundCurrencyAmount(value: number | string | null | undefined, code: string | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  const digits = currencyFractionDigits(code);
  const factor = currencyMinorUnitFactor(code);
  const sign = numeric < 0 ? -1 : 1;
  const absolute = Math.abs(numeric);
  const scaled = absolute * factor;
  // Add a magnitude-aware epsilon so values such as 1.005 do not become
  // 1.00 because of the binary representation immediately below the tie.
  return sign * (Math.round(scaled + Number.EPSILON * Math.max(1, scaled)) / factor);
}

export function formatCurrencyAmount(
  value: number | string | null | undefined,
  code: string | null | undefined,
): string {
  const normalized = normalizeCurrencyCode(code);
  const config = CURRENCY_CONFIGS[normalized];
  const rounded = roundCurrencyAmount(value, normalized);
  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: normalized,
      minimumFractionDigits: config.fractionDigits,
      maximumFractionDigits: config.fractionDigits,
    }).format(rounded);
  } catch {
    return `${config.symbol}${rounded.toFixed(config.fractionDigits)}`;
  }
}

/** Format an integer amount in the currency's smallest unit. */
export function formatCurrencyMinorUnits(
  minorUnits: number | string | null | undefined,
  code: string | null | undefined,
): string {
  const normalized = normalizeCurrencyCode(code);
  const factor = currencyMinorUnitFactor(normalized);
  return formatCurrencyAmount(Number(minorUnits ?? 0) / factor, normalized);
}