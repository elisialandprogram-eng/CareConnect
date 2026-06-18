# UI/UX Forensic Audit — GoldenLife (CareConnect)
**Date:** 2026-06-17  
**Scope:** All patient, provider, and admin flows; every route registered in `client/src/App.tsx`

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| HIGH     | 5     | Fixed  |
| MEDIUM   | 4     | Fixed  |
| LOW      | 3     | Fixed  |
| INFO     | 3     | Noted  |

---

## HIGH Severity

### H-01 — `/membership` page missing Header & Footer
**File:** `client/src/pages/membership-dashboard.tsx`  
**Impact:** User visiting `/membership` sees page content floating with no site navigation, no way to reach other pages except browser back button.  
**Fix:** Added `<Header />` and `<Footer />` wrapping the page in a full min-h-screen flex shell.

### H-02 — `/family-members/:id` page missing Header & Footer
**File:** `client/src/pages/family-member-dashboard.tsx`  
**Impact:** Same as H-01 — bare content with no site chrome.  
**Fix:** Added `<Header />` and `<Footer />` wrapping.

### H-03 — `/my-reports` page missing Header & Footer
**File:** `client/src/pages/my-bug-reports.tsx`  
**Impact:** Same as H-01. Both the list view and the detail view sub-component rendered without nav chrome.  
**Fix:** Added `<Header />` and `<Footer />` wrapping both view states.

### H-04 — `/provider/clinical` page missing Header & Footer
**File:** `client/src/pages/provider-clinical-dashboard.tsx`  
**Impact:** Provider clinical dashboard renders without site header. Has a back button but no global nav.  
**Fix:** Added `<Header />` and `<Footer />` wrapping.

### H-05 — 4 patient pages absent from header navigation
**File:** `client/src/components/header.tsx`  
**Pages missing from dropdown + mobile menu:**
- `/my-reports` — My Bug Reports (completely orphaned)
- `/membership` — My Memberships
- `/waitlist` — My Waitlist
- `/family-members` — Family Members  

**Impact:** These pages exist and are useful, but patients can only reach them by knowing the URL directly. Zero discoverability.  
**Fix:** Added all four links to the patient-only section of both the desktop dropdown menu and the mobile slide-out menu.

---

## MEDIUM Severity

### M-01 — Nested `<Link><a>` creates invalid HTML in Waitlist
**File:** `client/src/pages/waitlist.tsx` line 108–112  
**Issue:** `<Link href="..."><a className="...">` — Wouter's `Link` already renders an `<a>` tag, so the inner `<a>` creates nested anchors (invalid HTML, broken click behavior in some browsers).  
**Fix:** Removed the inner `<a>` tag; applied the class names directly on `<Link>`.

### M-02 — Group sessions use text "Loading…" instead of skeletons
**File:** `client/src/pages/group-sessions.tsx` (`BrowseList` and `MyBookingsList` components)  
**Issue:** Both sub-components show a bare `<div className="text-sm text-muted-foreground">Loading…</div>` while fetching. Every other list in the platform uses `Skeleton` components.  
**Fix:** Replaced with skeleton card grids matching the final card layout.

### M-03 — `/become-provider` not reachable from any navigation
**File:** `client/src/components/header.tsx`  
**Issue:** The route exists in App.tsx but is not linked anywhere in the site header or footer for non-provider patients. Prospective providers have no CTA path.  
**Fix:** Added a "Become a Provider" link in the authenticated header dropdown for patients, and in the unauthenticated nav bar.

### M-04 — Provider clinical dashboard not linked from provider nav
**File:** `client/src/pages/provider-dashboard.tsx` / `client/src/components/header.tsx`  
**Issue:** `/provider/clinical` is a full page but the provider header dropdown only shows "Earnings & Reports". Providers cannot discover the clinical dashboard through navigation.  
**Fix:** Added "Clinical Dashboard" link to the provider-only extras section of the header dropdown and mobile menu.

---

## LOW Severity

### L-01 — "Browse Providers" button on 404 page uses wrong icon
**File:** `client/src/pages/not-found.tsx` line 28  
**Issue:** Button uses `<ArrowLeft />` icon but navigates *forward* to `/providers`. The icon implies "go back" which contradicts the action.  
**Fix:** Changed icon to `<Search />`.

### L-02 — Gift cards "Amount (USD)" label hardcoded
**File:** `client/src/pages/gift-cards.tsx` line 94  
**Issue:** Label reads "Amount (USD)" regardless of the user's display currency. For HU/IR users this is confusing (gift cards are purchased in USD internally but it should just say "Amount").  
**Fix:** Changed label to "Amount" — the USD currency selector beside the input makes the currency clear without redundancy.

### L-03 — Bug report detail back button uses raw text arrow
**File:** `client/src/pages/my-bug-reports.tsx` line 104–106  
**Issue:** `← Back to reports` uses a raw Unicode arrow character instead of a Lucide icon, inconsistent with every other back button in the app.  
**Fix:** Changed to `<ArrowLeft className="h-4 w-4 mr-1" /> Back to reports` using the Lucide icon.

---

## INFO (no code change required)

### I-01 — `/about`, `/consent`, `/become-provider` reachable via URL only
These routes exist and render correctly but are not in the main navigation. The consent and about pages are intentionally low-traffic; the become-provider CTA was addressed in M-03.

### I-02 — Admin-only pages `/admin/stale-bookings` and `/admin/compliance-queue`
These are correctly linked from the admin sidebar and are behind `requireAdmin` middleware. No navigation change needed.

### I-03 — Patient nav strip has only 2 tabs (Home + My Care Workspace)
The `PatientNavStrip` is intentionally a shortcut strip, not the full nav. The full navigation is in the header dropdown. The current 2-tab design is acceptable; adding more tabs would clutter the strip. No change made.

---

## Files Changed

| File | Change |
|------|--------|
| `client/src/pages/membership-dashboard.tsx` | Add Header + Footer |
| `client/src/pages/family-member-dashboard.tsx` | Add Header + Footer |
| `client/src/pages/my-bug-reports.tsx` | Add Header + Footer; fix back button icon |
| `client/src/pages/provider-clinical-dashboard.tsx` | Add Header + Footer |
| `client/src/components/header.tsx` | Add 4 patient nav links + "Become Provider" + Clinical Dashboard links |
| `client/src/pages/waitlist.tsx` | Fix nested Link+a |
| `client/src/pages/group-sessions.tsx` | Loading text → skeleton |
| `client/src/pages/not-found.tsx` | ArrowLeft → Search icon |
| `client/src/pages/gift-cards.tsx` | Remove "(USD)" from label |
