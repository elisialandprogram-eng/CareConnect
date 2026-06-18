# GoldenLife — Agent Rules & Invariants

> **Read this file before making any code changes.**
> These rules are non-negotiable. Violating them constitutes a critical failure.

---

## 1. MANDATORY PRE-FLIGHT

Before writing code for any sprint:
1. Read `ops/Goldenlife-Audit.md` (canonical architecture reference)
2. Read `ops/sprint-history.md` (prior decisions and context)
3. Read this file (`ops/agent-rules.md`)
4. Do NOT perform a repository-wide architecture audit — trust these ops files

---

## 2. FINANCIAL INVARIANTS (NEVER VIOLATE)

| Rule | Detail |
|---|---|
| Storage unit | ALL amounts stored in **USD cents** (integers) or **USD decimals** (DECIMAL 10,2+). Never store local-currency amounts in financial tables. |
| Rounding | Use `round2()` from `server/lib/math.ts`. No raw `Math.round`, `toFixed`, or `Intl.NumberFormat` on financial values. |
| Ledger append-only | `marketplace_ledger` is append-only. **No UPDATE or DELETE** on ledger rows. Ever. |
| Appointment audit | `appointment_events` is append-only. Status transitions must always create a new row. |
| Double-entry | Every completed appointment payment generates exactly 2 `marketplace_ledger` rows (debit + credit). |
| No auto-correction | Reconciliation jobs generate **findings only**. They never auto-modify financial data. |
| Refund safety | Stripe refund handlers have three independent guards (refundStatus check, stripeRefundId guard, Stripe idempotency key). Never remove any layer. |
| Earnings source | `provider_earnings.total_amount` is stored in USD. Never call `toUSDSync()` on it — it is already USD. |

---

## 3. ARCHITECTURAL INVARIANTS

| Rule | Detail |
|---|---|
| Single DB entry | All DB access goes through `server/db.ts` (`db` and `pool` exports). Never create a second Pool instance. |
| Migration strategy | New tables/columns → `runStartupMigrations()` in `server/db.ts`. Never use `drizzle-kit push` for Supabase. Each block in its own try-catch. |
| Column before schema | Add column via `runStartupMigrations()` **before** adding it to `shared/schema.ts`. Drizzle SELECTs all schema columns on first query. |
| Startup sequence | `runStartupMigrations()` is fire-and-forget after `httpServer.listen()`. **Never await it before listen()**. |
| Route ordering | Literal path segments before param routes (e.g., `/api/services/reorder` before `/api/services/:id`). Express uses first-match. |
| Country isolation | All listing endpoints use `listingCountryFilter()`. Per-resource endpoints call `canAccessCountry()`. |
| Rate limit key gen | Use default IP keying (no custom keyGenerators). `app.set('trust proxy', 1)` is set in `server/index.ts`. |
| SelectItem values | `<SelectItem>` must never have an empty `value=""` prop — causes silent Radix crash. |

---

## 4. CODE QUALITY RULES

| Rule | Detail |
|---|---|
| TSC gate | `npx tsc --noEmit --skipLibCheck` must exit 0 after every change. |
| No breaking API changes | Existing API response shapes must not change. New fields may be added. |
| formatDate | Use `formatDate()`/`formatDateTime()` from `@/lib/datetime` — never write inline `toLocaleDateString()` blocks. |
| Currency display | Use `useCurrency()` for patient/provider, `useAdminCurrency()` for admin. Never raw `Intl.NumberFormat` or `$`. |
| Error codes | `const pgCode = err?.code ?? err?.cause?.code` — Drizzle wraps driver errors under `.cause`. |
| navigate() in render | Always wrap `navigate()` calls in `useEffect` — never call during render. |

---

## 5. CRON / SCHEDULER RULES

| Rule | Detail |
|---|---|
| Startup timing | Cron starters are called **after** `httpServer.listen()` as fire-and-forget dynamic imports. |
| No circular imports | `reminderCron.ts` must NOT import from `routes.ts` — circular dependency. Replicate small utilities inline. |
| Job tracking | All new jobs must use `withJobTracking(name, fn)` from `server/lib/cronState.ts`. |
| New jobs | Register new scheduled jobs via `server/lib/scheduler.ts` using `scheduler.register({ name, intervalMs, fn })`. |

---

## 6. SPRINT COMPLETION CHECKLIST

Before closing any sprint:
- [ ] `npx tsc --noEmit --skipLibCheck` → EXIT:0
- [ ] No breaking API changes
- [ ] No financial invariant violations
- [ ] All DB migrations are idempotent (IF NOT EXISTS / try-catch)
- [ ] `ops/sprint-history.md` updated with deliverables entry
- [ ] `ops/Goldenlife-Audit.md` updated if architecture changed
