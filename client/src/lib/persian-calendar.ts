// Solar Hijri (Jalali / Persian) calendar utilities.
// Uses Intl.DateTimeFormat with `persian` calendar to convert Gregorian <-> Persian.

export const PERSIAN_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export const PERSIAN_MONTHS_EN = [
  "Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar",
  "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand",
];

// Persian week starts on Saturday (Shanbe).
export const PERSIAN_WEEK_DAYS_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
export const PERSIAN_WEEK_DAYS_EN = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

export interface PersianDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const persianFmt = new Intl.DateTimeFormat("en-u-ca-persian", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function gregorianToPersian(date: Date): PersianDate {
  const parts = persianFmt.formatToParts(date);
  const year = Number(parts.find(p => p.type === "year")?.value || 0);
  const month = Number(parts.find(p => p.type === "month")?.value || 0);
  const day = Number(parts.find(p => p.type === "day")?.value || 0);
  return { year, month, day };
}

// Convert a Persian date back to a Gregorian Date by binary search around an estimate.
export function persianToGregorian(p: PersianDate): Date {
  // Approximate: Persian year 1 starts roughly at Gregorian 622 CE.
  // (year-1)*365.2422 days after 622-03-21 + (month-1)*~30.44 + (day-1)
  const estDays =
    (p.year - 1) * 365.2422 + (p.month - 1) * 30.44 + (p.day - 1);
  let est = new Date(Date.UTC(622, 2, 21));
  est = new Date(est.getTime() + Math.round(estDays) * 86400000);

  // Refine
  for (let i = 0; i < 6; i++) {
    const cur = gregorianToPersian(est);
    if (cur.year === p.year && cur.month === p.month && cur.day === p.day) {
      return new Date(est.getUTCFullYear(), est.getUTCMonth(), est.getUTCDate());
    }
    const curOrdinal = cur.year * 366 + (cur.month - 1) * 31 + cur.day;
    const wantOrdinal = p.year * 366 + (p.month - 1) * 31 + p.day;
    est = new Date(est.getTime() + (wantOrdinal - curOrdinal) * 86400000);
  }
  return new Date(est.getUTCFullYear(), est.getUTCMonth(), est.getUTCDate());
}

// Days in a Persian month: months 1-6 have 31 days, 7-11 have 30, 12 has 29 or 30 (leap).
export function persianMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isPersianLeapYear(year) ? 30 : 29;
}

// Standard 33-year cycle approximation for Persian leap years.
export function isPersianLeapYear(year: number): boolean {
  const cycle = [1, 5, 9, 13, 17, 22, 26, 30];
  const mod = ((year % 33) + 33) % 33;
  return cycle.includes(mod);
}

// First day-of-week index (0=Sat ... 6=Fri) for the 1st of the given Persian month.
export function persianMonthStartWeekday(year: number, month: number): number {
  const g = persianToGregorian({ year, month, day: 1 });
  // JS Date.getDay(): 0=Sun, 1=Mon, ..., 6=Sat. Persian week starts Sat, so map: Sat->0, Sun->1, ..., Fri->6.
  return (g.getDay() + 1) % 7;
}

const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, d => persianDigits[Number(d)]);
}

export function formatPersianDate(date: Date, locale: "fa" | "en" = "fa"): string {
  const p = gregorianToPersian(date);
  const months = locale === "fa" ? PERSIAN_MONTHS_FA : PERSIAN_MONTHS_EN;
  const dayStr = locale === "fa" ? toPersianDigits(p.day) : String(p.day);
  const yearStr = locale === "fa" ? toPersianDigits(p.year) : String(p.year);
  return `${dayStr} ${months[p.month - 1]} ${yearStr}`;
}

export function formatPersianDateShort(date: Date, locale: "fa" | "en" = "fa"): string {
  const p = gregorianToPersian(date);
  const y = locale === "fa" ? toPersianDigits(p.year) : String(p.year);
  const m = locale === "fa" ? toPersianDigits(String(p.month).padStart(2, "0")) : String(p.month).padStart(2, "0");
  const d = locale === "fa" ? toPersianDigits(String(p.day).padStart(2, "0")) : String(p.day).padStart(2, "0");
  return `${y}/${m}/${d}`;
}
