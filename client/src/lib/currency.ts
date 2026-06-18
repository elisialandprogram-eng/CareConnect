import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export type SupportedCurrency = "USD" | "HUF" | "IRR" | "GBP" | "EUR";

type CurrencyConfig = {
  code: SupportedCurrency;
  locale: string;
  symbol: string;
  rateFromUSD: number;
  fractionDigits: number;
};

const CURRENCY_BY_LANG: Record<string, CurrencyConfig> = {
  en: {
    code: "USD",
    locale: "en-US",
    symbol: "$",
    rateFromUSD: 1,
    fractionDigits: 2,
  },
  hu: {
    code: "HUF",
    locale: "hu-HU",
    symbol: "Ft",
    rateFromUSD: 365,
    fractionDigits: 0,
  },
  fa: {
    code: "IRR",
    locale: "fa-IR",
    symbol: "﷼",
    rateFromUSD: 42000,
    fractionDigits: 0,
  },
  gb: {
    code: "GBP",
    locale: "en-GB",
    symbol: "£",
    rateFromUSD: 0.79,
    fractionDigits: 2,
  },
  de: {
    code: "EUR",
    locale: "de-DE",
    symbol: "€",
    rateFromUSD: 0.92,
    fractionDigits: 2,
  },
  fr: {
    code: "EUR",
    locale: "fr-FR",
    symbol: "€",
    rateFromUSD: 0.92,
    fractionDigits: 2,
  },
};

// Country → currency mapping. The country a user belongs to is the strongest
// signal for which currency to display, regardless of UI language.
const CURRENCY_BY_COUNTRY: Record<"HU" | "IR", CurrencyConfig> = {
  HU: CURRENCY_BY_LANG.hu,
  IR: CURRENCY_BY_LANG.fa,
};

const DEFAULT_CURRENCY: CurrencyConfig = CURRENCY_BY_LANG.en;

// ── Live exchange-rate cache ──────────────────────────────────────────────────
// Updated by useLiveRates() on first render. Falls back to hardcoded rates.
let _liveRates: Record<string, number> | null = null;

export function setLiveRates(rates: Record<string, number>) {
  _liveRates = rates;
}

function getRateFromUSD(cfg: CurrencyConfig): number {
  if (_liveRates && _liveRates[cfg.code] && _liveRates[cfg.code] > 0) {
    return _liveRates[cfg.code];
  }
  return cfg.rateFromUSD;
}

/** Fetch live rates from the server once per session and cache them. */
let _ratesFetchStarted = false;
export function useLiveRates() {
  useEffect(() => {
    if (_ratesFetchStarted) return;
    _ratesFetchStarted = true;
    fetch("/api/exchange-rates")
      .then(r => (r.ok ? r.json() : null))
      .then((data: { rates?: Record<string, number> } | null) => {
        if (data?.rates && data.rates["USD"] && data.rates["HUF"] && data.rates["IRR"]) {
          setLiveRates(data.rates);
        }
      })
      .catch(() => {});
  }, []);
}

function resolveConfig(language: string | undefined): CurrencyConfig {
  if (!language) return DEFAULT_CURRENCY;
  const base = language.toLowerCase().split("-")[0];
  return CURRENCY_BY_LANG[base] ?? DEFAULT_CURRENCY;
}

function resolveByCode(code: SupportedCurrency | string | null | undefined): CurrencyConfig | null {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  for (const cfg of Object.values(CURRENCY_BY_LANG)) {
    if (cfg.code === upper) return cfg;
  }
  return null;
}

function formatWith(cfg: CurrencyConfig, amountInUSD: number | string | null | undefined): string {
  const numeric = Number(amountInUSD ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const rate = getRateFromUSD(cfg);
  const converted = safe * rate;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      maximumFractionDigits: cfg.fractionDigits,
      minimumFractionDigits: cfg.fractionDigits === 0 ? 0 : 2,
    }).format(converted);
  } catch {
    return `${cfg.symbol}${converted.toFixed(cfg.fractionDigits)}`;
  }
}

/**
 * @deprecated Use formatCurrencyByLanguage() or the new formatCurrency(amountCents, currencyIso, countryCode).
 * Kept for internal use within this module.
 */
function formatCurrencyByLanguage(
  amountInUSD: number | string | null | undefined,
  language: string | undefined,
): string {
  return formatWith(resolveConfig(language), amountInUSD);
}

/**
 * Authoritative dual-country display formatter.
 *
 * Converts an integer cent value (e.g. 500000 = 5 000 Ft) into the correct
 * display string for the given ISO-4217 currency + country context.
 *
 *  • HU / HUF → "5 000 Ft"     (integer, space-grouped, Ft suffix)
 *  • IR / IRR → "210 000 ﷼"    (integer, native locale)
 *  • fallback  → "$50.00"       (USD, 2 decimal places)
 *
 * @param amountCents  Integer amount in the smallest currency unit (cents / fillér / دینار)
 * @param currencyIso  ISO-4217 code, e.g. "HUF", "IRR", "USD"
 * @param countryCode  Two-letter country code, e.g. "HU", "IR"
 */
export function formatCurrency(
  amountCents: number,
  currencyIso: string,
  countryCode: string,
): string {
  const upper = (currencyIso ?? "").toUpperCase();
  const cc    = (countryCode ?? "").toUpperCase();

  // Resolve cents → full unit (HUF and IRR use 1:1 subunit in practice,
  // but our storage is in integer "cents" so we always divide by 100).
  const amount = (Number.isFinite(amountCents) ? amountCents : 0) / 100;

  // HUF — Hungarian Forint: integer, Ft suffix
  if (upper === "HUF" || cc === "HU") {
    const int = Math.round(amount);
    try {
      return new Intl.NumberFormat("hu-HU", {
        style: "currency",
        currency: "HUF",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }).format(int);
    } catch {
      return `${int.toLocaleString("hu-HU")} Ft`;
    }
  }

  // IRR — Iranian Rial: integer, ﷼ symbol
  if (upper === "IRR" || cc === "IR") {
    const int = Math.round(amount);
    try {
      return new Intl.NumberFormat("fa-IR", {
        style: "currency",
        currency: "IRR",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }).format(int);
    } catch {
      return `${int.toLocaleString("fa-IR")} ﷼`;
    }
  }

  // Fallback: resolve by currency code, default to USD
  const cfg = resolveByCode(upper) ?? DEFAULT_CURRENCY;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      maximumFractionDigits: cfg.fractionDigits,
      minimumFractionDigits: cfg.fractionDigits === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${cfg.symbol}${amount.toFixed(cfg.fractionDigits)}`;
  }
}

export function getCurrencyConfig(language: string | undefined): CurrencyConfig {
  return resolveConfig(language);
}

export function useCurrency() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  let userPreferred: string | null = null;
  let userCountry: "HU" | "IR" | null = null;
  try {
    const { user } = useAuth();
    userPreferred = user?.preferredCurrency ?? null;
    const cc = (user as any)?.countryCode;
    if (cc === "HU" || cc === "IR") userCountry = cc;
  } catch {
    userPreferred = null;
  }
  let overrideCode: string | null = userPreferred;
  if (!overrideCode && typeof window !== "undefined") {
    try {
      overrideCode = window.localStorage.getItem("preferredCurrency");
    } catch {
      overrideCode = null;
    }
  }
  // Priority: explicit per-user override > user's country > system default (USD).
  // Language does NOT affect currency — they are independent settings.
  const config =
    resolveByCode(overrideCode) ??
    (userCountry ? CURRENCY_BY_COUNTRY[userCountry] : null) ??
    DEFAULT_CURRENCY;

  // Fetch and cache live rates once per session
  useLiveRates();

  return {
    config,
    code: config.code,
    symbol: config.symbol,
    locale: config.locale,
    format: (amountInUSD: number | string | null | undefined) => formatWith(config, amountInUSD),
    convert: (amountInUSD: number | string | null | undefined) => {
      const numeric = Number(amountInUSD ?? 0);
      const safe = Number.isFinite(numeric) ? numeric : 0;
      return safe * getRateFromUSD(config);
    },
  };
}

export function getCurrencyConfigForCountry(countryCode: string | null | undefined): CurrencyConfig {
  if (countryCode === "HU" || countryCode === "IR") return CURRENCY_BY_COUNTRY[countryCode];
  return DEFAULT_CURRENCY;
}

/**
 * Format an amount that is already denominated in the target country's currency
 * (i.e. no USD→local conversion needed). Used for provider-own-currency display.
 */
export function formatCurrencyForCountry(
  amount: number | string | null | undefined,
  countryCode: string | null | undefined,
): string {
  const cfg = getCurrencyConfigForCountry(countryCode);
  const numeric = Number(amount ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      maximumFractionDigits: cfg.fractionDigits,
      minimumFractionDigits: cfg.fractionDigits === 0 ? 0 : 2,
    }).format(safe);
  } catch {
    return `${cfg.symbol}${safe.toFixed(cfg.fractionDigits)}`;
  }
}

/**
 * Convert an amount from one currency to another using live rates (falls back
 * to hardcoded rates). Both codes are ISO-4217 strings (e.g. "HUF", "IRR").
 */
export function convertBetweenCurrencies(
  amount: number,
  fromCode: string,
  toCode: string,
): number {
  if (fromCode === toCode) return amount;
  const rates = _liveRates ?? { USD: 1, HUF: 365, IRR: 42000, GBP: 0.79 };
  const fromRate = rates[fromCode] ?? 1;
  const toRate = rates[toCode] ?? 1;
  const inUSD = amount / fromRate;
  return inUSD * toRate;
}

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ["USD", "HUF", "IRR", "GBP", "EUR"];


/**
 * Admin-only currency hook. ALWAYS returns USD formatting regardless of the
 * logged-in admin's personal currency preference. This enforces Part 5 of the
 * multi-currency architecture: admin dashboards are strictly locked to USD so
 * that KPI cards, revenue totals, and ledger amounts are never mistakenly
 * displayed in HUF, IRR, or any other local currency.
 *
 * Use this in EVERY admin panel component instead of useCurrency().
 */
export function useAdminCurrency() {
  useLiveRates();
  const usdConfig = CURRENCY_BY_LANG.en;
  return {
    config: usdConfig,
    code: "USD" as SupportedCurrency,
    symbol: "$",
    locale: "en-US",
    format: (amountInUSD: number | string | null | undefined) => formatWith(usdConfig, amountInUSD),
    convert: (amountInUSD: number | string | null | undefined) => {
      const numeric = Number(amountInUSD ?? 0);
      return Number.isFinite(numeric) ? numeric : 0;
    },
  };
}

/** Get the display symbol for a given currency code. */
export function getCurrencySymbol(code: SupportedCurrency | string): string {
  return resolveByCode(code)?.symbol ?? code;
}

/**
 * Format an amount already denominated in the given currency (no USD→local
 * conversion). Use this when the value is already in the target currency.
 */
export function formatInCurrency(
  amount: number | string | null | undefined,
  code: SupportedCurrency | string,
): string {
  const cfg = resolveByCode(code);
  if (!cfg) return String(Number(amount ?? 0).toFixed(2));
  const numeric = Number(amount ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      maximumFractionDigits: cfg.fractionDigits,
      minimumFractionDigits: cfg.fractionDigits === 0 ? 0 : 2,
    }).format(safe);
  } catch {
    return `${cfg.symbol}${safe.toFixed(cfg.fractionDigits)}`;
  }
}

/**
 * Internal helper: format a USD-stored amount in the provider's local display
 * currency. Uses formatWith (multiplies by the USD→local exchange rate) so
 * that amounts stored in USD (the system-wide storage format) are correctly
 * presented in local denomination (HUF, IRR, etc.).
 *
 * This is distinct from formatCurrencyForCountry(), which intentionally does
 * NOT multiply by rate and is reserved for amounts already in local currency.
 */
function formatFromUSD(amountUSD: number, countryCode: string | null | undefined): string {
  const cfg = getCurrencyConfigForCountry(countryCode);
  return formatWith(cfg, amountUSD);
}

/**
 * Canonical display-price result for a provider. All patient-facing UI must
 * derive its price display from this function.
 */
export type ProviderPriceDisplay =
  | { kind: "from"; text: string }
  | { kind: "free" }
  | { kind: "contact" };

/**
 * PRICE-DRIFT-FIX: derive native currency from country code.
 * Services are now stored in native currency (not USD), so display should
 * never multiply by an exchange rate.
 */
function nativeCurrencyForCountry(countryCode: string | null | undefined): string {
  const c = (countryCode ?? "").toUpperCase();
  if (c === "HU") return "HUF";
  if (c === "IR") return "IRR";
  return "USD";
}

/**
 * Derive the "Starting at" price for a provider detail/sidebar widget.
 *
 * Priority order (source of truth → fallback):
 *   1. Active services array — compute Math.min of active, non-pending prices.
 *      Services prices are stored in native currency (services.currency).
 *   2. consultationFee — legacy field, treated as USD for backward-compat.
 *   3. Neither present → { kind: "contact" }
 *
 * consultationFee is intentionally checked AFTER services so that a stale or
 * legacy fee value never overrides the prices patients will actually see when
 * booking a specific service.
 */
export function getProviderDisplayPrice(
  consultationFee: number | string | null | undefined,
  services: Array<{
    price?: number | string | null;
    currency?: string | null;
    isActive?: boolean | null;
    pendingChangeStatus?: string | null;
  }> | null | undefined,
  countryCode: string | null | undefined,
): ProviderPriceDisplay {
  // 1. Services are the primary source of truth.
  const bookable = (services ?? []).filter(
    (s) => s.isActive !== false && s.pendingChangeStatus !== "pending",
  );

  if (bookable.length > 0) {
    let minPrice = Number.POSITIVE_INFINITY;
    let minCurrency = nativeCurrencyForCountry(countryCode);
    for (const s of bookable) {
      const p = Number(s.price ?? 0);
      if (Number.isFinite(p) && p < minPrice) {
        minPrice = p;
        // Prefer the per-row currency if present; fall back to country-derived.
        minCurrency = s.currency ?? nativeCurrencyForCountry(countryCode);
      }
    }

    if (!Number.isFinite(minPrice)) return { kind: "contact" };
    if (minPrice <= 0) return { kind: "free" };
    // PRICE-DRIFT-FIX: use formatInCurrency (no USD conversion) — price is already native.
    return { kind: "from", text: formatInCurrency(minPrice, minCurrency) };
  }

  // 2. Fall back to consultationFee only when no services are configured.
  // consultationFee is a legacy USD field — keep the old conversion here.
  const fee = Number(consultationFee ?? 0);
  if (Number.isFinite(fee) && fee > 0) {
    return { kind: "from", text: formatFromUSD(fee, countryCode) };
  }

  return { kind: "contact" };
}

/** Render a ProviderPriceDisplay as a plain string. */
export function providerPriceDisplayText(d: ProviderPriceDisplay): string {
  if (d.kind === "from") return d.text;
  if (d.kind === "free") return "Free";
  return "Contact for pricing";
}

/**
 * Price display for provider cards on the search/listing page.
 * Strictly based on minServicePrice — the server-side MIN of active service
 * prices (now in native currency after PRICE-DRIFT-FIX).
 *
 * - minServicePrice=null  → no active services → { kind: "contact" }
 * - minServicePrice=0     → free service exists → { kind: "free" }
 * - minServicePrice>0     → lowest active price → { kind: "from", text }
 *
 * consultationFee is intentionally NOT used here so cards always reflect
 * what patients will actually pay for a listed service.
 */
export function getProviderCardPrice(
  minServicePrice: number | string | null | undefined,
  countryCode: string | null | undefined,
): ProviderPriceDisplay {
  if (minServicePrice == null) return { kind: "contact" };
  const min = Number(minServicePrice);
  if (!Number.isFinite(min)) return { kind: "contact" };
  if (min <= 0) return { kind: "free" };
  // PRICE-DRIFT-FIX: minServicePrice is now in native currency — use formatInCurrency
  // (not formatFromUSD which would multiply by the exchange rate again).
  return { kind: "from", text: formatInCurrency(min, nativeCurrencyForCountry(countryCode)) };
}
