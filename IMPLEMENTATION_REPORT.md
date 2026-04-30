# Multi-Country Support — Implementation Report

This report describes how multi-country tenancy (Hungary `HU` + Iran `IR`) was added to the platform. Each country's data is isolated end-to-end: a Hungarian patient never sees Iranian providers, an Iranian admin never lists Hungarian bookings, and money is shown in the right currency by default.

---

## A. Data Model

A new `country_code` Postgres enum (`HU`, `IR`) was added in `shared/schema.ts` and applied as a non-nullable column with default `HU` to every tenant-bearing table:

| Table | Column | Index |
| --- | --- | --- |
| `users` | `country_code` | yes |
| `providers` | `country_code` | yes |
| `services` | `country_code` | `idx_services_country_code` |
| `appointments` | `country_code` | `idx_appointments_country_code` |
| `invoices` | `country_code` | yes |
| `payments` | `country_code` | yes |
| `service_requests` | `country_code` | `idx_service_requests_country_code` |

The `user_role` enum was extended with two new values:

- `global_admin` — sees and operates on every country.
- `country_admin` — locked to its own country (read + write).
- The legacy `admin` role is treated as `global_admin` everywhere in the code (backward compatible).

Schema was applied via `npm run db:push` against the Supabase Postgres instance.

---

## B. Backfill & Migration

A one-shot SQL migration was run to populate the new columns and migrate roles:

1. `users.country_code` — defaulted to `HU` for every existing row (no Iranian users existed pre-launch).
2. `providers.country_code` — copied from owning user.
3. `services.country_code` — copied from provider.
4. `appointments`, `invoices`, `payments`, `service_requests` — back-filled from their owning provider / patient.
5. Every existing `admin` user was promoted to `global_admin` so nothing in the admin console was lost.

All 8 pre-existing users were tagged `HU` and every existing admin received `global_admin`. No data loss.

---

## C. Server-Side Isolation

A new module `server/middleware/country.ts` centralises the rules:

- `isCountryCode(x)` — type guard for `"HU" | "IR"`.
- `isAdminRole(role)` / `isGlobalAdmin(role)` — role helpers.
- `canAccessCountry(user, target)` — gate used inside any endpoint that loads a single record. Global admins pass for any country; everyone else must match `user.countryCode === target`.
- `listingCountryFilter(req)` — returns the `countryCode` to filter a list query by:
  - global admin → `undefined` (all rows) unless they pass `?country=HU|IR`.
  - everyone else → forced to `req.user.countryCode`.
  - anonymous visitors on public listings → default `HU`.

This is wired into the routes in `server/routes.ts`:

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/providers` | Anonymous users default to `HU`; logged-in users see only their country; global admins see all (filterable). |
| `GET /api/providers/:id` | `canAccessCountry` gate — returns `404` if the caller is from another country (no leakage of existence). |
| `POST /api/services` | New service inherits the provider's `country_code`; cross-country writes are rejected. |
| `POST /api/appointments` | Validates that patient + provider + service all share one country; the parent + child rows and the payment row are stamped with that country. Cross-country booking returns `404`. |
| `GET /api/admin/users`, `…/providers`, `…/services-overview`, `…/bookings`, `…/invoices`, `…/service-requests` | Filter via `listingCountryFilter`. Country admins are restricted to their own country; global admins see everything (filterable). |
| `PATCH /api/admin/bookings/:id`, `PATCH /api/admin/service-requests/:id`, `…/approve`, `…/reject` | Guarded with `canAccessCountry` so a country admin cannot mutate another country's data even by guessing IDs. |
| `POST /api/admin/providers` | Country admins can only create providers in their own country; global admins can target any country. |
| `POST /api/onboarding` (provider self-onboarding) | Provider's country forced to the user's country. |
| `POST /api/provider/service-requests` | Inherits the provider's country; the approve flow propagates it onto the created service. |
| `PATCH /api/auth/profile` | Accepts `countryCode`; admins are explicitly forbidden from changing their own country here. |

Invoice creation (`server/utils/invoice-helper.ts`) copies the country from the source booking, keeping invoices and payments in the same tenant as the appointment.

---

## D. Registration & Profile

`POST /api/auth/register` now requires `countryCode ∈ {HU, IR}`; the value is stamped on the new user row. The register form (`client/src/pages/register.tsx`) shows a required country selector with `HU` as the default. Translations live under the new `country` namespace in `en/hu/fa/translation.json` (only new strings were added; nothing existing was modified).

`PATCH /api/auth/profile` accepts a country switch for non-admin accounts, re-validating the value server-side.

---

## E. Frontend UX

- **Country switcher** — `client/src/pages/settings.tsx` adds a card (visible to non-admins only) that PATCHes the user's profile and invalidates every React Query cache so the UI immediately reflects the new tenant.
- **Country flag** — the user dropdown in `client/src/components/header.tsx` shows the user's flag (🇭🇺 / 🇮🇷) next to their name.
- **Role helper** — a new `client/src/lib/roles.ts` module exposes `isAdminRole` / `isGlobalAdmin`. Authorization gates (header dashboard link, admin dashboard guard, admin stale-bookings guard, appointments admin redirect, admin-user list filter) were updated to use it so the new `global_admin` and `country_admin` roles are recognised everywhere. Pure display strings (e.g. the literal label "Admin" in the service form dropdown) were intentionally left untouched.
- **Locale-aware currency** — `client/src/lib/currency.ts` now keys formatting off `user.countryCode` first (HU → HUF, IR → IRR) and falls back to UI language only when no user is loaded. A new `getCurrencyConfigForCountry(code)` helper is exported for components that already know the target country.

---

## F. Translations

Per the user's instruction, only new strings were added. The new `country` namespace lives at the bottom of each locale file:

```jsonc
"country": {
  "label": "Country",
  "placeholder": "Select your country",
  "hungary": "Hungary",
  "iran": "Iran",
  "switcher_title": "Country",
  "switcher_help": "Switching country changes the data and currency you see.",
  "current": "Current country"
}
```

Persian (`fa`) was added text-only — no RTL layout changes were applied, as requested.

---

## Files Changed

- `shared/schema.ts` — country enum + columns, role enum extension.
- `server/middleware/country.ts` — new isolation middleware/helpers.
- `server/routes.ts` — listing filters, write guards, registration & profile country, service / booking / invoice / service-request flows.
- `server/storage.ts` — listing methods accept `countryCode`.
- `server/utils/invoice-helper.ts` — country-aware invoice creation.
- `client/src/pages/register.tsx` — country selector at signup.
- `client/src/pages/settings.tsx` — country switcher card.
- `client/src/components/header.tsx` — country flag + admin-role helper.
- `client/src/pages/admin-dashboard.tsx`, `admin-stale-bookings.tsx`, `appointments.tsx` — admin gate now recognises `global_admin` / `country_admin`.
- `client/src/lib/currency.ts` — country-driven currency selection.
- `client/src/lib/roles.ts` — new client-side role helpers.
- `client/src/i18n/locales/{en,hu,fa}/translation.json` — new `country` namespace strings only.

---

## Manual Verification

- Server starts cleanly with the schema migration applied.
- A Hungarian patient querying `/api/providers` only receives Hungarian providers; switching to `IR` in settings flips the listing.
- A country admin scoped to `HU` cannot fetch or mutate an Iranian booking (404 / 403 as appropriate).
- Booking attempts that mix countries return `404` rather than leaking provider existence.
- Invoices and payments inherit the booking's country.
- Currency in the UI follows the user's country (HUF / IRR) regardless of UI language.

---

## Notes & Out-of-Scope

- RTL layout for Persian is intentionally not applied (text-only translation per user decision).
- A handful of admin endpoints that surface only side-effects (audit-logs, broadcast-history, marketing analytics, etc.) were left as-is because they don't expose tenant rows directly. They can be country-scoped in a follow-up if country admins need them.
- Display labels that print the raw role string (e.g. provider creation form) were left as-is — they are informational, not authorization gates.
