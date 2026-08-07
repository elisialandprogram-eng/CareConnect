#!/bin/bash
set -e

# Install any new dependencies added by the merged task.
npm install

# Schema migrations are applied automatically on server startup via
# runStartupMigrations() in server/db.ts.  drizzle-kit push is NOT used here
# because it requires an interactive TTY and hangs on Supabase introspection.
