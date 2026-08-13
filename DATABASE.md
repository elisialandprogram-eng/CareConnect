# Database — Supabase (Required)

This project is permanently configured to use **Supabase (PostgreSQL)** as its
database. Every Replit import of this codebase must continue to use Supabase —
do **not** switch to Neon, Replit's built-in Postgres, or any other provider.

## Required environment variable

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_DATABASE_URL` | Yes | Supabase Postgres connection string (use the **Transaction** pooled URL). |
| `DATABASE_URL` | Optional fallback | Legacy variable; only used if `SUPABASE_DATABASE_URL` is missing. New imports should always set `SUPABASE_DATABASE_URL`. |

### How to get the connection string

1. Open your Supabase project.
2. Go to **Project Settings → Database → Connection string**.
3. Copy the **Transaction pooler** URI (recommended for serverless/Replit).
4. In Replit, open the Secrets tool and add `SUPABASE_DATABASE_URL` with that value.

## Where this is enforced

- `server/db.ts` — runtime database connection (throws if `SUPABASE_DATABASE_URL`
  is missing and there is no legacy `DATABASE_URL`).
- `server/db.ts` — current schema initialization and readiness-gated configuration setup.
- `replit.md` — project documentation surfaced to every future agent session.

## Do not

- Do not re-introduce `@neondatabase/serverless` as the runtime driver.
- Do not provision Replit's built-in Postgres for this project.
- Do not commit or hard-code Supabase credentials — always use Replit Secrets.
