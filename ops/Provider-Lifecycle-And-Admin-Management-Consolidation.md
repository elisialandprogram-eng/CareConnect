# Provider Lifecycle, Approval, Visibility & Admin Management Consolidation

**Sprint:** E4  
**Completed:** 2026-06-10  
**Scope:** GoldenLife / CareConnect — Provider-side lifecycle, verification, visibility, and admin workspace

---

## 1. Executive Summary

This sprint consolidated the provider lifecycle into 7 canonical states, unified all verification/approval logic, created a central visibility engine, massively enhanced the Provider 360° admin workspace, added a Provider Health Score, and corrected document criticality metadata.

---

## 2. Lifecycle State Migration

### Before → After

| Old Value         | New Canonical Value | Rationale                                         |
|-------------------|---------------------|---------------------------------------------------|
| `pending_approval`| `submitted`         | Clearer intent: provider has submitted for review |
| `pending`         | `submitted`         | Legacy alias, merged                              |
| `pending_documents` | `submitted`       | Legacy alias, merged                              |
| `documents_pending` | `submitted`       | Legacy alias, merged                              |
| `documents_verified` | `under_review`  | Clearer intent: all docs approved, awaiting final admin sign-off |
| `draft`           | `draft`             | Unchanged                                         |
| `action_required` | `action_required`   | Unchanged                                         |
| `approved`        | `approved`          | Unchanged                                         |
| `suspended`       | `suspended`         | Unchanged                                         |
| `deactivated`     | `deactivated`       | Unchanged                                         |

### Canonical 7-State Model

```
draft → submitted → under_review → approved
                ↘ action_required ↗         ↘ suspended
                                             ↘ deactivated
```

### Migration Mechanism

Added two idempotent `UPDATE` blocks to `runStartupMigrations()` in `server/db.ts`:
1. `UPDATE providers SET status = 'submitted' WHERE status IN ('pending_approval', 'pending', 'pending_documents', 'documents_pending')`
2. `UPDATE providers SET status = 'under_review' WHERE status = 'documents_verified'`

Both run on every boot — safe to re-execute since they only match the old values. New canonical stuck-state reconciliation block also added to `runStartupMigrations()` targeting the new `submitted`/`under_review` names.

---

## 3. Central Visibility Engine

**File:** `server/lib/provider-visibility.ts` (new)

### Exports

| Export | Purpose |
|--------|---------|
| `LIFECYCLE_STATES` | Canonical state constants object |
| `LifecycleState` | TypeScript union type |
| `getLifecycleLabel(status)` | Human-readable display label with legacy alias support |
| `getLifecycleColor(status)` | Tailwind class string for status badges |
| `normalizeLifecycleStatus(status)` | Maps any legacy value to canonical |
| `isProviderApproved(status)` | True if status is `approved` or `active` |
| `isProviderVisible(status, isVerified)` | True if visible in public listings |
| `isProviderSearchable(status, isVerified)` | True if appears in patient search |
| `isProviderBookable(status, isVerified, bookingsEnabled)` | True if bookings can be created |
| `isProviderInReviewQueue(status)` | True if status requires admin action |
| `isProviderInTerminalState(status)` | True if status is terminal |
| `getValidAdminTransitions(status)` | Returns valid next states for admin UI |
| `SQL_PROVIDER_VISIBLE` | SQL WHERE fragment for public listings |
| `SQL_PROVIDER_IN_QUEUE` | SQL WHERE fragment for admin review queue |

All predicates accept both canonical and legacy values — backward-compatible.

---

## 4. Verification State Machine Updates

**File:** `server/lib/verification.ts`

- `TRANSITIONABLE_PROVIDER_STATUSES` — added `submitted`, `under_review` to the set (kept legacy values during migration window)
- `recomputeProviderVerificationState()` — target state changed from `documents_verified` → `under_review`; guard condition updated to skip if already `under_review` or `documents_verified` (legacy compat)

---

## 5. Route Updates — Status String References

All old status string literals updated across:

| File | Changes |
|------|---------|
| `server/routes/provider.routes.ts` | `submit-review`: writes `submitted` (was `pending_approval`); response JSON says `status: "submitted"`; `isResubmission` guard includes `submitted`; `wasUnderReview` guard includes `submitted` + `under_review` |
| `server/routes/provider-media.routes.ts` | Auto-promotion on doc re-upload now sets `submitted` (was `pending_approval`) |
| `server/routes/admin/admin-providers.routes.ts` | Verification queue `WHERE` clause updated to `('submitted', 'under_review', 'action_required', 'pending_approval', 'documents_verified')` |
| `server/routes/admin/admin-home.routes.ts` | Home summary stats queries updated to include `submitted`/`under_review`; added `under_review_count` stat |

---

## 6. New Admin Actions

**Endpoint:** `POST /api/admin/providers/:id/actions`

Five new actions added to the switch block:

| Action | Effect |
|--------|--------|
| `deactivate` | Sets status=deactivated, suspends user account, sends provider notification |
| `reactivate` | Sets status=approved, unsuspends user, sends notification |
| `request_changes` | Sets status=action_required, sets rejectionReason, sends provider notification |
| `reset_verification` | Sets status=submitted, isVerified=false, all provider_documents reset to `pending` |
| `request_documents` | Sets status=action_required, sends notification listing required document types |

All actions write to `audit_logs` and dispatch provider notifications.

---

## 7. Provider 360° Workspace Enhancement

**File:** `client/src/components/admin/provider-operations-console.tsx`

### New Tabs (3 added)

| Tab | Content |
|-----|---------|
| **Health** | Provider Health Score (0–100, inverse of risk), 7 pass/fail factors with impact rating (high/medium) |
| **Verification** | Verification Center: mandatory KYC doc checklist, professional credentials grid, submission history |
| **Patients** | Patient Insights: unique patient count from recent appointments, engagement metrics (completion rate, cancellation rate, active bookings) |

Tab list now: Overview · Health · Verification · Services · Documents · Staff · Bookings · Financial · Patients · Timeline

### Provider Health Score

Score = `max(0, 100 - computedRisk)`. Seven factors:

| Factor | Impact |
|--------|--------|
| Identity Verified (isVerified) | High |
| Account Status (approved) | High |
| Mandatory Docs Approved | High |
| Account Not Suspended | High |
| Low Cancellation Rate (<20%) | Medium |
| Has Services | Medium |
| Bookings Enabled | Medium |

Visual: large score number, quality label (Excellent/Good/Fair/Poor), progress bar, factor cards with pass/fail coloring.

### Enhanced Operations Panel ("Quick Actions")

Panel renamed from "Operations" to "Quick Actions". New action buttons added:

| Button | Action |
|--------|--------|
| Reactivate Account (shown when deactivated) | `reactivate` |
| Request Changes | `request_changes` (with reason) |
| Deactivate (shown unless already deactivated) | `deactivate` (with reason) |
| Reset Verification | `reset_verification` |
| Request Documents | `request_documents` |
| View License (if licenseDocumentUrl set) | External link to license file |

Confirm dialog upgraded to use `CONFIRM_COPY` lookup with per-action titles, descriptions, and color variants (green/orange/red).

### Document Criticality Corrections

`DOC_PLACEHOLDERS` corrected per `server/lib/verification.ts` `MANDATORY_DOC_TYPES`:

| Document Type | Before | After |
|---------------|--------|-------|
| `address_proof` | `optional` | **`mandatory`** |
| `insurance` | `compliance-required` | **`optional`** |
| Ordering | id_card, insurance, business_registration, address_proof… | **id_card, address_proof, medical_license** first (mandatory KYC set) |

### Status Filter

`ProviderDirectory` status filter updated from old values (`pending`, `rejected`) to canonical set:
- `submitted`, `under_review`, `action_required`, `suspended`, `deactivated`, `draft`, `approved`

Status normalization in `filtered` memo updated to map `submitted`/`pending_approval`/`pending` → `submitted` and `under_review`/`documents_verified` → `under_review`.

---

## 8. Verification Queue UI (ProviderReviewQueue.tsx)

- `PROVIDER_STATUS_BADGE` map updated to include `submitted` and `under_review` keys (legacy aliases kept)
- Stats row: changed from per-status single-value match to multi-status array match so both canonical and legacy rows count correctly:
  - "Submitted" counts `submitted` + `pending_approval`
  - "Under Review" counts `under_review` + `documents_verified`
  - "Action Required" unchanged

---

## 9. Dead Code / Correctness Fixes

| Issue | Fix |
|-------|-----|
| `address_proof` marked "optional" in console despite being in `MANDATORY_DOC_TYPES` | Fixed — now shows "mandatory" |
| `insurance` marked "compliance-required" despite NOT being in `MANDATORY_DOC_TYPES` | Fixed — now shows "optional" |
| Submit-review returned `status: "pending_approval"` in JSON response | Fixed — now returns `status: "submitted"` |
| Auto-promotion after doc re-upload wrote `pending_approval` | Fixed — now writes `submitted` |
| Verification queue WHERE clause excluded `submitted`/`under_review` rows (post-migration) | Fixed — now matches all 5 status variants |
| Home summary stats only counted `pending_approval` for review queue | Fixed — now counts `submitted` + legacy |
| ProviderDirectory status filter had no option for `action_required`, `suspended`, `deactivated` | Fixed — all 7 lifecycle states now filterable |
| Operations Panel missing: deactivate, reactivate, request_changes, reset_verification, request_documents | Fixed — all 5 new actions added |

---

## 10. Files Modified

| File | Change Type |
|------|------------|
| `server/lib/provider-visibility.ts` | **New** — central visibility engine |
| `server/lib/verification.ts` | Modified — state machine update |
| `server/db.ts` | Modified — startup migration + stuck-state blocks |
| `server/routes/provider.routes.ts` | Modified — status string updates |
| `server/routes/provider-media.routes.ts` | Modified — auto-promotion status |
| `server/routes/admin/admin-providers.routes.ts` | Modified — queue query + 5 new actions |
| `server/routes/admin/admin-home.routes.ts` | Modified — stats queries |
| `client/src/components/admin/provider-operations-console.tsx` | Modified — tabs, health score, doc criticality, status filter, operations panel |
| `client/src/components/admin/ProviderReviewQueue.tsx` | Modified — status badge + stats counters |

---

## 11. Backward Compatibility

All changes are backward-compatible:
- Legacy status values still accepted everywhere (TRANSITIONABLE set, visibility predicates, SQL queries include both old and new names)
- The startup migration is idempotent — safe to re-run, no-ops when already canonical
- The stuck-state reconciliation has TWO blocks: one targeting legacy names, one targeting canonical names — both run on every boot until all rows are migrated
- API responses use new canonical names; frontend components handle both via normalization maps

---

## 12. Next Steps (not in scope for E4)

- Apply `isProviderVisible()` / `isProviderBookable()` from `provider-visibility.ts` to existing inline `status IN ('approved', 'active')` checks in `server/storage/database-storage.ts` and `server/routes/provider.routes.ts`
- Expose `under_review_count` from admin home summary in the admin dashboard UI
- Add `getValidAdminTransitions()` to restrict which action buttons show based on current status
