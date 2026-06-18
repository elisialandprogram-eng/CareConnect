# Backup & Recovery Strategy

## Database Backups (Supabase)

### Automatic Backups
Supabase provides automatic daily backups on all plans:
- **Free/Pro**: Daily backups retained for 7 days
- **Team/Enterprise**: Point-in-Time Recovery (PITR) with 30-day retention

**Action required**: Enable PITR in Supabase dashboard → Settings → Database → Point-in-Time Recovery

### Backup Checklist
- [ ] PITR enabled in Supabase
- [ ] Backup retention period confirmed (minimum 7 days)
- [ ] Last successful backup verified in Supabase dashboard
- [ ] `DATABASE_URL` / `SUPABASE_DATABASE_URL` documented securely (not in code)
- [ ] Backup restore tested in staging (quarterly)

### Manual Backup (on-demand)
```bash
# From Supabase dashboard → Database → Backups → Create backup
# Or via CLI:
supabase db dump -f backup_$(date +%Y%m%d).sql
```

### What Is Backed Up
| Data | Backed Up | Notes |
|---|---|---|
| All PostgreSQL tables | ✅ | Full schema + data |
| Uploaded files (Cloudinary) | ❌ | Cloudinary has its own backup |
| Environment secrets | ❌ | Store in a password manager |
| Application code | ✅ | Git history + Replit checkpoints |

---

## Cloudinary File Backup
Uploaded documents (PDFs, images) are stored in Cloudinary:
- Enable Cloudinary backup in their dashboard → Settings → Security
- Consider downloading a periodic asset export for critical medical documents

---

## Application Code Backup
- Git commits are the primary backup for code
- Replit creates automatic checkpoints after each agent task
- Critical checkpoints are tagged by the Replit checkpoint system

---

## Recovery Procedures

### Scenario 1: Accidental data deletion
1. Identify the timestamp of the deletion (check `audit_logs` table)
2. Use Supabase PITR to restore to 1 minute before the deletion
3. Export only the affected rows from the restored DB
4. Import them back into the production DB
5. Verify data integrity

### Scenario 2: Full database corruption
1. Take the application offline (update deploy config or set maintenance mode)
2. Restore from the most recent Supabase backup
3. Re-run `runStartupMigrations()` to ensure schema is current
4. Verify data with smoke tests
5. Bring application back online

### Scenario 3: Lost environment secrets
1. Rotate all secrets immediately (do not reuse)
2. Generate new `SESSION_SECRET` (32+ random chars)
3. Get new Stripe keys from Stripe dashboard
4. Get new Resend key from Resend dashboard
5. Update Replit Secrets
6. Redeploy

### Scenario 4: Replit environment corruption
1. Use Replit checkpoint rollback (see `ops/rollback-checklist.md`)
2. If checkpoint unavailable: clone the Git repo to a new Replit project
3. Restore secrets from your secure password manager
4. Reconnect to Supabase database

---

## Recovery Time Objectives (RTO)
| Incident Type | Target RTO |
|---|---|
| Application crash (restart) | < 2 minutes |
| Rollback to last checkpoint | < 5 minutes |
| Database restore (PITR) | < 30 minutes |
| Full environment rebuild | < 2 hours |

## Recovery Point Objectives (RPO)
| Backup Type | RPO |
|---|---|
| Supabase PITR | < 1 minute |
| Daily backup | < 24 hours |
| Manual backup | When last taken |

---

## Restore Validation Checklist

Run this checklist after any database restore to confirm the platform is healthy before re-opening to users.

### Step 1 — Schema Integrity
- [ ] Connect to restored DB in Supabase SQL editor
- [ ] Verify required tables exist:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
  ```
  Expected tables (minimum): `appointments`, `audit_logs`, `family_members`, `idempotency_keys`, `invoices`, `notification_delivery_logs`, `patient_consents`, `payments`, `privacy_requests`, `providers`, `referrals`, `services`, `slot_holds` (or `appointment_slot_holds`), `system_events`, `users`, `wallet_transactions`, `wallets`

- [ ] Check `privacy_requests` table exists (added Sprint 9):
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'privacy_requests' ORDER BY ordinal_position;
  ```

### Step 2 — Data Integrity Spot Checks
- [ ] Confirm users table not empty:
  ```sql
  SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM users WHERE is_deleted = false;
  ```
- [ ] Confirm wallet balances are positive or zero:
  ```sql
  SELECT COUNT(*) FROM wallets WHERE balance < 0;
  -- Expected: 0
  ```
- [ ] Confirm no orphan appointments (patient exists):
  ```sql
  SELECT COUNT(*) FROM appointments a
  LEFT JOIN users u ON u.id = a.patient_id
  WHERE u.id IS NULL;
  -- Expected: 0
  ```
- [ ] Confirm financial amounts are in USD (all currencies = 'USD'):
  ```sql
  SELECT DISTINCT currency FROM wallets;
  SELECT DISTINCT currency FROM wallet_transactions;
  -- Expected: only 'USD'
  ```

### Step 3 — Startup Migration Re-run
- [ ] Restart the application after pointing to the restored DB
- [ ] Watch server logs — confirm no `[db] startup migration error:` messages
- [ ] Confirm `[db] Sprint 9: privacy_requests table ready` log line appears

### Step 4 — Application Smoke Tests
- [ ] `GET /api/health` returns HTTP 200 with `status: "healthy"`
- [ ] `GET /api/admin/diagnostics` (with admin token) returns cache/scheduler/webhook data
- [ ] `POST /api/auth/login` with a known account succeeds
- [ ] `GET /api/patient/me/data-export` (with patient token) returns a valid JSON export

### Step 5 — Financial Reconciliation Check (post-restore)
- [ ] Run reconciliation query to confirm no wallet drift was introduced:
  ```sql
  SELECT w.user_id, w.balance,
         COALESCE(SUM(wt.amount),0) AS txn_sum,
         w.balance - COALESCE(SUM(wt.amount),0) AS drift
  FROM wallets w
  LEFT JOIN wallet_transactions wt ON wt.user_id = w.user_id
  GROUP BY w.user_id, w.balance
  HAVING ABS(w.balance - COALESCE(SUM(wt.amount),0)) > 0.01
  LIMIT 20;
  ```
  Expected: 0 rows (if rows appear, investigate before re-opening bookings)

---

## Supabase-Specific Assumptions

> These are platform assumptions that the restore process depends on.

| Assumption | Why It Matters |
|---|---|
| The `country_code` domain type (`CREATE TYPE country_code AS ENUM ('HU','IR')`) must exist before startup migrations run | `privacy_requests.country_code` and several other tables reference this type; if it is missing the startup migration silently warns but the column is created without the ENUM constraint |
| `gen_random_uuid()` is available | Used as default for `privacy_requests.id` and several other PKs; requires the `pgcrypto` extension (enabled by default on Supabase) |
| FTS tsvector trigger on `providers` table | `providers_search_vector_trig` must be present for provider search to work after a schema-only restore; the startup migration recreates it if missing |
| PITR requires a paid Supabase plan | Free plan only provides daily backups with 7-day retention; Point-in-Time Recovery requires Pro or above |

---

## Privacy Data Recovery Notes

> GDPR / healthcare compliance notes for data incidents.

- **Patient data export files** are generated on-demand and not stored server-side. There are no export file artefacts to restore.
- **`privacy_requests` rows** are part of the normal PostgreSQL backup. If rows are lost, check `audit_logs` for `privacy_request_submitted` / `privacy_request_updated` events — they can be used to reconstruct the audit trail.
- **Anonymized/deleted users** (`is_deleted = true`) are intentionally kept in the DB with PII cleared. A restore to before a deletion will bring PII back — immediately re-run the deletion if the restore point is after a confirmed patient deletion request.
- **Retention pruning** (audit_logs, user_notifications, system_events) runs hourly. After a restore to an older snapshot, older rows may reappear; the next scheduled prune cycle will clean them up.
