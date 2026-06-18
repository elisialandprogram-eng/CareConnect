---
name: Notification system audit
description: Root causes of bell/center mismatch and all fixes applied in the notification consolidation sprint
---

## The core bug (bell count ≠ notification list)

`GET /api/notifications` used raw pool.query selecting `subject, body, metadata` — columns that do **not exist** in `user_notifications` (actual cols: `title`, `message`, `data`). PostgreSQL returned 42703 → Express caught it → 500 response → frontend rendered empty list. But `GET /api/notifications/unread-count` used Drizzle ORM with correct column names → returned accurate count → bell showed count.

**Why:** Two developers wrote the list route and the count route independently. The count route followed the Drizzle schema; the list route was written against an older draft schema naming.

**Fix:** `server/routes/notification.routes.ts` — replaced raw pool.query with Drizzle ORM `db.select().from(userNotifications).where(...).orderBy(desc(...)).limit(...)`. Drizzle also automatically returns camelCase (isRead, createdAt) matching the `UserNotification` TS type, fixing a secondary bug where all notifications appeared unread client-side after any refetch.

## Bug 2: Dispute filing 500

`POST /api/disputes` in `admin-compliance.routes.ts` contained `INSERT INTO user_notifications (user_id, type, subject, body)` — same wrong column names. Fixed to `(user_id, type, title, message)`.

## Bug 3: Unverified providers blocked from own notifications

`server/middleware/auth.ts` allowed list for unverified providers only included `/api/provider/`, `/api/upload`, `/api/auth`. This meant providers in KYC review state received 403 on `/api/notifications/unread-count` and `/api/notifications` — so they could never see the "your documents were rejected" notification telling them what to fix.

**Fix:** Added `/api/notifications`, `/api/notification-preferences`, `/api/push`, `/api/chat`, `/api/comms` to the allowed list for unverified providers.

## Coverage gaps fixed

- `notify.reviewLeft` was using EventKey `"review.replied"` (shared with the patient's review-reply notification) — separated into `"review.left"` so provider and patient review preferences are independent.
- Added `"review.left"`, `"payout.approved"`, `"payout.paid"`, `"payout.rejected"` to the `EventKey` union type in `notification-dispatcher.ts`.
- Added payout status change notification to `PATCH /api/admin/payout-requests/:id` — providers now receive a `user_notifications` entry when admin approves, pays, or rejects their payout request.

## Architecture invariants confirmed

- `user_notifications` → personal in-app bell for ALL users (patients + providers + admins)
- `admin_notifications` → admin-only activity feed in `AdminNotificationCenter` sidebar
- These are intentionally separate; the header bell only reads `user_notifications`
- All `storage.createUserNotification()` calls use Drizzle ORM with correct camelCase → always safe
- Only raw SQL spots were the two bugs above; all other raw SQL uses correct snake_case column names for UPDATE/DELETE
