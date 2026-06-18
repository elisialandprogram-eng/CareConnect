# GoldenLife — Refinement Roadmap
**Generated:** 2026-06-11 | **Sprint:** GX-02 | **Phase:** Pre-Production → Launch

---

## Priority Legend
- 🔴 **CRITICAL** — Blocks launch or creates significant liability
- 🟠 **HIGH** — Major UX gaps or revenue-impacting gaps
- 🟡 **MEDIUM** — Important for retention and quality
- 🟢 **LOW** — Nice to have, post-launch

---

## Patient Experience

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🟠 HIGH | PDF prescription download | Providers create prescriptions; patients need PDF download | S |
| 🟠 HIGH | Referral code UI | Schema done, no sharing UI or reward automation | M |
| 🟠 HIGH | Health metrics charts | Biometric data stored, but displayed as text list only | M |
| 🟡 MEDIUM | Notification preferences page | Allow patients to configure channel preferences (email/SMS/push) | M |
| 🟡 MEDIUM | Patient dashboard home polish | Empty states, onboarding checklist for new patients | M |
| 🟡 MEDIUM | Gift card redemption at checkout | Backend wired, checkout flow integration missing | S |
| 🟡 MEDIUM | Message unread badge | Unread count not shown in nav; users miss messages | S |
| 🟢 LOW | Calendar sync (Google / iCal) | Export appointment as .ics file | M |
| 🟢 LOW | Patient community / reviews discovery | Social proof beyond per-provider review list | L |

---

## Provider Experience

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🔴 CRITICAL | Automated payouts | Manual admin approval only; providers need automatic disbursement | L |
| 🟠 HIGH | Buffer time enforcement | `buffer_before`/`buffer_after` columns exist but not applied in slot engine | M |
| 🟠 HIGH | Provider analytics trends | Earnings over time, booking conversion, patient retention | M |
| 🟠 HIGH | Video session testing | Daily.co integration done but needs end-to-end test coverage | S |
| 🟡 MEDIUM | Google Calendar two-way sync | Block time from Google Calendar, export bookings to calendar | L |
| 🟡 MEDIUM | Clinic room reservation polish | Room booking UI at booking step is basic | M |
| 🟡 MEDIUM | Notification preferences | Providers need to configure their notification channels | M |
| 🟡 MEDIUM | iCal subscription URL | Auto-updating calendar feed for external apps | M |
| 🟢 LOW | Portfolio / case studies | Allow providers to showcase work beyond gallery | L |
| 🟢 LOW | Team / clinic management | Multi-provider per clinic with shared scheduling | XL |

---

## Admin Experience

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🔴 CRITICAL | 2FA for global_admin | No MFA on highest-privilege accounts; critical security gap | M |
| 🟠 HIGH | CSV / Excel export | All analytics, booking, and user tables need export | M |
| 🟠 HIGH | Custom date range on analytics | All analytics panels hardcode date ranges | M |
| 🟠 HIGH | RBAC role builder UI | Roles seeded but not configurable via admin UI | L |
| 🟡 MEDIUM | Admin action approval workflow | 2-admin sign-off for destructive operations (delete user, mass-reset) | L |
| 🟡 MEDIUM | Bug report queue | Table exists, admin queue needs polish and assignment workflow | M |
| 🟡 MEDIUM | Real-time admin dashboard | WebSocket-fed live metrics on overview panel | L |
| 🟢 LOW | Admin audit log export | Export audit logs to CSV for compliance | S |
| 🟢 LOW | Custom notification templates | Admin configurable email/SMS templates (Resend templates) | M |

---

## Revenue

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🔴 CRITICAL | Stripe Connect for payouts | Automated disbursement to provider bank accounts | L |
| 🟠 HIGH | Per-country VAT calculation | HU 27% VAT, IR VAT not calculated in revenue engine | M |
| 🟠 HIGH | Auto-renewal subscriptions | Stripe Subscriptions for membership packages | L |
| 🟠 HIGH | Gift card redemption | Complete checkout integration | S |
| 🟡 MEDIUM | Revenue export to accounting | CSV / QuickBooks / Xero export of financial records | M |
| 🟡 MEDIUM | Package upgrade/downgrade | Pro-rated billing on plan changes | M |
| 🟡 MEDIUM | Apple Pay / Google Pay | Stripe Elements with wallet payment methods | M |
| 🟢 LOW | Klarna / BNPL | Buy-now-pay-later for large service packages | L |
| 🟢 LOW | Family packages | One subscription covering multiple family members | L |

---

## Scheduling

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🟠 HIGH | Buffer time enforcement | Apply `buffer_before`/`buffer_after` in slot conflict engine | S |
| 🟠 HIGH | Timezone-aware display | Cross-country providers show slots in patient's local timezone | M |
| 🟡 MEDIUM | Recurring appointments | UI for weekly/monthly recurring bookings | M |
| 🟡 MEDIUM | Smart scheduling AI suggestions | Suggest optimal slots based on patient history | L |
| 🟢 LOW | iCal feed for providers | Auto-updating calendar subscription URL | M |

---

## Communications

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🟠 HIGH | Email template localization | Appointment confirmations in HU and FA | M |
| 🟠 HIGH | Message unread count | Missing from patient and provider nav | S |
| 🟡 MEDIUM | File attachments in messages | Cloudinary-backed file sharing in chat | M |
| 🟡 MEDIUM | Message search | Full-text search over conversation history | M |
| 🟡 MEDIUM | Daily digest notifications | Cron exists, not wired to email dispatch | S |
| 🟡 MEDIUM | Read receipts | Show when messages have been read | M |
| 🟢 LOW | Rich push notifications | Image thumbnails in push notifications | M |
| 🟢 LOW | Video call within chat | Integrated telemedicine link in conversation | L |

---

## Performance

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🟠 HIGH | Query optimization audit | N+1 queries exist in provider list enrichment | M |
| 🟡 MEDIUM | API response caching | Extend 30s provider list cache, add Redis for session store | M |
| 🟡 MEDIUM | Startup migration audit | 90+ migration blocks slow cold-start; consolidate | M |
| 🟡 MEDIUM | Bundle size reduction | Vite bundle analysis; lazy-load more admin panels | M |
| 🟡 MEDIUM | WebSocket connection pool | ws connections not pooled; scale risk under load | M |
| 🟢 LOW | CDN for static assets | Serve client bundle via CDN (Cloudflare) | M |
| 🟢 LOW | Database connection pool tuning | pg pool max=12; benchmark under concurrent load | S |

---

## Security

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🔴 CRITICAL | TOTP 2FA for admins | global_admin has no MFA; single credential compromise = full access | M |
| 🟠 HIGH | Upload file validation | Validate MIME type + size server-side before Cloudinary | S |
| 🟠 HIGH | IP allowlist for admin panel | Restrict /admin-dashboard and /api/admin/* to known IPs | M |
| 🟡 MEDIUM | Row-level security (DB) | Backend enforces country isolation; add DB-level RLS backup | L |
| 🟡 MEDIUM | Penetration testing | Commission external pen test before launch | — |
| 🟡 MEDIUM | Security event alerting | Alert admin on brute-force, mass-delete, unusual API patterns | M |
| 🟢 LOW | SIEM integration | Ship audit logs to Datadog / Splunk | L |
| 🟢 LOW | PCI compliance review | Stripe handles card data but review scope before launch | — |

---

## Analytics

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🟠 HIGH | CSV export from all tables | Bookings, users, revenue, providers all need export | M |
| 🟠 HIGH | Custom date range pickers | All analytics panels need start/end date controls | M |
| 🟡 MEDIUM | Revenue trend charts | Monthly/weekly revenue with provider type breakdown | M |
| 🟡 MEDIUM | Patient acquisition funnel | Registration → first booking → repeat booking analytics | L |
| 🟡 MEDIUM | Provider performance leaderboard | Ranked by revenue, rating, booking volume | S |
| 🟡 MEDIUM | Churn / retention analysis | Track patient return rate and provider retention | L |
| 🟢 LOW | Real-time dashboard | WebSocket-fed live counters on admin overview | L |
| 🟢 LOW | BI export (Metabase/Looker) | Read-only analytics DB replica | XL |

---

## Operations

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🟠 HIGH | Production deployment guide | Step-by-step launch checklist for Render/Railway/Fly.io | S |
| 🟠 HIGH | Database backup strategy | Automated daily Supabase backups + restore test | S |
| 🟡 MEDIUM | Health check endpoint | `GET /healthz` for load balancer / uptime monitoring | S |
| 🟡 MEDIUM | Structured logging (production) | JSON log format for production log aggregation | M |
| 🟡 MEDIUM | Error alerting | Sentry / Bugsnag integration for production errors | M |
| 🟢 LOW | Blue-green deployment | Zero-downtime deployment strategy | L |
| 🟢 LOW | Disaster recovery runbook | Documented restore procedure | S |

---

## Technical Debt

| Priority | Item | Detail | Effort |
|----------|------|--------|--------|
| 🟠 HIGH | routes.ts decomposition | Main routes file still 7k+ lines despite sub-files; continue extraction | L |
| 🟠 HIGH | database-storage.ts decomposition | storage impl is large; continue mixin pattern | M |
| 🟡 MEDIUM | Startup migration consolidation | 90+ migration blocks in db.ts; extract to version-gated migration runner | L |
| 🟡 MEDIUM | TypeScript strict mode | Many `any` casts; enable strict gradually | L |
| 🟡 MEDIUM | Test coverage | No automated tests; add integration tests for critical flows | XL |
| 🟡 MEDIUM | OpenAPI / Swagger | Auto-generate API docs from routes | M |
| 🟡 MEDIUM | Environment variable validation | Zod schema for all env vars at startup | S |
| 🟢 LOW | ESLint / Prettier enforcement | No lint CI gate; enforce in GitHub Actions | S |
| 🟢 LOW | Storybook component library | Document shadcn customizations | M |

---

## Effort Key
- **S** — Small (< 1 day)
- **M** — Medium (1–3 days)
- **L** — Large (3–7 days)
- **XL** — Extra Large (1–2 weeks+)

---

## Recommended Launch Sprint Sequence

### Sprint GX-03 — Revenue & Payout Completion
- Stripe Connect automated payouts
- VAT calculation (HU/IR)
- Gift card redemption
- Package auto-renewal (Stripe Subscriptions)

### Sprint GX-04 — Security Hardening
- Admin 2FA (TOTP)
- Upload file validation
- IP allowlist for admin
- Penetration test

### Sprint GX-05 — Analytics & Export
- CSV export all tables
- Custom date range analytics
- Revenue trend charts

### Sprint GX-06 — Patient & Provider UX Polish
- PDF prescriptions
- Health metrics charts
- Buffer time enforcement
- Notification preferences

### Sprint GX-07 — Communications
- Email template localization (HU, FA)
- Message unread count
- File attachments in chat
- Daily digest notifications

### Sprint GX-08 — Production Readiness
- Health check endpoint
- Structured production logging
- Sentry error tracking
- Deployment automation (CI/CD)

---

*Generated by GX-02 Environment Management Console Sprint*
