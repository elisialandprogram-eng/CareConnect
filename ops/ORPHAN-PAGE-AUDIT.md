# Orphan Page Audit
**Date:** 2026-06-17  
**Scope:** All routes registered in `client/src/App.tsx`  
**Method:** Cross-referenced every route against header, footer, dropdowns, dashboards, page-level CTAs, and in-page navigate() calls.

---

## Summary

| Category | Count |
|---|---|
| True orphans (no clickable link anywhere) | 3 |
| Programmatic-only (auto-redirect on login, no return link) | 2 |
| Functional programmatic-only (by design) | 1 |
| Redirect aliases (legacy, no link needed) | 2 |
| Fully linked | 47 |

---

## True Orphans — No User-Clickable Link Anywhere

### 1. `/patient/workspace`

| Field | Value |
|---|---|
| **Route** | `/patient/workspace` |
| **Purpose** | URL alias — renders `PatientDashboard` (identical output to `/patient/dashboard`) |
| **User Role** | Patient |
| **Reachable?** | N — no link anywhere in the app |
| **Should be linked?** | N — alias is redundant; `/patient/dashboard` is the canonical URL |
| **Should be removed?** | **Y** — replace with a `<Redirect>` to `/patient/dashboard`, or delete the route; `PatientNavStrip` already detects this path for active-tab highlighting but never links to it |

**Notes:** `PatientNavStrip` active-detection includes `/patient/workspace` in its `startsWith` check, which implies the route was once a real destination. No in-app link was ever added. The strip's "My Care Workspace" tab points to `/patient/dashboard`, not `/patient/workspace`.

---

### 2. `/patient/records`

| Field | Value |
|---|---|
| **Route** | `/patient/records` |
| **Purpose** | URL alias — renders `PatientDashboard` (identical output to `/patient/dashboard`) |
| **User Role** | Patient |
| **Reachable?** | N — no link anywhere in the app |
| **Should be linked?** | N — alias is redundant |
| **Should be removed?** | **Y** — same treatment as `/patient/workspace` |

**Notes:** Same family as `/patient/workspace`. Both were likely planned for a multi-tab patient workspace that was later consolidated into a single route.

---

### 3. `/book-wizard`

| Field | Value |
|---|---|
| **Route** | `/book-wizard` |
| **Purpose** | Duplicate route — renders `BookWizard` (identical output to `/book`) |
| **User Role** | Any (booking flow) |
| **Reachable?** | N — every link and CTA in the app uses `/book`; no link uses `/book-wizard` |
| **Should be linked?** | N — `/book` is the canonical URL |
| **Should be removed?** | **Y** — remove or replace with a redirect to `/book`; the route creates a second entry point with no canonical purpose |

**Notes:** Both `/book` and `/book-wizard` are registered in App.tsx pointing at the same `BookWizard` component. All footer links, dashboard CTAs, and programmatic `navigate()` calls use `/book`.

---

## Programmatic-Only — Auto-Redirect on Login, No Return Link

These pages render meaningful content but are only reachable once (on login via `home.tsx` redirect). After the user navigates away, there is no in-app path back.

### 4. `/provider/home`

| Field | Value |
|---|---|
| **Route** | `/provider/home` |
| **Purpose** | Provider daily command centre: today's clinic schedule, appointment rows, revenue stats, alerts (expiring docs, pending reviews), quick-action grid |
| **User Role** | Provider |
| **Reachable?** | Y — but only via `home.tsx` auto-redirect when a provider logs in |
| **Should be linked?** | **Y** — after a provider navigates to `/provider/dashboard`, there is no back-link or menu entry to return to this page; the header dropdown goes to `/provider/dashboard`, not `/provider/home` |
| **Should be removed?** | N — it is a fully built, high-value page |

**Notes:** `home.tsx` routes authenticated providers to `/provider/home`. The header user-menu "Dashboard" link points to `/provider/dashboard` (the heavy settings/tabs page). The provider has no way to return to their daily home after leaving it. Recommend adding a "Home" or "Today" entry to the header provider dropdown, or a sticky tab strip similar to `PatientNavStrip`.

---

### 5. `/admin/home`

| Field | Value |
|---|---|
| **Route** | `/admin/home` |
| **Purpose** | Admin command centre: real-time KPIs, action-required items, financial alerts, scheduler job health, recent audit activity, quick-action grid |
| **User Role** | Admin / global_admin / country_admin / verification_admin |
| **Reachable?** | Y — but only via `home.tsx` auto-redirect when an admin logs in |
| **Should be linked?** | **Y** — `admin-dashboard.tsx` has no link back to `/admin/home`; `admin-home.tsx` quick nav links to `/admin` (the full dashboard) but the reverse link is missing |
| **Should be removed?** | N — it is a polished, fully built operations page |

**Notes:** `home.tsx` routes authenticated admins to `/admin/home`. The header dropdown link for admins goes to `/admin` (AdminDashboard). After an admin clicks "Full Dashboard" from AdminHome they lose the route and cannot return without typing the URL. Recommend adding a "Command Center" item to the admin header dropdown or a breadcrumb/tab on `AdminDashboard`.

---

## Functional Programmatic-Only — Expected By Design

### 6. `/verify-email`

| Field | Value |
|---|---|
| **Route** | `/verify-email` |
| **Purpose** | OTP email verification form shown immediately after registration or when an unverified user tries to log in |
| **User Role** | New user (any role) |
| **Reachable?** | Y — programmatically via `navigate('/verify-email?userId=…')` from both `register.tsx` and `login.tsx` |
| **Should be linked?** | N — designed to be triggered automatically; a manual nav link would allow bypassing the flow |
| **Should be removed?** | N — required for the auth flow |

---

## Redirect Aliases — No Link Needed

These routes exist solely to redirect legacy URLs and do not render meaningful content themselves.

### 7. `/booking`

| Field | Value |
|---|---|
| **Route** | `/booking` |
| **Purpose** | `BookingRedirect` — immediately redirects to `/book` preserving all query params |
| **User Role** | Any |
| **Reachable?** | Y via direct URL or old external links |
| **Should be linked?** | N — redirect alias, not a destination |
| **Should be removed?** | N — keep for backward compatibility with external links and bookmarks |

---

### 8. `/provider/setup`

| Field | Value |
|---|---|
| **Route** | `/provider/setup` |
| **Purpose** | `SetupRedirect` — immediately redirects to `/provider/dashboard?tab=profile` |
| **User Role** | Provider |
| **Reachable?** | Y via direct URL or old external links |
| **Should be linked?** | N — redirect alias |
| **Should be removed?** | N — keep for backward compatibility |

---

## Recommendations

### Immediate Removals (safe, no user impact)

| Route | Action |
|---|---|
| `/patient/workspace` | Replace with `<Redirect to="/patient/dashboard" />` or delete |
| `/patient/records` | Replace with `<Redirect to="/patient/dashboard" />` or delete |
| `/book-wizard` | Replace with `<Redirect to="/book" />` or delete |

### Link Additions (meaningful pages with no return path)

| Route | Suggested Link Location |
|---|---|
| `/provider/home` | Add "Home" entry to the provider section of the header dropdown menu (above "Dashboard") |
| `/admin/home` | Add "Command Center" entry to the admin section of the header dropdown menu, or add it as a tab/breadcrumb on AdminDashboard |

---

## All Routes — Complete Status Table

| Route | Page File | Linked From | Role | Orphan? |
|---|---|---|---|---|
| `/` | home.tsx | Header logo | All | No |
| `/login` | login.tsx | Header, footer | All | No |
| `/register` | register.tsx | Header, footer | All | No |
| `/providers` | providers.tsx | Header nav, footer, CTA | All | No |
| `/services` | services.tsx | Header nav | All | No |
| `/group-sessions` | group-sessions.tsx | Header nav, footer | All | No |
| `/dashboard` | patient-home.tsx | PatientNavStrip "Home" tab | Patient | No |
| `/patient/dashboard` | patient-dashboard.tsx | Header dropdown, footer, PatientNavStrip | Patient | No |
| `/patient/workspace` | patient-dashboard.tsx | **Nothing** | Patient | **YES** |
| `/patient/records` | patient-dashboard.tsx | **Nothing** | Patient | **YES** |
| `/provider/home` | provider-home.tsx | home.tsx redirect only | Provider | **Programmatic only** |
| `/provider/dashboard` | provider-dashboard.tsx | Header dropdown | Provider | No |
| `/provider/clinical` | provider-clinical-dashboard.tsx | Header dropdown | Provider | No |
| `/provider/setup` | (SetupRedirect) | Legacy alias | Provider | Alias |
| `/provider/earnings` | provider-earnings.tsx | Header dropdown | Provider | No |
| `/provider/:id` | provider-profile.tsx | Provider cards | All | No |
| `/booking` | (BookingRedirect) | Legacy alias | All | Alias |
| `/booking/confirmation/:id` | booking-confirmation.tsx | Booking flow | Any | No |
| `/book` | book-wizard.tsx | Footer, patient dashboard | Any | No |
| `/book-wizard` | book-wizard.tsx | **Nothing** | Any | **YES** |
| `/admin/home` | admin-home.tsx | home.tsx redirect only | Admin | **Programmatic only** |
| `/admin` | admin-dashboard.tsx | Header dropdown, admin-home quick nav | Admin | No |
| `/admin/stale-bookings` | admin-stale-bookings.tsx | admin-dashboard.tsx button | Admin | No |
| `/admin/users` | admin-users.tsx | admin-home QuickAction, admin-access-panel | Admin | No |
| `/admin/bug-reports` | admin-bug-reports.tsx | admin-home.tsx links | Admin | No |
| `/admin/compliance-queue` | admin/compliance-queue.tsx | admin-home.tsx links | Admin | No |
| `/packages` | packages.tsx | Header dropdown, footer | Any | No |
| `/messages` | messages.tsx | Header dropdown | Auth | No |
| `/notifications` | notifications.tsx | Header bell, dropdown | Auth | No |
| `/terms` | terms.tsx | Footer | All | No |
| `/privacy` | privacy.tsx | Footer | All | No |
| `/cookies` | cookie-policy.tsx | Footer | All | No |
| `/about` | about.tsx | Footer | All | No |
| `/become-provider` | become-provider.tsx | Footer, CTA | All | No |
| `/appointments` | appointments.tsx | Header dropdown | Auth | No |
| `/appointments/:id` | appointment-details.tsx | Appointments list rows | Auth | No |
| `/profile` | profile.tsx | Header dropdown (non-provider) | Patient | No |
| `/settings` | settings.tsx | Header dropdown (non-provider) | Patient | No |
| `/verify-email` | verify-email.tsx | login.tsx / register.tsx programmatic | New user | Programmatic |
| `/forgot-password` | forgot-password.tsx | Login page link | Any | No |
| `/consent` | consent.tsx | Footer | All | No |
| `/wallet` | wallet.tsx | Header badge + dropdown, footer | Patient | No |
| `/referrals` | referrals.tsx | Header dropdown, footer, patient dashboard | Patient | No |
| `/waitlist` | waitlist.tsx | Header dropdown, footer | Patient | No |
| `/review/:id` | review.tsx | Patient dashboard, my-reviews, appt-details | Patient | No |
| `/support/tickets` | support-tickets.tsx | Header dropdown | Auth | No |
| `/gift-cards` | gift-cards.tsx | Header dropdown, footer | Patient | No |
| `/my-documents` | my-documents.tsx | Header dropdown, footer | Patient | No |
| `/family-members` | family-members.tsx | Header dropdown | Patient | No |
| `/family-members/:id` | family-member-dashboard.tsx | Family members list rows | Patient | No |
| `/membership` | membership-dashboard.tsx | Header dropdown, patient dashboard | Patient | No |
| `/my-reports` | my-bug-reports.tsx | Header dropdown | Patient | No |
| `/health-records` | health-records.tsx | Header dropdown, footer | Patient | No |
| `/my-reviews` | my-reviews.tsx | Header dropdown | Patient | No |
