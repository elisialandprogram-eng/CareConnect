# Provider Profile Unification Verification Report — Sprint P8.1

**Date:** 2026-06-12  
**Status:** COMPLETE

---

## 1. Provider Profile Architecture Map

### Tables (single source of truth per concern)

| Table | Owner | Contents |
|-------|-------|----------|
| `users` | Auth | name, email, phone, city, language_preference, role |
| `providers` | Profile | bio, specialty, years_experience, is_verified, status, service_modes[], clinic_name, location, rating |
| `provider_documents` | KYC | id_card, address_proof, medical_license, insurance uploads + verification_status |
| `provider_credentials` | Credentials | medical_license URL mirrored from setup |
| `services` | Services offered | name, price, homeVisitFee, clinicFee, telemedicineFee, locationMode, duration, is_active |
| `practitioners` | Practitioners | names, title, bio, linked to provider |
| `provider_wallets` | Finances | available_balance |

### Routes (single authority per domain)

| Route | Purpose |
|-------|---------|
| `POST /api/provider/setup` | Full profile upsert (KYC + professional info + serviceModes) |
| `GET /api/provider/me` | Provider reads own profile |
| `GET /api/providers/:id` | Public profile |
| `GET /api/providers` | Public listing with minServicePrice enrichment |
| `PATCH /api/provider/preferences` | Notification prefs |
| `GET/PATCH /api/admin/providers/:id` | Admin view/edit |

### UI Entry Points (single path per role)

| Flow | Page/Component |
|------|---------------|
| Provider onboarding | `provider-setup.tsx` |
| Provider self-management | `provider-dashboard.tsx` → ProviderKYC / ProviderServicesTab |
| Public patient view | `provider-profile.tsx` |
| Provider selection | `providers.tsx`, `book-wizard.tsx` |
| Admin management | AdminDashboard → ProviderOperationsConsole / DocumentQueue |

---

## 2. Issues Found & Fixed

### Issue 1 — Delivery mode derivation used deprecated provider-level fee columns
**File:** `client/src/pages/provider-profile.tsx` lines 232–247  
**Problem:** `offersHome`, `offersOnline`, `offersClinic` were derived from `provider.homeVisitFee` and `provider.telemedicineFee` (deprecated provider-level columns) plus service fee amounts, not from the canonical `serviceModes[]` field.

**Fix:** Replaced with `providerServiceModes.includes(...)` as the primary check, with per-service `locationMode` as a structural fallback for providers who have services but no `serviceModes` set.

```
// Before: offersOnline = provider.telemedicineFee > 0 || service.telemedicineFee > 0
// After:  offersOnline = serviceModes.includes("online") || service.locationMode allows online
```

### Issue 2 — Legacy "Fees & Pricing" card on public profile
**File:** `client/src/pages/provider-profile.tsx` lines 495–514  
**Problem:** The About tab showed a "Fees & Pricing" card reading `provider.consultationFee`, `provider.homeVisitFee`, `provider.telemedicineFee`, `provider.emergencyCareFee` — all deprecated provider-level columns. This data is stale and misleading (per-service fees in the Services tab are the truth).

**Fix:** Removed the card entirely. Per-service pricing is shown in the Services tab; the booking sidebar already shows the correct min price.

### Issue 3 — Home visit fee line item in booking sidebar
**File:** `client/src/pages/provider-profile.tsx` lines 796–804  
**Problem:** The booking sidebar showed `provider.homeVisitFee` as a separate "Home visit" line item from the deprecated provider-level column.

**Fix:** Removed the line item. Home visit fees are shown per-service in the Services tab.

### Issue 4 — `consultationFee` fallback in booking sidebar and no-services display
**File:** `client/src/pages/provider-profile.tsx` lines 674, 767  
**Problem:** Both `getProviderDisplayPrice()` calls used `provider.consultationFee` as the base price fallback — a deprecated provider-level column.

**Fix:** Both now use `(provider as any).minServicePrice ?? provider.consultationFee` — the server-enriched minimum service price takes precedence.

### Issue 5 — `consultationFee` in book-wizard provider selection list
**File:** `client/src/pages/book-wizard.tsx` line 595  
**Problem:** The provider picker in the booking wizard displayed `p.consultationFee` (deprecated provider-level column) as the fee label.

**Fix:** Now uses `(p as any).minServicePrice ?? p.consultationFee ?? 0` — the server-enriched minimum service price from the `/api/providers` response takes precedence.

### Issue 6 — Orphaned `FileText` icon import
**File:** `client/src/pages/provider-profile.tsx` line 15  
**Problem:** After removing the "Fees & Pricing" card, `FileText` was imported but no longer used.

**Fix:** Removed from the lucide-react import statement.

---

## 3. Verified Correct (No Changes Needed)

| Item | Status |
|------|--------|
| KYC gating: `id_card` + `address_proof` required | ✅ `kycSaved = !!(kycIdCard && kycAddressProof)` |
| Insurance: optional | ✅ `required: false` in KYC_SETUP_SLOTS; `"optional"` criticality on upload |
| `MANDATORY_DOC_TYPES` = id_card, address_proof, medical_license | ✅ `server/lib/verification.ts` line 18-22 |
| Admin verification queue shows insurance as optional | ✅ `provider-operations-console.tsx` line 97 comment |
| `serviceModes[]` is in schema + provider-setup form | ✅ `shared/schema.ts` + `provider-setup.tsx` |
| Service delivery modes in admin views read serviceModes | ✅ All admin views use `provider.serviceModes` |
| `appointment-details.tsx` + `booking-confirmation.tsx` service fee reads | ✅ Read from `s.homeVisitFee`/`s.telemedicineFee` (service-level — correct) |
| `add-service-catalogue-dialog.tsx`, `service-form-dialog.tsx`, `ProviderServicesTab.tsx` | ✅ All write to services table — correct |
| Provider card (`provider-card.tsx`) | ✅ Uses `minServicePrice` (enriched server-side) — no legacy fields |
| Provider listing filter + sort (`providers.tsx`) | ✅ Fixed in P9 sprint |
| Provider matcher budget score | ✅ Fixed in P9 sprint — uses `minServicePrice` |
| Appointment pricing fallback | ✅ Fixed in P9 sprint — uses `0` not provider-level fee |
| No `offersHomeVisit`, `clinicVisitEnabled`, `onlineConsultationEnabled`, `consultationType`, `deliveryMode`, `deliveryType`, `visitMode` fields | ✅ Confirmed absent across all files |

---

## 4. Service Delivery Mode Architecture (Final)

```
serviceModes[] on providers table
  ↓ canonical source
  set in: provider-setup.tsx (multi-select checkboxes)
  read by:
    - provider-profile.tsx: derives offersHome/offersOnline/offersClinic badges
    - providers.tsx: homeVisit filter (serviceModes.includes("home_visit"))
    - providerMatcher.ts: ProviderCandidate.offeredModes (if populated)
    - appointment.routes.ts: locationMode enforced per svcRecord (per-service)

Per-service locationMode on services table
  ↓ secondary source (per-service granularity)
  set in: ProviderServicesTab, add-service-catalogue-dialog, service-form-dialog
  read by:
    - provider-profile.tsx: fallback delivery mode derivation
    - appointment.routes.ts: validates requested visitType against svcLocMode
    - booking: locationMode filters available visit types per service

NO LEGACY FIELDS in active delivery-mode logic:
  ✗ providers.homeVisitFee   — deprecated, not used for mode detection
  ✗ providers.telemedicineFee — deprecated, not used for mode detection
```

---

## 5. Profile Completion Logic (Final)

### Patient Profile (`patient-dashboard.tsx`)
Computed client-side from user fields: name, phone, address, profile photo, dob.

### Provider Profile Readiness (`ProviderKYC.tsx`)
7-item checklist:
1. Government ID uploaded (`id_card`)  
2. Medical licence uploaded (`medical_license`)  
3. Proof of address uploaded (`address_proof`)  
4. Bio / description  
5. Profile photo  
6. Specialization  
7. Location / clinic set  

Insurance is **NOT** in the readiness checklist (correctly optional).

### Submit-Review Gate (`server/routes/provider.routes.ts`)
Requires `id_card` + `address_proof` in `provider_documents` before allowing submission. Medical license via `provider_credentials`. Insurance **not required** for submission.

---

## 6. Admin Verification Architecture (Final)

| Screen | What's shown | Insurance treatment |
|--------|-------------|---------------------|
| DocumentQueue | id_card, address_proof, medical_license, insurance | Approve/reject each independently |
| ProviderOperationsConsole | Same, plus status badges | Insurance shown as optional |
| ProviderReviewQueue | Clinic name, key fields | No insurance gating |

No UI or server route implies insurance is mandatory for approval.

---

## 7. Public Profile Architecture (Final)

The patient-facing `provider-profile.tsx` shows:
- Provider header: name, type, rating, city, years experience
- Service delivery mode badges: derived from `serviceModes[]` (canonical) + service `locationMode` fallback
- About tab: bio, specialties, education, languages, workplace, verification badges
- Services tab: per-service pricing with `service.price` (no provider-level fee columns)
- Reviews tab: patient reviews
- Booking sidebar: `minServicePrice` from enriched API response, visit type badges from `serviceModes[]`

No duplicated profile sections. No legacy provider-level fee display.

---

## 8. Files Changed

| File | Change |
|------|--------|
| `client/src/pages/provider-profile.tsx` | Delivery mode derivation → serviceModes[]; removed legacy Fees & Pricing card; removed homeVisitFee sidebar item; consultationFee → minServicePrice in two display price calls; removed unused FileText import |
| `client/src/pages/book-wizard.tsx` | consultationFee → minServicePrice for provider fee label |

---

## 9. Validation

| Check | Result |
|-------|--------|
| `npm run build` (client + server) | ✅ PASSED (32s) |
| No legacy delivery mode fields in active logic | ✅ Confirmed (grep clean) |
| No `offersHomeVisit` / `clinicVisitEnabled` / `deliveryMode` fields | ✅ Confirmed absent |
| Insurance optional in all forms and server logic | ✅ Confirmed |
| id_card + address_proof required everywhere | ✅ Confirmed |
| serviceModes[] is single delivery mode source | ✅ Confirmed |

---

## 10. Remaining Recommendations (Out of P8.1 Scope)

| Item | Effort | Priority |
|------|--------|----------|
| `ProviderTimeEngine.tsx` — surge pricing base fees still write `providers.consultationFee`/`homeVisitFee`/`telemedicineFee`. Needs refactor to write to per-service rows | Medium | P10 |
| `providers.consultationFee`/`homeVisitFee`/`telemedicineFee`/`emergencyCareFee` DB columns — can be dropped once TimeEngine refactor is done | Low | Post-P10 |
| `providers.tsx` price range filter has no max-price calibration for HUF (large numbers) — UX improvement | Low | Future |
