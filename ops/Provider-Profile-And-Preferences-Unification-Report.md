# Provider Profile & Preferences Unification — Sprint P10 Report

**Date:** 2026-06-12  
**Status:** ✅ Complete  
**Build:** `npm run build` — passed (`✓ built in 33.38s`)

---

## Objective

Eliminate duplicate Provider Profile and Preferences access paths. Establish a single source of truth for all provider profile, preferences, and account settings.

---

## Duplicate Items Found (Pre-Sprint)

### Navigation duplicates
| Item | Location 1 | Location 2 |
|------|-----------|-----------|
| Profile link | Header dropdown → `/profile` | Dashboard → Profile tab (via setup) |
| Settings link | Header dropdown → `/settings` | Dashboard hero "Settings" button → `/settings` |
| Notification prefs | `/settings` page | _(none in provider dashboard)_ |
| Language pref | `/settings` page | Header language switcher |
| Display currency | `/settings` page | `ProviderPreferencesTab` (separate field) |
| Password change | `/settings` page | _(none in provider dashboard)_ |

### Component duplicates
- `ProviderPreferencesTab` had currency field; `/settings` also had display currency — two separate editors writing to the same `preferredCurrency` column
- Language editable in `/settings` and also in header language switcher — now unified (header switcher kept; preferences tab also exposes it)

---

## Removed Navigation

### Header dropdown — provider role
- ❌ **Profile** (→ `/profile`) — removed for `user.role === "provider"`
- ❌ **Settings** (→ `/settings`) — removed for `user.role === "provider"`

### Header mobile menu — provider role
- ❌ **Profile** (mobile link) — removed for providers
- ❌ **Settings** (mobile link) — removed for providers

### Provider Dashboard hero
- ❌ **Settings button** (→ `/settings`) — replaced with in-page navigation to the Preferences tab

---

## Removed Components / Routes

No components or routes were deleted — the `/profile` and `/settings` pages remain intact for patient and admin users. Only the navigation links to these pages were removed for providers.

---

## Changes Made

### `client/src/components/header.tsx`
- Desktop dropdown: Wrapped "Profile" and "Settings" `DropdownMenuItem` entries in `{user?.role !== "provider" && (...)}` guards
- Mobile menu: Wrapped "Profile" and "Settings" `<Link>` entries in `{user?.role !== "provider" && (...)}` guards

### `client/src/pages/provider-dashboard.tsx`
- Changed the "Settings" button in the dashboard hero from `<Link href="/settings">` to `onClick={() => setActiveTab("preferences")}` — now navigates directly to the Preferences tab in the same page

### `client/src/components/provider/dashboard/ProviderPreferencesTab.tsx`
- Added imports: `useQuery`, `Switch`, `Separator`, `Bell`, `Lock`, `Shield`, `Eye`, `EyeOff`, `Smartphone`, `MessageSquare`, `Mail`, `Monitor`, `Globe`, `Banknote`, `subscribeToPush`, `unsubscribeFromPush`, `getPushCapability`, `QK`, `showErrorModal`, `useEffect`
- Added state: `pushCap`, `pushSubscribed`, `passwordForm`, `showPasswords`
- Added queries: `notifPrefs` (GET `/api/notification-preferences`), `commsCaps` (GET comms capabilities)
- Added mutations: `updateNotifPrefs`, `updateCurrencyMutation`, `updateCountryMutation`, `changePasswordMutation`
- Added **Account Settings** card with sections:
  - Notification toggles: Email, SMS, WhatsApp, Browser Push, In-App
  - Quiet hours (from/to time inputs)
  - Language selector
  - Display currency selector
  - Country switcher (HU / IR)
  - Password change form

---

## Profile Architecture

```
Provider Profile — Single Entry Path
└── Dashboard (/provider/dashboard)
    ├── Hero banner
    │   ├── "Profile" button → Public profile (/provider/:id)   [view only]
    │   ├── "Edit Setup" button → /provider/setup               [edit profile]
    │   └── "Settings" button → Preferences tab (in-page)       [settings]
    └── Tabs
        ├── Upcoming / Active / Calendar / History
        ├── Clients
        ├── Reviews
        ├── Availability
        ├── Analytics / Insights
        ├── Services
        ├── Group Sessions
        ├── KYC (Documents)
        ├── Gallery
        └── Preferences ← SINGLE PREFERENCES AUTHORITY
```

---

## Preferences Architecture

**ONE preferences system — `ProviderPreferencesTab`**

Sections:
1. **Professional Information** — primary/secondary titles, display title, title-change requests
2. **Practice Preferences** — currency (provider), max patients/day, contact method, payment methods accepted, on-call toggle
3. **Permanent Address** — legal/home address for compliance
4. **Account Settings** — notifications (email/SMS/WhatsApp/push/in-app/quiet hours), language, display currency, country, password

**ONE API surface:**
- `PATCH /api/provider/preferences` — practice preferences, titles, address
- `PATCH /api/notification-preferences` — notification toggles + quiet hours + language
- `PATCH /api/auth/profile` — display currency, country code, password

---

## Final Provider Navigation Structure

**Header dropdown (provider):**
- Dashboard → `/provider/dashboard`
- My Appointments → `/appointments`
- Messages → `/messages`
- Notifications → `/notifications`
- Support Tickets → `/support/tickets`
- Membership Packages → `/packages`
- Earnings & Reports → `/provider/earnings`
- Logout

**Header (always visible):**
- Language switcher (EN / HU / FA)
- Theme toggle
- Notification bell

**Dashboard tabs:**
- Upcoming · Active · Calendar · History · Clients · Reviews · Availability · Analytics · Insights · Services · Group Sessions · KYC · Gallery · **Preferences**

---

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| ONE Provider Profile entry point | ✅ Dashboard → Edit Setup |
| ONE Preferences System | ✅ Dashboard → Preferences tab |
| NO Header Profile Menu for providers | ✅ Removed |
| NO Header Settings Menu for providers | ✅ Removed |
| NO Duplicate Settings | ✅ All settings consolidated into Preferences tab |
| NO Profile Navigation Drift | ✅ Dashboard hero "Settings" → Preferences tab (not /settings) |
| `npm run build` passes | ✅ Built in 33.38s, no errors |
