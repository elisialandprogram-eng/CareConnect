/**
 * CurrencyService — single server-side source of truth for all currency operations.
 *
 * Architecture (P-FINAL native-currency model):
 *   SERVICE PRICES  = stored in provider's native currency (services.currency)
 *   ALL CALCULATIONS = performed in bookingCurrency (= provider native currency)
 *   USD             = accounting / reporting currency ONLY (finalTotalUsd snapshots)
 *   DISPLAY         = native currency, never re-converted from USD
 *
 * fromUSDSync / toUSDSync / convertUSDToLocal / convertLocalToUSD are ACCOUNTING
 * helpers only — they must NOT be used to derive displayed service prices.
 *
 * Rate chain:
 *   1. In-process cache (55-minute TTL)
 *   2. currency_rates DB table (populated by syncRates hourly cron)
 *   3. Hardcoded fallback constants (server always starts)
 */

import { pool } from "../db";

export type SupportedCurrency = "USD" | "HUF" | "IRR" | "GBP";

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ["USD", "HUF", "IRR", "GBP"];

const ZERO_DECIMAL_CURRENCIES = new Set(["HUF", "IRR", "JPY", "KRW"]);

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  HUF: 365,
  IRR: 42000,
  GBP: 0.79,
  EUR: 0.92,
};

const CURRENCY_CONFIGS: Record<string, { locale: string; symbol: string; fractionDigits: number }> = {
  USD: { locale: "en-US",  symbol: "$",  fractionDigits: 2 },
  HUF: { locale: "hu-HU",  symbol: "Ft", fractionDigits: 0 },
  IRR: { locale: "fa-IR",  symbol: "﷼", fractionDigits: 0 },
  GBP: { locale: "en-GB",  symbol: "£",  fractionDigits: 2 },
  EUR: { locale: "en-IE",  symbol: "€",  fractionDigits: 2 },
};

let _cache: { rates: Record<string, number>; fetchedAt: number } = {
  rates: { ...FALLBACK_RATES },
  fetchedAt: 0,
};
const CACHE_TTL_MS = 55 * 60 * 1000;

/**
 * Returns current exchange rates (USD base).
 * Priority: in-process cache → DB table → hardcoded fallback.
 */
export async function getRates(): Promise<Record<string, number>> {
  if (Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache.rates;
  try {
    const result = await pool.query(
      `SELECT currency_code, rate_from_usd FROM currency_rates`,
    );
    if (result.rows.length > 0) {
      const rates: Record<string, number> = { ...FALLBACK_RATES };
      for (const row of result.rows) {
        rates[row.currency_code] = Number(row.rate_from_usd);
      }
      _cache = { rates, fetchedAt: Date.now() };
      return rates;
    }
  } catch {
    // DB unavailable — fall through to cached/hardcoded rates
  }
  return _cache.rates;
}

/**
 * Fetches live rates from open.er-api.com and upserts into currency_rates table.
 * Called hourly by the cron. A failed fetch is silently swallowed so cron
 * keeps running with stale-but-valid rates.
 */
export async function syncRates(): Promise<void> {
  try {
    const resp = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!resp.ok) return;
    const data = await resp.json() as { rates?: Record<string, number> };
    if (!data?.rates || Object.keys(data.rates).length < 10) return;

    const now = new Date();
    for (const currency of [...SUPPORTED_CURRENCIES, "EUR"]) {
      const rate = data.rates[currency];
      if (!rate || !Number.isFinite(rate) || rate <= 0) continue;
      await pool.query(
        `INSERT INTO currency_rates (currency_code, rate_from_usd, fetched_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (currency_code) DO UPDATE
           SET rate_from_usd = EXCLUDED.rate_from_usd,
               fetched_at    = EXCLUDED.fetched_at`,
        [currency, rate, now],
      );
    }
    _cache.fetchedAt = 0;
  } catch {
    // Network failure — keep existing rates
  }
}

/** Convert a USD amount to the target currency. */
export function fromUSDSync(amountUSD: number, toCurrency: string, rates: Record<string, number>): number {
  const rate = rates[toCurrency] ?? 1;
  return amountUSD * rate;
}

/** Convert an amount in a given currency to USD. */
export function toUSDSync(amount: number, fromCurrency: string, rates: Record<string, number>): number {
  const rate = rates[fromCurrency] ?? 1;
  return rate === 0 ? amount : amount / rate;
}

/**
 * Named alias for fromUSDSync with integer-safe rounding.
 * Mirrors the client-side convertUSDToLocal() naming.
 * All amounts are in full units (not cents).
 */
export function convertUSDToLocal(amountUSD: number, targetCurrency: string, rates: Record<string, number>): number {
  const rate = rates[targetCurrency] ?? 1;
  return Math.round(amountUSD * rate * 100) / 100;
}

/**
 * Named alias for toUSDSync with integer-safe rounding.
 * Mirrors the client-side convertLocalToUSD() naming.
 * All amounts are in full units (not cents).
 */
export function convertLocalToUSD(localAmount: number, sourceCurrency: string, rates: Record<string, number>): number {
  const rate = rates[sourceCurrency] ?? 1;
  return rate === 0 ? localAmount : Math.round((localAmount / rate) * 100) / 100;
}

/** Format a USD amount as display currency string. */
export function formatSync(
  amountUSD: number,
  toCurrency: string,
  rates: Record<string, number>,
): string {
  const converted = fromUSDSync(amountUSD, toCurrency, rates);
  const cfg = CURRENCY_CONFIGS[toCurrency] ?? CURRENCY_CONFIGS.USD;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: toCurrency,
      maximumFractionDigits: cfg.fractionDigits,
      minimumFractionDigits: cfg.fractionDigits === 0 ? 0 : 2,
    }).format(converted);
  } catch {
    return `${cfg.symbol}${converted.toFixed(cfg.fractionDigits)}`;
  }
}

/**
 * Format an amount that is already denominated in the target currency
 * (no USD conversion needed). Use this for displaying local-currency amounts
 * from legacy data or provider-side values that were never stored as USD.
 */
export function formatLocal(amount: number, currency: string): string {
  const cfg = CURRENCY_CONFIGS[currency] ?? CURRENCY_CONFIGS.USD;
  const safeCurr = currency in CURRENCY_CONFIGS ? currency : "USD";
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: safeCurr,
      maximumFractionDigits: cfg.fractionDigits,
      minimumFractionDigits: cfg.fractionDigits === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${cfg.symbol}${amount.toFixed(cfg.fractionDigits)}`;
  }
}

/**
 * Convert a USD amount to Stripe's integer unit_amount.
 * Zero-decimal currencies (HUF, IRR) → round to integer, NO ×100.
 * Standard currencies → ×100 (cents).
 *
 * NOTE: The platform charges in USD only, so `currency` is always "usd"
 * in practice. This helper is kept correct for completeness.
 */
export function toStripeAmount(amountUSD: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) {
    return Math.round(amountUSD);
  }
  return Math.round(amountUSD * 100);
}
