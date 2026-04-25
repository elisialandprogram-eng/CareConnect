# CareConnect - Healthcare Booking Platform

## Overview

CareConnect is a healthcare booking platform that connects patients with verified physiotherapists, doctors, and home care nurses. The platform enables patients to search for healthcare providers, book appointments (online or home visits), make secure payments, and leave reviews. Providers can manage their profiles, services, availability, and appointments through a dedicated dashboard.

The application follows a modern full-stack architecture with React on the frontend, Express on the backend, and PostgreSQL (via Neon serverless) for data persistence. It emphasizes a trustworthy, clean aesthetic inspired by platforms like Fresha, Calendly, and Zocdoc.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query (React Query) for server state
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Forms**: React Hook Form with Zod validation

**Design System:**
- Typography: Inter (primary), DM Sans (accents)
- Component library using Radix UI for accessibility
- Custom theme system supporting light/dark modes via CSS variables
- Responsive layouts with mobile-first approach
- Tailwind configuration with custom spacing scale (2, 4, 6, 8, 12, 16, 20)

**Key Pages:**
- Home: Hero section with search, service categories, testimonials, stats
- Providers: Searchable/filterable provider listing
- Provider Profile: Detailed provider info, reviews, booking interface
- Patient Dashboard: Appointment management, booking history
- Provider Dashboard: Appointment management, availability settings
- Authentication: Login, register, provider setup

### Backend Architecture

**Technology Stack:**
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **ORM**: Drizzle ORM
- **Authentication**: JWT tokens with bcrypt password hashing
- **Validation**: Zod schemas (shared between client/server)

**Authentication Flow:**
- JWT-based authentication with access tokens (15-minute expiry)
- Refresh tokens for extended sessions (7-day expiry)
- Cookie-based token storage for web clients
- Role-based access control (patient, provider, admin)
- Middleware for protected routes (`authenticateToken`, `optionalAuth`)

**API Structure:**
- RESTful endpoints organized by resource
- JSON request/response format
- Centralized error handling
- Request logging middleware

**Data Access Layer:**
- Storage interface (`IStorage`) abstracts database operations
- Separate functions for users, providers, services, appointments, reviews, payments
- Complex queries return enriched types (e.g., `ProviderWithUser`, `AppointmentWithDetails`)

### Database Architecture

**Platform**: Neon Serverless PostgreSQL with WebSocket connections

**Schema Design:**

**Core Tables:**
- `users`: User accounts (email, password, role, profile info)
- `providers`: Provider profiles (type, specialization, fees, ratings, location)
- `services`: Services offered by providers
- `time_slots`: Provider availability windows
- `appointments`: Booking records with status tracking
- `reviews`: Patient reviews for providers
- `payments`: Payment transaction records
- `refresh_tokens`: Session management

**Key Relationships:**
- One-to-one: User → Provider
- One-to-many: Provider → Services, Provider → TimeSlots, Provider → Appointments
- Many-to-one: Appointments → Provider, Appointments → Patient

**Enums:**
- User roles: patient, provider, admin
- Provider types: physiotherapist, doctor, nurse
- Appointment statuses: pending, confirmed, completed, cancelled, rescheduled
- Visit types: online, home, clinic
- Payment statuses: pending, completed, refunded, failed

**Data Integrity:**
- Foreign key constraints with cascading deletes
- Unique constraints on email addresses
- Default values for timestamps and status fields
- UUID primary keys via `gen_random_uuid()`

### External Dependencies

**Database:**
- Neon Serverless PostgreSQL
- Connection pooling via `@neondatabase/serverless`
- WebSocket-based connections for serverless environments

**UI Component Library:**
- Radix UI primitives for accessible, unstyled components
- shadcn/ui configuration for styled component variants
- Custom theming via CSS variables and Tailwind

**Development Tools:**
- Vite for frontend bundling and HMR
- esbuild for server-side bundling in production
- Drizzle Kit for database migrations
- TypeScript for type safety across the stack

**Build Process:**
- Client: Vite builds React app to `dist/public`
- Server: esbuild bundles Express app to `dist/index.cjs`
- Selected dependencies bundled to reduce cold start times
- Shared types and schemas between client/server via `shared/` directory

**Path Aliases:**
- `@/*`: Client source files
- `@shared/*`: Shared types and schemas
- `@assets/*`: Static assets

**Environment Requirements:**
- `DATABASE_URL`: PostgreSQL connection string (required)
- `SUPABASE_DATABASE_URL`: Supabase Postgres connection string (preferred — used when set, otherwise falls back to `DATABASE_URL`)
- `SESSION_SECRET`: JWT signing key (defaults to development key)
- `NODE_ENV`: Environment mode (development/production)
- `VITE_GOOGLE_MAPS_API_KEY`: Google Maps JavaScript API key (frontend). Required for the interactive map + address autocomplete in the booking flow. When unset, the booking address picker falls back to a plain text input + browser-geolocation button, and the provider dashboard still shows the address with a "Get Directions" link that opens Google Maps in a new tab. Enable Maps JavaScript API, Places API, and Geocoding API on your Google Cloud project.
- `STRIPE_SECRET_KEY`: Stripe secret API key (backend). When set, card-payment bookings create a real Stripe Checkout Session and the patient is redirected to Stripe to pay. When unset, bookings still succeed with the payment row in `pending` state.
- `VITE_STRIPE_PUBLISHABLE_KEY`: Stripe publishable key (frontend). Currently informational — the Checkout Session redirect does not require it client-side, but the Admin → Settings → Payments panel reports its presence.
- `STRIPE_WEBHOOK_SECRET`: Used by `POST /api/stripe/webhook` to verify event signatures. Without it the webhook still parses events but logs a loud warning (DEV ONLY). In Stripe, point a webhook at `${ORIGIN}/api/stripe/webhook` and subscribe to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.

## Internationalization (i18n)

**ACTIVE i18n CONFIG**: `client/src/lib/i18n.ts` — this is the file imported by `client/src/main.tsx` and `client/src/App.tsx`. All translation resources (en/hu/fa) are bundled inline here as JS objects. **All translation key edits must be made in this file.**

**INACTIVE / LEGACY**: `client/src/i18n/config.ts` and `client/src/i18n/locales/*/translation.json` exist but are NOT imported anywhere. Editing the JSON files has no runtime effect. They can be removed in a future cleanup.

Languages: English (`en`, default), Hungarian (`hu`, formal tone), Persian (`fa`, RTL). Detection order: localStorage → cookie → htmlTag. Persisted to localStorage as `i18nextLng`.

**Auth + validation localization status**: As of the latest pass, both HU and FA have full `auth` and `validation` blocks (login screen, register screen, OTP verify, consents & authorizations panel, form validation messages, role placeholder, name placeholders). FA also now has its own `footer` block (was missing before). Other still-missing HU/FA blocks (hero, features, payment, service_categories, how_it_works, stats, cta, testimonials, chat, dashboard) continue to fall back to EN until they are localized in a future pass.

## Recent Changes

- Booking-flow & invoicing fixes:
  - **New helper** `server/utils/invoice-helper.ts` exports `createInvoiceForAppointment(appointmentId)`. It looks up the appointment's payment row, sets the new invoice status to `paid` if the payment is `completed` and `due` otherwise, generates the PDF via `generateInvoicePDF`, and emails it to the patient when Resend is configured. Idempotent — bails out if the appointment already has `invoiceGenerated = true`.
  - `PATCH /api/appointments/:id/status` (the route the **provider** dashboard calls) now invokes the helper whenever status becomes `completed` — previously only the admin path generated invoices, so no invoice was ever produced in the normal flow. The patient-notification message now includes the invoice number when one was generated. Response shape is `{ ...appointment, invoice?: { created, invoiceNumber } }`.
  - **New endpoint** `PATCH /api/appointments/:id/payment-status` (provider or admin only) lets the provider mark cash / bank-transfer / crypto payments as `completed` once received. If the appointment is already completed and was waiting for payment, it triggers invoice generation as a side-effect, and notifies the patient that payment was recorded.
  - **New endpoint** `GET /api/invoices/me` returns invoices for the current patient or provider so the patient dashboard no longer has to fish them out of the appointments list.
  - Provider dashboard (`client/src/pages/provider-dashboard.tsx`): the appointment row had **no action buttons at all** — the `updateStatusMutation` was wired up but never called. Added Confirm / Mark Completed / Cancel buttons (state-aware, only the relevant action shows for each status), plus a "Mark payment received" button for non-card bookings whose payment is still pending. Each action surfaces a toast — completing an appointment shows the invoice number when one is generated. Also surfaces the payment method + status in the row meta line.
  - Patient dashboard (`client/src/pages/patient-dashboard.tsx`): the "Invoices" tab now actually shows invoices (from `/api/invoices/me`), each with a **Download PDF** button that hits `/api/invoices/:id/download`, status badge (`paid` / `due`), issue + due date. Payment History is preserved as a second card below.

- UI polish on auth pages (`client/src/pages/login.tsx`, `client/src/pages/register.tsx`):
  - Fixed the password show/hide eye toggle on Login, Register, and Confirm-password fields. The previous `<Button size="icon" className="absolute right-0 top-0 h-full">` overlay rendered as a separate row below the input. Replaced with a plain `<button>` positioned at `right-2 top-1/2 -translate-y-1/2` over a `pr-10` padded input — icon now sits cleanly inside the field on the right.
  - Reorganised the Register form: First/Last name → Email → Phone → Role → Password/Confirm password → **Consents & Authorizations** (was previously placed *between* the name fields and the email field). Consents are now wrapped in a soft `bg-muted/30` panel with a one-line intro for clarity.
  - Replaced hardcoded English strings on Register (placeholders for first/last name, password, confirm password, role select, and the consent labels & section header) with `t("auth.*")` calls. Added the new keys to the `en.auth` block in `client/src/lib/i18n.ts` (HU/FA still fall back to EN until the auth block is localised).
  - Header (`client/src/components/header.tsx`) profile menu now uses `t("common.profile")` instead of the missing `common.profile_label` key, so admins no longer see the raw key string.
  - Footer (`client/src/components/footer.tsx`) Privacy / Terms / Cookie policy links now go through `t()`, with EN + HU translations added to `client/src/lib/i18n.ts`.

- Integrated real Stripe Checkout payments (replaces the previous mock/placeholder UI):
  - New `server/stripe.ts` (lazy-initialised Stripe client) and `server/stripeWebhook.ts` (raw-body webhook handler registered in `server/index.ts` BEFORE `express.json`).
  - `POST /api/appointments` now also creates a Stripe Checkout Session when `paymentMethod === "card"` and Stripe is configured, returning `checkoutUrl` alongside the appointment. The booking page redirects the patient to Stripe and handles the `?stripe=success`/`?stripe=cancelled` return URLs.
  - On `checkout.session.completed`, the webhook flips the payment to `completed`, stores the Stripe session + payment-intent IDs, and confirms the appointment.
  - Admin → Settings → Payments now shows live Stripe configuration status (mode/keys/webhook secret) plus setup instructions, replacing the old "fake" key-input form. Stripe-status endpoint: `GET /api/admin/stripe/status` (admin only).

- Added Google Maps location capture to the booking flow (`client/src/components/location-picker.tsx`):
  - Patients can search an address (Places Autocomplete), drop/drag a pin on the map, or use "Use my current location".
  - Both the formatted address and the lat/lng are persisted to the appointment.
  - Added two nullable columns: `appointments.patient_latitude` and `appointments.patient_longitude` (DOUBLE PRECISION).
  - Provider dashboard shows the patient's address per appointment with a "Get Directions" button that opens Google Maps with turn-by-turn navigation (works without the JS API key — uses the universal `maps/dir/?api=1` URL).
  - Registered the missing `/booking` route in `client/src/App.tsx`.