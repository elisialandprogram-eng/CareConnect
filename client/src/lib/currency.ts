import { useTranslation } from "react-i18next";

export type SupportedCurrency = "USD" | "HUF" | "IRR";

type CurrencyConfig = {
  code: SupportedCurrency;
  locale: string;
  symbol: string;
  rateFromHUF: number;
  fractionDigits: number;
};

const CURRENCY_BY_LANG: Record<string, CurrencyConfig> = {
  en: {
    code: "USD",
    locale: "en-US",
    symbol: "$",
    rateFromHUF: 1 / 360,
    fractionDigits: 2,
  },
  hu: {
    code: "HUF",
    locale: "hu-HU",
    symbol: "Ft",
    rateFromHUF: 1,
    fractionDigits: 0,
  },
  fa: {
    code: "IRR",
    locale: "fa-IR",
    symbol: "﷼",
    rateFromHUF: 235,
    fractionDigits: 0,
  },
};

const DEFAULT_CURRENCY: CurrencyConfig = CURRENCY_BY_LANG.en;

function resolveConfig(language: string | undefined): CurrencyConfig {
  if (!language) return DEFAULT_CURRENCY;
  const base = language.toLowerCase().split("-")[0];
  return CURRENCY_BY_LANG[base] ?? DEFAULT_CURRENCY;
}

export function formatCurrency(
  amountInHUF: number | string | null | undefined,
  language: string | undefined,
): string {
  const cfg = resolveConfig(language);
  const numeric = Number(amountInHUF ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const converted = safe * cfg.rateFromHUF;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      maximumFractionDigits: cfg.fractionDigits,
      minimumFractionDigits: cfg.fractionDigits === 0 ? 0 : 2,
    }).format(converted);
  } catch {
    const rounded = converted.toFixed(cfg.fractionDigits);
    return `${cfg.symbol}${rounded}`;
  }
}

export function getCurrencyConfig(language: string | undefined): CurrencyConfig {
  return resolveConfig(language);
}

export function useCurrency() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const config = resolveConfig(lang);
  return {
    config,
    code: config.code,
    symbol: config.symbol,
    locale: config.locale,
    format: (amountInHUF: number | string | null | undefined) =>
      formatCurrency(amountInHUF, lang),
    convert: (amountInHUF: number | string | null | undefined) => {
      const numeric = Number(amountInHUF ?? 0);
      const safe = Number.isFinite(numeric) ? numeric : 0;
      return safe * config.rateFromHUF;
    },
  };
}
