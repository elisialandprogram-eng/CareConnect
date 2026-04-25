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

### Backend

The backend is developed with Node.js and TypeScript, using Express.js as the framework and Drizzle ORM for database interactions. Authentication is JWT-based with bcrypt for password hashing, supporting role-based access control (patient, provider, admin). The API is RESTful, uses JSON for communication, and includes centralized error handling and request logging. A Data Access Layer (DAL) abstracts database operations for various entities, providing enriched data types for complex queries.

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