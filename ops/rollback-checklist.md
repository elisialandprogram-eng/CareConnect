# Rollback Checklist

Use when a deployment is broken and must be reverted.

## Decision: When to Roll Back
Roll back immediately if:
- Booking creation returns 500 for >5 minutes
- Payment processing is broken
- Admin dashboard is inaccessible
- Database connection errors appear
- Auth is broken (login returns 500)

Do NOT roll back for:
- Minor UI regressions with a quick fix available
- Single-user edge case bugs
- Performance degradation < 20%

---

## Rollback Steps (Replit Checkpoint)

### Option A — Replit Checkpoint Rollback (fastest)
1. [ ] Open Replit → History → Checkpoints
2. [ ] Find the last known-good checkpoint (before the broken deployment)
3. [ ] Click **Restore** on that checkpoint
4. [ ] Verify server starts cleanly (check logs)
5. [ ] Run smoke tests (see deployment checklist)

### Option B — Git Revert
1. [ ] `git log --oneline -10` — find the last good commit SHA
2. [ ] `git revert HEAD` — creates a revert commit (safer than reset)
3. [ ] Push and redeploy
4. [ ] Verify server starts and smoke tests pass

---

## Database Rollback

> ⚠️ GoldenLife uses `CREATE TABLE IF NOT EXISTS` (additive-only) migrations.
> Columns and tables are never dropped automatically. Rollback is safe for schema changes.

If a migration added a breaking column or table:
1. [ ] Connect to Supabase SQL editor
2. [ ] Identify the specific statement that broke things
3. [ ] Manually `DROP COLUMN` or `DROP TABLE IF EXISTS` the new object (only if it has no data)
4. [ ] Verify the old code path works without the column
5. [ ] Document the rollback in the incident report

## Data Rollback (Supabase PITR)
For data corruption or accidental deletes:
1. [ ] Go to Supabase dashboard → Database → Backups
2. [ ] Enable Point-in-Time Recovery (PITR) if not already enabled
3. [ ] Choose the restore point (before the incident)
4. [ ] Restore to a new database project first — verify data before switching
5. [ ] Update `SUPABASE_DATABASE_URL` to point to the restored database
6. [ ] Redeploy the application

---

## Post-Rollback
- [ ] Confirm all smoke tests pass on the rolled-back version
- [ ] Write incident report with root cause
- [ ] Create a fix for the broken change and test it in development before re-deploying
- [ ] Update this checklist if a step was missing or unclear

---

## Privacy / Data Breach Rollback

> Special considerations when a rollback is triggered by a data breach or unauthorized access.

### DO before rolling back
- [ ] Preserve all `audit_logs` and `system_events` rows from the incident window — take a Supabase snapshot labelled `incident-YYYY-MM-DD` before any PITR restore
- [ ] Screenshot or export suspicious request patterns from Supabase logs (they are not in the application DB)
- [ ] Notify Legal before rolling back — the rollback may overwrite forensic evidence if it involves a DB PITR restore

### Sprint 9 DB objects — what to preserve vs. drop
| Object | On rollback |
|---|---|
| `privacy_requests` table | **Preserve** — contains patient requests; deleting it violates GDPR |
| `privacy_requests` rows with `status='pending'` | **Preserve** — active requests have a legal SLA; they must be processed even if the feature is temporarily disabled |
| `idx_privacy_requests_*` indexes | Safe to drop if rolling back the schema; table data must be kept |
| `server/lib/validateEnv.ts` | Safe to remove on code rollback; does not affect data |

### After rollback — notify affected patients
If a data breach was the cause, `GET /api/admin/privacy-requests` may need to be used to queue deletion requests for affected users. Do not use `deleteUser()` until Legal approves.

### Rolling back Sprint 9 DB migration (privacy_requests)
Only do this if the table itself is the cause of the incident:
```sql
-- Preserve data first!
CREATE TABLE privacy_requests_backup AS SELECT * FROM privacy_requests;

-- Then drop only if confirmed safe by Legal
DROP TABLE IF EXISTS privacy_requests CASCADE;
```
