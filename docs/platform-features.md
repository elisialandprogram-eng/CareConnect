# Golden Life — Platform Features by Role

This document lists the features available on the Golden Life healthcare platform, organized by user role: **Patients**, **Providers** (physiotherapists, doctors, home-care nurses), and **Admins**. Shared/system-wide features are listed at the end.

---

## 1. Patients

Patients are the primary consumers of the platform. Their features focus on discovering care, booking appointments, managing health records, and handling payments.

### Discovery & Booking
- **Provider directory** — Search and filter healthcare providers by name, specialization, and visit type (Online, Home, Clinic).
- **Service catalog** — Browse services grouped by categories (e.g., Physiotherapy, Nursing Care) and sub-services.
- **Provider profiles** — View detailed professional information, experience, certifications, fees, gallery, and patient reviews.
- **Booking wizard** — Multi-step flow to select a service, practitioner, date/time slot, and confirm appointment details.
- **Saved providers** — Favorite providers for quick access later.
- **One-tap rebooking** — Quickly book the same service with a previously seen provider.

### Appointment Management
- **Unified dashboard** — View upcoming, past, and cancelled appointments with status tracking (Awaiting Approval, Confirmed, In Progress, Completed, Cancelled).
- **Reschedule & cancel** — Request a new time or cancel a booking.
- **Visit-type support** — Online, in-home, and in-clinic appointments.

### Health & Records
- **Medical history** — Manage diagnoses, procedures, and lab results, with document attachments.
- **Prescriptions** — Digital list of medications, dosages, and instructions, with downloadable attachments.
- **Health metrics** — Track vital signs (Blood Pressure, Weight, Blood Sugar, Heart Rate).
- **Medication tracker** — Manage active medications and schedules.
- **Family members** — Manage health profiles for family members under one account.

### Financials & Support
- **Digital wallet** — Pre-load credits (HUF) via Stripe, view transaction history (top-ups, debits, refunds), and pay in one tap.
- **Invoices** — Auto-generated, downloadable PDF invoices for completed appointments.
- **Promo codes** — Apply discount codes during booking.
- **Support tickets** — Open, track, and reply to support requests with the admin team.

### Communication
- **Secure messaging** — Direct chat with providers for appointment coordination.
- **AI chat assistant** — In-app AI-powered healthcare assistant.
- **Reviews & ratings** — Leave star ratings and written feedback after completed appointments.

---

## 2. Providers (Physiotherapists, Doctors, Home-Care Nurses)

Providers manage their professional practice, availability, and clinical delivery.

### Practice Management
- **Professional profile** — Configure title, bio, education, license numbers, and specialties.
- **Service management** — Create and edit services, set pricing per visit type (Online vs. Home vs. Clinic), and define durations.
- **Practitioner management** — Larger providers can manage multiple staff members and assign them to specific services.
- **Gallery** — Upload professional photos to showcase the practice.
- **Profile completeness tracker** — Gamified progress card guiding providers to complete their profile for better visibility.

### Availability & Scheduling
- **Weekly schedule grid** — Define recurring working hours and available days.
- **Bulk availability** — Create multiple time slots across several dates at once.
- **Calendar view** — Visual overview of all scheduled appointments.

### Clinical Operations
- **Appointment workflow** — Approve or reject pending requests; mark appointments as In Progress or Completed.
- **Private clinical notes** — Maintain internal notes on patients (not visible to the patient).
- **Patient context** — View patient profile, address (with Google Maps integration), and contact info during appointments.
- **Secure patient messaging** — Chat with patients to coordinate care.

### Business Tools
- **Analytics dashboard** — Track earnings and appointment trends with interactive line/bar/area charts.
- **Review management** — View patient ratings and post official replies.
- **Payment tracking** — Mark payments as received for cash or bank-transfer transactions.
- **Invoices** — Access generated invoices for completed appointments.

---

## 3. Admins

Admins have full platform access to moderate users, manage the catalog, and configure system-wide settings.

### User & Provider Oversight
- **Provider verification** — Review and approve provider applications, licenses, and background checks.
- **User management** — View all patients and providers; suspend, unsuspend, or edit accounts.
- **Identity verification** — Track background-check and identity-verification statuses.

### Platform Configuration
- **Service catalog hierarchy** — Manage Categories → Catalog Services → Sub-Services across the platform.
- **Pricing overrides** — Set admin price overrides and platform-fee overrides for specific services.
- **Promo code management** — Create, track, and expire discount codes.
- **Tax settings** — Configure tax percentages and rules.

### Operations & Support
- **Global appointments view** — Monitor all platform-wide bookings and their statuses.
- **Stale booking cleanup** — Identify and clear expired appointment requests.
- **Support helpdesk** — View and respond to all patient support tickets.
- **Audit logs** — System-wide audit trail for actions like create, delete, login, and export.

### Content Management
- **Dynamic CMS content** — Manage homepage content, FAQs, blog, Terms of Service, and Privacy Policy.
- **Announcements** — Push system-wide notifications or banners (Info, Warning, Error).

---

## Shared / System-Wide Features

These features are available across all user roles.

- **Multi-language support** — Full UI localization in English, Persian (Farsi), and Hungarian, with RTL support for Farsi.
- **Authentication & security** — Email OTP verification, password recovery, and role-based access control (RBAC).
- **Notifications** — Multi-channel delivery via Email, SMS, WhatsApp, and Push.
- **Light & dark mode** — Theme switcher available throughout the app.
- **Responsive design** — Works on desktop, tablet, and mobile devices.
