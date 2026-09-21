type Translate = any;

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function reportLabel(
  t: Translate,
  group:
    | "visit_type"
    | "payment_method"
    | "status"
    | "provider_type"
    | "package_status"
    | "priority"
    | "role"
    | "day_short"
    | "document_type"
    | "lifecycle_action"
    | "audit_action"
    | "medical_history_type"
    | "ledger_entry_type"
    | "relationship"
    | "benefit_type"
    | "credential_type"
    | "system_event_type"
    | "location_mode",
  value: string | null | undefined,
  fallback?: string,
): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback ?? "";
  const translated = String(t(`reporting.${group}.${normalized}`, { defaultValue: "" }) ?? "");
  if (translated) return translated;
  if (fallback && fallback !== humanize(normalized) && fallback !== normalized) return fallback;
  return String(t("reporting.unknown", { defaultValue: "Unknown" }));
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

export function reportDocumentTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "document_type", value, fallback);
}

export function reportLifecycleActionLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "lifecycle_action", value, fallback);
}

export function reportAuditActionLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "audit_action", value, fallback);
}

export function reportMedicalHistoryTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "medical_history_type", value, fallback);
}

export function reportLedgerEntryTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "ledger_entry_type", value, fallback);
}

export function reportRelationshipLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "relationship", value, fallback);
}

export function reportBenefitTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "benefit_type", value, fallback);
}

export function reportCredentialTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "credential_type", value, fallback);
}

export function reportSystemEventTypeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "system_event_type", value, fallback);
}

export function reportLocationModeLabel(t: Translate, value: string | null | undefined, fallback?: string): string {
  return reportLabel(t, "location_mode", value, fallback);
}