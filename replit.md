# GoldenLife (CareConnect)

A healthcare booking platform connecting patients with verified physiotherapists, doctors, and home-care nurses for appointments, secure payments, and reviews.

## Run & Operate

- **Dev server:** `npm run dev` (runs on port 5000)
- **Build:** `npm run build`
- **Start (prod):** `npm run start`
- **Seed admin:** `npm run seed`
- **Required secrets:** `SESSION_SECRET`, `SUPABASE_DATABASE_URL`
- **Optional secrets:**
  - `GOOGLE_MAPS_API_KEY` — server-side geocoding (`location.service.ts`)
  - `VITE_GOOGLE_MAPS_API_KEY` — **frontend** Places Autocomplete (must be prefixed `VITE_`)
  - `DAILY_API_KEY` + `DAILY_DOMAIN` + `VIDEO_PROVIDER=daily` — Daily.co video rooms (falls back to public Jitsi)
  - `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` — SMS notifications
  - `TWILIO_WHATSAPP_FROM` — WhatsApp Business notifications
  - `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — Web Push notifications
  - `VAPID_SUBJECT` — Push identity email (defaults to `mailto:admin@goldenlife.health`)
  - `AI_INTEGRATIONS_OPENAI_API_KEY` — AI chat/batch integrations

## Stack

- **Frontend:** React 18, TypeScript, Wouter, TanStack Query, Tailwind CSS, Radix UI/shadcn, React Hook Form, Zod, i18next, Vite
- **Backend:** Node.js 20, TypeScript, Express, Drizzle ORM, bcrypt, JWT (via `SESSION_SECRET`), WebSocket (`ws`)
- **Database:** PostgreSQL — Replit built-in (`DATABASE_URL`) or Supabase (`SUPABASE_DATABASE_URL`)
- **Build:** Vite (client), esbuild (server → `dist/index.cjs`)

## Where things live

- `client/src/` — React frontend, pages under `client/src/pages/`
- `client/src/components/page-breadcrumbs.tsx` — reusable `PageBreadcrumbs` component (back button + breadcrumb trail)
- `server/` — Express API, `routes.ts` is the main API file (7k+ lines)
- `shared/schema.ts` — Drizzle ORM schema + Zod validators (source of truth)
- `server/replit_integrations/` — AI chat, image, batch integrations
- `script/` — Build, seed, and audit scripts

## Architecture decisions

- **Multi-country tenancy:** HU and IR isolated via `country_code` on every major table, enforced server-side by middleware.
- **JWT auth:** Token stored in `Authorization` header; `SESSION_SECRET` env var is the signing key (falls back to hardcoded dev value).
- **Stripe is optional at startup:** `getStripe()` returns `null` if `STRIPE_SECRET_KEY` is missing — payment routes fail gracefully.
- **Resend email is optional:** `resend` is `null` if `RESEND_API_KEY` missing; email features silently skip sending.
- **Schema authority:** `server/db.ts` applies current idempotent DDL and required configuration seeds on boot. Historical data repair is never part of startup.

## Product

- Patient–provider matching, booking (online/home visit/video), and reviews
- Stripe payments, wallet credits, promo codes
- Provider dashboard (profile, services, availability, appointments)
- Multi-language (English, Hungarian, Persian/Farsi) and multi-currency
- Group session booking, referral program, invoice editor, automated reminders

## User preferences

- Simple, everyday language in responses.

## Gotchas

- `server/routes.ts` uses Express first-match — search for existing routes before adding new ones.
- Radix UI `<SelectItem value="">` causes silent crashes; use a non-empty sentinel.
- `tsx` is in devDependencies; the workflow runs `npm run dev` which uses `node_modules/.bin/tsx` automatically.
- Vite HMR is bound to the HTTP server in `server/vite.ts` — do not set `hmr.clientPort` in `vite.config.ts`.
- **New tables/enums must be added to `runStartupMigrations()` in `server/db.ts`** — the application uses Supabase as its single database authority.
- `appointment_events` table is the audit log for every status transition. Missing this table causes 500 on `PATCH /api/appointments/:id/status`.
- Provider status dropdown only shows valid next-state transitions (defined in `PROVIDER_STATUS_TRANSITIONS` inside the component). Cancel/reschedule use the action endpoint instead.

## Pointers

- Drizzle ORM: https://orm.drizzle.team/docs/overview
- TanStack Query: https://tanstack.com/query/latest
- shadcn/ui: https://ui.shadcn.com/docs
- Stripe API: https://stripe.com/docs/api
