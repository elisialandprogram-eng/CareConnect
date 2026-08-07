/**
 * provider-visibility.ts — Central visibility engine for the provider lifecycle.
 *
 * Single source of truth for all "can this provider appear here?" decisions.
 * All search, listing, booking, and profile-display logic MUST call these
 * helpers instead of inlining status string comparisons.
 *
 * Canonical Lifecycle States:
 *   draft          → Profile started, not submitted
 *   submitted      → Provider submitted for review (was: pending_approval)
 *   under_review   → All mandatory docs approved, awaiting final admin sign-off (was: documents_verified)
 *   action_required → Docs rejected / info needed from provider
 *   approved       → Fully approved, visible, bookable
 *   suspended      → Temporarily suspended by admin
 *   deactivated    → Permanently deactivated
 *
 * Legacy aliases (still accepted for backward-compat reads):
 *   pending, pending_documents, documents_pending → submitted
 *   pending_approval → submitted
 *   documents_verified → under_review
 *   active → approved
 *   rejected → action_required (display only)
 */

// ── Canonical lifecycle state constants ────────────────────────────────────────
export const LIFECYCLE_STATES = {
  DRAFT:           "draft",
  SUBMITTED:       "submitted",
  UNDER_REVIEW:    "under_review",
  ACTION_REQUIRED: "action_required",
  APPROVED:        "approved",
  SUSPENDED:       "suspended",
  DEACTIVATED:     "deactivated",
} as const;

export type LifecycleState = typeof LIFECYCLE_STATES[keyof typeof LIFECYCLE_STATES];

// ── Label / badge display ──────────────────────────────────────────────────────
const LIFECYCLE_LABELS: Record<string, string> = {
  draft:            "Draft",
  submitted:        "Submitted",
  under_review:     "Under Review",
  action_required:  "Action Required",
  approved:         "Approved",
  suspended:        "Suspended",
  deactivated:      "Deactivated",
  // Legacy aliases → display as canonical
  pending:          "Submitted",
  pending_documents: "Submitted",
  documents_pending: "Submitted",
  pending_approval:  "Submitted",
  documents_verified: "Under Review",
  active:           "Approved",
  rejected:         "Action Required",
};

export function getLifecycleLabel(status: string): string {
  return LIFECYCLE_LABELS[status] ?? status;
}

const LIFECYCLE_COLORS: Record<string, string> = {
  draft:            "bg-slate-100 text-slate-700 border-slate-200",
  submitted:        "bg-yellow-50 text-yellow-800 border-yellow-200",
  under_review:     "bg-blue-50 text-blue-800 border-blue-200",
  action_required:  "bg-orange-50 text-orange-800 border-orange-200",
  approved:         "bg-green-50 text-green-800 border-green-200",
  suspended:        "bg-red-50 text-red-800 border-red-200",
  deactivated:      "bg-gray-100 text-gray-600 border-gray-300",
  // Legacy aliases
  pending:          "bg-yellow-50 text-yellow-800 border-yellow-200",
  pending_approval: "bg-yellow-50 text-yellow-800 border-yellow-200",
  documents_verified: "bg-blue-50 text-blue-800 border-blue-200",
  active:           "bg-green-50 text-green-800 border-green-200",
  rejected:         "bg-orange-50 text-orange-800 border-orange-200",
};

export function getLifecycleColor(status: string): string {
  return LIFECYCLE_COLORS[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

// ── Canonical normalizer ───────────────────────────────────────────────────────
// Maps any legacy or alias status value to its canonical form.
const STATUS_NORMALIZE_MAP: Record<string, string> = {
  pending:           "submitted",
  pending_documents: "submitted",
  documents_pending: "submitted",
  pending_approval:  "submitted",
  documents_verified: "under_review",
  active:            "approved",
  // rejected is kept as-is but displayed as action_required
};

export function normalizeLifecycleStatus(status: string): string {
  return STATUS_NORMALIZE_MAP[status] ?? status;
}

// ── Visibility predicates ──────────────────────────────────────────────────────

/**
 * True if the provider is in a terminal approved state (visible to patients).
 * Accepts both canonical ("approved") and legacy ("active") values.
 */
export function isProviderApproved(status: string): boolean {
  return status === "approved" || status === "active";
}

/**
 * True if the provider should appear in public search results and listings.
 * Requires: approved + verified.
 */
export function isProviderVisible(status: string, isVerified: boolean): boolean {
  return isProviderApproved(status) && isVerified;
}

/**
 * True if the provider should appear in search queries (same rule as visible,
 * kept as a separate predicate so the rule can diverge later without ripple).
 */
export function isProviderSearchable(status: string, isVerified: boolean): boolean {
  return isProviderApproved(status) && isVerified;
}

/**
 * True if the provider can receive new patient bookings.
 * Requires: approved + verified + bookings not explicitly disabled by admin.
 */
export function isProviderBookable(
  status: string,
  isVerified: boolean,
  bookingsEnabled?: boolean | null,
): boolean {
  return isProviderApproved(status) && isVerified && bookingsEnabled !== false;
}

/**
 * True if the provider is in a state that requires admin action
 * (review queue visibility).
 */
export function isProviderInReviewQueue(status: string): boolean {
  const s = normalizeLifecycleStatus(status);
  return s === "submitted" || s === "under_review" || s === "action_required";
}

/**
 * True if the provider status is a terminal state that admin cannot
 * auto-reverse without explicit action.
 */
export function isProviderInTerminalState(status: string): boolean {
  const s = normalizeLifecycleStatus(status);
  return s === "approved" || s === "suspended" || s === "deactivated";
}

/**
 * Returns the valid next lifecycle states an admin can manually transition to
 * from the given current state.
 */
export function getValidAdminTransitions(status: string): string[] {
  const s = normalizeLifecycleStatus(status);
  const map: Record<string, string[]> = {
    draft:           ["submitted"],
    submitted:       ["under_review", "action_required", "approved"],
    under_review:    ["action_required", "approved"],
    action_required: ["submitted", "approved"],
    approved:        ["suspended", "deactivated"],
    suspended:       ["approved", "deactivated"],
    deactivated:     ["approved"],
  };
  return map[s] ?? [];
}

// ── SQL helpers ────────────────────────────────────────────────────────────────
/** SQL fragment for "provider is visible to patients" — use in WHERE clauses. */
export const SQL_PROVIDER_VISIBLE = `p.status IN ('approved', 'active') AND p.is_verified = true`;

/** SQL fragment for "provider is in the review queue". */
export const SQL_PROVIDER_IN_QUEUE = `p.status IN ('submitted', 'under_review', 'action_required', 'pending_approval', 'documents_verified')`;
