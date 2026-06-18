---
name: StatusBadge design system
description: Unified status badge component — single source of truth for all status rendering across GoldenLife. Use this instead of any inline status color map.
---

## Rule
Always use `StatusBadge` from `@/components/ui/status-badge` for any status rendering. Never create a new inline `statusColor`, `getStatusColor`, or `getStatusBadge` function.

## Component location
`client/src/components/ui/status-badge.tsx`

## Exports

| Export | Purpose |
|--------|---------|
| `StatusBadge` | Full badge component (use in JSX) |
| `statusClasses` | Raw CSS class string (for non-Badge wrappers) |
| `statusLabel` | Human-readable label string only |
| `docStatusTextClass` | Text-only color class for document icons/inline text |

## Domains

Pass `domain` prop to select the right status space:

| Domain | Status values covered |
|--------|----------------------|
| `appointment` (default) | pending, approved, confirmed, in_progress, completed, cancelled, cancelled_by_patient, cancelled_by_provider, rejected, rescheduled, expired, no_show |
| `payment` | pending, pending_payment, processing, completed, failed, refunded, partially_refunded, processed, not_required |
| `provider` | pending, pending_approval, approved, active, documents_verified, rejected, suspended, draft, inactive |
| `document` | pending, approved, rejected, expired, expiring_soon, reupload_requested, reupload_required, missing |
| `dispute` | open, resolved, closed, rejected |

## Usage examples

```tsx
// Appointment status (default domain):
<StatusBadge status={appointment.status} />

// Payment status:
<StatusBadge status={payment.status} domain="payment" />

// Provider/package status:
<StatusBadge status={provider.status} domain="provider" />

// Document icon color:
<FileText className={docStatusTextClass(doc.status)} />

// Label only (no badge):
const label = statusLabel(appt.status); // "In Progress"
```

## What was eliminated (do not recreate)
- `getStatusColor()` switch in patient-dashboard.tsx
- `getStatusLabel()` + `getStatusColor()` in provider-dashboard.tsx
- `statusColor()` in client-operations-console.tsx
- `statusColor()` + `docStatusColor()` in provider-operations-console.tsx
- `getStatusBadge()` + cfg map in appointments.tsx
- `APPOINTMENT_STATUS_COLOR` Record in family-member-dashboard.tsx
- Inline statusColor Record in admin-dashboard.tsx
- Local `StatusBadge` function in communication-center.tsx

**Why:** 8 separate implementations had inconsistent dark mode support, inconsistent colors, and raw snake_case labels showing in the UI. One component with a domain prop eliminates all of it.

**How to apply:** Any new feature that renders a status → import StatusBadge and pick the closest domain. If a new status domain is needed, add it to status-badge.tsx rather than creating an inline map.
