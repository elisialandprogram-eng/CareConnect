/**
 * GoldenLife — Canonical non-currency, non-date formatting utilities.
 *
 * All functions here format non-monetary values (counts, percentages,
 * file sizes, durations, ratings, distances). They are the ONLY approved
 * way to format these values in the UI — never use Number.toLocaleString(),
 * Number.toFixed(), or inline Intl.NumberFormat for these purposes.
 *
 * Currency → use formatInCurrency() / useAdminCurrency().format()  (@/lib/currency)
 * Dates    → use formatDate() / formatTime() / formatDateTime()    (@/lib/datetime)
 */

const COUNT_FMT = new Intl.NumberFormat("en");

/**
 * Format an integer count with locale-appropriate thousand separators.
 * e.g. 12345 → "12,345"
 */
export function formatCount(n: number | null | undefined): string {
  const safe = Math.round(Number(n ?? 0));
  return COUNT_FMT.format(safe);
}

/**
 * Format a percentage to one decimal place.
 * e.g. 95.3 → "95.3%"
 */
export function formatPercent(n: number | null | undefined, digits = 1): string {
  const safe = Number(n ?? 0);
  return `${Number.isFinite(safe) ? safe.toFixed(digits) : "0"}%`;
}

/**
 * Format a byte count as a human-readable file size.
 * e.g. 1_572_864 → "1.5 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)         return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Format a star rating to one decimal place.
 * e.g. 4.8666 → "4.9"
 */
export function formatRating(n: number | null | undefined): string {
  const safe = Number(n ?? 0);
  return Number.isFinite(safe) && safe > 0 ? safe.toFixed(1) : "—";
}

/**
 * Format a duration in hours to one decimal place.
 * e.g. 2.5 → "2.5h"
 */
export function formatHours(n: number | null | undefined): string {
  const safe = Number(n ?? 0);
  return `${Number.isFinite(safe) ? safe.toFixed(1) : "0"}h`;
}

/**
 * Format a distance in kilometres to one decimal place.
 * e.g. 12.345 → "12.3 km"
 */
export function formatKMDistance(km: number | null | undefined): string {
  const safe = Number(km ?? 0);
  return `${Number.isFinite(safe) ? safe.toFixed(1) : "0"} km`;
}

/**
 * Compact number abbreviation for chart axis ticks.
 * e.g. 1_200_000 → "1.2M", 3_500 → "3.5k", 250 → "250"
 */
export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
