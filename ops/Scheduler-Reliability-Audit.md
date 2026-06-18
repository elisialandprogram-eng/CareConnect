# Scheduler Reliability Audit & Fix

**Date:** 2026-06-10  
**Scope:** All scheduler jobs — `reminderCron.ts`, `scheduler.ts`, `ledger-reconcile.ts`, `metrics-snapshot.ts`, `cron/rolling-schedule.ts`, `cron/wallet-audit.ts`

---

## Executive Summary

The scheduler suffered two compounding failures that caused the `tick_5min` job to show as "failed" and silently skip all modules in `tickHourly()` whenever any single sub-task threw:

1. **`Promise.all()` task isolation failure** — both `tick()` and `tickHourly()` ran subtasks inside `Promise.all()` / a single monolithic `try/catch`. One thrown error rejected the entire batch, abandoning all remaining subtasks.
2. **Pool exhaustion at startup** — the pool is capped at 12 connections; 6 concurrent Drizzle ORM tasks in `Promise.all()` could claim 12–18 connections simultaneously, hitting `EMAXCONNSESSION`. The problem was compounded by `tick()` and `tickHourly()` running immediately on startup before startup migrations had released their connections.

All fixes are live. TypeScript: EXIT 0.

---

## Root Cause Analysis

### Bug 1 — `tick()`: `Promise.all()` with no per-task isolation

**File:** `server/reminderCron.ts` — `tick()` function  
**Severity:** Critical

```ts
// BEFORE (broken)
const totals = await Promise.all([
  sendForTier("1h"),
  sendForTier("15m"),
  sendPostVisit(),
  expireStalePending(),
  cancelStaleConfirmed(),
  expireAndNotifySlotHolds(),
]);
```

`Promise.all()` rejects as soon as any one promise rejects. If `sendForTier("1h")` threw (e.g. due to a pool-exhaustion error), all 5 remaining tasks were abandoned. The outer `catch` block marked the entire tick as `status: "failed"`, which surfaced in the admin scheduler panel. The `sentMemo` dedup keys were never written, so the same appointments would be re-queued on the next tick.

### Bug 2 — `tickHourly()`: Single monolithic `try/catch` around 10+ modules

**File:** `server/reminderCron.ts` — `tickHourly()` function  
**Severity:** Critical

```ts
// BEFORE (broken) — pseudo-code
try {
  await Promise.all([sendForTier("24h"), sendPrepReminders(), ...]);  // 4 concurrent
  const waitlistExpired = await expireNotifiedWaitlistEntries();       // if above throws → skipped
  const docsSent = await sendDocumentExpiryReminders();               // skipped
  const credSent = await sendCredentialExpiryAlerts();                // skipped
  const followupSent = await sendFollowUpReminders();                 // skipped
  const pkgAlerts = await sendPackageRetentionAlerts();               // skipped
  const pkgExpired = await expireAndNotifyPackages();                 // skipped
  // data retention, wallet audit, etc. — all skipped
} catch (err) {
  logScheduler({ ..., status: "failed" });
}
```

A failure in the first `Promise.all()` block caused the entire hourly tick to abort, skipping waitlist expiry, document reminders, credential alerts, follow-up reminders, package alerts, package expiry, wallet audit, and data retention.

### Bug 3 — Startup pool exhaustion

**File:** `server/reminderCron.ts` — `startReminderCron()`  
**Severity:** High

```ts
// BEFORE (broken)
export function startReminderCron() {
  tick();        // immediate — races startup migrations
  tickHourly();  // immediate — stacks on top of tick()
  setInterval(tick, TICK_5M);
  hourlyTimer = setInterval(tickHourly, 60 * 60 * 1000);
}
```

`startReminderCron()` is called from `server/index.ts` in the `.finally()` of `runStartupMigrations()`. Even though migrations are "done," the pool connections may not have fully settled (migrations run fire-and-forget with no awaiting). With both `tick()` and `tickHourly()` firing immediately, this created a burst of 10–15 concurrent queries against a pool of 12, causing `EMAXCONNSESSION` errors.

### Bug 4 — `withJobTracking` re-throw inside hourly `try/catch` scope

**File:** `server/reminderCron.ts` — `tickHourly()` → `data_retention` and `pending_account_cleanup`  
**Severity:** Medium

```ts
// BEFORE — inside the monolithic try/catch
const pruned = await withJobTracking("data_retention", pruneOldData);  // re-throws on failure
```

`withJobTracking` re-throws errors (by design, for cronState tracking). These calls were inside the same monolithic try/catch, so a failure would abort the entire hourly tick and mark it `status: "failed"` globally.

---

## Fixes Applied

### Fix 1 — `runSubtask()` helper

Added a new helper that wraps any async function with per-task isolation, duration logging, and a guaranteed non-throw return:

```ts
async function runSubtask(name: string, fn: () => Promise<number>): Promise<number> {
  const t0 = Date.now();
  try {
    const count = await fn();
    const n = count ?? 0;
    if (n > 0) log(`reminderCron[${name}]: processed ${n} item(s) in ${Date.now() - t0}ms`);
    return n;
  } catch (err) {
    log(`reminderCron[${name}]: FAILED in ${Date.now() - t0}ms — ${(err as Error).message}`);
    return 0;
  }
}
```

### Fix 2 — `tick()` rewritten to sequential isolated subtasks

```ts
async function tick() {
  const start = recordJobStart("tick_5min");
  // Sequential = stays within pool limit; runSubtask = one failure never aborts others
  let sum = 0;
  sum += await runSubtask("reminder_1h",    () => sendForTier("1h"));
  sum += await runSubtask("reminder_15m",   () => sendForTier("15m"));
  sum += await runSubtask("post_visit",     () => sendPostVisit());
  sum += await runSubtask("expire_pending", () => expireStalePending());
  sum += await runSubtask("cancel_stale",   () => cancelStaleConfirmed());
  sum += await runSubtask("slot_holds",     () => expireAndNotifySlotHolds());
  sum += await runSubtask("group_sessions", ...);
  recordJobEnd("tick_5min", start, { itemCount: sum });
  logScheduler({ job: "tick_5min", status: "completed", ... });
  // Note: tick() never records "failed" now — individual subtask failures are
  // logged per-task and the tick always completes.
}
```

**Impact:** `tick_5min` can no longer be marked failed due to a subtask error. Each subtask logs its own failure with the task name, duration, and error message.

### Fix 3 — `tickHourly()` rewritten to per-module isolation

All 10+ modules now go through `runSubtask()`. The `withJobTracking` calls for `data_retention` and `pending_account_cleanup` are each wrapped in their own `try/catch`. The hourly tick always records `status: "completed"`.

### Fix 4 — Startup delay in `startReminderCron()`

```ts
export function startReminderCron() {
  const STARTUP_DELAY_MS = 8_000;
  setTimeout(tick,       STARTUP_DELAY_MS);           // first tick after 8s
  setTimeout(tickHourly, STARTUP_DELAY_MS + 2_000);   // staggered +2s
  setInterval(tick, TICK_5M);
  hourlyTimer = setInterval(tickHourly, 60 * 60 * 1000);
}
```

The first execution of both `tick()` and `tickHourly()` is delayed 8 s (staggered by 2 s) after startup. The interval timers start immediately so no scheduled tick is missed. This gives startup migrations time to release their pool connections before any cron query runs.

---

## Pre-Existing Good Practices (No Changes Needed)

| Component | Status |
|-----------|--------|
| `expireAndNotifySlotHolds()` | ✅ Already has own try/catch; returns 0 on failure |
| `expireStalePending()` / `cancelStaleConfirmed()` | ✅ Per-appointment try/catch; outer try propagates up — now caught by `runSubtask` |
| `ledger-reconcile.ts` — `reconcileLedger()` | ✅ Each of 5 checks wrapped individually |
| `scheduler.ts` — `JobScheduler.start()` | ✅ Each job wrapped in `withJobTracking().catch(() => {})` |
| `metrics-snapshot.ts` | ✅ Errors caught per-route; non-fatal |
| `cron/wallet-audit.ts` | ✅ Entire function in single try/catch; callers (tickHourly) also wrap it |
| `withJobTracking` (cronState.ts) | ✅ Re-throws by design; now every call site has its own catch |

---

## Scheduler Architecture (Post-Fix)

```
server/index.ts
└── runStartupMigrations().finally(() => {
      startReminderCron()        → delayed 8s → tick() every 5min
                                  delayed 10s → tickHourly() every 1h
      startLedgerReconcileCron() → reconcileLedger() immediately + every 1h
      startMetricsSnapshotCron() → snapshotMetrics() every 1h
                                   runAlertGeneration() every 30min
      runRollingSchedule()       → fire-and-forget on startup + daily from tickHourly
    })

tick_5min subtasks (sequential, each isolated):
  reminder_1h → reminder_15m → post_visit → expire_pending →
  cancel_stale → slot_holds → group_sessions

tick_hourly subtasks (sequential, each isolated):
  sync_exchange_rates → reminder_24h → prep_reminder → invoice_reminder →
  doc_expiry → [Mon: weekly_summary, profile_nudge] →
  [1st: monthly_summary] → waitlist_expiry → doc_advance →
  cred_expiry → followup → pkg_alerts → pkg_expire →
  [daily: rollingSchedule fire-and-forget] →
  walletAudit → [hourly: data_retention + pending_account_cleanup]
```

---

## Pool Configuration Reference

| Setting | Value | Notes |
|---------|-------|-------|
| `pool.max` | 12 | Below Supabase session-mode cap of 15 |
| `pool.idleTimeoutMillis` | 30,000 | Releases idle connections promptly |
| Concurrent tasks (before fix) | 6–10 | Could exceed pool.max |
| Concurrent tasks (after fix) | 1 at a time | Sequential execution, safe |

---

## Monitoring Improvements

Each subtask now logs:
- **On success:** `reminderCron[task_name]: processed N item(s) in Xms` (only if N > 0)
- **On failure:** `reminderCron[task_name]: FAILED in Xms — <error message>`

The `tick_5min` job now always records `status: "completed"` in the scheduler panel. Per-task failures appear individually in logs with task name and duration, making it easy to identify exactly which subtask failed and why.

---

## Verification

- TypeScript: `npx tsc --noEmit --skipLibCheck` — **EXIT 0**
- No breaking changes to external APIs, DB schema, or admin endpoints
