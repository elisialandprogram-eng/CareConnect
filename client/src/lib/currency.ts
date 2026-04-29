import { useTranslation } from "react-i18next";

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
  let overrideCode: string | null = null;
  if (typeof window !== "undefined") {
    try {
      overrideCode = window.localStorage.getItem("preferredCurrency");
    } catch {
      overrideCode = null;
    }
  }
  const config = resolveByCode(overrideCode) ?? resolveConfig(lang);
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
