# Sprint P8.2 — Provider Profile Finalization & Legacy Removal

**Date:** 2026-06-12  
**Status:** COMPLETE  
**TypeScript check:** 0 errors

---

## Summary

Eight workstreams executed to finalize the provider domain and eliminate architectural drift across frontend and backend.

---

## Workstream Results

### WS1 — Mobile Number Enforcement ✅
**File:** `server/routes/provider.routes.ts`  
**Change:** Added mobile number gate in submit-review handler (after KYC gate).  
- Reads `storage.getUser(req.user.id)` to check `mobileNumber ≥ 7 chars`.  
- Returns HTTP 400 with `field: "mobileNumber"` error if missing/short.  
- Frontend hint added in `client/src/pages/provider-setup.tsx` — red banner in global action bar when `mobileInput` is empty.

---

### WS2 — Workplace Validation for Clinic Visits ✅
**File:** `server/routes/provider.routes.ts`  
**Change:** Added clinic_visit workplace gate immediately after mobile gate.  
- Checks `merged.serviceModes.includes("clinic_visit")`.  
- Validates `primaryServiceLocation || clinicFormattedAddress`, `city`, `country`.  
- Returns HTTP 400 with per-field errors if any are missing.  
- Frontend hint added in `client/src/pages/provider-setup.tsx` Section 4 — red banner when clinic_visit is selected but address/city is empty.

---

### WS3 — Booking Window Authority (Remove from profile.tsx) ✅
**File:** `client/src/pages/profile.tsx`  
**Removed:**  
- `scheduleSettings` state (`minimumNoticeMinutes`, `maximumBookingDays`)  
- `useEffect` that populated `scheduleSettings` from `providerData`  
- `saveScheduleMutation` (PATCH `/api/provider/office-hours`)  
- Entire **Scheduling Settings** Card in JSX (min-notice input, booking window input, availability version display, Save button)  

**Authority:** SmartScheduler's `WorkloadControlsCard` is the single source for booking window configuration.

---

### WS4 — Fee Legacy Removal ✅

**`client/src/pages/profile.tsx`**  
- Removed `consultationFee: string` from `FormState` interface  
- Removed `consultationFee: "0"` from `emptyForm`  
- Removed `consultationFee: providerData?.consultationFee || "0"` from `useEffect`  
- Removed Consultation Fee grid cell from read-only Professional Details card; Years of Experience now renders as single full-width field  

**`client/src/pages/providers.tsx`** (3 places)  
- Removed `?? p.consultationFee` fallback in price range filter  
- Removed `?? a.consultationFee` fallback in price-low sort  
- Removed `?? b.consultationFee` fallback in price-high sort  

**`client/src/pages/provider-profile.tsx`** (2 places)  
- Removed `?? provider.consultationFee` fallback in services-tab `getProviderDisplayPrice` call  
- Removed `?? provider.consultationFee` fallback in booking widget `getProviderDisplayPrice` call  

**`client/src/pages/book-wizard.tsx`** (1 place)  
- Removed `?? p.consultationFee` fallback in provider card fee display  

**`server/routes/admin/admin-providers.routes.ts`**  
- Removed explicit `consultationFee: providerData.consultationFee.toString()` and `homeVisitFee: ...` overrides from admin provider creation — these were crash-prone (`.toString()` on undefined) and redundant with the `...providerData` spread.  

**Result:** All pricing reads now rely solely on `minServicePrice` (computed from active services). Legacy `consultationFee` column is no longer written or read by any frontend or admin code.

---

### WS5 — Document Panel Consolidation (No Code Change) ✅
**Files analyzed:** `client/src/components/provider/dashboard/ProviderKYC.tsx`, `client/src/components/provider-documents-panel.tsx`  
**Finding:** These panels are NOT duplicates — they serve distinct concerns:  
- `ProviderKYC.tsx` → KYC identity documents (`id_card`, `address_proof`, `medical_license`) via `POST /api/provider/documents/upload`  
- `provider-documents-panel.tsx` → Professional credentials (photo, certificates, insurance) via `POST /api/provider/credentials/upload`  

Both correctly read from `GET /api/provider/documents` for status display only. No consolidation required; separation is intentional.

---

### WS6 — Submit-Review Completion Logic ✅
**File:** `server/routes/provider.routes.ts`  
The submit-review handler now enforces the following gates in order:  
1. Profile completeness (professionalTitle, specialization, licensingAuthority, licenseNumber, bio ≥ 20 chars, agreements, licenseDocumentUrl)  
2. KYC documents (id_card + address_proof — required; insurance — optional)  
3. Mobile number (≥ 7 chars on user account)  
4. Workplace (primaryServiceLocation/clinicFormattedAddress + city + country — only when clinic_visit mode is selected)  

---

### WS7 — serviceModes as Canonical Source ✅
**File:** `client/src/pages/provider-profile.tsx`  
**Change:** Replaced three-way `offersOnline`/`offersHome`/`offersClinic` derivation that fell back to per-service `locationMode` with a clean three-liner:  
```ts
const offersOnline  = providerServiceModes.includes("online");
const offersHome    = providerServiceModes.includes("home_visit");
const offersClinic  = providerServiceModes.includes("clinic_visit");
```  
Also corrected the clinic value from the stale `"clinic"` to the correct `"clinic_visit"` (matching provider-setup.tsx form values).  

All `activeProviderServices` iteration for mode derivation removed.

---

### WS8 — This Report ✅
**File:** `ops/Provider-Profile-Finalization-Report.md`

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `server/routes/provider.routes.ts` | Backend | Mobile gate + workplace gate added |
| `client/src/pages/provider-setup.tsx` | Frontend | Mobile + workplace UX warnings |
| `client/src/pages/profile.tsx` | Frontend | Remove scheduleSettings, saveScheduleMutation, consultationFee |
| `client/src/pages/providers.tsx` | Frontend | Remove 3× consultationFee fallbacks |
| `client/src/pages/provider-profile.tsx` | Frontend | Remove 2× consultationFee fallbacks + legacy locationMode fallback derivation |
| `client/src/pages/book-wizard.tsx` | Frontend | Remove 1× consultationFee fallback |
| `server/routes/admin/admin-providers.routes.ts` | Backend | Remove explicit fee writes in provider creation |

---

## Post-Sprint State

- **Pricing authority:** `minServicePrice` (computed from active services) — no legacy fallbacks
- **Mode derivation:** `serviceModes[]` array — no per-service `locationMode` fallbacks  
- **Booking window authority:** SmartScheduler `WorkloadControlsCard` — removed from profile.tsx  
- **Submit-review gates:** 4-stage enforced gate in `server/routes/provider.routes.ts`  
- **TypeScript:** 0 errors post-sprint
