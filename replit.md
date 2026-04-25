# CareConnect - Healthcare Booking Platform

## Overview

CareConnect is a healthcare booking platform designed to connect patients with verified physiotherapists, doctors, and home care nurses. It facilitates searching for healthcare providers, booking various types of appointments (online or home visits), secure online payments, and submitting patient reviews. Healthcare providers can utilize a dedicated dashboard to manage their profiles, services offered, availability, and scheduled appointments. The platform aims to provide a reliable and aesthetically pleasing user experience, drawing inspiration from leading booking platforms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React and TypeScript, utilizing Wouter for routing and TanStack Query for server state management. Styling is handled with Tailwind CSS, leveraging Radix UI primitives and shadcn/ui for accessible UI components. Forms are managed with React Hook Form and Zod for validation. The design system incorporates Inter and DM Sans fonts, supports light/dark modes, and follows a mobile-first responsive approach. Key pages include Home, Provider listing, Provider Profile, Patient Dashboard, Provider Dashboard, and Authentication flows.

### Backend

The backend is developed with Node.js and TypeScript, using Express.js as the framework and Drizzle ORM for database interactions. Authentication is JWT-based with bcrypt for password hashing, supporting role-based access control (patient, provider, admin). The API is RESTful, uses JSON for communication, and includes centralized error handling and request logging. A Data Access Layer (DAL) abstracts database operations for various entities, providing enriched data types for complex queries.

### Database

The application uses Neon Serverless PostgreSQL with WebSocket connections. The schema includes core tables for users, providers, services, time slots, appointments, reviews, payments, and refresh tokens. Relationships are defined to link these entities, such as one-to-one for User-Provider and one-to-many for Provider-Services. Enums are used for user roles, provider types, appointment statuses, visit types, and payment statuses to ensure data integrity and consistency. UUIDs are used for primary keys, and foreign key constraints with cascading deletes are implemented.

### Build Process

The client-side React app is bundled using Vite, while the server-side Express app is bundled with esbuild. Shared types and schemas are maintained in a `shared/` directory to ensure consistency across the stack.

## External Dependencies

### Database

- **Neon Serverless PostgreSQL**: Primary data storage solution.
- **@neondatabase/serverless**: For connection pooling and WebSocket-based database connections in serverless environments.

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