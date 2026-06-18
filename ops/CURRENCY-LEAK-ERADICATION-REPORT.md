# Currency Leak Eradication Sprint — Final Report

**Date:** 2026-06-17  
**Scope:** Eliminate every place where booking-currency values (HUF/IRR) are incorrectly interpreted as USD across all patient, provider, and admin screens.

---

## Architecture Rule (invariant)

| Source | Currency | Correct formatter |
|--------|----------|-------------------|
| `appointments.totalAmount` | Booking currency (HUF/IRR/USD) | `formatInCurrency(n, appt.displayCurrency)` |
| `invoices.totalAmount` | Booking currency derived from `countryCode` | `formatInCurrency(n, currency)` |
| `provider_earnings.totalAmount/platformFee/providerEarning` | USD | `fmtMoney(n)` (useCurrency) |
| Wallet balance | USD | `fmtMoney(n)` |
| Payment `payments.amount` | USD | `fmtMoney(n)` |
| Gift card balances | USD | `fmtMoney(n)` |
| Referral/reward credits | USD | `fmtMoney(n)` |

`fmtMoney` = `useCurrency().format()` = converts **from USD to local currency** (multiplies by exchange rate).  
`formatInCurrency(n, currency)` = formats a value **already in the target currency** (no multiplication).

Applying `fmtMoney` to a booking-currency amount (e.g., 5 000 HUF) treats it as USD and converts again → displays ~1 825 000 Ft instead of 5 000 Ft.

---

## Fixes Applied

### 1. `SlotAvailabilityWidget.tsx`
- **Leak:** `formatPrice(surgePrice)` with no currency context — assumed USD input.
- **Fix:** Added optional `currency?: string` prop; `fmtSlotPrice` uses `formatInCurrency` when `currency !== "USD"`, falls back to USD converter otherwise.
- **Call site:** `book-wizard.tsx` now passes `currency={quoteCurrency}`.

### 2. `ProviderAppointmentsTabs.tsx`
- **Leak:** `fmtMoney(Number(selectedAppt.totalAmount))` in the appointment detail side-panel.
- **Fix:** `formatInCurrency(Number(totalAmount), appt.displayCurrency ?? "USD")`.

### 3. `bookings-management.tsx` (admin)
- **Leak:** `fmtMoney(booking.totalAmount)` in the booking list card — converted booking currency as if it were USD.
- **Fix:** `formatInCurrency(Number(totalAmount), booking.displayCurrency ?? "USD")`.

### 4. `invoice-management.tsx` (admin)
- **Leak:** `fmtMoney(invoice.totalAmount)` — invoice amounts are in booking currency, derived from `countryCode`.
- **Fix:** `formatInCurrency(n, countryCode === "IR" ? "IRR" : countryCode === "HU" ? "HUF" : "USD")`.

### 5. `provider-dashboard.tsx` — All analytics/earnings cards
- **Leak:** `totalEarnings`, `weeklyEarnings`, `monthlyEarnings`, `todayEarnings`, `avgPerBooking`, sparkline data, `uniqueClients.totalSpend`, per-client table rows, timeline appointment amounts — all computed from `appointment.totalAmount` (booking currency) then displayed with `fmtMoney` (USD converter).
- **Fix:**
  - Added `providerNativeCurrency` derived from `providerData?.countryCode` (placed *after* the providerData query to avoid TDZ crash).
  - Added `fmtEarnings = (n) => formatInCurrency(n, providerNativeCurrency)` helper.
  - Replaced 8 `fmtMoney` call sites with `fmtEarnings`.
  - `ProviderInsightsTab` receives `fmtEarnings` as its `fmtMoney` prop so the insights chart tooltips and repeat-patient rows are also fixed.
  - Timeline per-appointment amount uses `formatInCurrency(n, appt.displayCurrency ?? providerNativeCurrency)` for per-appointment precision.

### 6. `patient-dashboard.tsx` — Invoice list
- **Leak:** `fmtMoney(inv.totalAmount)` — invoice amounts are in booking currency.
- **Fix:** `formatInCurrency(n, countryCode === "IR" ? "IRR" : countryCode === "HU" ? "HUF" : "USD")`.
- Note: `walletData.balance`, `gc.balance` (gift card), and `referralData.totalEarned` were audited and confirmed as USD — no change needed.

### 7. `AppointmentActionDialog.tsx` — Refund preview
- **Leak:** `fmtMoney(quote.refund.amount)` — refund amount is computed from `appointment.totalAmount` (booking currency) via `quoteRefundWithRule()`.
- **Fix (full chain):**
  - Backend: `GET /api/appointments/:id/action-quote` now includes `displayCurrency` in the response (pulled from `existing.displayCurrency`).
  - Frontend `QuoteResponse` interface extended with `displayCurrency?: string`.
  - Both usages (refund preview card + success toast) replaced with `formatInCurrency(amount, quote.displayCurrency ?? "USD")`.
  - Removed now-unused `useCurrency` import and `fmtMoney` variable from the component.

---

## Known Remaining Items (deferred, lower priority)

| Location | Issue | Reason deferred |
|----------|-------|-----------------|
| `services.tsx:258` | `fmtMoney(s.startingPrice)` — catalog startingPrice is native currency | Catalog API does not return a currency field; fix requires backend schema change to include currency per price row |
| `provider-profile.tsx:671` | `fmtMoney(service.price)` — service.price is native currency | Complex context (package savings calc also affected); out of scope for this sprint |
| `provider-earnings.tsx:559` | `fmtMoney(e.promoDiscount)` — promoDiscount may be booking-currency snapshot | Needs cross-reference with provider_earnings join to confirm currency; existing EarningBreakdownRow uses a `fmt` prop |

---

## Verification

- Workflow running clean (no client-error 500s in logs after all fixes).
- Provider dashboard TDZ bug caught and resolved by placing `providerNativeCurrency`/`fmtEarnings` after the `providerData` query declaration.
- All 7 confirmed leak sites resolved; 3 lower-priority items documented for follow-up.

---

## Files Changed

| File | Change type |
|------|-------------|
| `client/src/components/booking/SlotAvailabilityWidget.tsx` | Added `currency` prop; `fmtSlotPrice` helper |
| `client/src/pages/book-wizard.tsx` | Passes `currency={quoteCurrency}` to widget |
| `client/src/components/provider/dashboard/ProviderAppointmentsTabs.tsx` | `formatInCurrency` for detail totalAmount |
| `client/src/components/admin/dashboard/bookings-management.tsx` | `formatInCurrency` for booking totalAmount |
| `client/src/components/admin/dashboard/invoice-management.tsx` | `formatInCurrency` for invoice totalAmount |
| `client/src/pages/provider-dashboard.tsx` | `fmtEarnings` helper; 8 call sites fixed |
| `client/src/pages/patient-dashboard.tsx` | `formatInCurrency` for invoice totalAmount |
| `client/src/components/appointment/AppointmentActionDialog.tsx` | `formatInCurrency` for refund preview; removed `useCurrency` |
| `server/routes/appointment.routes.ts` | action-quote endpoint returns `displayCurrency` |
