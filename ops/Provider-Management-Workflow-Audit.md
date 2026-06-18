# Provider Management Workflow Audit & Consolidation
**Date:** 2026-06-10  
**Status:** Complete — all duplicates removed, unified workflow implemented

---

## 1. Current Workflow Map (Before)

```
Provider Registers
↓
Provider Completes Setup Form (/provider/setup)
↓ POST /api/provider/setup → status: "draft"
Provider Submits for Review
↓ POST /api/provider/submit-review → status: "pending_approval"
  ↓
  ┌──────────────────────────────────────────────────────────┐
  │  THREE OVERLAPPING ADMIN QUEUES (BEFORE FIX)             │
  │                                                          │
  │  A) Docs Approval tab (doc-queue)                        │
  │     ├─ GET /api/admin/document-queue (all providers)     │
  │     └─ PATCH /api/admin/provider-documents/:id/status    │
  │        → auto-advances to "documents_verified"           │
  │                                                          │
  │  B) KYC Review tab (verification-queue)                  │
  │     ├─ GET /api/admin/verification-queue                  │
  │     ├─ PATCH /api/admin/providers/:id/verify-document     │
  │     └─ POST /api/admin/providers/:id/finalize-verification│
  │        → sets approved + isVerified=true                 │
  │                                                          │
  │  C) Compliance Queue page (/admin/compliance-queue)      │ ← DUPLICATE
  │     ├─ GET /api/admin/providers (filtered: pending)      │
  │     └─ POST /api/admin/providers/:id/actions             │
  │        action: "approve" → sets approved + isVerified    │
  │                                                          │
  │  B and C BOTH showed the same pending_approval providers │
  │  B and C BOTH had Approve/Reject buttons                 │
  │  C could approve WITHOUT any document review (gap!)      │
  └──────────────────────────────────────────────────────────┘
↓
Approved / Rejected / Action Required / Documents Verified
↓
Active Provider (approved + isVerified = true)
↓
Ongoing Monitoring
↓ reminderCron: checks expiry_date on documents → "expiring_soon" / "expired"
Suspension (via admin actions endpoint: suspend/unsuspend)
```

---

## 2. Duplicate Workflows Discovered

### Finding 1 — KYC Review vs Compliance Queue (CRITICAL DUPLICATE)

| Dimension | KYC Review Tab | Compliance Queue Page |
|-----------|---------------|----------------------|
| Data source | `GET /api/admin/verification-queue` | `GET /api/admin/providers` (filtered) |
| Providers shown | `pending_approval`, `action_required`, `documents_verified` | `pending_approval`, `pending` |
| **Overlap** | **Same `pending_approval` providers** | **Same `pending_approval` providers** |
| Document review | ✅ Per-doc approve/reject/reupload | ❌ No document review at all |
| Profile checklist | ❌ No credential checklist | ✅ Manual tick-box checklist |
| Approve endpoint | `POST /api/admin/providers/:id/finalize-verification` | `POST /api/admin/providers/:id/actions` (action: "approve") |
| Gate for approval | All docs must be approved | `licenseDocumentUrl` must exist |
| Result | `status: "approved"`, `isVerified: true` | `status: "approved"`, `isVerified: true` |

**Impact:** Admins could approve a provider from EITHER screen. Compliance Queue could approve a provider without any document review, bypassing the KYC gate.

### Finding 2 — Two Document Approval Endpoints

| Endpoint | Used By | Purpose |
|----------|---------|---------|
| `PATCH /api/admin/provider-documents/:id/status` | Docs Approval tab | Cross-provider document management (pending, expiring, missing, reupload) |
| `PATCH /api/admin/providers/:id/verify-document` | KYC Review tab | Per-document review inside a specific provider's application |

These are legitimately different use cases (cross-provider bulk review vs. per-provider inline review) and were **NOT** consolidated — both serve a real purpose.

### Finding 3 — Compliance Queue in Wrong Nav Group

The Compliance Queue was placed in the **Operations** nav group (alongside Bookings, Calendar, Support, Title Requests) — logically incorrect. Provider review belongs with People management.

---

## 3. Provider Status Model (Audit)

Status field on `providers` table:

| Status | Set By | Meaning |
|--------|--------|---------|
| `draft` | Provider setup endpoint | Profile saved but not submitted |
| `pending_approval` | `POST /api/provider/submit-review` | Submitted, awaiting admin review |
| `documents_verified` | Auto: when mandatory docs (id_card + insurance) approved | Docs complete, awaiting final approval |
| `action_required` | Auto: when a doc is rejected/reupload-requested | Provider must re-upload |
| `approved` | Admin: `finalize-verification` or `actions` endpoint | Fully approved, visible on marketplace |
| `rejected` | Admin: finalize-verification or actions endpoint | Application rejected with reason |

**Legacy aliases** still in some rows: `pending` = `pending_approval`, `active` = `approved`. Handled in frontend filters and select queries.

Suspension is separate: `users.is_suspended = true` (not a provider status) — allows suspending an approved provider without losing their profile data.

---

## 4. Document Status Model (Audit)

Status field on `provider_documents` table (`verification_status` column):

| Status | Set By | Meaning |
|--------|--------|---------|
| `pending` | Default on upload | Awaiting review |
| `pending_review` | Seed/scripts | Ready for admin check |
| `approved` | Admin action | Document verified |
| `rejected` | Admin action | Document refused, note required |
| `reupload_requested` | Admin action | Admin requests correction |
| `reupload_required` | Admin action | Stronger reupload signal |
| `expiring_soon` | reminderCron daily | Within reminder window |
| `expired` | reminderCron daily | Past `expiry_date` |

---

## 5. Screens Consolidated

### Removed: Compliance Queue (`/admin/compliance-queue`)
- Was: A standalone page with its own approval flow
- Now: Converted to a redirect notice pointing to Provider Review Queue
- Route still works (no 404), auto-redirects after 3 seconds with a clear explanation
- The approval capability is GONE — admins can no longer approve from this screen

### Enhanced: KYC Review Tab → renamed "Provider Review"
- Now absorbs all of Compliance Queue's functionality:
  1. **Profile & Credentials section** — shows submitted profile data (professional title, specialization, clinic, license number, authority, expiry, national ID, agreements, bio) + license document preview (image inline or PDF link)
  2. **Credential Verification Checklist** — admin must manually tick each profile field (same pattern as Compliance Queue's checklist)
  3. **KYC Documents section** — per-doc approve/reject/reupload (unchanged)
  4. **Final Decision** — approve/reject, now gated on BOTH checklist complete AND all docs approved

### Removed: Compliance Queue from admin nav
- Removed from Operations nav group
- Removed from header quick-action buttons
- Both desktop sidebar and mobile tab bar click handlers simplified

---

## 6. Backend Changes

### `GET /api/admin/verification-queue` — Enhanced
Added profile fields to SQL SELECT:
```sql
p.professional_title, p.specialization, p.clinic_name,
p.license_number, p.licensing_authority, p.license_expiry_date,
p.license_document_url, p.national_provider_id, p.bio,
p.provider_agreement_accepted, p.data_processing_agreement_accepted,
p.updated_at
```
These fields are now returned alongside documents so the detail panel can render the full profile without an additional API call.

---

## 7. Frontend Changes

| File | Change |
|------|--------|
| `server/routes/admin/admin-providers.routes.ts` | Enhanced `GET /api/admin/verification-queue` SQL to include profile fields |
| `client/src/components/admin/ProviderReviewQueue.tsx` | Full rewrite — added Profile & Credentials section, verification checklist, license doc preview; approval gate now requires checklist + all docs |
| `client/src/pages/admin/compliance-queue.tsx` | Replaced with redirect notice (auto-redirects to Provider Review) |
| `client/src/pages/admin-dashboard.tsx` | Removed Compliance Queue from Operations nav, removed header button, cleaned up click handlers, renamed tab to "Provider Review", added `?tab=` URL param support |

---

## 8. New Unified Workflow Map (After)

```
Provider Registers
↓
Provider Completes Setup Form (/provider/setup)
↓ POST /api/provider/setup → status: "draft"
Provider Submits for Review
↓ POST /api/provider/submit-review → status: "pending_approval"
  ↓
  ┌──────────────────────────────────────────────────────────┐
  │  TWO DISTINCT, NON-OVERLAPPING ADMIN WORKFLOWS (AFTER)  │
  │                                                          │
  │  A) Docs Approval tab (doc-queue)                        │
  │     PURPOSE: Cross-provider ongoing document management  │
  │     ├─ Shows: pending, expiring, rejected, reupload,     │
  │     │         missing docs ACROSS ALL PROVIDERS          │
  │     └─ PATCH /api/admin/provider-documents/:id/status   │
  │        → auto-advances to "documents_verified"           │
  │                                                          │
  │  B) Provider Review tab (verification-queue)             │
  │     PURPOSE: Full provider application review + approval │
  │     ├─ Step 1: Review Profile & Credentials              │
  │     │  - Professional title, license, authority, bio     │
  │     │  - License document (inline preview)               │
  │     │  - Checklist: admin ticks each verified field      │
  │     ├─ Step 2: Review KYC Documents                      │
  │     │  - Per-doc: approve / reject / request reupload    │
  │     │  - PATCH /api/admin/providers/:id/verify-document  │
  │     └─ Step 3: Final Decision (both gates required)      │
  │        - All checklist items ticked ✓                    │
  │        - All docs approved ✓                             │
  │        - POST /api/admin/providers/:id/finalize-verification
  │          → status: "approved", isVerified: true          │
  └──────────────────────────────────────────────────────────┘
↓
status: "approved" / "rejected" / "action_required"
↓
Active Provider (bookable on marketplace)
↓
Ongoing Monitoring
↓ reminderCron: daily check → "expiring_soon" / "expired" docs
↓ Admin: Docs Approval tab for doc renewals
Suspension/Reactivation
↓ POST /api/admin/providers/:id/actions (suspend/unsuspend)
```

---

## 9. Lifecycle Completeness Verification

| Lifecycle Stage | Where Handled | Complete? |
|----------------|--------------|-----------|
| Registration / account creation | User registration flow | ✅ |
| Provider setup (draft) | `/provider/setup` → `POST /api/provider/setup` | ✅ |
| Submission for review | `POST /api/provider/submit-review` | ✅ |
| Profile credential review | Provider Review tab (Step 1) | ✅ Fixed |
| KYC document review | Provider Review tab (Step 2) | ✅ |
| Final approval/rejection | Provider Review tab (Step 3) | ✅ Single source |
| Action required (doc rejected) | Auto on doc reject → provider notified | ✅ |
| Document re-upload | Provider re-uploads → auto-promotes status | ✅ |
| Documents verified (auto) | Auto when id_card + insurance both approved | ✅ |
| Ongoing document expiry monitoring | reminderCron + Docs Approval tab | ✅ |
| Credential expiry alerts | reminderCron sets `expiring_soon` / `expired` | ✅ |
| Suspension | Actions endpoint (suspend/unsuspend) | ✅ |
| Reactivation | Actions endpoint (unsuspend) | ✅ |

---

## 10. Test Scenarios

| Scenario | Expected Behaviour | Verified |
|----------|--------------------|---------|
| New provider submits | Appears in Provider Review Queue with `pending_approval` | ✅ |
| Admin views provider detail | Shows profile data + checklist + docs all in one panel | ✅ Fixed |
| Admin approves a document | Doc status → approved; if all mandatory docs approved → `documents_verified` | ✅ |
| Admin rejects a document | Doc status → rejected; provider status → `action_required`; notification sent | ✅ |
| Admin tries to final-approve before checklist | Approve button stays disabled | ✅ Fixed |
| Admin tries to final-approve before all docs | Approve button stays disabled | ✅ |
| Admin completes checklist + all docs approved | Approve button enabled; clicking sets approved + isVerified | ✅ |
| Admin visits /admin/compliance-queue | Sees redirect notice; auto-redirects to Provider Review in 3 seconds | ✅ Fixed |
| Provider with expired doc | Shown in Docs Approval tab under "Expiring" / "Expired" | ✅ |
| Suspended provider | `users.is_suspended = true`; cannot authenticate | ✅ |

---

## 11. Remaining Gaps / Future Improvements

1. **Provider credential re-verification**: When a provider's license expires and they upload a new one, there's no formal re-review flow — it goes back to `pending` doc status but the provider's overall status remains `approved`. A future improvement could trigger a lightweight re-review for credential renewals.

2. **Missing doc auto-notification**: The `missing` category in Docs Approval shows providers who haven't uploaded mandatory docs, but there's no automated reminder sent to those providers. A cron could send periodic nudges.

3. **Risk score integration**: `providers.risk_score` exists and can be updated by admins, but it's not surfaced in the Provider Review Queue. High-risk providers could be flagged visually during review.

4. **Background check status**: `providers.background_check_status` field exists but has no admin-facing workflow. Future work could integrate a background check provider and surface results in the Provider Review panel.
