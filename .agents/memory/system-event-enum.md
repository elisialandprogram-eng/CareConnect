---
name: system_event_type enum constraint
description: The system_events table event_type column is a fixed PostgreSQL enum — free-form strings cause INSERT failures. The logger maps categories to allowed values and only persists warn/error/critical.
---

## Rule

`system_events.event_type` is a PostgreSQL `ENUM` named `system_event_type` defined in `shared/schema.ts`:

```
"api_error" | "payment_failure" | "notification_failure" | "slow_endpoint" | "failed_job" | "auth_failure"
```

**Any string not in this list will cause a runtime error:** `invalid input value for enum system_event_type: "<value>"`.

## How the structured logger handles this

`server/lib/logger.ts` defines `CATEGORY_EVENT_TYPE` which maps our richer log categories to the allowed enum values:

| Category | DB event_type |
|----------|--------------|
| auth | auth_failure |
| payment | payment_failure |
| notification | notification_failure |
| scheduler | failed_job |
| booking, webhook, search, db, cache, system | api_error |

Additionally, only `warn / error / critical` level events are persisted to the DB — `info` and `debug` are console-only. This prevents spamming `system_events` with routine heartbeats.

**Why:** First hit during Sprint 8 when `logScheduler()` passed `"scheduler:cron_tick_5min"` as the event type, causing silent failures on every cron tick logged at info level.

**How to apply:** When calling `logSystemEvent()` directly (not via the logger helpers), always use one of the 6 allowed enum values. When adding new log categories to `server/lib/logger.ts`, add a mapping entry in `CATEGORY_EVENT_TYPE`.
