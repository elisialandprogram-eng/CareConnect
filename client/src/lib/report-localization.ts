type Translate = any;

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function reportLabel(
  t: Translate,
  group: "visit_type" | "payment_method" | "status" | "provider_type" | "package_status" | "priority" | "role" | "day_short",
  value: string | null | undefined,
  fallback?: string,
): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback ?? "";
  const translated = String(t(`reporting.${group}.${normalized}`, { defaultValue: "" }) ?? "");
  return translated || fallback || humanize(normalized);
}

export function reportVisitTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "visit_type", value, fallback);
}

export function reportPaymentMethodLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "payment_method", value, fallback);
}

export function reportStatusLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "status", value, fallback);
}

export function reportProviderTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "provider_type", value, fallback);
}

export function reportPackageStatusLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "package_status", value, fallback);
}

export function reportPriorityLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "priority", value, fallback);
}

export function reportRoleLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "role", value, fallback);
}