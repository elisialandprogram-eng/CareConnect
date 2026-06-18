const TZ_STORAGE_KEY = "userTimezone";

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
    return d.toLocaleDateString(undefined, { ...options, timeZone: getUserTimezone() });
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
    return d.toLocaleTimeString(undefined, { ...options, timeZone: getUserTimezone() });
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
    return d.toLocaleString(undefined, { ...options, timeZone: getUserTimezone() });
  } catch {
    return d.toLocaleString(undefined, options);
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
