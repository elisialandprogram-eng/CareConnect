/**
 * DRIZZLE CONFIG — SUPABASE ONLY
 *
 * Migrations and `npm run db:push` always target the Supabase database.
 * Set `SUPABASE_DATABASE_URL` (Supabase → Project Settings → Database → Connection string).
 * Do NOT point this project at Neon or Replit's built-in Postgres.
 */
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. This project uses Supabase exclusively — " +
    "add the Supabase connection string as the SUPABASE_DATABASE_URL secret in Replit."
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
