# Patient Home Experience — Implementation Report

**Date:** 2026-06-10  
**Status:** Complete  

---

## Problem Solved

Before this change:
- Authenticated patients landed on the **public marketing homepage** after login.
- No role-aware routing existed for admin users.

After this change:
- **Visitor** → Public landing page
- **Patient** → `/dashboard` (new Patient Home Experience)
- **Provider** → `/provider/dashboard`
- **Admin** → `/admin`

---

## Files Changed

| File | Change |
|------|--------|
| `client/src/pages/patient-home.tsx` | **Created** — new premium patient home (650 lines) |
| `client/src/App.tsx` | Updated routing: `/dashboard` + `/patient/dashboard` → `PatientHome`; added `/patient/records` → existing `PatientDashboard` |
| `client/src/pages/home.tsx` | Added admin role redirect to `/admin`; changed patient redirect to use `{ replace: true }` |

---

## Components & Sections Built

### Section 1 — Personalized Greeting Hero
- Large gradient hero card (primary → indigo)
- Patient avatar / initial fallback
- Time-based greeting: Good morning / afternoon / evening
- Rotating contextual messages (8-second interval)
- Premium care badge pills

### Section 2 — Today's Care
- **Largest card on page** — highlighted with primary border
- Shows next upcoming appointment: provider, service, date/time, visit type
- Actions: View Details, Join Video Visit (if video + room URL exists), Get Directions (home/clinic), Reschedule
- Empty state: "No upcoming appointments" with Book CTA
- Loading skeleton state

### Section 3 — Attention Required
- Only shown when alerts exist (zero-DOM when clean)
- Computed alerts:
  - **Pending Review** — completed appointments missing review
  - **Package Sessions Low** — ≤2 sessions or ≤7 days remaining
  - **Active Referral Reward** — pending referral rewards
- Color-coded severity: high/medium/low

### Section 4 — Health Snapshot
- 4 stat cards: Upcoming Visits, Completed Visits, Active Prescriptions, Family Members
- Each card links to the relevant detail page
- Live counts from existing APIs

### Section 5 — Active Prescriptions
- Shows up to 3 active prescriptions
- Medication name, dosage, frequency, duration
- "View all" link to Health Records
- Hidden when no prescriptions

### Section 6 — Family Health
- Shows up to 3 family members
- Book appointment and View Records quick actions per member
- "Add Member" card as the last tile
- Hidden when no family members

### Section 7 — Benefits Center
- Wallet Balance (live from `/api/wallet`)
- Package Sessions Remaining (from `/api/patient/package-summary`)
- Gift & Referrals shortcut

### Section 8 — Recent Activity Timeline
- Timeline of last 5 appointment events (completed, confirmed, cancelled)
- "X days ago" relative labels
- Hidden when no activity

### Section 9 — Health Tip of the Day
- Rotating from 7 wellness tips (12-second interval)
- Green/teal card — warm and non-medical-advice tone

### Section 10 — Quick Actions
- 6 icon actions: Book, Health Records, Upload Documents, Family, Refer & Earn, Wallet
- Hover: fills with action color

### Manage Section (Full Dashboard Link)
- Card linking to `/patient/records` (the existing detailed dashboard with all tabs)

---

## APIs Used (reusing existing endpoints)

| API | Usage |
|-----|-------|
| `GET /api/appointments/patient` | Upcoming, completed, recent activity |
| `GET /api/wallet` | Benefits Center balance |
| `GET /api/family-members` | Family Health section |
| `GET /api/prescriptions/patient/:id` | Active Prescriptions |
| `GET /api/patient/package-summary` | Package sessions remaining + expiry alerts |
| `GET /api/reviews/mine` | Pending review alert computation |
| `GET /api/referrals/me` | Active referral reward alert |

All queries use existing `QK` query key constants from `client/src/lib/query-keys.ts`.

---

## UX Decisions

- **Container max-width `max-w-3xl`** — focused, readable, app-like feel (not a wide analytics panel)
- **`space-y-5` section rhythm** — consistent vertical breathing room
- **Attention Required renders above Today's Care** — alerts are more urgent than scheduling
- **Family / Prescriptions sections are conditional** — zero DOM when empty (clean for new patients)
- **`useRotating()` hook** — all rotating content (greeting messages, health tips) uses a shared hook with configurable interval
- **`{ replace: true }` on home redirects** — prevents stale back-button behavior
- **Existing `PatientDashboard` preserved at `/patient/records`** — full management view remains accessible via the "Manage Everything" card

---

## Routing Architecture

```
/ (public)
  ├── visitor          → Public landing page (home.tsx)
  ├── patient login    → redirect to /dashboard (replace)
  ├── provider login   → redirect to /provider/dashboard (replace)
  └── admin login      → redirect to /admin (replace)

/dashboard             → PatientHome (patient-protected)
/patient/dashboard     → PatientHome (patient-protected) [legacy alias]
/patient/records       → PatientDashboard (patient-protected) [full management]
/provider/dashboard    → ProviderDashboard (provider-protected)
/admin                 → AdminDashboard (admin-protected)
```

---

## TypeScript

```
npx tsc --noEmit --skipLibCheck → EXIT 0 (zero errors)
```

Fixed during implementation:
- `visitType` enum is `"online" | "home" | "clinic"` (not "telemedicine")
- `profileImageUrl` lives on `provider.user`, not `provider`
- `videoRoomUrl` is a migration-only column → accessed via `(appt as any).videoRoomUrl`

---

## Testing Scenarios

| Scenario | Expected | Status |
|----------|----------|--------|
| New patient (no appointments) | Greeting + empty Today's Care with Book CTA | ✅ |
| Returning patient with upcoming appointment | Full Today's Care card with provider details | ✅ |
| Patient with video appointment + room URL | "Join Video Visit" button appears | ✅ |
| Patient with home/clinic appointment | "Get Directions" button appears | ✅ |
| Patient with active prescriptions | Prescriptions section renders | ✅ |
| Patient with family members | Family Health section renders | ✅ |
| Patient with low package sessions | Attention Required alert appears | ✅ |
| Patient with pending reviews | Attention Required alert appears | ✅ |
| Unauthenticated user hits /dashboard | Redirected to /login | ✅ |
| Admin user hits / | Redirected to /admin | ✅ |
| Provider user hits / | Redirected to /provider/dashboard | ✅ |

---

## Remaining Gaps / Future Improvements

- **Section 11 (Dynamic Message System)**: Basic implementation via `useRotating()`. Could be extended with server-side context to make messages truly personalized.
- **Notification badge on greeting**: Could pull `GET /api/notifications/unread-count` to show bell indicator in hero.
- **Medication reminders**: Active prescriptions could show days remaining if duration is parsed.
- **Upcoming family member appointments**: Family cards currently don't show next appointment — would need `GET /api/family-members/:id/appointments` per member (N+1 — needs a batch endpoint).
