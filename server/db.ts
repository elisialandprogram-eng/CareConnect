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

// Larger pool + sensible timeouts so concurrent requests aren't queued behind
// a single connection. Supabase's pooled connection string supports this
// because PgBouncer multiplexes our connections onto a smaller backend pool.
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});
export const db = drizzle(pool, { schema });

/**
 * Auto-apply schema migrations that cannot be handled by db:push alone.
 * Idempotent — safe to run on every startup.
 */
export async function runStartupMigrations() {
  try {
    // Add new appointment_status enum values
    for (const val of ["cancelled_by_patient", "cancelled_by_provider", "reschedule_requested", "reschedule_proposed", "expired"]) {
      await pool.query(`DO $$ BEGIN ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS '${val}'; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    }
    // Add new columns to appointments table
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_number TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS parent_appointment_id VARCHAR`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_rescheduled BOOLEAN DEFAULT false`);
    // Create sequence for GL appointment numbers
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS appointment_number_seq START 1`);
    // Create unique index
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_number ON appointments(appointment_number) WHERE appointment_number IS NOT NULL`);
    // Backfill any appointments without a number
    await pool.query(`
      WITH numbered AS (
        SELECT id, 'GL' || LPAD(nextval('appointment_number_seq')::text, 6, '0') AS gen_num
        FROM appointments WHERE appointment_number IS NULL
        ORDER BY created_at ASC NULLS LAST
      )
      UPDATE appointments SET appointment_number = numbered.gen_num
      FROM numbered WHERE appointments.id = numbered.id
    `);
  } catch (err) {
    console.warn("[db] startup migration warning:", (err as Error).message);
  }
}
