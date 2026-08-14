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
  const factor = 10 ** digits;
  const sign = numeric < 0 ? -1 : 1;
  const absolute = Math.abs(numeric);
  return sign * (Math.round((absolute + Number.EPSILON * Math.max(1, absolute)) * factor) / factor);
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