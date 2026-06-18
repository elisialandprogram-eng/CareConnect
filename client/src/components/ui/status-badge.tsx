/**
 * StatusBadge — single source of truth for ALL status rendering across GoldenLife.
 *
 * Covers: appointment, payment/refund, provider, document, and broadcast statuses.
 * Human-readable labels only — never exposes raw snake_case to the UI.
 * Dark-mode aware throughout.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Status maps ─────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  classes: string;
}

const APPOINTMENT_STATUS: Record<string, StatusConfig> = {
  pending:              { label: "Pending",        classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200/60 dark:border-orange-700/40" },
  approved:             { label: "Approved",       classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200/60 dark:border-blue-700/40" },
  confirmed:            { label: "Confirmed",      classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200/60 dark:border-green-700/40" },
  in_progress:          { label: "In Progress",    classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60 dark:border-amber-700/40" },
  completed:            { label: "Completed",      classes: "bg-muted text-foreground dark:bg-muted dark:text-foreground border-border/60 dark:border-border/40" },
  cancelled:            { label: "Cancelled",      classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60 dark:border-red-700/40" },
  cancelled_by_patient: { label: "Cancelled",      classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60 dark:border-red-700/40" },
  cancelled_by_provider:{ label: "Cancelled",      classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60 dark:border-red-700/40" },
  rejected:             { label: "Rejected",       classes: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200/60 dark:border-rose-700/40" },
  rescheduled:          { label: "Rescheduled",    classes: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200/60 dark:border-purple-700/40" },
  expired:              { label: "Expired",        classes: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-300/60 dark:border-zinc-600/40" },
  no_show:              { label: "No Show",        classes: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-400 border-stone-300/60 dark:border-stone-600/40" },
};

const PAYMENT_STATUS: Record<string, StatusConfig> = {
  pending:             { label: "Pending",              classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60" },
  pending_payment:     { label: "Awaiting Payment",     classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60" },
  processing:          { label: "Processing",           classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200/60" },
  completed:           { label: "Paid",                 classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200/60" },
  failed:              { label: "Failed",               classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60" },
  refunded:            { label: "Refunded",             classes: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200/60" },
  partially_refunded:  { label: "Partial Refund",       classes: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200/60" },
  processed:           { label: "Processed",            classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200/60" },
  not_required:        { label: "Not Required",         classes: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground border-border/60" },
};

const PROVIDER_STATUS: Record<string, StatusConfig> = {
  pending:              { label: "Pending Review",      classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60" },
  pending_approval:     { label: "Pending Approval",    classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60" },
  approved:             { label: "Approved",            classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200/60" },
  active:               { label: "Active",              classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200/60" },
  documents_verified:   { label: "Docs Verified",       classes: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200/60" },
  rejected:             { label: "Rejected",            classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60" },
  suspended:            { label: "Suspended",           classes: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200/60" },
  draft:                { label: "Draft",               classes: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/60" },
  inactive:             { label: "Inactive",            classes: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground border-border/60" },
};

const DOCUMENT_STATUS: Record<string, StatusConfig> = {
  pending:              { label: "Pending",             classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved:             { label: "Approved",            classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected:             { label: "Rejected",            classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  expired:              { label: "Expired",             classes: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  expiring_soon:        { label: "Expiring Soon",       classes: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  reupload_required:    { label: "Re-upload Required",  classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  under_review:         { label: "Under Review",        classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  missing:              { label: "Missing",             classes: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

const DISPUTE_STATUS: Record<string, StatusConfig> = {
  open:     { label: "Open",     classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  resolved: { label: "Resolved", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed:   { label: "Closed",   classes: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground" },
  rejected: { label: "Rejected", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const BUG_STATUS: Record<string, StatusConfig> = {
  new:              { label: "New",               classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200/60 dark:border-blue-700/40" },
  triaged:          { label: "Triaged",            classes: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200/60 dark:border-purple-700/40" },
  in_progress:      { label: "In Progress",        classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60 dark:border-amber-700/40" },
  waiting_for_user: { label: "Waiting for User",   classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200/60 dark:border-orange-700/40" },
  resolved:         { label: "Resolved",           classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200/60 dark:border-green-700/40" },
  closed:           { label: "Closed",             classes: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground border-border/60 dark:border-border/40" },
  duplicate:        { label: "Duplicate",          classes: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/60 dark:border-slate-600/40" },
  rejected:         { label: "Rejected",           classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60 dark:border-red-700/40" },
};

const BUG_SEVERITY: Record<string, StatusConfig> = {
  low:      { label: "Low",      classes: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/60" },
  medium:   { label: "Medium",   classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60" },
  high:     { label: "High",     classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200/60" },
  critical: { label: "Critical", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60" },
};

const BUG_PRIORITY: Record<string, StatusConfig> = {
  low:    { label: "Low",    classes: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/60" },
  medium: { label: "Medium", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200/60" },
  high:   { label: "High",   classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/60" },
  urgent: { label: "Urgent", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/60" },
};

const FALLBACK: StatusConfig = { label: "Unknown", classes: "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground" };

// ─── Domain union ─────────────────────────────────────────────────────────────

type StatusDomain = "appointment" | "payment" | "provider" | "document" | "dispute" | "bug" | "bug_severity" | "bug_priority";

function resolve(status: string | null | undefined, domain: StatusDomain): StatusConfig {
  const s = (status ?? "").toLowerCase();
  const map: Record<StatusDomain, Record<string, StatusConfig>> = {
    appointment: APPOINTMENT_STATUS,
    payment: PAYMENT_STATUS,
    provider: PROVIDER_STATUS,
    document: DOCUMENT_STATUS,
    dispute: DISPUTE_STATUS,
    bug: BUG_STATUS,
    bug_severity: BUG_SEVERITY,
    bug_priority: BUG_PRIORITY,
  };
  return map[domain][s] ?? FALLBACK;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: string | null | undefined;
  domain?: StatusDomain;
  className?: string;
  "data-testid"?: string;
}

/**
 * Renders a consistent, human-readable status badge.
 *
 * @param status  Raw status value from API (e.g. "in_progress", "pending_payment")
 * @param domain  Which status space to use for label+color lookup. Defaults to "appointment".
 *
 * Examples:
 *   <StatusBadge status={appt.status} />
 *   <StatusBadge status={payment.status} domain="payment" />
 *   <StatusBadge status={provider.status} domain="provider" />
 */
export function StatusBadge({
  status,
  domain = "appointment",
  className,
  "data-testid": testId,
}: StatusBadgeProps) {
  const { label, classes } = resolve(status, domain);
  return (
    <Badge
      className={cn("border font-medium", classes, className)}
      data-testid={testId}
    >
      {label}
    </Badge>
  );
}

/**
 * Returns only the CSS classes for a status (for wrapping in non-Badge elements).
 */
export function statusClasses(status: string | null | undefined, domain: StatusDomain = "appointment"): string {
  return resolve(status, domain).classes;
}

/**
 * Returns the human-readable label for a status.
 */
export function statusLabel(status: string | null | undefined, domain: StatusDomain = "appointment"): string {
  return resolve(status, domain).label;
}

/**
 * Returns a text-only color class for a document status (used for icons/inline text, not badges).
 */
export function docStatusTextClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "approved") return "text-green-600 dark:text-green-400";
  if (s === "rejected") return "text-red-600 dark:text-red-400";
  if (s === "expired") return "text-red-500 dark:text-red-400";
  if (s === "expiring_soon") return "text-amber-600 dark:text-amber-400";
  if (s === "reupload_requested" || s === "reupload_required") return "text-orange-600 dark:text-orange-400";
  if (s === "missing") return "text-slate-400 dark:text-slate-500";
  return "text-yellow-600 dark:text-yellow-400";
}
