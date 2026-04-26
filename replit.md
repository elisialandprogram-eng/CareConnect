# CareConnect - Healthcare Booking Platform

## Overview

CareConnect is a healthcare booking platform designed to connect patients with verified physiotherapists, doctors, and home care nurses. It facilitates searching for healthcare providers, booking various types of appointments (online or home visits), secure online payments, and submitting patient reviews. Healthcare providers can utilize a dedicated dashboard to manage their profiles, services offered, availability, and scheduled appointments. The platform aims to provide a reliable and aesthetically pleasing user experience, drawing inspiration from leading booking platforms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React and TypeScript, utilizing Wouter for routing and TanStack Query for server state management. Styling is handled with Tailwind CSS, leveraging Radix UI primitives and shadcn/ui for accessible UI components. Forms are managed with React Hook Form and Zod for validation. The design system incorporates Inter and DM Sans fonts, supports light/dark modes, and follows a mobile-first responsive approach. Key pages include Home, Provider listing, Provider Profile, Patient Dashboard, Provider Dashboard, and Authentication flows.

The Provider Dashboard offers comprehensive booking management with eight key statistics (Today's appointments, Pending actions, Upcoming, Unique patients, Weekly/Monthly/Total revenue in HUF, and Rating with completion rate), a dedicated "Today's Schedule" highlight section, and nine tabs: Upcoming, Completed, Cancelled, All History, Calendar, Reviews, Availability, Analytics, and Services & Staff. Appointments can be searched by patient name/service/ID, filtered by status and visit type, exported to CSV, and clicked to open a detail modal with private internal notes and a reschedule dialog. The Calendar tab highlights days with appointments and lists them per selected date. The Reviews tab fetches the provider's reviews with inline reply support. The Availability tab opens a weekly slot manager that bulk-creates time slots across selected weekdays. The Analytics tab renders 30-day revenue (line) and appointment-count (bar) charts via recharts. Status-aware action buttons (Approve, Reject, Confirm, Mark Completed, Mark Payment Received, Cancel, Reschedule) appear contextually across all seven appointment states.

The Patient Dashboard mirrors the provider experience with Upcoming, Completed, Cancelled, All History, Medical Records, and Invoices tabs plus shared search and visit-type filters. The Providers listing surfaces a prominent emerald "Verified" badge on each card and offers a "Verified providers only" filter checkbox alongside the existing service/location/rating/price/visit-type filters. The site header shows a notification bell with an unread-count badge that polls every 30 seconds.

### Internationalization (i18n)

The app supports English (EN), Hungarian (HU), and Persian/Farsi (FA) via i18next, with locale JSON files at `client/src/i18n/locales/{en,hu,fa}/translation.json`. All hardcoded user-facing strings in the Provider Dashboard, Patient Dashboard, Profile page, and Admin Dashboard (Booking Statistics, FAQs, Announcements, Platform Settings, Audit Logs, Invoice Management, Support Tickets, Pricing Management, Promo Codes, Stripe Settings, External Integrations, and provider creation toasts) have been wired through `t("namespace.key", "English fallback")`. Currency is formatted via the shared `useCurrency()` hook in `client/src/lib/currency.ts`: USD ($) is the main display currency for English, Hungarian switches to HUF (Ft), and Persian switches to IRR (﷼). Stored prices remain in HUF in the database and the hook converts on the fly using the rates declared in `currency.ts` (update those constants when FX rates drift). Status badge values, payment method names, and form `value` attributes remain untranslated to preserve API contracts.

### Backend

The backend is developed with Node.js and TypeScript, using Express.js as the framework and Drizzle ORM for database interactions. Authentication is JWT-based with bcrypt for password hashing, supporting role-based access control (patient, provider, admin). The API is RESTful, uses JSON for communication, and includes centralized error handling and request logging. A Data Access Layer (DAL) abstracts database operations for various entities, providing enriched data types for complex queries.

### Wallet System

CareConnect ships with an in-app wallet so patients can pre-load HUF credits and pay any service in one tap. The schema lives in `shared/schema.ts` (`wallets` + append-only `wallet_transactions` ledger with snapshot `balanceAfter` and a unique `idempotency_key`). Storage helpers in `server/storage.ts` (`getOrCreateWallet`, `topUpWallet`, `debitWallet`, `refundWallet`, `adminAdjustWallet`) all funnel through `applyWalletDelta`, which runs inside a `db.transaction` with `SELECT … FOR UPDATE` row locking and a short-circuit on duplicate idempotency keys. Insufficient-balance debits throw cleanly without mutating state.

API surface (in `server/routes.ts`): `GET /api/wallet`, `GET /api/wallet/transactions`, `POST /api/wallet/topup` (Stripe Checkout, `metadata.type=wallet_topup`, success URL `/wallet?topup=success`), `POST /api/wallet/pay-appointment`, `GET /api/admin/wallets`, `GET /api/admin/wallets/:userId/transactions`, `POST /api/admin/wallets/:userId/adjust`. `server/stripeWebhook.ts` recognizes `wallet_topup` sessions and credits the wallet idempotently with `idempotencyKey=stripe:<sessionId>`. The booking endpoint (`POST /api/appointments`) accepts `paymentMethod: "wallet"` and atomically debits the wallet, marks the payment `completed`, and confirms the appointment; failures cancel the appointment and mark the payment `failed` so the patient can retry with another method.

Frontend: a dedicated `/wallet` page (`client/src/pages/wallet.tsx`) exposes balance, quick top-up amounts (5k/10k/25k/50k HUF) plus custom amount, and the full transaction history with credit/debit colour coding. The patient dashboard surfaces a Wallet link, the booking page adds a "Wallet" payment radio that auto-disables when the balance is insufficient, and the admin dashboard gets a Wallets tab with a searchable user list and signed adjustments (positive credit, negative debit) backed by mandatory reason notes for the audit trail. i18n keys (`wallet.*`, `admin_wallets.*`) are present for EN/HU/FA. Currency is always formatted as HUF via `Intl.NumberFormat`.

A lightweight in-process reminder cron (`server/reminderCron.ts`) starts after the HTTP server binds; every hour it scans for confirmed/approved/rescheduled appointments occurring ~24h ahead and creates in-app reminder notifications for both the patient and the provider's user account, deduplicating in-memory by appointment ID. The provider dashboard exposes additional endpoints: `GET /api/notifications/unread-count`, `POST /api/notifications/mark-all-read`, `GET /api/reviews/provider/me`, `PATCH /api/reviews/:id/reply`, `POST /api/services/:id/duplicate`, `PATCH /api/services/reorder`, `POST /api/availability/bulk`, and `PATCH /api/appointments/:id` (reschedule + private note).

### Database

**This project uses Supabase (PostgreSQL) exclusively. Do NOT switch to Neon, Replit's built-in Postgres, or any other provider — every Replit import must keep using Supabase.** The runtime connection lives in `server/db.ts` and the migration tooling lives in `drizzle.config.ts`; both read the connection string from `SUPABASE_DATABASE_URL` (with `DATABASE_URL` only as a legacy fallback). Set `SUPABASE_DATABASE_URL` in Replit Secrets using the **Transaction pooler** URI from Supabase → Project Settings → Database → Connection string. Full details and rationale live in `DATABASE.md`.

The schema includes core tables for users, providers, services, time slots, appointments, reviews, payments, and refresh tokens. Relationships are defined to link these entities, such as one-to-one for User-Provider and one-to-many for Provider-Services. Enums are used for user roles, provider types, appointment statuses, visit types, and payment statuses to ensure data integrity and consistency. UUIDs are used for primary keys, and foreign key constraints with cascading deletes are implemented.

### Build Process

The client-side React app is bundled using Vite, while the server-side Express app is bundled with esbuild. Shared types and schemas are maintained in a `shared/` directory to ensure consistency across the stack.

## External Dependencies

### Database

- **Supabase (PostgreSQL)**: Sole, required data storage solution. The `SUPABASE_DATABASE_URL` secret must be set in Replit on every import. See `DATABASE.md` for setup instructions and enforcement details.
- **`pg` + `drizzle-orm/node-postgres`**: Standard Postgres pool driver used to talk to Supabase.

### UI Component Libraries

- **Radix UI**: Provides accessible, unstyled UI primitives.
- **shadcn/ui**: Configured on top of Radix UI for styled component variants.

### Development Tools

- **Vite**: Frontend bundling and Hot Module Replacement (HMR).
- **esbuild**: Server-side bundling for production.
- **Drizzle Kit**: Database migrations.
- **TypeScript**: Ensures type safety across the entire codebase.

### Payment Processing

- **Stripe**: For secure online card payments. Integrated for creating Checkout Sessions and handling webhooks for payment status updates.

### Location Services

- **Google Maps JavaScript API**: Used for interactive map functionalities, including address search (Places Autocomplete) and location picking in the booking flow. This requires enabling Maps JavaScript API, Places API, and Geocoding API on the Google Cloud project.

### Communications System

The platform now has a unified communications layer (`server/services/notification-dispatcher.ts`) covering email, SMS, WhatsApp, web-push, and in-app channels. Per-user preferences (channels enabled, quiet hours, language) live in the `notification_preferences` table and are honored on every send; quiet hours suppress non-urgent notifications. The dispatcher is wired into booking creation, cancellation, payment receipt, and review reply events, and triggers a 24-hour, 1-hour, 15-minute, and post-visit reminder cadence via `reminderCron`.

Channel adapters live in `server/services/channels/*` (email via Resend, SMS/WhatsApp via Twilio REST, push via Web Push). Each adapter logs a single warning and no-ops when its environment keys are missing so the app keeps running without third-party setup. `GET /api/comms/capabilities` reports which channels are live so the settings UI can hide disabled toggles.

Two-way messaging in `server/chat/ws.ts` supports per-conversation read receipts, typing indicators, mute/pin, attachments and voice notes (uploaded via `POST /api/chat/upload` using `X-Filename`-tagged raw bodies), and unread badge counts. Patient and admin support tickets share the same conversation thread model. Providers can configure weekly office hours and an offline auto-reply via `GET/PATCH /api/provider/office-hours`. Online appointments expose `GET /api/video/room/:appointmentId` which returns a Daily.co room URL when `DAILY_API_KEY` is set, otherwise a graceful placeholder. Admins can broadcast announcements (`/api/admin/broadcasts`) and inspect per-message delivery logs (`/api/admin/notification-logs`) from the admin dashboard.

Required environment variables (all optional; channels degrade gracefully): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `DAILY_API_KEY`, and the frontend `VITE_PUBLIC_VAPID_KEY`. See `.env.example`.