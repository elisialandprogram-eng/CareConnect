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

## Recent Changes

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