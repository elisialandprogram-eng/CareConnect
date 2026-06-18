export function fmtBalance(n: string | number, currency = "USD") {
  const num = Number(n || 0);
  const cfgMap: Record<string, { locale: string; digits: number }> = {
    USD: { locale: "en-US", digits: 2 },
    HUF: { locale: "hu-HU", digits: 0 },
    IRR: { locale: "fa-IR", digits: 0 },
    GBP: { locale: "en-GB", digits: 2 },
    EUR: { locale: "de-DE", digits: 2 },
  };
  const cfg = cfgMap[currency] ?? cfgMap.USD;
  const safeCurr = currency in cfgMap ? currency : "USD";
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: safeCurr,
      maximumFractionDigits: cfg.digits,
      minimumFractionDigits: cfg.digits === 0 ? 0 : 2,
    }).format(num);
  } catch {
    return `${safeCurr} ${num.toFixed(cfg.digits)}`;
  }
}
