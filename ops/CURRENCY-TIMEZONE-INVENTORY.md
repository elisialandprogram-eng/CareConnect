# GoldenLife — Currency & Timezone Complete Inventory

**Created:** 2026-06-18  
**Sprint:** Platform-Wide Currency & Timezone Forensic Audit  
**Audited by:** Forensic audit (June 2026)

Legend:
- ✅ SAFE — correct currency/timezone handling
- ⚠️ RISK — potential issue, needs monitoring
- 🔴 BROKEN — confirmed bug (fixed or flagged)
- ✔️ FIXED — was broken, now fixed in this sprint

---

## SECTION A — Frontend Currency Inventory

### A.1 Core Currency Utilities (`client/src/lib/currency.ts`)

| Export | Type | Purpose | Classification |
|---|---|---|---|
| `useCurrency()` | Hook | Patient/provider USD→local display | ✅ SAFE |
| `useAdminCurrency()` | Hook | Admin USD-locked display | ✅ SAFE |
| `formatInCurrency(n, code)` | Function | Format native-currency amount | ✅ SAFE |
| `formatFromUSD(n, code)` | Function | USD→local (internal) | ✅ SAFE |
| `formatCurrency(n, code)` | Function | Dual-country display (admin reports) | ✅ SAFE |
| `convertBetweenCurrencies(n, from, to)` | Function | Cross-currency arithmetic | ✅ SAFE |
| `getProviderDisplayPrice()` | Function | Provider "Starting at" price | ✅ SAFE |
| `getProviderCardPrice()` | Function | Provider card price display | ✅ SAFE |

### A.2 Timezone Utilities (`client/src/lib/datetime.ts`)

| Export | Type | Purpose | Classification |
|---|---|---|---|
| `getUserTimezone()` | Function | Active user's IANA TZ | ✅ SAFE |
| `setUserTimezone(tz)` | Function | Persist TZ to localStorage | ✅ SAFE |
| `formatDate(value, opts?)` | Function | Date in user TZ | ✅ SAFE |
| `formatTime(value, opts?)` | Function | Time in user TZ | ✅ SAFE |
| `formatDateTime(value, opts?)` | Function | Date+time in user TZ | ✅ SAFE |
| `tzShortLabel(tz?)` | Function | Short TZ name | ✅ SAFE |

---

## SECTION B — Frontend Pages Inventory

| File | Currency Fields | Currency Formatter | TZ Usage | TZ Formatter | Classification |
|---|---|---|---|---|---|
| `book-wizard.tsx` | Service price, wallet, total | `useCurrency()`, `formatInCurrency` | `startAtUtc` for urgency | `formatDateTime` implicit | ✅ SAFE |
| `booking-confirmation.tsx` | Total, breakdown | `formatInCurrency(n, appt.displayCurrency)` | Appt date/time (wall-clock) | `formatCalDt()` for ICS | ✅ SAFE |
| `patient-dashboard.tsx` | Invoice total, payments | `useCurrency()`, `formatInCurrency` | Invoice dates | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `patient-home.tsx` | Provider prices, wallet credit | `useCurrency()`, `getProviderCardPrice` | Next appt date | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `wallet.tsx` | Balance, transactions | `useCurrency()`, `formatInCurrency` | tx.createdAt | `toLocaleString()` | ⚠️ RISK (cosmetic) |
| `packages.tsx` | Package price | `useCurrency().format` | Expiry dates | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `gift-cards.tsx` | Card value, balance | `useCurrency()` | Expiry date | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `referrals.tsx` | Reward amount | `useCurrency()` | Joined date | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `group-sessions.tsx` | Session price | `formatInCurrency` | Session time | `formatDateTime` | ✔️ FIXED |
| `admin-home.tsx` | Revenue today | `formatInCurrency(n,"USD")` | — | — | ✔️ FIXED |
| `provider-dashboard.tsx` | Earnings, appt value | `useCurrency()`, `fmtEarnings` | Review dates | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `provider-earnings.tsx` | Revenue breakdown | `formatInCurrency` | Date rows | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `provider-home.tsx` | Today's earnings | `useCurrency()` | Today's date | `toLocaleDateString("en-GB"...)` | ⚠️ RISK (cosmetic) |
| `provider-profile.tsx` | Service, package prices | `formatInCurrency`, `getProviderDisplayPrice` | — | — | ✅ SAFE |

---

## SECTION C — Frontend Components Inventory

| File | Currency Formatter | TZ Formatter | Classification |
|---|---|---|---|
| `header.tsx` | `useCurrency().format` | — | ✅ SAFE |
| `provider-card.tsx` | `getProviderCardPrice()` | — | ✅ SAFE |
| `group-sessions-panel.tsx` | `formatInCurrency` | `formatDateTime` | ✔️ FIXED |
| `appointment/AppointmentTimeline.tsx` | — | `formatDateTime` | ✔️ FIXED |
| `service-form-dialog.tsx` | `formatInCurrency` | `formatDateTime` | ✔️ FIXED |
| `add-service-catalogue-dialog.tsx` | `formatInCurrency` | — | ✅ SAFE |
| `provider/dashboard/ProviderServicesTab.tsx` | `formatInCurrency`, `convertBetweenCurrencies` | — | ✅ SAFE |
| `provider/dashboard/ProviderAppointmentsTabs.tsx` | `formatInCurrency` | `formatDateTime` (via startAtUtc) | ✅ SAFE |
| `provider/dashboard/ProviderAnalyticsTab.tsx` | `useCurrency()` | — | ✅ SAFE |
| `provider/dashboard/ProviderReportingCenter.tsx` | `useCurrency()` | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `provider-wallet-panel.tsx` | `useCurrency()` | — | ✅ SAFE |
| `provider-payout-panel.tsx` | `useCurrency()` | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `patient/WalletTopUpModal.tsx` | `useCurrency()`, `formatInCurrency` | — | ✅ SAFE |
| `patient/PatientReportingCenter.tsx` | `useCurrency()` | `toLocaleDateString()` | ⚠️ RISK (cosmetic) |
| `health-metrics-tab.tsx` | — | `toLocaleString(i18n.language)` | ⚠️ RISK (cosmetic) |
| `slot-conflict-preview-dialog.tsx` | — | `toLocaleDateString("en-GB",...)` | ⚠️ RISK (cosmetic) |
| `booking-canvas.tsx` | `formatInCurrency` | — | ✅ SAFE |
| `admin/dashboard/financial-master-report.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `admin/dashboard/revenue-intelligence.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `admin/dashboard/admin-wallets.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `admin/dashboard/admin-payouts.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `admin/dashboard/invoice-management.tsx` | `useAdminCurrency()`, `formatInCurrency` | — | ✅ SAFE |
| `admin/dashboard/promo-code-management.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `admin/refund-management.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `admin/package-management.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `admin/provider-financial-reports.tsx` | `useAdminCurrency()` | — | ✅ SAFE |
| `AppointmentTimingCard.tsx` | — | `startAtUtc` based | ✅ SAFE |

---

## SECTION D — Backend Currency Inventory

### D.1 Core Services

| File | Function | Purpose | Classification |
|---|---|---|---|
| `server/services/currency.ts` | `formatLocal` | Format already-local amount | ✅ SAFE |
| `server/services/currency.ts` | `formatSync` | USD→local format | ✅ SAFE |
| `server/services/currency.ts` | `fromUSDSync` | USD→local conversion | ✅ SAFE |
| `server/services/currency.ts` | `toUSDSync` | Local→USD conversion | ✅ SAFE |
| `server/services/currency.ts` | `convertUSDToLocal` | Named alias | ✅ SAFE |
| `server/services/currency.ts` | `convertLocalToUSD` | Named alias | ✅ SAFE |
| `server/services/currency.ts` | `syncRates()` | Hourly exchange rate sync | ✅ SAFE |
| `server/lib/revenue-engine.ts` | `runRevenueEngine()` | Booking price calculation | ✅ SAFE |

### D.2 Notification Currency

| File | Notification Type | Before | After | Classification |
|---|---|---|---|---|
| `server/reminderCron.ts` | Overdue invoice | Raw `totalAmount + "IRR"` | `formatLocal(n, currency)` | ✔️ FIXED |
| `server/reminderCron.ts` | Weekly/monthly summary | `$${revenue.toFixed(2)} USD` | `formatLocal(revenue, providerCurrency)` | ✔️ FIXED |
| `server/reminderCron.ts` | Membership renewal | `$${priceUSD.toFixed(2)} USD` | `formatLocal(priceUSD, "USD")` | ✔️ FIXED |
| `server/routes/shared/helpers.ts` | Referral reward (referrer) | `"USD 5.00"` (.toFixed) | `formatLocal(5, "USD")` | ✔️ FIXED |
| `server/routes/shared/helpers.ts` | Referral welcome bonus | `"USD 5.00"` (.toFixed) | `formatLocal(5, "USD")` | ✔️ FIXED |
| `server/routes/payment.routes.ts` | Gift card email | `"USD 100.00"` (.toFixed) | `formatLocal(amount, currency)` | ✔️ FIXED |
| `server/services/notification-dispatcher.ts` | Payment received | `formatLocal`/`formatSync` | — | ✅ SAFE |

---

## SECTION E — Backend Timezone Inventory

### E.1 Core Utilities

| File | Function | Purpose | Classification |
|---|---|---|---|
| `server/lib/tzUtils.ts` | `localToUTC` | Wall-clock → UTC | ✅ SAFE |
| `server/lib/tzUtils.ts` | `getProviderTimezone` | Authoritative TZ lookup | ✅ SAFE |
| `server/lib/tzUtils.ts` | `todayInTz` | Local midnight date | ✅ SAFE |
| `server/lib/tzUtils.ts` | `tzAbbr` | Display abbreviation | ✅ SAFE |

### E.2 Route Timezone Usage

| File | Usage | Classification |
|---|---|---|
| `server/routes/appointment.routes.ts` | Uses `localToUTC` for `start_at`/`end_at` | ✅ SAFE |
| `server/routes/provider.routes.ts` | `getProviderTimezone` for slot generation | ✅ SAFE |
| `server/reminderCron.ts` | UTC window via `start_at TIMESTAMPTZ` | ✅ SAFE |
| `server/cron/rolling-schedule.ts` | `todayInTz(tz)` for provider-local today | ✅ SAFE |
| `server/routes/care.routes.ts` | PDF: `toLocaleDateString()` server-side | ⚠️ RISK (server=UTC, acceptable) |
| `server/routes/payment.routes.ts` | Gift card expiry: `.toISOString().slice(0,10)` | ✔️ FIXED |
| `server/routes/admin/admin-financial.routes.ts` | `DATE_TRUNC('month', ...)` DB UTC | ✅ SAFE |

---

## SECTION F — Reporting & Export Inventory

| Report | Currency Assumption | TZ Assumption | Classification |
|---|---|---|---|
| Admin master financial report | USD (`final_total_usd`) | UTC (DB truncation) | ✅ SAFE |
| Admin CSV export | USD (labeled in header) | UTC ISO strings | ✅ SAFE |
| Provider earnings report | Provider currency + USD dual | UTC `created_at` | ✅ SAFE |
| Provider CSV export | Provider native + USD | UTC | ✅ SAFE |
| Patient analytics | Booking currency (`total_amount`) | UTC intervals | ⚠️ RISK (single-country isolated — acceptable) |
| PDF invoices | Multi (HUF/IRR/USD/GBP/EUR) | Server UTC | ✅ SAFE |
| Group session exports | N/A | Wall-clock strings | ✅ SAFE |

---

## SECTION G — Summary Counts

| Category | Safe | Risk (cosmetic) | Fixed | Remaining bugs |
|---|---|---|---|---|
| Frontend currency | 22 | 0 | 4 | 0 |
| Frontend timezone | 10 | 12 | 4 | 0 |
| Backend currency | 8 | 0 | 6 | 0 |
| Backend timezone | 6 | 2 | 1 | 0 |
| Reports/exports | 6 | 1 | 0 | 0 |
| **TOTAL** | **52** | **15** | **15** | **0** |

All ⚠️ RISK items are cosmetic date labels (joined/uploaded/purchased dates) that use browser-ambient timezone. They do not affect financial correctness or appointment scheduling. Fixing them is low priority and would require threading `getUserTimezone()` through dozens of metadata-only display strings.
