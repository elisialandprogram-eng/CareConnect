/**
 * verification.ts — single source of truth for provider document verification.
 *
 * Canonical document lifecycle:
 *   pending → under_review → approved | rejected | reupload_required | expired
 *
 * Exports:
 *   MANDATORY_DOC_TYPES       — exactly three KYC docs required for approval
 *   CANONICAL_DOC_STATUSES    — only these values are stored in provider_documents
 *   normalizeDocStatus()      — maps legacy aliases to canonical form at boundaries
 *   recomputeProviderVerificationState() — atomic recompute of providers.status + is_verified
 */

import { pool } from "../db";
import { storage } from "../storage";

// ── Mandatory document types ───────────────────────────────────────────────────
export const MANDATORY_DOC_TYPES = [
  "id_card",
  "address_proof",
  "medical_license",
] as const;

export type MandatoryDocType = (typeof MANDATORY_DOC_TYPES)[number];

// ── Canonical document status set ─────────────────────────────────────────────
// All stored verification_status values MUST be one of these.
export const CANONICAL_DOC_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "reupload_required",
  "expired",
  "expiring_soon",
] as const;

export type CanonicalDocStatus = (typeof CANONICAL_DOC_STATUSES)[number];

// ── Status normalization ───────────────────────────────────────────────────────
// Maps legacy / alias values to their canonical form.
// Call this at every API boundary before writing to the DB.
// Never use legacy strings after this boundary — all downstream code uses canonical only.
const STATUS_ALIAS_MAP: Record<string, CanonicalDocStatus> = {
  // pending_review = waiting for admin review → canonical: under_review
  pending_review:      "under_review",
  verification_pending: "under_review",
  // reupload variants → canonical: reupload_required
  reupload_requested:  "reupload_required",
  // virtual state that should never be stored → treat as pending
  missing:             "pending",
};

export function normalizeDocStatus(status: string): CanonicalDocStatus {
  return (STATUS_ALIAS_MAP[status] ?? status) as CanonicalDocStatus;
}

// ── Provider state machine ────────────────────────────────────────────────────
// Provider statuses that can be automatically transitioned by document events.
// Terminal states (approved / rejected / suspended / deactivated) require a human admin.
const TRANSITIONABLE_PROVIDER_STATUSES = new Set([
  // Legacy aliases kept for backward-compat during migration window
  "pending",
  "pending_documents",
  "documents_pending",
  "pending_approval",
  "documents_verified",
  // Canonical names
  "submitted",
  "under_review",
  "action_required",
]);

/**
 * Atomically recomputes a provider's aggregate verification state after any
 * document status change.  This is the ONLY function that writes to
 * providers.status + providers.is_verified automatically.
 *
 * Transitions (only within TRANSITIONABLE_PROVIDER_STATUSES):
 *   ALL mandatory docs approved  → under_review (is_verified stays false until finalize)
 *   ANY mandatory doc rejected | reupload_required → action_required (is_verified = false)
 */
export async function recomputeProviderVerificationState(
  providerId: string,
  performedByUserId: string,
  countryCode?: string | null,
): Promise<void> {
  // Fetch provider state + mandatory doc statuses in one round-trip
  const [providerRes, docsRes] = await Promise.all([
    pool.query<{ status: string; user_id: string; is_verified: boolean }>(
      `SELECT status, user_id, is_verified FROM providers WHERE id = $1`,
      [providerId],
    ),
    pool.query<{ document_type: string; verification_status: string }>(
      `SELECT document_type, verification_status
         FROM provider_documents
        WHERE provider_id = $1
          AND document_type = ANY($2::text[])`,
      [providerId, MANDATORY_DOC_TYPES],
    ),
  ]);

  const provider = providerRes.rows[0];
  if (!provider) return;

  // Never auto-transition terminal states
  if (!TRANSITIONABLE_PROVIDER_STATUSES.has(provider.status)) return;

  const docMap = new Map<string, string>(
    docsRes.rows.map((r) => [r.document_type, r.verification_status]),
  );

  const allApproved = MANDATORY_DOC_TYPES.every(
    (t) => docMap.get(t) === "approved",
  );
  const anyActionRequired = MANDATORY_DOC_TYPES.some((t) => {
    const s = docMap.get(t);
    return s === "rejected" || s === "reupload_required";
  });

  // Canonical target is "under_review" — also guard legacy value "documents_verified"
  if (allApproved && provider.status !== "under_review" && provider.status !== "documents_verified") {
    // Use a transaction so status + is_verified update atomically
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE providers
            SET status = 'under_review',
                is_verified = false,   -- finalize-verification sets this to true
                updated_at = NOW()
          WHERE id = $1`,
        [providerId],
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
       VALUES ($1, 'provider_documents_verified', 'provider', $2, $3, $4)`,
      [
        performedByUserId,
        providerId,
        JSON.stringify({ trigger: "auto_all_mandatory_docs_approved" }),
        countryCode ?? null,
      ],
    ).catch(() => {});

    if (provider.user_id) {
      storage.createUserNotification({
        userId:  provider.user_id,
        title:   "Documents Verified ✓",
        message: "All required documents have been approved. Your profile is now under final compliance review.",
        type:    "document_status",
        data:    JSON.stringify({ providerId, autoAdvanced: true }),
      }).catch(() => {});
    }
    return;
  }

  if (anyActionRequired && provider.status !== "action_required") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE providers
            SET status = 'action_required',
                is_verified = false,
                updated_at = NOW()
          WHERE id = $1`,
        [providerId],
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
       VALUES ($1, 'provider_action_required', 'provider', $2, $3, $4)`,
      [
        performedByUserId,
        providerId,
        JSON.stringify({ trigger: "auto_mandatory_doc_needs_action" }),
        countryCode ?? null,
      ],
    ).catch(() => {});

    if (provider.user_id) {
      storage.createUserNotification({
        userId:  provider.user_id,
        title:   "Action Required",
        message: "One or more required documents need attention. Please re-upload the flagged documents.",
        type:    "document_status",
        data:    JSON.stringify({ providerId }),
      }).catch(() => {});
    }
  }
}
