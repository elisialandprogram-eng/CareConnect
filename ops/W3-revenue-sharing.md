# W3 — Revenue Share: Extended Participant Types

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Allow `revenue_share_rules` and `booking_revenue_shares` to record participant types beyond the original `platform` default — specifically `provider_referral`, `affiliate`, and `corporate`.

## Background

The `revenue_share_rules` table was created with a `participant_type TEXT NOT NULL DEFAULT 'platform'` column. The `booking_revenue_shares` audit table mirrored this. Both tables were populated via admin routes but the UI and booking engine only ever set `participant_type = 'platform'`, leaving affiliate and referral revenue-share rows unsupported.

## Changes Delivered

### `server/db.ts` — Phase 12 migration

```sql
ALTER TABLE revenue_share_rules
  ADD COLUMN IF NOT EXISTS participant_type_extended TEXT;

ALTER TABLE booking_revenue_shares
  ADD COLUMN IF NOT EXISTS participant_type_extended TEXT;
```

The `participant_type_extended` column is a nullable TEXT field that overrides `participant_type` when non-null. This additive approach avoids breaking existing rows that contain `participant_type = 'platform'`.

**Design decision:** Using an extension column (rather than altering the original column or adding an enum constraint) was chosen because:

1. PostgreSQL cannot remove enum values once added — a TEXT override column keeps the door open for future clean-up.
2. Existing admin routes and the booking engine remain backwards-compatible: any code reading `participant_type` still works.
3. New routes can write to `participant_type_extended` for affiliate/referral entries.

### Revenue Billing Center — Revenue Sharing tab

The existing `RevenueSharePanel` in `revenue-billing-center.tsx` already renders and edits `revenue_share_rules` rows. No UI change was needed because the panel passes all rule fields through and the new column is transparent to the form.

## Future Work

Once `participant_type_extended` is well-established across all rows, a follow-up migration can:
1. Coalesce `COALESCE(participant_type_extended, participant_type)` into a single canonical column.
2. Drop `participant_type` and rename `participant_type_extended`.

## Testing Notes

- Insert a rule with `participant_type = 'affiliate'` via `participant_type_extended` using the admin API.
- Verify the `RevenueSharePanel` shows the row correctly.
- Confirm existing rows with `participant_type = 'platform'` are unaffected.
