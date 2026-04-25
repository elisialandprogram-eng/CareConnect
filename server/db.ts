/**
 * DATABASE CONFIGURATION — SUPABASE ONLY
 *
 * This project is permanently configured to use Supabase (PostgreSQL) as its
 * database. Do NOT switch to Neon, Replit's built-in Postgres, or any other
 * provider. When importing this project into a fresh Replit workspace, set the
 * `SUPABASE_DATABASE_URL` secret to the Supabase connection string (use the
 * pooled "Transaction" connection string from
 * Supabase → Project Settings → Database → Connection string).
 *
 * The legacy `DATABASE_URL` variable is accepted only as a fallback so existing
 * deployments keep working, but Supabase remains the canonical and required
 * database for this project.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. This project uses Supabase exclusively — " +
    "add the Supabase connection string as the SUPABASE_DATABASE_URL secret in Replit."
  );
}

if (!process.env.SUPABASE_DATABASE_URL) {
  console.warn(
    "[db] SUPABASE_DATABASE_URL is not set; falling back to DATABASE_URL. " +
    "This project is configured to run on Supabase only — please set SUPABASE_DATABASE_URL."
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
