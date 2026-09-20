const TZ_STORAGE_KEY = "userTimezone";
const LANGUAGE_STORAGE_KEY = "i18nextLng";

function getDateLocale(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const language = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)?.split("-")[0];
    if (language === "hu") return "hu-HU";
    if (language === "fa") return "fa-IR";
  } catch {
    /* ignore */
  }
  return "en-US";
}

export function getUserTimezone(): string {
  if (typeof window === "undefined") return "UTC";
  try {
    const stored = window.localStorage.getItem(TZ_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function setUserTimezone(tz: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (tz) window.localStorage.setItem(TZ_STORAGE_KEY, tz);
    else window.localStorage.removeItem(TZ_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatDate(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const d = toDate(value);
  if (!d) return "";
  try {
    return d.toLocaleDateString(getDateLocale(), { ...options, timeZone: getUserTimezone() });
  } catch {
    return d.toLocaleDateString(undefined, options);
  }
}

export function formatTime(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  const d = toDate(value);
  if (!d) return "";
  try {
    return d.toLocaleTimeString(getDateLocale(), { ...options, timeZone: getUserTimezone() });
  } catch {
    return d.toLocaleTimeString(undefined, options);
  }
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  const d = toDate(value);
  if (!d) return "";
  try {
    return d.toLocaleString(getDateLocale(), { ...options, timeZone: getUserTimezone() });
  } catch {
    return d.toLocaleString(undefined, options);
  }
}

const ENGLISH_MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function parseChartDate(value: string | null | undefined, monthOnly = false): Date | null {
  if (!value) return null;
  const normalized = value.trim();
  const isoMonth = normalized.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) return new Date(Date.UTC(Number(isoMonth[1]), Number(isoMonth[2]) - 1, 1));
  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])));
  }
  const monthYear = normalized.match(/^([A-Za-z]{3})\s+(\d{2,4})$/);
  if (monthYear) {
    const month = ENGLISH_MONTHS.indexOf(monthYear[1].toLowerCase());
    if (month >= 0) {
      const year = Number(monthYear[2]);
      return new Date(Date.UTC(year < 100 ? 2000 + year : year, month, 1));
    }
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Localize API-provided month labels such as `2026-09` or `Sep 26`. */
export function formatMonthLabel(value: string | null | undefined): string {
  const date = parseChartDate(value, true);
  if (!date) return value ?? "";
  try {
    return date.toLocaleDateString(getDateLocale(), {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return value ?? "";
  }
}

/** Localize API-provided week labels such as `2026-09-14` or `Sep 14`. */
export function formatWeekLabel(value: string | null | undefined): string {
  const date = parseChartDate(value);
  if (!date) return value ?? "";
  try {
    return date.toLocaleDateString(getDateLocale(), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return value ?? "";
  }
}

export function tzShortLabel(tz?: string): string {
  const zone = tz || getUserTimezone();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}
