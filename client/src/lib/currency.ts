import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export type SupportedCurrency = "USD" | "HUF" | "IRR" | "EUR" | "GBP";

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
    rateFromUSD: 360,
    fractionDigits: 0,
  },
  fa: {
    code: "IRR",
    locale: "fa-IR",
    symbol: "﷼",
    rateFromUSD: 84000,
    fractionDigits: 0,
  },
};

// Country → currency mapping. The country a user belongs to is the strongest
// signal for which currency to display, regardless of UI language. e.g. an
// English-speaking user living in Hungary should still see prices in HUF.
const CURRENCY_BY_COUNTRY: Record<"HU" | "IR", CurrencyConfig> = {
  HU: CURRENCY_BY_LANG.hu,
  IR: CURRENCY_BY_LANG.fa,
};

// Additional currencies users can override to (not auto-bound to a language).
const EXTRA_CURRENCIES: Record<string, CurrencyConfig> = {
  EUR: {
    code: "EUR",
    locale: "en-IE",
    symbol: "€",
    rateFromUSD: 0.92,
    fractionDigits: 2,
  },
  GBP: {
    code: "GBP",
    locale: "en-GB",
    symbol: "£",
    rateFromUSD: 0.79,
    fractionDigits: 2,
  },
};

const DEFAULT_CURRENCY: CurrencyConfig = CURRENCY_BY_LANG.en;

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
  if (EXTRA_CURRENCIES[upper]) return EXTRA_CURRENCIES[upper];
  return null;
}

function formatWith(cfg: CurrencyConfig, amountInUSD: number | string | null | undefined): string {
  const numeric = Number(amountInUSD ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const converted = safe * cfg.rateFromUSD;
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

export function formatCurrency(
  amountInUSD: number | string | null | undefined,
  language: string | undefined,
): string {
  return formatWith(resolveConfig(language), amountInUSD);
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
    // useAuth is safe to call here; this hook always runs inside React tree.
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
  // Priority: explicit per-user override > user's country > UI language fallback.
  const config =
    resolveByCode(overrideCode) ??
    (userCountry ? CURRENCY_BY_COUNTRY[userCountry] : null) ??
    resolveConfig(lang);
  return {
    config,
    code: config.code,
    symbol: config.symbol,
    locale: config.locale,
    format: (amountInUSD: number | string | null | undefined) => formatWith(config, amountInUSD),
    convert: (amountInUSD: number | string | null | undefined) => {
      const numeric = Number(amountInUSD ?? 0);
      const safe = Number.isFinite(numeric) ? numeric : 0;
      return safe * config.rateFromUSD;
    },
  };
}

export function getCurrencyConfigForCountry(countryCode: string | null | undefined): CurrencyConfig {
  if (countryCode === "HU" || countryCode === "IR") return CURRENCY_BY_COUNTRY[countryCode];
  return DEFAULT_CURRENCY;
}

/**
 * Format an amount using a specific country's currency. Used when an entity
 * (e.g. a provider) has its own country and prices should be shown in that
 * country's currency regardless of the viewer's UI language. Treats the input
 * as already-denominated in the target currency (no FX conversion); if the
 * source amount is in USD, convert first using getCurrencyConfigForCountry().
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
