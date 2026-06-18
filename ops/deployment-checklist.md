# Deployment Checklist

Run this checklist for every production deployment.

## Pre-Deployment (before pushing)
- [ ] All tests / build passes locally (`npm run build`)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Database migrations prepared — new tables/columns added to `runStartupMigrations()` in `server/db.ts`
- [ ] Environment secrets verified (see `ops/production-checklist.md`)
- [ ] Reviewed diff for accidental secret commits or debug code
- [ ] Sprint checklist / PR reviewed by a second person (if team)

## Deployment Steps (Replit)
1. [ ] Click **Publish** in Replit (or push to main branch if CI/CD connected)
2. [ ] Monitor build logs for compile errors
3. [ ] Wait for health check to pass (Replit deployment proxy)
4. [ ] Open production URL and verify home page loads

## Post-Deployment Smoke Tests
- [ ] `GET /api/auth/me` returns 401 (not 500) — server is up
- [ ] `GET /api/categories` returns data — DB connected
- [ ] Login with a test account succeeds
- [ ] Search providers returns results
- [ ] Admin dashboard loads and shows data
- [ ] Check monitoring tab for new 5xx events

## Rollback Decision Point
If any smoke test fails:
- [ ] Immediately follow `ops/rollback-checklist.md`
- [ ] Do NOT attempt hot-patch in production without rollback ready

## Database Migration Notes
- `runStartupMigrations()` runs automatically on server start
- Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- If a migration fails, check server logs for `[db] startup migration error:`
- To manually apply: connect to Supabase SQL editor and run the failing statement

## Environment Changes
If adding a new secret:
1. Add it to Replit Secrets
2. Update `ops/production-checklist.md`
3. Update `replit.md` under "Required secrets"
4. Test that the feature works without the secret (graceful degradation)
