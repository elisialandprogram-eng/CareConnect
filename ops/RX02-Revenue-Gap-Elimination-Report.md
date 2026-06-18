# Sprint RX-02 — Revenue Engine Gap Elimination Report

**Date:** 2026-06-11  
**Status:** COMPLETE  
**TypeScript:** EXIT:0

---

## Objective

Make `runRevenueEngine()` the unquestionable single financial authority — no bypass paths, no duplicate calculations, no legacy logic, no dead code. Eliminate all gaps discovered in the RX-02 Phase 1 audit.

---

## Phase 1 Audit — Findings Summary

### computeFinalPrice usage audit

| File | Usage | Action |
|------|-------|--------|
| `server/lib/revenue-engine.ts` | Kernel (RE calls it internally) | Keep — correct |
| `server/utils/invoice-helper.ts` | Display-only: reconstructs tax breakdown from stored `totalAmount` | Keep — not a financial write |
| `server/routes/catalog.routes.ts:487` | Service price preview for listing (not booking) | Keep — display only |
| `server/routes/appointment-resources.routes.ts` | Import only, no call | **Removed** |
| `server/routes/appointment-waitlist.routes.ts` | Import only, no call | **Removed** |
| `server/routes/provider-availability.routes.ts` | Import only, no call | **Removed** |
| `server/routes/provider-media.routes.ts` | Import only, no call | **Removed** |
| `server/routes/provider-schedule-admin.routes.ts` | Import only, no call | **Removed** |
| `server/routes/provider-wallet-payouts.routes.ts` | Import only, no call | **Removed** |
| `server/routes/provider.routes.ts` | Import only, no call | **Removed** |

**Result:** 7 unused ghost imports removed. Zero active bypass paths remain.

### Membership benefit gaps

| Benefit key | Status before RX-02 | Status after RX-02 |
|-------------|---------------------|---------------------|
| `service_discount_percent` | ✅ Implemented | ✅ Implemented (no change) |
| `platform_fee_discount` | ✅ Implemented | ✅ Implemented (no change) |
| `reduced_commission` | ❌ Not extracted, not passed to RE | ✅ Extracted → `membershipReducedCommissionPercent` → RE |
| `wallet_bonus` | ❌ Not extracted, not applied | ✅ Extracted → `topUpWallet()` fire-and-forget after booking |
| `free_cancellations` | ❌ Not extracted | ℹ️ No cancellation fee logic exists yet; benefit is effectively already honored |
| `priority_support` | Non-financial admin label | No action needed |
| `featured_provider` | Non-financial search ranking | No action needed |

### Performance: rule loading

| Metric | Before | After |
|--------|--------|-------|
| DB queries per booking | 5 (all rule tables) | 5 on first request, 0 for next 30 s |
| Cache TTL | None | 30 seconds |
| Cache invalidation | None | Immediate on any admin rule write |

---

## Changes Made

### 1. `server/lib/revenue-engine.ts`

- **Rule cache**: Added 30 s TTL module-level cache (`_rulesCache`). `loadRevenueRules()` returns cached data on repeat calls. Exported `invalidateRevenueRulesCache()` to bust the cache.
- **New RE input field**: `membershipReducedCommissionPercent?: number | null` — number of percentage points subtracted from the matched commission rule rate (floored at 0%).
- **Commission calculation**: `commissionRate = max(0, baseCommissionRate − membershipReduction)`. Applied rule trace shows both the original rate and the reduction amount.

### 2. `server/routes/appointment.routes.ts`

- **Membership benefit extraction**: Extended the package lookup block to also extract `reduced_commission` and `wallet_bonus` benefit keys alongside the existing `service_discount_percent` and `platform_fee_discount`.
- **RE calls (both paths)**: Both `runRevenueEngine()` calls (service path + fallback path) now pass `membershipReducedCommissionPercent`.
- **Wallet bonus credit**: After successful booking + RE snapshot write, `storage.topUpWallet(userId, pendingWalletBonus, { idempotencyKey: appt:ID:wallet_bonus })` is called fire-and-forget. Idempotency key prevents double-credits on retries.

### 3. `server/routes/admin/revenue-billing.routes.ts`

- Added `invalidateRevenueRulesCache` to the import.
- Added `invalidateRevenueRulesCache()` immediately before every successful response in all **15 mutation handlers** (POST/PATCH/DELETE × 5 rule tables: `platform_fee_rules`, `commission_rules`, `payment_method_rules`, `travel_fee_rules`, `revenue_share_rules`).
- `payout_config` mutations intentionally excluded — it is not loaded by `loadRevenueRules()`.

---

## Hardcoded Financial Constants Audit

| Location | Value | Classification | Decision |
|----------|-------|----------------|----------|
| `revenue-engine.ts` | `10` (commission default) | Last-resort in-code fallback | **Acceptable** — DB rule seeds cover all real scenarios; fallback only triggers if *all* commission rules are deleted |
| `revenue-engine.ts` | `3` (platform fee default) | Last-resort in-code fallback | **Acceptable** — same reasoning |
| `financials.routes.ts` | `0.10` commission fallback | Settlement last-resort | **Acceptable** — settlement uses stored RE snapshot; bare fallback never reached in normal operation |

No new hardcoded constants introduced.

---

## Regression Notes

- `free_cancellations` benefit: no cancellation fee logic exists anywhere in the codebase as of this sprint. The benefit is effectively already honored (no fee is charged). Implementation should be addressed when a cancellation fee feature is introduced.
- `invoice-helper.ts` uses `computeFinalPrice` for display only — it does not affect any financial write. The authoritative value is the stored `totalAmount` column on the appointment. This is correct behavior.
- `catalog.routes.ts` uses `computeFinalPrice` for price preview API (service listing display). No financial write involved.

---

## Verification

- `tsc --noEmit --skipLibCheck`: **EXIT:0** ✅
- Server running clean, no errors in logs ✅
- 16 `invalidateRevenueRulesCache` references in admin routes (1 import + 15 calls) ✅
- 7 dead `computeFinalPrice` imports removed ✅
- 4 `pendingWalletBonus` references confirm wallet bonus flow ✅
- 2 `membershipReducedCommissionPercent` references confirm both RE call paths updated ✅
