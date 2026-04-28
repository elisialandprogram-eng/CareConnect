# CareConnect - Healthcare Booking Platform

## Overview

CareConnect is a healthcare booking platform designed to connect patients with verified physiotherapists, doctors, and home care nurses. It facilitates searching for healthcare providers, booking various types of appointments (online or home visits), secure online payments, and submitting patient reviews. Healthcare providers can utilize a dedicated dashboard to manage their profiles, services offered, availability, and scheduled appointments. The platform aims to provide a reliable and aesthetically pleasing user experience, drawing inspiration from leading booking platforms, and includes a business vision to capture a significant share of the healthcare booking market by offering a seamless and trustworthy service.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React and TypeScript, using Wouter for routing and TanStack Query for server state management. Tailwind CSS, Radix UI primitives, and shadcn/ui are used for styling and accessible UI components. Forms are managed with React Hook Form and Zod for validation. The design system features Inter and DM Sans fonts, supports light/dark modes, and is mobile-first responsive. Key pages include Home, Provider listing, Provider Profile, Patient Dashboard, Provider Dashboard, and Authentication flows. The platform supports English, Hungarian, and Persian/Farsi via i18next, with currency formatting based on user preferences or language. User language and currency preferences are persistent and applied dynamically.

Both Patient and Provider Dashboards offer comprehensive appointment management, search, filtering, and export capabilities. The Provider Dashboard includes statistics, a "Today's Schedule" highlight, calendar view, reviews management with inline replies, availability management with bulk slot creation, and analytics for revenue and appointment counts. The Patient Dashboard includes medical records and invoices. Profile management is organized into tabs (Personal, Address, Medical, Insurance, Emergency, Provider, Gallery, Security) with a sticky save bar for updates. Registration handles unverified accounts by deleting prior records to prevent lockouts. Admin dashboard management mutations use TanStack Query for efficient cache invalidation and optimistic updates.

### Backend

The backend is developed with Node.js and TypeScript, using Express.js and Drizzle ORM for database interactions. Authentication is JWT-based with bcrypt for password hashing and supports role-based access control (patient, provider, admin). The API is RESTful, uses JSON, and includes centralized error handling and request logging. A Data Access Layer (DAL) abstracts database operations.

### Performance & Response Sanitization

To keep payloads small and avoid leaking sensitive data, list endpoints that return `User` objects pass them through `server/utils/sanitize.ts` before responding. `sanitizeUser` strips `password`, OTP fields, OAuth tokens, and similar credentials; the `public` strip mode also drops bulky/private fields (medical history, insurance, emergency contact, etc.) for list views, and inlined data-URL avatars longer than 2 KB are dropped from list responses (full-size avatars stay available on the user's own `/api/auth/me` and individual record reads). The providers list (`GET /api/providers`), provider detail (`GET /api/providers/:id`), and admin user list (`GET /api/admin/users`) all use these helpers; the providers list response went from ~5 MB to ~15 KB after this change.

To eliminate slow page loads caused by Supabase round-trip latency, three additional optimizations are in place:

1. **Database indexes** — `scripts/add-performance-indexes.sql` creates 48 `CREATE INDEX IF NOT EXISTS` indexes on every foreign key and common sort/filter column (providers, services, appointments, reviews, payments, chat, notifications, audit_logs, wallets, etc.). Re-run with `node -e "require('pg')..."` style script if migrating to a fresh database. Indexes are NOT yet declared in `shared/schema.ts`; if you regenerate the database from scratch via `db:push`, re-apply this SQL afterwards.
2. **Connection pool tuning** — `server/db.ts` configures the pg pool with `max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, keepAlive: true` so connections survive between requests instead of reconnecting on every call.
3. **Auth middleware in-process cache** — `authenticateToken` in `server/routes.ts` caches per-user `{ isEmailVerified, role, isSuspended, full user record }` and the per-provider `isVerified` flag for 30 seconds. This removes 1–2 Supabase round-trips (~400–800 ms) from every authenticated request. `/api/auth/me` reads directly from this cache so subsequent calls drop from ~370 ms to ~5 ms. Cache entries are invalidated via the exported `invalidateAuthCache(userId)` helper from login, logout, email verification, profile updates, suspension toggles, role changes, admin user deletion, and provider updates.

The cookie-parser middleware is registered at the top of `registerRoutes` so every auth-protected route (including the early invoice endpoints) can read the JWT cookie.

### Booking & Promo Codes

The booking flow charges per-service platform fees (sourced from each service's sub-service `platformFee`) and supports promo codes. Patients can enter a promo code in the booking summary; the backend `/api/promo-codes/validate` endpoint validates the code (active state, expiration, min purchase, per-user usage cap) and returns the discount amount. The booking creation endpoint persists `promoCode`, `promoDiscount`, and `platformFeeAmount` on the appointment, increments `usedCount` on the promo, and includes the discount and platform fee in the patient confirmation and provider notification emails (which list patient and clinic addresses, all amounts in USD).

### Solar Hijri Calendar

The frontend includes a `client/src/lib/persian-calendar.ts` utility that converts between Gregorian and Persian (Jalali) dates using `Intl.DateTimeFormat` with the `persian` calendar. When the active language is `fa`, booking date displays render in Solar Hijri format with Persian digits.

### Service Form

Provider service add/edit uses `client/src/components/service-form-dialog.tsx`, a modal styled after the reference design with image upload, calendar color swatches, sub-service category, price + deposit toggle, duration / time-slot length / buffer-before / buffer-after, custom-duration toggle, and hide-price / hide-duration toggles. The schema's `services` table holds `imageUrl`, `calendarColor`, `enableDeposit`, `depositAmount`, `timeSlotLength`, `bufferBefore`, `bufferAfter`, `customDuration`, `hidePrice`, `hideDuration`, and `sortOrder`.

### Wallet System

An in-app wallet allows patients to pre-load credits and pay for services. The system includes a `wallets` table and an append-only `wallet_transactions` ledger with snapshot balances and idempotency keys. Transaction operations are safeguarded by database transactions and row locking. The API supports wallet balance retrieval, transaction history, top-ups via Stripe, and payment for appointments. The frontend provides a dedicated wallet page, integrates wallet payment options into the booking flow, and the admin dashboard allows for wallet adjustments. A reminder cron generates in-app notifications for upcoming appointments.

### Database

The project exclusively uses Supabase (PostgreSQL) for all data storage. The schema includes core tables for users, providers, services, time slots, appointments, reviews, payments, and refresh tokens, with UUID primary keys, foreign key constraints, and cascading deletes. Enums are used for data integrity.

### Build Process

The client-side React app is bundled using Vite, and the server-side Express app with esbuild. Shared types and schemas are maintained in a `shared/` directory.

## External Dependencies

-   **Supabase (PostgreSQL)**: Primary database solution.
-   **`pg` + `drizzle-orm/node-postgres`**: PostgreSQL driver for database interactions.
-   **Radix UI**: Accessible, unstyled UI primitives.
-   **shadcn/ui**: Styled UI components built on Radix UI.
-   **Vite**: Frontend bundling.
-   **esbuild**: Server-side bundling.
-   **Drizzle Kit**: Database migrations.
-   **TypeScript**: Type safety across the codebase.
-   **Stripe**: Secure online payment processing.
-   **Google Maps JavaScript API**: For map functionalities, address search (Places Autocomplete), and location picking.
-   **Resend**: Email communication.
-   **Twilio**: SMS and WhatsApp communication.
-   **Web Push**: Web-push notifications.
-   **Daily.co**: Video conferencing for online appointments.