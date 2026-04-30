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

// Pool sized below Supabase's per-session client cap (pool_size=15) so the
// driver never asks PgBouncer for more connections than it will grant. Going
// over the cap surfaces as `EMAXCONNSESSION` and 500s for end users.
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 12,
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
    // Multi-country tenancy hardening: indexes on country_code for the
    // tables that drive the most filtered listings. Idempotent.
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_country_code ON users(country_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_country_code ON providers(country_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_country_code ON invoices(country_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_country_code ON payments(country_code)`);

    // Group sessions feature — tables, enums, indexes. Idempotent so we don't
    // need a separate migration step in CI/dev.
    await pool.query(`DO $$ BEGIN
      CREATE TYPE group_session_status AS ENUM ('scheduled','live','completed','cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN
      CREATE TYPE group_attendance AS ENUM ('registered','joined','no_show');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await pool.query(`CREATE TABLE IF NOT EXISTS group_sessions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      service_id VARCHAR REFERENCES services(id),
      title TEXT NOT NULL,
      description TEXT,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      max_participants INTEGER NOT NULL,
      price_per_user NUMERIC(10,2) NOT NULL,
      status group_session_status NOT NULL DEFAULT 'scheduled',
      meeting_link TEXT,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_sessions_provider_id ON group_sessions(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_sessions_status ON group_sessions(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_sessions_start_time ON group_sessions(start_time)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_sessions_country_code ON group_sessions(country_code)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS group_session_participants (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      payment_status payment_status NOT NULL DEFAULT 'pending',
      attendance_status group_attendance NOT NULL DEFAULT 'registered',
      amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
      payment_method TEXT,
      joined_at TIMESTAMP,
      refunded_at TIMESTAMP,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_group_participant_session_user ON group_session_participants(session_id, user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_participants_user_id ON group_session_participants(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_participants_session_id ON group_session_participants(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_participants_country_code ON group_session_participants(country_code)`);

    // Service edits approval workflow — provider-staged edits live in
    // pending_changes (jsonb). While pending_change_status = 'pending', the
    // service is hidden from booking flows. On approval, the staged values are
    // merged into the row and these columns are cleared.
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS pending_changes JSONB`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS pending_change_status TEXT`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS pending_change_submitted_by VARCHAR`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS pending_change_submitted_at TIMESTAMP`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS pending_change_reviewed_by VARCHAR`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS pending_change_reviewed_at TIMESTAMP`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS pending_change_reason TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_services_pending_change_status ON services(pending_change_status)`);
  } catch (err) {
    console.warn("[db] startup migration warning:", (err as Error).message);
  }
}
