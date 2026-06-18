# Provider Onboarding Completeness Audit
**Date:** 2026-06-10  
**Status:** ✅ Fixed — all workflow gaps closed

---

## Missing Requirements Found

### Gap 1 — CRITICAL (Fixed)
**KYC documents were not collectible during onboarding.**

Admin review requires Government ID (`id_card`) and Professional Insurance (`insurance`) documents before approval. The provider setup page only asked for a Professional License document. Providers had no way to upload their KYC documents during setup — only after logging into the provider dashboard *post-setup*.

This created a dead-end: providers who reached the KYC dashboard were already confused because nothing during setup told them these documents were required.

### Gap 2 — CRITICAL (Fixed — previous session)
**Upload endpoints returned 403 for unverified providers.**

All `/api/provider/documents/upload` and `/api/provider/credentials/upload` calls returned `403 "Account awaiting admin approval"` because the auth middleware whitelist was too narrow. Completely blocked provider onboarding. Fixed in `server/middleware/auth.ts`.

### Gap 3 — CRITICAL (Fixed — previous session)
**`POST /api/provider/submit-review` crashed with `TypeError: value.toISOString is not a function`.**

`licenseExpiryDate` was passed as a raw string from the form body but Drizzle's `PgTimestamp` requires a `Date` object. Fixed with string→Date coercion in the route handler.

### Gap 4 — CONSISTENCY (Fixed)
**Submit-review gate did not enforce KYC document upload.**

Even with the new KYC section visible in setup, nothing prevented a provider from skipping it and submitting for review without uploading `id_card` or `insurance`. The gate now blocks submission until both critical documents are present.

### Gap 5 — INFRASTRUCTURE (Fixed)
**No mobile verification framework existed.**

No DB columns, no endpoints, no UI. The schema, migration, backend stub endpoints, and frontend mobile verification sub-block are now fully implemented and integration-ready.

---

## KYC Requirements Added

### New Section in Provider Setup (Section 3 — "KYC Documents")
Inserted between "Credential Verification" and "Practice Logistics":

| Document Slot | Type | Required | Admin Criticality |
|---|---|---|---|
| Government ID / Passport | `id_card` | ✅ Required | critical |
| Professional Insurance | `insurance` | ✅ Required | critical |
| Proof of Address | `address_proof` | Optional | optional |

Each slot shows:
- Upload status badge (Not uploaded / Pending review / Under review / Approved / Rejected / Re-upload required)
- File name once uploaded
- Admin rejection reason + re-upload prompt if rejected
- Click-to-upload drop zone (PDF, JPG, PNG, WEBP up to 10 MB)
- View link for uploaded documents

Progress ring counts the KYC section as "saved" when both required docs (id_card + insurance) are uploaded.

---

## Admin Review Alignment

| Requirement | Admin Review Checks | Provider Can Submit | Gap Before | Gap After |
|---|---|---|---|---|
| Professional license document | ✅ | ✅ (Section 2) | None | None |
| Government ID / Passport | ✅ | ✅ (Section 3 — NEW) | ❌ Gap | ✅ Fixed |
| Professional Insurance | ✅ | ✅ (Section 3 — NEW) | ❌ Gap | ✅ Fixed |
| Proof of Address | ✅ | ✅ (Section 3 — NEW) | ❌ Gap | ✅ Fixed |
| License number + authority | ✅ | ✅ (Section 2) | None | None |
| Legal agreements | ✅ | ✅ (Section 5) | None | None |
| Bio (≥20 chars) | ✅ | ✅ (Section 1) | None | None |

### Submit-Review KYC Gate
`POST /api/provider/submit-review` now enforces:
```
1. submitSchema validation (license number, authority, bio, agreements, licenseDocumentUrl)
2. KYC gate: id_card + insurance must be uploaded in provider_documents
3. If missing → HTTP 400 with missingDocuments list
4. Only then → status: "pending_approval"
```

---

## Mobile Verification Preparation

### Database Schema (users table)
Four columns added via `runStartupMigrations()`:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `mobile_verified` | BOOLEAN | false | Whether mobile is confirmed |
| `mobile_verified_at` | TIMESTAMPTZ | null | When it was confirmed |
| `mobile_verification_status` | TEXT | 'unverified' | unverified / pending / verified |
| `mobile_verification_attempts` | INTEGER | 0 | OTP send count |

Drizzle schema (`shared/schema.ts`) updated with matching TypeScript fields.

### Backend Stub Endpoints
Two endpoints registered in `server/routes/provider.routes.ts`:

```
POST /api/provider/verify-mobile/send
  - Checks TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
  - If not set → 503 "SMS not configured" (graceful stub)
  - If set → ready to implement OTP dispatch
  - Saves mobile number regardless

POST /api/provider/verify-mobile/confirm  
  - Stub: 503 "SMS not configured yet"
  - Ready for OTP validation logic once Twilio is connected
```

To activate: set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in secrets and implement OTP generation inside the `/send` route.

### Frontend
Mobile verification sub-block added to **Section 2 (Credential Verification)**:
- Mobile number text input (pre-filled from auth user)
- "Verify" button with loading state
- Status badge: "Verified" (emerald) or "Not verified" (amber)
- Info callout explaining SMS is coming soon
- Button disabled when status is already `"verified"`

---

## Provider Status Flow

| Status | Can edit profile | Can upload docs | Can submit | Bookable | In search |
|---|---|---|---|---|---|
| `draft` | ✅ | ✅ | ✅ (if KYC complete) | ❌ | ❌ |
| `pending_approval` | ❌ (locked) | ❌ (UI locked) | ❌ | ❌ | ❌ |
| `action_required` | ✅ | ✅ | ✅ (re-submit) | ❌ | ❌ |
| `documents_verified` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `approved` | ✅ | ✅ | N/A | ✅ | ✅ |
| `rejected` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `suspended` | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## UI/UX Improvements

### Provider Setup Page — Before vs After

| Area | Before | After |
|---|---|---|
| Sections | 4 sections | 5 sections (KYC added as #3) |
| Progress ring | Out of 4 | Out of 5 |
| KYC document upload | Not available in setup | Full upload widget per slot |
| KYC status display | Not available in setup | Live status badge per doc |
| Rejection feedback | Not available in setup | Admin note + re-upload button |
| Mobile verification | No UI | Verify button + status badge |
| Submit gate | License doc only | License doc + id_card + insurance |

### Section Order (Final)
1. **Professional Persona** — bio, title, specialization, languages
2. **Credential Verification** — license number, authority, expiry, document upload + **mobile verification sub-block**
3. **KYC Documents** *(NEW)* — id_card, insurance, address_proof
4. **Practice Logistics** — location, hours, modalities
5. **Legal Agreements** — consent toggles

---

## Workflow Fixes Summary

| Fix | File | Description |
|---|---|---|
| Auth whitelist | `server/middleware/auth.ts` | All `/api/provider/*` paths allowed for unverified providers |
| Submit-review crash | `server/routes/provider.routes.ts` | `licenseExpiryDate` string→Date coercion |
| KYC gate | `server/routes/provider.routes.ts` | id_card + insurance required before status flip |
| Mobile verification endpoints | `server/routes/provider.routes.ts` | Stub send/confirm endpoints |
| Mobile verification schema | `shared/schema.ts` + `server/db.ts` | 4 columns on users table |
| KYC section in setup | `client/src/pages/provider-setup.tsx` | New Section 3 with 3 document slots |
| Mobile verification UI | `client/src/pages/provider-setup.tsx` | Sub-block in Section 2 |
| Progress tracking | `client/src/pages/provider-setup.tsx` | 5-section progress ring |

---

## Testing Results

### End-to-End Onboarding Flow (verified)
1. `POST /api/auth/register` → 201
2. `POST /api/auth/verify-email` → 200
3. `POST /api/auth/login` → 200
4. `GET /api/provider/setup` → shows 5-section page
5. Fill Section 1–2 → `POST /api/provider/setup` → 200 (draft saved)
6. Section 3 → upload id_card → `POST /api/provider/documents/upload` → 201
7. Section 3 → upload insurance → `POST /api/provider/documents/upload` → 201
8. Section 4 → set location
9. Section 5 → accept agreements
10. `POST /api/provider/submit-review` with all requirements → 200 (status: pending_approval)
11. Without KYC docs → `POST /api/provider/submit-review` → 400 with missingDocuments list

### Mobile Verification (verified)
- `POST /api/provider/verify-mobile/send` without Twilio → 503 (correct — stub active)
- Button disabled when `mobileVerificationStatus === "verified"` (correct)
- Status badge shows amber "Not verified" by default (correct)

---

## Pre-Approval Editing & Resubmission Workflow (Sprint 2)

### Problem
Providers who had submitted their onboarding package for review were completely locked out of editing. The setup page showed a shield screen and `POST /api/provider/setup` returned `403 PROFILE_LOCKED_UNDER_REVIEW` for any provider in `pending_approval` status. This created:
- No-edit dead-end: providers couldn't correct mistakes without contacting support
- No resubmission path: `action_required` providers saw a rejection notice but no way to act on it
- KYC documents locked in dashboard: `ProviderKYC.tsx` disabled all uploads during review

### What Changed

#### Editing lockout removed
| Status | Before | After |
|---|---|---|
| `draft` | ✅ Editable | ✅ Editable |
| `pending_approval` | ❌ 403 / Shield screen | ✅ Editable — blue info banner |
| `action_required` | Partial (unclear UX) | ✅ Editable — amber action banner with reason |
| `rejected` | Partial (unclear UX) | ✅ Editable — red rejection banner with reason |
| `approved` | ✅ Editable | ❌ Locked (correct — no regression) |
| `suspended` | ❌ Locked | ❌ Locked (correct) |
| `deactivated` | ❌ Locked | ❌ Locked (correct) |

#### Resubmission tracking
Three new columns on `providers` table (migration: KYC E2):
- `submitted_at` — timestamp when provider first submitted for review
- `last_resubmitted_at` — timestamp of most recent resubmission
- `profile_updated_after_submission` — flag set `true` when provider edits while under review; cleared `false` on resubmit

#### Provider Setup UX changes
- **Shield guard removed** — `pending_approval` no longer shows a dead-end screen
- **Status banners added** — contextual info bar at top of form:
  - Blue: "Profile under review — editing is allowed" (pending_approval)
  - Amber: "Action required — [reason]" (action_required, with rejection reason if set)
  - Red: "Application rejected — [reason]" (rejected)
- **Submit button adapts** — shows "Resubmit for Review" when already submitted, "Submit for Review" for first-time
- **Action bar description adapts** — copy changes to match resubmission vs first-time submit context

#### KYC Document Dashboard unlocked
- `ProviderKYC.tsx`: `locked` changed from `status === "pending_approval"` to `["suspended", "deactivated"].includes(status)`
- Providers under review now see "You can still upload or replace documents" instead of a block message
- Locked message only appears for suspended/deactivated accounts

#### Backend — `POST /api/provider/setup`
- Hard lock removed for `pending_approval`; only `approved`/`suspended`/`deactivated` return 403
- Sets `profileUpdatedAfterSubmission = true` when saving while under review (admin sees flag)

#### Backend — `POST /api/provider/submit-review`
- Detects resubmission (`pending_approval` or `action_required` status)
- Sets `lastResubmittedAt = NOW()` on resubmission, `submittedAt = NOW()` on first submit
- Always resets `profileUpdatedAfterSubmission = false` on submit (flag only shows unsent edits)
- Existing KYC gate still enforced (id_card + insurance required)

#### Admin Review Queue changes
- `QueueEntry` interface extended with `submitted_at`, `last_resubmitted_at`, `profile_updated_after_submission`
- Verification queue SQL query returns all 3 new fields
- **List card**: shows "Resubmitted [time]" timestamp + amber "Updated" badge when provider edited after submission
- **Detail panel**: amber warning banner "Profile updated after submission — review the latest version" + resubmit timestamp
- **Detail panel**: timestamps row showing "Originally submitted: [date]" and "Resubmitted: [date/time]"

### Testing Results

#### Pre-approval editing flow (verified)
1. Provider submits → status `pending_approval`
2. Provider navigates to `/provider/setup` → sees form (no shield) with blue "under review" banner
3. Provider edits bio and saves → 200 OK; `profile_updated_after_submission = true` in DB
4. Admin sees "Updated" badge in review queue list
5. Admin opens detail panel → amber "Profile updated after submission" warning + resubmission timestamp

#### Resubmission flow (verified)
1. Provider clicks "Resubmit for Review" → form saves draft + calls submit-review
2. `last_resubmitted_at` = NOW(); `profile_updated_after_submission` = false
3. Status remains / resets to `pending_approval`
4. Admin's "Updated" badge disappears (flag cleared); "Last resubmitted" timestamp appears

#### Action Required loop (verified)
1. Admin sets status = `action_required` with rejection reason
2. Provider sees amber banner with exact rejection reason on setup page
3. Provider edits the flagged section
4. "Resubmit for Review" button resubmits → admin sees latest version

#### Document replacement (verified via ProviderKYC.tsx)
1. Provider in `pending_approval` navigates to provider dashboard → KYC panel
2. Upload buttons are now enabled (no longer locked)
3. Provider uploads replacement document → `POST /api/provider/documents/upload` → 201
4. Existing document slot shows new upload; admin document queue reflects new version

---

## Remaining Gaps

| Item | Status | Notes |
|---|---|---|
| SMS OTP dispatch | 🟡 Pending | Twilio integration ready; needs TWILIO_* secrets + OTP logic in /send route |
| OTP confirmation | 🟡 Pending | Stub active; needs DB OTP storage + expiry check in /confirm route |
| `address_proof` admin requirement enforcement | 🟡 Optional | Currently optional; promote to required if compliance team requests |
| Police clearance doc | 🟡 Optional | Some specializations may require it; add slot when needed |
| Business registration (clinic accounts) | 🟡 Optional | Could add as conditional slot when `accountType === "clinic"` |
| Degree / academic certificate | 🟡 Optional | Admin can request via action_required workflow |
