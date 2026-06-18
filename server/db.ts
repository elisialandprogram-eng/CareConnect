/**
 * DATABASE CONFIGURATION — SUPABASE ONLY
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  GUARDRAIL: ALL DB ACCESS MUST GO THROUGH THIS MODULE           ║
 * ║                                                                  ║
 * ║  • Use ONLY: SUPABASE_DATABASE_URL                              ║
 * ║  • Do NOT use: Replit DB, local DB, fallback DBs,               ║
 * ║    temporary adapters, mock storage, ad-hoc Pool instances       ║
 * ║  • Every service that needs DB access must import `db` or       ║
 * ║    `pool` from this file — never create a second client         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Set the `SUPABASE_DATABASE_URL` secret to the Supabase connection
 * string (use the pooled "Transaction" connection string from
 * Supabase → Project Settings → Database → Connection string).
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { SUB_SERVICE_SEED } from "./lib/sub-service-seed-data";

// ── Startup validation ────────────────────────────────────────────────────────
// SUPABASE_DATABASE_URL is the single source of truth for all DB connections.
// DATABASE_URL is NOT used — SUPABASE_DATABASE_URL is the only accepted connection string.
const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "[db] FATAL: SUPABASE_DATABASE_URL is required. " +
    "Set this secret to the Supabase pooled connection string."
  );
}

const dbProvider = "Supabase PostgreSQL";
console.log(`[db] Database Provider: ${dbProvider}`);
console.log("[db] Database URL Loaded: YES");

// ── Cold-start observability ──────────────────────────────────────────────
// Tracks DB connect time and first-query latency for the diagnostics endpoint.
// State is intentionally ephemeral — resets on restart — because these metrics
// describe only the current process session (cold-start vs warm state).
const _processBootMs = Date.now();

interface DbStartupMetrics {
  /** Unix ms when this module was first evaluated (process boot reference). */
  processBootMs: number;
  /** Milliseconds from pool creation to first successful client acquisition. */
  connectMs: number | null;
  /** Milliseconds for the warm-up SELECT 1 on that first connection. */
  firstQueryMs: number | null;
  /** ISO 8601 timestamp of the first successful connection. */
  connectedAt: string | null;
}

const _dbStartupMetrics: DbStartupMetrics = {
  processBootMs: _processBootMs,
  connectMs: null,
  firstQueryMs: null,
  connectedAt: null,
};

/** Read-only snapshot of DB cold-start timing for the diagnostics endpoint. */
export function getDbStartupMetrics(): Readonly<DbStartupMetrics> {
  return { ..._dbStartupMetrics };
}
console.log("[db] Connection: initialising pool…");

// Pool sized below Supabase's per-session client cap (pool_size=15) so the
// driver never asks PgBouncer for more connections than it will grant. Going
// over the cap surfaces as `EMAXCONNSESSION` and 500s for end users.
// '-c TimeZone=UTC' forces UTC on every connection at the protocol level,
// consistent across all environments regardless of server OS locale.
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  options: "-c TimeZone=UTC",
});

// Verify connectivity on first acquired connection; record connect + first-query timing
const _poolConnectStart = Date.now();
pool.connect()
  .then(client => {
    _dbStartupMetrics.connectMs = Date.now() - _poolConnectStart;
    _dbStartupMetrics.connectedAt = new Date().toISOString();
    console.log(`[db] Connection: OK (${_dbStartupMetrics.connectMs}ms)`);
    const _firstQueryStart = Date.now();
    return client.query("SELECT 1")
      .then(() => {
        _dbStartupMetrics.firstQueryMs = Date.now() - _firstQueryStart;
        console.log(`[db] First query: OK (${_dbStartupMetrics.firstQueryMs}ms)`);
        client.release();
      })
      .catch((qErr: Error) => {
        console.warn("[db] First query failed:", qErr.message);
        client.release();
      });
  })
  .catch(err => {
    console.error("[db] Connection: FAILED —", err.message);
    process.exit(1);
  });

export const db = drizzle(pool, { schema });

/**
 * Auto-apply schema migrations that cannot be handled by db:push alone.
 * Idempotent — safe to run on every startup.
 *
 * ── SECTION CLASSIFICATION ──────────────────────────────────────────────────
 * Each block is tagged with one of three categories:
 *
 *   [SCHEMA-SETUP]    Pure DDL: CREATE TABLE/INDEX IF NOT EXISTS,
 *                     ALTER TABLE ADD COLUMN IF NOT EXISTS.
 *                     Fully idempotent.  Safe to keep at startup indefinitely.
 *
 *   [BUSINESS-LOGIC]  Data backfills or mutations (UPDATE … WHERE …).
 *                     Currently idempotent, but carries data-risk on schema
 *                     changes.  Should migrate to versioned up/down migrations
 *                     once the platform reaches stable multi-instance deployment.
 *                     See ops/tech-debt.md TD-03.
 *
 *   [ONE-TIME]        Operations intended to run exactly once (legacy token
 *                     purge, tsvector backfill).  WHERE guards make them no-ops
 *                     after the first run, but they should be removed once all
 *                     target rows are confirmed covered in production.
 *
 * Sprint sections are numbered for audit continuity.  Do not renumber or merge.
 */
export async function runStartupMigrations() {
  try {
    // ── provider_type enum — ensure all 7 canonical categories exist ──
    for (const val of [
      "physician", "mental_health", "nutrition", "rehabilitation",
      "dental", "alternative_medicine", "nursing",
    ]) {
      await pool.query(
        `DO $$ BEGIN ALTER TYPE provider_type ADD VALUE IF NOT EXISTS '${val}'; EXCEPTION WHEN others THEN NULL; END $$`
      ).catch((e: any) => console.warn(`[db] provider_type enum '${val}':`, e?.message));
    }
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
    // Tax amount snapshot on appointments (derived from sub_services.tax_percentage at booking time)
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT '0.00'`);
    // Provider-controlled display title for their card badge
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS display_title TEXT`);

    // Refund system — cancellation tracking on appointments
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT '0.00'`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS refund_status TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_refund_status ON appointments(refund_status) WHERE refund_status IS NOT NULL`);

    // Refund tracking on payments (running total per payment row)
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(10,2) DEFAULT '0.00'`);

    // Ensure appointment_status enum has ALL required values (some were added after initial deploy).
    // ADD VALUE IF NOT EXISTS is idempotent on PG ≥ 9.6 when wrapped in DO.
    for (const val of [
      "pending", "approved", "confirmed", "in_progress", "completed",
      "cancelled", "rejected", "rescheduled", "no_show",
      "cancelled_by_patient", "cancelled_by_provider",
      "reschedule_requested", "reschedule_proposed", "expired",
    ]) {
      await pool.query(
        `DO $$ BEGIN ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS '${val}'; EXCEPTION WHEN others THEN NULL; END $$`
      ).catch((e: any) => console.warn(`[db] appointment_status enum '${val}':`, e?.message));
    }

    // appointment_action enum + appointment_events table (audit log for every
    // status transition). Idempotent — CREATE IF NOT EXISTS / ADD VALUE IF NOT EXISTS.
    for (const val of ["book", "cancel", "reschedule", "no_show", "approve", "confirm", "start", "complete", "reject"]) {
      await pool.query(`DO $$ BEGIN ALTER TYPE appointment_action ADD VALUE IF NOT EXISTS '${val}'; EXCEPTION WHEN others THEN NULL; END $$`)
        .catch((e: any) => console.warn(`[db] appointment_action enum '${val}':`, e?.message));
    }
    await pool.query(`DO $$ BEGIN
      CREATE TYPE appointment_action AS ENUM ('book','cancel','reschedule','no_show','approve','confirm','start','complete','reject');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`).catch(() => null);

    await pool.query(`CREATE TABLE IF NOT EXISTS appointment_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR NOT NULL REFERENCES appointments(id),
      action appointment_action NOT NULL,
      actor_user_id VARCHAR REFERENCES users(id),
      actor_role user_role,
      from_status appointment_status,
      to_status appointment_status,
      reason TEXT,
      reason_code TEXT,
      refund_amount DECIMAL(10,2) DEFAULT 0.00,
      metadata TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appt_events_appointment_id ON appointment_events(appointment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appt_events_action ON appointment_events(action)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appt_events_created_at ON appointment_events(created_at)`);

    // service_price_snapshot column on appointments (locked at booking time)
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_price_snapshot DECIMAL(10,2)`);

    // location_mode on services (clinic_only / home_only / both)
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS location_mode TEXT NOT NULL DEFAULT 'both'`);

    // visit-type fee columns on services
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS home_visit_fee DECIMAL(10,2) DEFAULT 0.00`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic_fee DECIMAL(10,2) DEFAULT 0.00`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS telemedicine_fee DECIMAL(10,2) DEFAULT 0.00`);

    // Cancellation policy on providers
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS cancellation_policy_hours INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS cancellation_fee_percent DECIMAL(5,2) DEFAULT 0.00`);

    // Availability exceptions (provider blocks specific dates)
    await pool.query(`CREATE TABLE IF NOT EXISTS availability_exceptions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_avail_exc_provider_date ON availability_exceptions(provider_id, date)`);

    // Patient notes (provider private notes per patient)
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_notes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appointment_id VARCHAR,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_notes_provider ON patient_notes(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_notes_patient ON patient_notes(patient_id)`);

    // Gift cards
    await pool.query(`CREATE TABLE IF NOT EXISTS gift_cards (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      purchaser_user_id VARCHAR REFERENCES users(id),
      recipient_email TEXT,
      initial_amount DECIMAL(10,2) NOT NULL,
      balance DECIMAL(10,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      redeemed_by_user_id VARCHAR REFERENCES users(id),
      redeemed_at TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT true,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gift_cards_purchaser ON gift_cards(purchaser_user_id)`);

    // Disputes
    await pool.query(`CREATE TABLE IF NOT EXISTS disputes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR NOT NULL,
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      reason TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      resolution TEXT,
      resolved_by_user_id VARCHAR REFERENCES users(id),
      resolved_at TIMESTAMP,
      refund_issued BOOLEAN DEFAULT false,
      refund_amount DECIMAL(10,2) DEFAULT 0.00,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_disputes_appointment_id ON disputes(appointment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_disputes_patient_id ON disputes(patient_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_disputes_country_code ON disputes(country_code)`);

    // Full pricing breakdown snapshot — JSONB stored at booking time so the
    // confirmation page never reconstructs it from stale live-service data.
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pricing_breakdown JSONB`);

    // Platform VAT: add year column to tax_settings so admins can set rates per country+year.
    await pool.query(`ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER`);

    // Provider gallery: richer gallery images with captions and ordering.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_gallery (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        caption TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_gallery_provider_id ON provider_gallery(provider_id)`);
    await pool.query(`ALTER TABLE provider_gallery ADD COLUMN IF NOT EXISTS public_id TEXT`);

    // Provider category permissions: admin overrides which categories a provider can see/use.
    // Column is "category" (not "category_id") to match original Supabase schema.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_category_permissions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        category VARCHAR NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT TRUE,
        assigned_by_admin BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(provider_id, category)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pcp_provider_id ON provider_category_permissions(provider_id)`);

    // ── Membership Packages ───────────────────────────────────────────────────────
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'package_target') THEN
        CREATE TYPE package_target AS ENUM ('patient','provider','both');
      END IF;
    END $$`);
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'package_status') THEN
        CREATE TYPE package_status AS ENUM ('pending','active','expired','cancelled');
      END IF;
    END $$`);
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'benefit_key') THEN
        CREATE TYPE benefit_key AS ENUM (
          'service_discount_percent','platform_fee_discount','wallet_bonus',
          'featured_provider','reduced_commission','priority_support','free_cancellations'
        );
      END IF;
    END $$`);

    await pool.query(`CREATE TABLE IF NOT EXISTS packages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      country_code country_code,
      duration_days INTEGER NOT NULL DEFAULT 30,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency TEXT NOT NULL DEFAULT 'USD',
      target_user_type package_target NOT NULL DEFAULT 'patient',
      is_active BOOLEAN NOT NULL DEFAULT true,
      max_purchases INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by VARCHAR REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_packages_country ON packages(country_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(is_active)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS package_benefits (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      package_id VARCHAR NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      benefit_key benefit_key NOT NULL,
      benefit_value DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      notes TEXT
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_package_benefits_pkg ON package_benefits(package_id)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_packages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_id VARCHAR NOT NULL REFERENCES packages(id),
      status package_status NOT NULL DEFAULT 'pending',
      payment_id VARCHAR,
      price_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      purchased_at TIMESTAMP DEFAULT NOW(),
      activated_at TIMESTAMP,
      expires_at TIMESTAMP,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_packages_user ON user_packages(user_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_packages_pkg  ON user_packages(package_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_packages_exp  ON user_packages(expires_at) WHERE status = 'active'`);

    // ── Package columns on appointments ───────────────────────────────────────
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_id_used VARCHAR REFERENCES user_packages(id)`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_discount_amount DECIMAL(10,2) DEFAULT 0.00`);

    // ── RBAC: admin_roles, rbac_permissions, role_permissions, admin_assignments ─
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_roles (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS rbac_permissions (
      key TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS role_permissions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id VARCHAR NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
      permission_key TEXT NOT NULL REFERENCES rbac_permissions(key) ON DELETE CASCADE,
      UNIQUE(role_id, permission_key)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS admin_assignments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id VARCHAR NOT NULL REFERENCES admin_roles(id),
      country_code country_code,
      is_active BOOLEAN NOT NULL DEFAULT true,
      assigned_by VARCHAR REFERENCES users(id),
      expires_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_assignments_user_id ON admin_assignments(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_assignments_role_id ON admin_assignments(role_id)`);

    // ── Security columns on users table ───────────────────────────────────────
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_revoked_at TIMESTAMP`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at) WHERE last_login_at IS NOT NULL`);

    // ── Seed default roles & permissions ──────────────────────────────────────
    {
      const { DEFAULT_ROLE_META, DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG } = await import("./middleware/rbac");

      // Upsert permissions
      for (const p of PERMISSION_CATALOG) {
        await pool.query(
          `INSERT INTO rbac_permissions (key, module, action, description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (key) DO UPDATE SET module=EXCLUDED.module, action=EXCLUDED.action, description=EXCLUDED.description`,
          [p.key, p.module, p.action, p.description],
        );
      }

      // Upsert roles
      for (const r of DEFAULT_ROLE_META) {
        await pool.query(
          `INSERT INTO admin_roles (name, display_name, description, is_system)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, description=EXCLUDED.description`,
          [r.name, r.displayName, r.description],
        );
      }

      // Upsert role-permission links
      for (const [roleName, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        const roleRow = await pool.query(`SELECT id FROM admin_roles WHERE name = $1`, [roleName]);
        if (!roleRow.rows[0]) continue;
        const roleId = roleRow.rows[0].id;
        for (const perm of perms) {
          await pool.query(
            `INSERT INTO role_permissions (role_id, permission_key)
             VALUES ($1, $2)
             ON CONFLICT (role_id, permission_key) DO NOTHING`,
            [roleId, perm],
          );
        }
      }
    }

    // ── Conflict Engine: block_type enum ──────────────────────────────────────
    await pool.query(`DO $$ BEGIN
      CREATE TYPE block_type AS ENUM ('vacation','leave','break','other');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    // ── Conflict Engine: provider_buffer_settings ─────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS provider_buffer_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      practitioner_id VARCHAR REFERENCES practitioners(id) ON DELETE CASCADE,
      clinic_buffer_before INTEGER NOT NULL DEFAULT 0,
      clinic_buffer_after INTEGER NOT NULL DEFAULT 0,
      home_buffer_before INTEGER NOT NULL DEFAULT 15,
      home_buffer_after INTEGER NOT NULL DEFAULT 15,
      travel_radius_km NUMERIC(6,2) DEFAULT 0.00,
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pbs_provider_id ON provider_buffer_settings(provider_id)`);
    await pool.query(`ALTER TABLE provider_buffer_settings ADD COLUMN IF NOT EXISTS online_buffer_before INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE provider_buffer_settings ADD COLUMN IF NOT EXISTS online_buffer_after INTEGER NOT NULL DEFAULT 0`);

    // ── Conflict Engine: provider_blocks ──────────────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS provider_blocks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      practitioner_id VARCHAR REFERENCES practitioners(id) ON DELETE CASCADE,
      block_type block_type NOT NULL DEFAULT 'other',
      start_datetime TIMESTAMP NOT NULL,
      end_datetime TIMESTAMP NOT NULL,
      reason TEXT,
      created_by VARCHAR REFERENCES users(id),
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_blocks_provider_id ON provider_blocks(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_blocks_start ON provider_blocks(provider_id, start_datetime)`);

    // ── Conflict Engine: appointment_slot_holds ───────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS appointment_slot_holds (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      practitioner_id VARCHAR REFERENCES practitioners(id) ON DELETE CASCADE,
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      visit_type visit_type NOT NULL DEFAULT 'clinic',
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_slot_holds_provider_date ON appointment_slot_holds(provider_id, date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_slot_holds_expires ON appointment_slot_holds(expires_at)`);

    // ── Availability engine: provider scheduling constraints ──────────────────
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS minimum_notice_minutes INTEGER DEFAULT 60`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS maximum_booking_days INTEGER DEFAULT 90`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS availability_version INTEGER DEFAULT 1`);

    // ── Provider permanent / legal address ────────────────────────────────────
    // Separate from service location (city/state/primaryServiceLocation).
    // Used for invoicing, legal verification, and compliance only.
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS permanent_address_line1 TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS permanent_address_line2 TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS permanent_city TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS permanent_state_region TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS permanent_postal_code TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS permanent_country TEXT`);
    // ── Provider licence credential columns ────────────────────────────────────
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS license_number TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS licensing_authority TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS license_expiry_date TIMESTAMP`);

    // ── Availability engine: per-service availability hours ───────────────────
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS availability_hours JSONB`);

    // ── Provider Documents (private verification docs) ────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS provider_documents (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_url TEXT NOT NULL,
      cloudinary_public_id TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      expiry_date TEXT,
      admin_note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_documents_provider_id ON provider_documents(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_documents_status ON provider_documents(verification_status)`);
    // ── provider_documents: columns added after initial CREATE TABLE ──────────
    await pool.query(`ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS file_name TEXT`);
    await pool.query(`ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expiry_required BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP`);
    await pool.query(`ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT 30`);
    await pool.query(`ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS document_criticality TEXT DEFAULT 'optional'`);
    await pool.query(`ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS verified_by VARCHAR`);
    await pool.query(`ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`);

    // ── Provider Credentials (public when verified) ───────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS provider_credentials (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      credential_type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_url TEXT,
      cloudinary_public_id TEXT,
      license_number TEXT,
      issuing_body TEXT,
      verified BOOLEAN NOT NULL DEFAULT false,
      verified_at TIMESTAMP,
      admin_note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider_id ON provider_credentials(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_credentials_verified ON provider_credentials(provider_id, verified)`);

    // ── Provider Payout Requests ───────────────────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS payout_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      amount DECIMAL(14,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'HUF',
      method TEXT NOT NULL DEFAULT 'bank_transfer',
      bank_name TEXT,
      account_holder TEXT,
      account_number_masked TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      reviewed_by VARCHAR REFERENCES users(id),
      reviewed_at TIMESTAMP,
      paid_at TIMESTAMP,
      payment_reference TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_requests_provider ON payout_requests(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_requests_created ON payout_requests(created_at DESC)`);

    // ── Patient Documents ──────────────────────────────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_documents (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appointment_id VARCHAR REFERENCES appointments(id) ON DELETE SET NULL,
      document_type TEXT NOT NULL DEFAULT 'other',
      title TEXT NOT NULL,
      file_url TEXT NOT NULL,
      cloudinary_public_id TEXT,
      mime_type TEXT,
      file_size_bytes INTEGER,
      visibility TEXT NOT NULL DEFAULT 'private',
      shared_with_provider_ids TEXT[] DEFAULT '{}',
      country_code TEXT NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_patient ON patient_documents(patient_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_type ON patient_documents(patient_id, document_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_created ON patient_documents(created_at DESC)`);

    // ── Patient Gallery (private media uploads) ────────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_gallery (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      public_id TEXT,
      caption TEXT,
      file_type TEXT DEFAULT 'image',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_gallery_user_id ON patient_gallery(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_gallery_created_at ON patient_gallery(created_at DESC)`);

    // ── Practitioner photo + verified flag ─────────────────────────────────────
    await pool.query(`ALTER TABLE practitioners ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await pool.query(`ALTER TABLE practitioners ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`);

    // ── Practitioner-level weekly schedules ────────────────────────────────────
    // One active row per practitioner. The weekly_schedule JSONB uses the same
    // format as provider office_hours.weekly_schedule so the same slot-generator
    // logic can be reused. When present, the practitioner's hours are intersected
    // with the provider's hours to produce the patient-visible slot grid.
    await pool.query(`CREATE TABLE IF NOT EXISTS practitioner_schedules (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      practitioner_id VARCHAR NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
      weekly_schedule JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_practitioner_schedules_practitioner ON practitioner_schedules(practitioner_id)`);
    // Partial unique index: only one active schedule per practitioner at a time.
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_practitioner_active_schedule ON practitioner_schedules(practitioner_id) WHERE is_active = true`);

    // ── Configurable refund policy rules ─────────────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS refund_rules (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      scenario TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT 'all',
      full_refund_hours INTEGER NOT NULL DEFAULT 24,
      partial_refund_hours INTEGER NOT NULL DEFAULT 6,
      partial_refund_percent INTEGER NOT NULL DEFAULT 50,
      is_active BOOLEAN NOT NULL DEFAULT true,
      description TEXT,
      updated_by_id VARCHAR REFERENCES users(id),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    // Seed global default rules once
    await pool.query(`
      INSERT INTO refund_rules (scenario, country_code, full_refund_hours, partial_refund_hours, partial_refund_percent, description)
      SELECT s.scenario, 'all', s.full_h, s.partial_h, s.pct, s.descr
      FROM (VALUES
        ('patient_cancel'::text,   24, 6,  50, 'Patient cancellation: >24 h full, 6–24 h 50%, <6 h none'),
        ('provider_cancel'::text,   0, 0, 100, 'Provider/admin cancellation: always full refund'),
        ('no_show'::text,           0, 0,   0, 'No-show: no refund issued'),
        ('late_cancel'::text,       0, 6,   0, 'Late cancellation (<6 h): no refund'),
        ('service_failure'::text,   0, 0, 100, 'Service failure/force-cancel: always full refund')
      ) AS s(scenario, full_h, partial_h, pct, descr)
      WHERE NOT EXISTS (
        SELECT 1 FROM refund_rules WHERE scenario = s.scenario AND country_code = 'all'
      )
    `);

    // ── Admin broadcasts: scheduling + targeting columns ──────────────────────
    await pool.query(`ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP`);
    await pool.query(`ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
    await pool.query(`ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent'`);
    await pool.query(`ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS target_countries TEXT[]`);
    await pool.query(`ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS target_verified_only BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_status ON admin_broadcasts(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_scheduled ON admin_broadcasts(scheduled_at) WHERE scheduled_at IS NOT NULL`);

    // ── Appointments: admin refund override notes ─────────────────────────────
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS refund_notes TEXT`);

    // ── Audit logs: extended state tracking ───────────────────────────────────
    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_state JSONB`);
    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_state JSONB`);
    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS payload JSONB`);
    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS country_code TEXT`);
    // Add new audit action enum values (idempotent)
    for (const val of ["approve", "reject", "refund", "role_change", "document_verify", "payment_action", "suspend", "verify", "reconcile_earnings", "wallet_adjust", "ledger_override", "circuit_breaker", "repair_earnings", "provider.note_added", "db_reset_preview", "db_reset_executed"]) {
      await pool.query(`DO $$ BEGIN ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${val}'; EXCEPTION WHEN others THEN NULL; END $$`);
    }

    // ── System monitoring: system_events ──────────────────────────────────────
    await pool.query(`DO $$ BEGIN
      CREATE TYPE system_event_type AS ENUM (
        'api_error','payment_failure','notification_failure',
        'slow_endpoint','failed_job','auth_failure'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN
      CREATE TYPE system_event_severity AS ENUM ('info','warning','error','critical');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await pool.query(`CREATE TABLE IF NOT EXISTS system_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type system_event_type NOT NULL,
      severity system_event_severity NOT NULL DEFAULT 'error',
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB,
      country_code TEXT,
      resolved_at TIMESTAMP,
      resolved_by VARCHAR REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_system_events_resolved ON system_events(resolved_at) WHERE resolved_at IS NULL`);

    // ── pg_trgm: trigram GIN indexes for fast ILIKE provider search ──────────
    // Enables sub-10 ms prefix/substring searches on name + city columns at
    // scale. CREATE EXTENSION is idempotent; CREATE INDEX IF NOT EXISTS is safe
    // on every boot. Wrapped in individual catches so a missing superuser grant
    // (shared Supabase plans) does not abort the rest of migrations.
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch((e: any) =>
      console.warn("[db] pg_trgm extension:", e?.message));
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trgm_users_first_name ON users USING GIN (first_name gin_trgm_ops)`).catch(() => null);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trgm_users_last_name ON users USING GIN (last_name gin_trgm_ops)`).catch(() => null);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trgm_providers_specialization ON providers USING GIN (specialization gin_trgm_ops)`).catch(() => null);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trgm_providers_city ON providers USING GIN (city gin_trgm_ops)`).catch(() => null);
    // Additional trigram indexes for bio + professional title full-text search
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trgm_providers_bio ON providers USING GIN (bio gin_trgm_ops)`).catch(() => null);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trgm_providers_title ON providers USING GIN (professional_title gin_trgm_ops)`).catch(() => null);
    // Composite B-tree for the most common provider listing filter: country + type + verified
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_country_type_verified ON providers(country_code, provider_type, is_verified)`).catch(() => null);
    // Composite for rating-sorted listings (country + rating for ORDER BY optimisation)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_country_rating ON providers(country_code, rating DESC)`).catch(() => null);
    // Appointments lookup by provider + status (dashboard queries)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_provider_status ON appointments(provider_id, status)`).catch(() => null);
    // Appointments lookup by patient + status
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_patient_status ON appointments(patient_id, status)`).catch(() => null);

    // ── Sprint B: missing performance indexes ─────────────────────────────────
    // wallet_transactions.wallet_id — required for per-wallet history queries
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet_id ON wallet_transactions(wallet_id)`).catch(() => null);
    // realtime_messages.conversation_id — drives every chat message fetch
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_realtime_messages_conv ON realtime_messages(conversation_id)`).catch(() => null);
    // user_notifications.user_id + is_read — notification badge + listing queries
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_notif_user_read ON user_notifications(user_id, is_read)`).catch(() => null);
    // providers.country_code + status — provider directory listing
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_country_status ON providers(country_code, status)`).catch(() => null);

    // ── DB-backed appointment idempotency ─────────────────────────────────────
    // Replaces the process-local in-memory cache so multi-instance deployments
    // cannot create duplicate appointments when the same Idempotency-Key hits
    // different server instances.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key         TEXT        NOT NULL,
        scope       TEXT        NOT NULL DEFAULT 'appointment',
        user_id     VARCHAR     REFERENCES users(id) ON DELETE CASCADE,
        status      INTEGER     NOT NULL DEFAULT 201,
        response_body JSONB,
        expires_at  TIMESTAMP   NOT NULL,
        created_at  TIMESTAMP   DEFAULT NOW(),
        PRIMARY KEY (key, scope)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_idem_keys_expires ON idempotency_keys(expires_at)`);

    // ── Providers: columns added after initial db:push ─────────────────────
    // These were in shared/schema.ts but never reached the Supabase DB via a
    // migration.  All are idempotent (ADD COLUMN IF NOT EXISTS).
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS bookings_enabled BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'individual'`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_name TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_registration_number TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS contact_person_name TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS business_address TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS support_email TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS support_phone TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS service_modes TEXT[] DEFAULT '{}'::text[]`);
    // Index on risk_score for admin risk-management queries
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_risk_score ON providers(risk_score DESC) WHERE risk_score > 0`);

    // ── Users: extended profile columns ───────────────────────────────────
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS saved_latitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS saved_longitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_pronouns TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marital_status TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_number TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_group TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm INTEGER`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,2)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS known_allergies TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_conditions TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_medications TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS past_surgeries TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_provider TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_care_physician TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_id TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT`);

    // ── Admin Notifications ────────────────────────────────────────────────────
    // Stores activity-driven alerts for admin review. Scoped by country_code for
    // country-admin isolation; global admins see all rows.
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_notifications (
      id            VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
      type          TEXT      NOT NULL,
      severity      TEXT      NOT NULL DEFAULT 'info',
      title         TEXT      NOT NULL,
      message       TEXT      NOT NULL,
      provider_id   VARCHAR   REFERENCES providers(id) ON DELETE CASCADE,
      provider_name TEXT,
      country_code  TEXT,
      action_type   TEXT,
      metadata      JSONB,
      is_read       BOOLEAN   NOT NULL DEFAULT FALSE,
      read_by       VARCHAR   REFERENCES users(id),
      read_at       TIMESTAMP,
      created_at    TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_notif_is_read   ON admin_notifications(is_read)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_notif_provider  ON admin_notifications(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_notif_country   ON admin_notifications(country_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_notif_created   ON admin_notifications(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_notif_severity  ON admin_notifications(severity)`);

    // ── High-traffic foreign-key indexes ──────────────────────────────────────
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet_id        ON wallet_transactions(wallet_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_realtime_msgs_conversation   ON realtime_messages(conversation_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_notif_user_read         ON user_notifications(user_id, is_read)`);

    // ── Sprint 1 production blockers: missing indexes ─────────────────────────
    // wallet_transactions.user_id — every patient wallet history query filters by user_id
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_user_id ON wallet_transactions(user_id)`).catch(() => null);
    // audit_logs.entity_id — dispute/refund audit trail lookups scan entity_id
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id)`).catch(() => null);
    // audit_logs.user_id — per-user audit history (admin compliance view)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`).catch(() => null);
    // audit_logs.created_at — time-range queries on audit trail
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`).catch(() => null);
    // payments.appointment_id — already in Drizzle schema but ensure it exists on DB
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_appointment_id ON payments(appointment_id)`).catch(() => null);
    // stripe_refund_id: persist Stripe refund ID for idempotent card refund tracking
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT`).catch(() => null);

    // ── Sprint 1 gap: remaining H-07 indexes ──────────────────────────────────
    // appointments(status) standalone — composite idx_appointments_patient_status cannot
    // satisfy status-only filters (cron auto-expiry, analytics, admin status tabs).
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`).catch(() => null);
    // wallet_transactions.idempotency_key — looked up on every booking attempt;
    // without this index applyWalletDelta does a full seq-scan to detect duplicates.
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_idempotency_key ON wallet_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL`).catch(() => null);

  } catch (err) {
    console.warn("[db] startup migration warning:", (err as Error).message);
  }

  // ── patient_documents: add family_member_id if missing ──────────────────────
  try {
    await pool.query(`
      ALTER TABLE patient_documents
        ADD COLUMN IF NOT EXISTS family_member_id VARCHAR REFERENCES family_members(id) ON DELETE CASCADE
    `);
  } catch (err) {
    console.warn("[db] patient_documents family_member_id migration warning:", (err as Error).message);
  }

  // ── patient_consents: add family_member_id if missing ────────────────────────
  try {
    await pool.query(`
      ALTER TABLE patient_consents
        ADD COLUMN IF NOT EXISTS family_member_id VARCHAR REFERENCES family_members(id) ON DELETE CASCADE
    `);
  } catch (err) {
    console.warn("[db] patient_consents migration warning:", (err as Error).message);
  }

  // ── patient_consents: add consent_version if missing ─────────────────────────
  try {
    await pool.query(`
      ALTER TABLE patient_consents
        ADD COLUMN IF NOT EXISTS consent_version TEXT DEFAULT '1.0'
    `);
  } catch (err) {
    console.warn("[db] patient_consents consent_version migration warning:", (err as Error).message);
  }

  // ── Provider Wallets & Ledger (separate try-catch so they never block boot) ──
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS provider_wallets (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
      available_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      pending_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      held_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      lifetime_earnings DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      currency TEXT NOT NULL DEFAULT 'HUF',
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      frozen_reason TEXT,
      last_payout_date TIMESTAMP,
      country_code country_code NOT NULL DEFAULT 'HU',
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_wallets_provider_id ON provider_wallets(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_wallets_country_code ON provider_wallets(country_code)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS provider_ledger (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      amount DECIMAL(14,2) NOT NULL,
      entry_type TEXT NOT NULL,
      reference_id TEXT,
      description TEXT,
      actor_id VARCHAR REFERENCES users(id),
      balance_after DECIMAL(14,2),
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_ledger_provider_id ON provider_ledger(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_ledger_created_at ON provider_ledger(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_ledger_entry_type ON provider_ledger(entry_type)`);
    console.log("[db] provider_wallets + provider_ledger tables ready");
  } catch (wErr) {
    console.warn("[db] provider wallet migration warning (non-fatal):", (wErr as Error).message);
  }

  // ── Canonical currency layer ───────────────────────────────────────────────
  // currency_rates: DB-persisted exchange rates (USD base), updated hourly by cron.
  // display columns: snapshot the user-facing currency at transaction time.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS currency_rates (
        currency_code  TEXT          PRIMARY KEY,
        rate_from_usd  DECIMAL(16,6) NOT NULL,
        fetched_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    // Seed fallback rows so the table is never empty after first boot
    await pool.query(`
      INSERT INTO currency_rates (currency_code, rate_from_usd)
      VALUES ('USD', 1), ('HUF', 365), ('IRR', 42000), ('GBP', 0.79), ('EUR', 0.92)
      ON CONFLICT (currency_code) DO NOTHING
    `);

    // Display columns on appointments (locked at booking time)
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS display_currency TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS display_amount DECIMAL(14,2)`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(16,6)`);

    // Display columns on payments
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS display_currency TEXT`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS display_amount DECIMAL(14,2)`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(16,6)`);

    // Display columns on provider_earnings
    await pool.query(`ALTER TABLE provider_earnings ADD COLUMN IF NOT EXISTS display_currency TEXT`);
    await pool.query(`ALTER TABLE provider_earnings ADD COLUMN IF NOT EXISTS display_amount DECIMAL(14,2)`);
    await pool.query(`ALTER TABLE provider_earnings ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(16,6)`);

    // USD-equivalent columns on wallet_transactions
    await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(14,4)`);
    await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(16,6)`);

    // provider_ledger: add missing currency + USD-equivalent columns
    await pool.query(`ALTER TABLE provider_ledger ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'`);
    await pool.query(`ALTER TABLE provider_ledger ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(14,4)`);
    await pool.query(`ALTER TABLE provider_ledger ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(16,6)`);

    // Migrate wallet/wallet_transaction/provider_wallet defaults to USD
    await pool.query(`ALTER TABLE wallets ALTER COLUMN currency SET DEFAULT 'USD'`);
    await pool.query(`ALTER TABLE wallet_transactions ALTER COLUMN currency SET DEFAULT 'USD'`);
    await pool.query(`ALTER TABLE provider_wallets ALTER COLUMN currency SET DEFAULT 'USD'`);
    await pool.query(`ALTER TABLE payout_requests ALTER COLUMN currency SET DEFAULT 'USD'`);

    console.log("[db] currency_rates table and display columns ready");
  } catch (cErr) {
    console.warn("[db] currency migration warning (non-fatal):", (cErr as Error).message);
  }

  // ── Provider title system columns ──────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS primary_title TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS secondary_titles TEXT[] NOT NULL DEFAULT '{}'`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS requested_title TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS title_request_reason TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS title_request_status TEXT DEFAULT 'none'`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS title_reviewed_by VARCHAR`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS title_reviewed_at TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_title_request_status ON providers(title_request_status) WHERE title_request_status = 'pending'`);
    console.log("[db] provider title system columns ready");
  } catch (err) {
    console.warn("[db] provider title system migration warning:", (err as Error).message);
  }

  // ── Service Lifecycle Refactor ────────────────────────────────────────────
  // Phases 2-14: service_requests table, sub_services/catalog_services/services
  // extended columns for status lifecycle, multilang, price guardrails,
  // requirements engine, and versioning. All idempotent.
  try {
    // service_requests — provider proposals for brand-new services not in catalog
    await pool.query(`CREATE TABLE IF NOT EXISTS service_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      service_name TEXT NOT NULL,
      sub_service_name TEXT,
      description TEXT,
      suggested_price DECIMAL(10,2),
      currency TEXT DEFAULT 'USD',
      duration_minutes INTEGER DEFAULT 30,
      location_mode TEXT DEFAULT 'both',
      admin_notes TEXT,
      rejection_reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review',
      requested_by VARCHAR REFERENCES users(id),
      reviewed_by VARCHAR REFERENCES users(id),
      reviewed_at TIMESTAMP,
      country_code TEXT NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_provider_id ON service_requests(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_country ON service_requests(country_code)`);
    // Ensure columns added after initial table creation are present on older DBs
    await pool.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR REFERENCES users(id)`);
    await pool.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP`);
    await pool.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'`);
    await pool.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30`);
    await pool.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS requested_by VARCHAR REFERENCES users(id)`);

    // sub_services: lifecycle status (draft / pending_approval / active / inactive / deprecated / archived)
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
    // sub_services: multi-language fields (Phases 10)
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS name_en TEXT`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS name_hu TEXT`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS name_fa TEXT`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS description_en TEXT`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS description_hu TEXT`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS description_fa TEXT`);
    // sub_services: price guardrails (Phase 9)
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS min_price DECIMAL(10,2)`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS max_price DECIMAL(10,2)`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS suggested_min_price DECIMAL(10,2)`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS suggested_max_price DECIMAL(10,2)`);
    // sub_services: requirements engine (Phase 8)
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '{}'`);
    // sub_services: per-country availability
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS country_codes TEXT[] DEFAULT '{}'`);

    // catalog_services: lifecycle status + multi-language
    await pool.query(`ALTER TABLE catalog_services ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
    await pool.query(`ALTER TABLE catalog_services ADD COLUMN IF NOT EXISTS name_en TEXT`);
    await pool.query(`ALTER TABLE catalog_services ADD COLUMN IF NOT EXISTS name_hu TEXT`);
    await pool.query(`ALTER TABLE catalog_services ADD COLUMN IF NOT EXISTS name_fa TEXT`);

    // services: versioning (Phase 6) + change classification (Phase 5)
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS change_type TEXT`);

    console.log("[db] service lifecycle refactor columns ready");
  } catch (svcErr) {
    console.warn("[db] service lifecycle migration warning (non-fatal):", (svcErr as Error).message);
  }

  // ── Booking / Availability Engine Hardening ──────────────────────────────────
  // Phases 7 (timezone), 8 (workload controls), 5 (waitlist config).
  // All idempotent via ADD COLUMN IF NOT EXISTS.
  try {
    // Phase 8: daily booking cap & minimum gap between appointments
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS max_daily_appointments INTEGER`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS min_gap_minutes INTEGER DEFAULT 0`);
    // Phase 5: provider-level waitlist on/off and size cap
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS waitlist_max_size INTEGER DEFAULT 10`);
    // Phase 7: canonical timezone for provider; used in slot generation and
    // "minimum notice" filtering so times are relative to the provider's clock.
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'`);
    // Phase 11: ensure a partial unique index prevents duplicate confirmed bookings
    // at the DB level (same provider + date + startTime + non-terminal status).
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_slot
      ON appointments (provider_id, date, start_time)
      WHERE status IN ('pending','approved','confirmed','in_progress')
    `);
    // Phase 11b: unique constraint on time_slots(provider_id, date, start_time)
    // required by Drizzle's onConflictDoNothing({target:[...]}) in bulkCreateTimeSlots.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_provider_date_start
      ON time_slots (provider_id, date, start_time)
    `);
    // Original slot preservation: set once on first reschedule so history
    // survives multiple reschedules without digging through audit event JSON.
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS original_date TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS original_start_time TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS original_end_time TEXT`);
    console.log("[db] booking engine hardening schema ready");
  } catch (bookingErr) {
    console.warn("[db] booking engine hardening warning (non-fatal):", (bookingErr as Error).message);
  }

  // ── Refresh token hashing (Sprint 2 — H-01/H-02) ─────────────────────────
  try {
    await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT UNIQUE`);
    // Make the legacy plaintext token column nullable (new rows only set token_hash)
    await pool.query(`ALTER TABLE refresh_tokens ALTER COLUMN token DROP NOT NULL`);
    console.log("[db] refresh_tokens token_hash column ready");
  } catch (rtErr) {
    console.warn("[db] refresh_token hash migration warning (non-fatal):", (rtErr as Error).message);
  }

  // ── Sprint 3: Currency column default (DDL) ──────────────────────────────
  try {
    await pool.query(`ALTER TABLE payout_requests ALTER COLUMN currency SET DEFAULT 'USD'`);
    console.log("[db] payout_requests currency default ready");
  } catch (currErr) {
    console.warn("[db] currency default warning (non-fatal):", (currErr as Error).message);
  }

  // ── Sprint 3: Financial reconciliation indexes ────────────────────────────
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_reference ON wallet_transactions(reference_type, reference_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_txns_idempotency ON wallet_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_provider_ledger_reference ON provider_ledger(reference_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_disputes_status_country ON disputes(status, country_code)`);
  } catch (idxErr) {
    console.warn("[db] reconciliation index warning (non-fatal):", (idxErr as Error).message);
  }

  // ── Sprint 4: Analytics & reporting performance indexes ───────────────────
  // Split into individual try-catches so one bad index never blocks the rest.
  // Covers: getEnhancedAnalytics hot paths (country+created_at, visit_type
  // GROUP BY), financial provider dashboard joins, user/provider growth series.
  const s4Indexes: Array<[string, string]> = [
    ["idx_appointments_country_created",   `CREATE INDEX IF NOT EXISTS idx_appointments_country_created ON appointments(country_code, created_at DESC)`],
    ["idx_appointments_visit_type",        `CREATE INDEX IF NOT EXISTS idx_appointments_visit_type ON appointments(visit_type) WHERE visit_type IS NOT NULL`],
    ["idx_provider_earnings_provider_id",  `CREATE INDEX IF NOT EXISTS idx_provider_earnings_provider_id ON provider_earnings(provider_id)`],
    ["idx_users_role_country",             `CREATE INDEX IF NOT EXISTS idx_users_role_country ON users(role, country_code)`],
    ["idx_provider_docs_verification",     `CREATE INDEX IF NOT EXISTS idx_provider_docs_verification ON provider_documents(verification_status)`],
    ["idx_providers_country_status",       `CREATE INDEX IF NOT EXISTS idx_providers_country_status ON providers(country_code, status)`],
  ];
  for (const [name, sql] of s4Indexes) {
    try { await pool.query(sql); }
    catch (e) { console.warn(`[db] Sprint 4 index ${name} warning (non-fatal):`, (e as Error).message); }
  }
  console.log("[db] analytics performance indexes ready");

  // ── Sprint 5: Provider full-text search (H-06) ────────────────────────────
  // GENERATED ALWAYS AS is rejected by Postgres when any sub-expression is
  // STABLE rather than IMMUTABLE (array_to_string is STABLE).  We use a
  // trigger-maintained tsvector column instead — triggers have no volatility
  // restriction and are maintained automatically on every INSERT/UPDATE.
  //
  // Steps (all idempotent):
  //   1. Add the column (regular, not generated)
  //   2. CREATE OR REPLACE the trigger function
  //   3. (Re)create the BEFORE INSERT OR UPDATE trigger
  //   4. Backfill any rows where search_vector is still NULL
  //   5. Add GIN index on the column + functional GIN on users name
  try {
    // Step 1 — column
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS search_vector tsvector`);

    // Step 2 — trigger function (CREATE OR REPLACE is idempotent)
    await pool.query(`
      CREATE OR REPLACE FUNCTION providers_update_search_vector() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('simple', coalesce(NEW.specialization,      '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(NEW.professional_title,  '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(NEW.provider_type,       '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(array_to_string(NEW.secondary_specialties, ' '), '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(NEW.bio,                 '')), 'C') ||
          setweight(to_tsvector('simple', coalesce(NEW.city,                '')), 'C');
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);

    // Step 3 — trigger (drop-then-create is idempotent)
    await pool.query(`DROP TRIGGER IF EXISTS providers_search_vector_trig ON providers`);
    await pool.query(`
      CREATE TRIGGER providers_search_vector_trig
        BEFORE INSERT OR UPDATE ON providers
        FOR EACH ROW EXECUTE FUNCTION providers_update_search_vector()
    `);

    console.log("[db] providers.search_vector column + trigger ready");
  } catch (svErr) {
    console.warn("[db] Sprint 5 search_vector column/trigger warning (non-fatal):", (svErr as Error).message);
  }

  // Sprint 5: GIN indexes for full-text search — each in its own try-catch.
  const s5Indexes: Array<[string, string]> = [
    [
      "idx_providers_search_vector",
      `CREATE INDEX IF NOT EXISTS idx_providers_search_vector ON providers USING GIN (search_vector)`,
    ],
    [
      "idx_users_name_fts",
      // Functional GIN on the concatenated name; used by the FTS WHERE clause
      `CREATE INDEX IF NOT EXISTS idx_users_name_fts ON users USING GIN (
         to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
       )`,
    ],
  ];
  for (const [name, sqlStr] of s5Indexes) {
    try { await pool.query(sqlStr); }
    catch (e) { console.warn(`[db] Sprint 5 index ${name} warning (non-fatal):`, (e as Error).message); }
  }
  console.log("[db] full-text search indexes ready");

  // ── Sprint 6: Booking concurrency — unique active slot holds ─────────────────
  // Prevents two patients from simultaneously holding the exact same slot.
  // We first clean expired holds so they don't block new valid requests.
  // Each DDL is in its own try-catch so one failure doesn't block the rest.
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_holds_unique_slot
      ON appointment_slot_holds(provider_id, COALESCE(practitioner_id, ''), date, start_time, end_time)
    `);
    console.log("[db] slot hold uniqueness index ready");
  } catch (e) {
    console.warn("[db] Sprint 6 slot hold index warning (non-fatal):", (e as Error).message);
  }

  // ── Sprint 9: Privacy requests table ──────────────────────────────────────
  // Tracks patient export / deletion / access requests for GDPR compliance.
  // Idempotent — CREATE TABLE IF NOT EXISTS.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS privacy_requests (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       VARCHAR NOT NULL REFERENCES users(id),
        request_type  TEXT NOT NULL CHECK (request_type IN ('export','deletion','access')),
        status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','rejected')),
        notes         TEXT,
        admin_notes   TEXT,
        processed_by  VARCHAR REFERENCES users(id),
        country_code  country_code,
        completed_at  TIMESTAMP,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_privacy_requests_user_id  ON privacy_requests(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_privacy_requests_status    ON privacy_requests(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_privacy_requests_country   ON privacy_requests(country_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_privacy_requests_created   ON privacy_requests(created_at DESC)`);
    console.log("[db] privacy_requests table ready");
  } catch (e) {
    console.warn("[db] Sprint 9 privacy_requests migration (non-fatal):", (e as Error).message);
  }

  // ── Sprint 10: Webhook idempotency + cold-start observability ──────────────
  // [SCHEMA-SETUP] — no new table required.
  // Webhook deduplication is backed by the existing idempotency_keys table with
  // scope = 'stripe_webhook' and expires_at = NOW() + 72 h.  The pruneOldData()
  // cron job handles expiry cleanup (DELETE WHERE expires_at < NOW()).
  // Cold-start DB connect time and first-query latency are captured at module
  // load in _dbStartupMetrics (exported via getDbStartupMetrics()) and surfaced
  // in GET /api/admin/diagnostics under the "coldStart" key.
  console.log("[db] webhook idempotency (idempotency_keys scope=stripe_webhook) and cold-start observability active");

  // ── Sub-service catalogue buffer defaults ────────────────────────────────
  try {
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS buffer_before integer NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS buffer_after  integer NOT NULL DEFAULT 0`);
    console.log("[db] sub_services buffer_before/buffer_after columns ready");
  } catch (e) {
    console.warn("[db] sub_services buffer columns migration (non-fatal):", (e as Error).message);
  }

  // ── Bug Reports (Sprint 9 — Bug Tracking System) ────────────────────────
  try {
    for (const val of ["bug","feature_request","payment_issue","booking_issue","account_issue","service_issue","ui_issue","performance_issue","other"]) {
      await pool.query(`DO $$ BEGIN CREATE TYPE bug_category AS ENUM ('${val}'); EXCEPTION WHEN duplicate_object THEN ALTER TYPE bug_category ADD VALUE IF NOT EXISTS '${val}'; END $$`).catch(() => null);
    }
    await pool.query(`DO $$ BEGIN CREATE TYPE bug_category AS ENUM ('bug','feature_request','payment_issue','booking_issue','account_issue','service_issue','ui_issue','performance_issue','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`).catch(() => null);
    await pool.query(`DO $$ BEGIN CREATE TYPE bug_severity AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`).catch(() => null);
    await pool.query(`DO $$ BEGIN CREATE TYPE bug_priority AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`).catch(() => null);
    await pool.query(`DO $$ BEGIN CREATE TYPE bug_status AS ENUM ('new','triaged','in_progress','waiting_for_user','resolved','closed','duplicate','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`).catch(() => null);

    await pool.query(`CREATE TABLE IF NOT EXISTS bug_reports (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      country_code country_code NOT NULL DEFAULT 'HU',
      reported_by_user_id VARCHAR NOT NULL REFERENCES users(id),
      reporter_role TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      steps_to_reproduce TEXT,
      category TEXT NOT NULL DEFAULT 'bug',
      severity TEXT NOT NULL DEFAULT 'medium',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new',
      page_url TEXT,
      browser_info TEXT,
      device_info TEXT,
      correlation_id TEXT,
      screenshot_url TEXT,
      screenshot_public_id TEXT,
      assigned_to VARCHAR REFERENCES users(id),
      resolution_notes TEXT,
      admin_notes TEXT,
      include_diagnostics BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      resolved_at TIMESTAMP,
      closed_at TIMESTAMP,
      last_activity_at TIMESTAMP DEFAULT NOW() NOT NULL,
      soft_deleted BOOLEAN DEFAULT false
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS bug_report_comments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      bug_report_id VARCHAR NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      role TEXT,
      message TEXT NOT NULL,
      attachment_url TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_reports_country_code ON bug_reports(country_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_reports_priority ON bug_reports(priority)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_reports_reported_by ON bug_reports(reported_by_user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_reports_assigned_to ON bug_reports(assigned_to)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_reports_country_status ON bug_reports(country_code, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bug_report_comments_report ON bug_report_comments(bug_report_id)`);
    console.log("[db] bug_reports + bug_report_comments tables ready");
  } catch (bugErr: any) {
    console.warn("[db] bug reports migration (non-fatal):", bugErr.message);
  }

  // ── C7: practitioners missing FK index ──────────────────────────────────────
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_practitioners_provider_id ON practitioners(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_practitioners_status ON practitioners(status)`);
    console.log("[db] practitioners performance indexes ready");
  } catch (c7Err: any) {
    console.warn("[db] C7 practitioners indexes (non-fatal):", c7Err.message);
  }

  // ── P2 / Phase 12: Revenue completion schema changes ─────────────────────
  try {
    // W7: 'renewed' status for auto-renewed user_packages
    await pool.query(`ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'renewed'`);
    // W3: relax participant_type in revenue_share_rules to allow affiliate/referral/corporate
    await pool.query(`ALTER TABLE revenue_share_rules ADD COLUMN IF NOT EXISTS participant_type_extended TEXT`);
    await pool.query(`ALTER TABLE booking_revenue_shares ADD COLUMN IF NOT EXISTS participant_type_extended TEXT`);
    // W5/W9: gift_cards table hardening
    await pool.query(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS recipient_email TEXT`);
    await pool.query(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS initial_amount NUMERIC(12,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'`);
    // W8: ensure tax_settings has VAT number / exemption fields
    await pool.query(`ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS is_vat_exempt BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE tax_settings ADD COLUMN IF NOT EXISTS vat_number TEXT`);
    console.log("[db] revenue completion schema ready");
  } catch (p12Err: any) {
    console.warn("[db] migration (non-fatal):", p12Err.message);
  }

  // ── Phase 13: Appointment-centric communication schema ────────────────────
  try {
    await pool.query(`ALTER TABLE realtime_conversations ADD COLUMN IF NOT EXISTS appointment_id VARCHAR`);
    await pool.query(`ALTER TABLE realtime_conversations ADD COLUMN IF NOT EXISTS context_type TEXT NOT NULL DEFAULT 'general'`);
    await pool.query(`ALTER TABLE realtime_conversations ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP`);
    console.log("[db] communication schema ready");
  } catch (p13Err: any) {
    console.warn("[db] migration (non-fatal):", p13Err.message);
  }

  // ── Phase 14: Provider type change request flow ───────────────────────────
  try {
    // pending_provider_type: the type the provider wants to switch to (requires admin approval once approved)
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS pending_provider_type TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS type_change_reason TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS type_change_requested_at TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_pending_type ON providers(pending_provider_type) WHERE pending_provider_type IS NOT NULL`);
    console.log("[db] provider type change schema ready");
  } catch (p14Err: any) {
    console.warn("[db] migration (non-fatal):", p14Err.message);
  }

  // ── Phase 15: Provider category change request flow + service catalogue ──────
  try {
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS pending_provider_category TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS pending_provider_subcategory TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS category_change_reason TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS category_change_requested_at TIMESTAMPTZ`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_providers_pending_category ON providers(pending_provider_category) WHERE pending_provider_category IS NOT NULL`);
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS provider_category_name TEXT`);
    // Phase 15b: allow specialization + display_title in the same change request
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS pending_specialization TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS pending_display_title TEXT`);
    console.log("[db] provider category change + service catalogue schema ready");
  } catch (p15Err: any) {
    console.warn("[db] migration (non-fatal):", p15Err.message);
  }

  // ── Phase 16: Soft delete for provider_documents ──────────────────────────
  try {
    await pool.query(`
      ALTER TABLE provider_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);
    console.log("[db] provider_documents soft-delete column ready");
  } catch (p16Err: any) {
    console.warn("[db] migration (non-fatal):", p16Err.message);
  }

  // RBAC seeding runs in the background — does not block port open
  setTimeout(() => seedRbacRoles().catch((e) => console.warn("[db] rbac seed warning:", e.message)), 0);
}

async function seedRbacRoles(): Promise<void> {
  try {
    const { DEFAULT_ROLE_META: ROLE_META, DEFAULT_ROLE_PERMISSIONS: ROLE_PERMS, PERMISSION_CATALOG } = await import("./middleware/rbac");

    // Upsert all permissions (including new ones)
    for (const p of PERMISSION_CATALOG) {
      await pool.query(
        `INSERT INTO rbac_permissions (key, module, action, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET module=EXCLUDED.module, action=EXCLUDED.action, description=EXCLUDED.description`,
        [p.key, p.module, p.action, p.description],
      );
    }

    // Upsert all roles (including verification_admin)
    for (const r of ROLE_META) {
      await pool.query(
        `INSERT INTO admin_roles (name, display_name, description, is_system)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, description=EXCLUDED.description`,
        [r.name, r.displayName, r.description],
      );
    }

    // Upsert role-permission links for all roles
    for (const [roleName, perms] of Object.entries(ROLE_PERMS)) {
      const roleRow = await pool.query(`SELECT id FROM admin_roles WHERE name = $1`, [roleName]);
      if (!roleRow.rows[0]) continue;
      const roleId = roleRow.rows[0].id;
      for (const perm of perms) {
        await pool.query(
          `INSERT INTO role_permissions (role_id, permission_key)
           VALUES ($1, $2)
           ON CONFLICT (role_id, permission_key) DO NOTHING`,
          [roleId, perm],
        );
      }
    }
    console.log("[db] RBAC roles and permissions seeded");
  } catch (err: any) {
    console.warn("[db] rbac seed error:", err.message);
  }

  try {
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0`);
    console.log("[db] invoices reminder columns ready");
  } catch (err: any) {
    console.warn("[db] invoices reminder columns migration error:", err.message);
  }

  // Sprint C14.5 — Part 1: promo code base currency
  try {
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'USD'`);
    console.log("[db] promo_codes.base_currency column ready");
  } catch (err: any) {
    console.warn("[db] promo_codes.base_currency migration error:", err.message);
  }

  // Sprint C14.5 — Part 2: payout request immutable display snapshot
  try {
    await pool.query(`ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS display_currency TEXT`);
    await pool.query(`ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS display_amount DECIMAL(14,2)`);
    await pool.query(`ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(16,6)`);
    console.log("[db] payout_requests snapshot columns ready");
  } catch (err: any) {
    console.warn("[db] payout_requests snapshot migration error:", err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code TEXT NOT NULL,
        logo_url TEXT,
        company_name TEXT,
        company_address TEXT,
        tax_id TEXT,
        footer_text TEXT,
        color_scheme JSONB,
        is_default BOOLEAN NOT NULL DEFAULT true,
        updated_by VARCHAR REFERENCES users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (country_code, is_default)
      )
    `);
    console.log("[db] invoice_templates table ready");
  } catch (err: any) {
    console.warn("[db] invoice_templates migration error:", err.message);
  }

  // Sprint C15.6 — practitioners.business_name
  try {
    await pool.query(`ALTER TABLE practitioners ADD COLUMN IF NOT EXISTS business_name TEXT`);
    console.log("[db] practitioners.business_name column ready");
  } catch (err: any) {
    console.warn("[db] practitioners.business_name migration error:", err.message);
  }

  // Sprint C15.6 — users.profile_image_url (title-request metadata)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT`);
    console.log("[db] users.profile_image_url column ready");
  } catch (err: any) {
    console.warn("[db] users.profile_image_url migration error:", err.message);
  }

  // Sprint C15.1 — provider_office_hours.provider_id normalisation
  try {
    await pool.query(`ALTER TABLE provider_office_hours ADD COLUMN IF NOT EXISTS provider_id VARCHAR REFERENCES providers(id)`);
    console.log("[db] provider_office_hours.provider_id column ready");
  } catch (err: any) {
    console.warn("[db] provider_office_hours.provider_id migration error:", err.message);
  }

  // Sprint C16.0 — appointments.start_at / end_at as TIMESTAMPTZ for precise scheduling
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ`);
    console.log("[db] appointments.start_at / end_at columns ready");
  } catch (err: any) {
    console.warn("[db] appointments start_at/end_at migration error:", err.message);
  }

  // TZ Hardening Sprint — appointments.provider_timezone
  // Stores the IANA timezone of the provider at booking time. Used together with
  // start_at / end_at to label displayed times correctly for international patients.
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_timezone TEXT`);
    console.log("[db] appointments.provider_timezone column ready");
  } catch (err: any) {
    console.warn("[db] TZ Sprint provider_timezone:", err.message);
  }

  // [CONSOLIDATED] TZ backfill was here — removed after all rows confirmed populated.
  // All new appointments write start_at/end_at/provider_timezone at booking time.

  // Sprint C20.0 — OCC version column on time_slots for Optimistic Concurrency Control
  // Each successful reservation increments the version; a mismatched version on UPDATE
  // means another session claimed the slot between our SELECT FOR UPDATE and our write.
  try {
    await pool.query(`ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`);
    console.log("[db] time_slots.version column ready");
  } catch (err: any) {
    console.warn("[db] time_slots.version migration error:", err.message);
  }

  // Sprint C19.0 — appointment_consents: immutable cryptographic audit ledger
  // Written with raw SQL only (not added to Drizzle schema) per migration-pattern.md rule:
  // only add to Drizzle schema AFTER confirming the column exists in Supabase.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointment_consents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id VARCHAR NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consent_type TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_appt_consents_appointment
        ON appointment_consents(appointment_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_appt_consents_user
        ON appointment_consents(user_id)
    `);
    console.log("[db] appointment_consents audit ledger ready");
  } catch (err: any) {
    console.warn("[db] appointment_consents migration error:", err.message);
  }

  // ── Sprint C21.0 — Dynamic JSON-Schema Intake Forms ─────────────────────────
  // intake_schema on sub_services: admin-defined array of field descriptors.
  // intake_responses on appointments: patient answers at booking time.
  try {
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS intake_schema JSONB DEFAULT '[]'`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS intake_responses JSONB DEFAULT '{}'`);
    console.log("[db] intake_schema + intake_responses columns ready");
  } catch (err: any) {
    console.warn("[db] C21.0 intake schema migration error:", err.message);
  }

  // ── Sprint C21.0 — Administrative Provider Schedule Block-Out Overrides ─────
  // Admins can block any time window for a provider (e.g. maintenance, training).
  // Slot-holds and bookings check this table before accepting a slot.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_schedule_overrides (
        id           VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id  VARCHAR      NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        start_time   TIMESTAMPTZ  NOT NULL,
        end_time     TIMESTAMPTZ  NOT NULL,
        override_reason TEXT,
        created_by   VARCHAR      REFERENCES users(id),
        country_code TEXT,
        created_at   TIMESTAMP    DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedule_overrides_provider ON provider_schedule_overrides(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedule_overrides_time ON provider_schedule_overrides(start_time, end_time)`);
    // Backfill: add override_reason if the table was created without it
    await pool.query(`ALTER TABLE provider_schedule_overrides ADD COLUMN IF NOT EXISTS override_reason TEXT`);
    console.log("[db] provider_schedule_overrides table ready");
  } catch (err: any) {
    console.warn("[db] C21.0 schedule overrides migration error:", err.message);
  }

  // ── Sprint C21.0 — Multi-Location Room / Asset Allocation ───────────────────
  // clinic_rooms: physical rooms/assets a provider can allocate to appointments.
  // room_reservations: links a room to a specific appointment time window.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinic_rooms (
        id          VARCHAR  PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR  NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        name        TEXT     NOT NULL,
        location    TEXT,
        capacity    INTEGER  DEFAULT 1,
        is_active   BOOLEAN  DEFAULT true,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clinic_rooms_provider ON clinic_rooms(provider_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_reservations (
        id             VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id        VARCHAR     NOT NULL REFERENCES clinic_rooms(id) ON DELETE CASCADE,
        appointment_id VARCHAR     REFERENCES appointments(id) ON DELETE SET NULL,
        start_time     TIMESTAMPTZ NOT NULL,
        end_time       TIMESTAMPTZ NOT NULL,
        created_at     TIMESTAMP   DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_room_reservations_room ON room_reservations(room_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_room_reservations_appt ON room_reservations(appointment_id)`);
    console.log("[db] clinic_rooms + room_reservations tables ready");
  } catch (err: any) {
    console.warn("[db] C21.0 clinic rooms migration error:", err.message);
  }

  // ── Sprint C21.0 — Automated Multi-Currency Payout Contract Splits ───────────
  // fee_split_ratio on providers: contractual fraction (0–1) of totalAmount that
  // goes to the provider.  Defaults to 0.70 (70 % provider / 30 % platform).
  // recordProviderEarning() reads this to compute the exact split ledger entries.
  try {
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS fee_split_ratio DECIMAL(5,4) DEFAULT 0.7000`);
    console.log("[db] providers.fee_split_ratio column ready");
  } catch (err: any) {
    console.warn("[db] C21.0 fee_split_ratio migration error:", err.message);
  }

  // ── membership_benefit_usage — tracks per-appointment benefit consumption ────
  // Required by the package engine to deduct session credits and record which
  // benefit was consumed for each appointment. Missing from earlier migrations.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS membership_benefit_usage (
        id              VARCHAR       PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_package_id VARCHAR       NOT NULL REFERENCES user_packages(id) ON DELETE CASCADE,
        benefit_id      VARCHAR       REFERENCES package_benefits(id) ON DELETE SET NULL,
        benefit_type    VARCHAR(100),
        quantity        INTEGER       NOT NULL DEFAULT 1,
        description     TEXT,
        appointment_id  VARCHAR       REFERENCES appointments(id) ON DELETE SET NULL,
        created_at      TIMESTAMP     DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_benefit_usage_pkg ON membership_benefit_usage(user_package_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_benefit_usage_appt ON membership_benefit_usage(appointment_id)`);
    console.log("[db] membership_benefit_usage table ready");
  } catch (err: any) {
    console.warn("[db] membership_benefit_usage migration error:", err.message);
  }

  // ── platform_events — lightweight analytics event log ────────────────────────
  // Captures funnel events (search, booking_started, booking_completed, etc.)
  // for growth analytics without touching PII. Missing from earlier migrations.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_events (
        id               VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type       TEXT      NOT NULL,
        user_id          VARCHAR   REFERENCES users(id) ON DELETE SET NULL,
        country_code     TEXT,
        provider_id      VARCHAR   REFERENCES providers(id) ON DELETE SET NULL,
        service_category TEXT,
        service_mode     TEXT,
        metadata         TEXT,
        created_at       TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_platform_events_type    ON platform_events(event_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_platform_events_user    ON platform_events(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_platform_events_created ON platform_events(created_at)`);
    console.log("[db] platform_events table ready");
  } catch (err: any) {
    console.warn("[db] platform_events migration error:", err.message);
  }

  // ── marketplace_ledger — immutable double-entry financial ledger ─────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_ledger (
        id                  SERIAL        PRIMARY KEY,
        appointment_id      VARCHAR       REFERENCES appointments(id) ON DELETE CASCADE,
        source_account      VARCHAR(64)   NOT NULL,
        destination_account VARCHAR(64)   NOT NULL,
        amount_cents        INT           NOT NULL CHECK (amount_cents > 0),
        transaction_type    VARCHAR(64)   NOT NULL,
        status              VARCHAR(32)   NOT NULL DEFAULT 'PENDING',
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_appointment ON marketplace_ledger(appointment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_status      ON marketplace_ledger(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_dest        ON marketplace_ledger(destination_account)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_created     ON marketplace_ledger(created_at)`);
    // Multi-country tracking columns (idempotent)
    await pool.query(`ALTER TABLE marketplace_ledger ADD COLUMN IF NOT EXISTS currency_iso VARCHAR(3) NOT NULL DEFAULT 'USD'`);
    await pool.query(`ALTER TABLE marketplace_ledger ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT 'HU'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_country     ON marketplace_ledger(country_code)`);
    console.log("[db] marketplace_ledger table ready");
  } catch (err: any) {
    console.warn("[db] marketplace_ledger migration error:", err.message);
  }

  // ── provider_schedule_templates — weekly base templates for rolling cron ──────
  // Part 1: Smart Recurring Template Engine. Stores (provider_id, day_of_week,
  // start_time, end_time) rows that the rolling-schedule cron reads to auto-
  // generate time_slots 30 days ahead.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_schedule_templates (
        id                  VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id         VARCHAR   NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        day_of_week         INTEGER   NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time          TEXT      NOT NULL,
        end_time            TEXT      NOT NULL,
        slot_duration_mins  INTEGER   NOT NULL DEFAULT 30,
        buffer_before_mins  INTEGER   NOT NULL DEFAULT 0,
        buffer_after_mins   INTEGER   NOT NULL DEFAULT 0,
        is_active           BOOLEAN   NOT NULL DEFAULT TRUE,
        created_at          TIMESTAMP DEFAULT NOW(),
        updated_at          TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sched_tmpl_provider     ON provider_schedule_templates(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sched_tmpl_provider_day ON provider_schedule_templates(provider_id, day_of_week)`);
    console.log("[db] provider_schedule_templates table ready");
  } catch (err: any) {
    console.warn("[db] provider_schedule_templates migration error:", err.message);
  }

  // ── payments.appointment_id nullable — wallet top-ups have no appointment ──
  try {
    await pool.query(`ALTER TABLE payments ALTER COLUMN appointment_id DROP NOT NULL`);
    console.log("[db] payments.appointment_id nullable (wallet topup bridge ready)");
  } catch (err: any) {
    console.warn("[db] payments nullable appointmentId (may already be nullable):", err.message);
  }

  // ── rate_limit_hits — persistent DB-backed store for express-rate-limit ───
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_hits (
        key      VARCHAR(512) PRIMARY KEY,
        hits     INTEGER      NOT NULL DEFAULT 1,
        reset_at TIMESTAMPTZ  NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ratelimit_reset_at ON rate_limit_hits(reset_at)`);
    console.log("[db] rate_limit_hits table ready");
  } catch (err: any) {
    console.warn("[db] rate_limit_hits migration:", err.message);
  }

  // ── reconciliation_results — hourly financial consistency audit findings ──
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_results (
        id           VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        check_type   VARCHAR(64) NOT NULL,
        severity     VARCHAR(16) NOT NULL DEFAULT 'ok',
        entity_type  VARCHAR(64),
        entity_id    VARCHAR,
        message      TEXT        NOT NULL,
        details      JSONB,
        country_code VARCHAR(2),
        resolved_at  TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reconcil_run_at  ON reconciliation_results(run_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reconcil_severity ON reconciliation_results(severity, run_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reconcil_entity   ON reconciliation_results(entity_type, entity_id)`);
    console.log("[db] reconciliation_results table ready");
  } catch (err: any) {
    console.warn("[db] reconciliation_results migration:", err.message);
  }

  // ── Performance indexes (Sprint Phase 1 — Enterprise Infrastructure) ──────
  const perfIndexes: [string, string][] = [
    ["idx_payments_status",        "CREATE INDEX IF NOT EXISTS idx_payments_status      ON payments(status)"],
    ["idx_payments_patient_id",    "CREATE INDEX IF NOT EXISTS idx_payments_patient_id  ON payments(patient_id)"],
    ["idx_payments_created_at",    "CREATE INDEX IF NOT EXISTS idx_payments_created_at  ON payments(created_at DESC)"],
    ["idx_tickets_status",         "CREATE INDEX IF NOT EXISTS idx_tickets_status        ON support_tickets(status)"],
    ["idx_tickets_user_id",        "CREATE INDEX IF NOT EXISTS idx_tickets_user_id       ON support_tickets(user_id)"],
    ["idx_tickets_created_at",     "CREATE INDEX IF NOT EXISTS idx_tickets_created_at    ON support_tickets(created_at DESC)"],
    ["idx_ndl_created_at",         "CREATE INDEX IF NOT EXISTS idx_ndl_created_at         ON notification_delivery_logs(created_at DESC)"],
    ["idx_ndl_status",             "CREATE INDEX IF NOT EXISTS idx_ndl_status              ON notification_delivery_logs(status)"],
    ["idx_appointments_start_at",  "CREATE INDEX IF NOT EXISTS idx_appointments_start_at  ON appointments(start_at)"],
  ];
  for (const [name, sql] of perfIndexes) {
    await pool.query(sql).catch((e: any) =>
      console.warn(`[db] perf index ${name}:`, e.message),
    );
  }
  console.log("[db] performance indexes applied");

  // ── login_attempts — brute-force / credential-stuffing tracking ───────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id           SERIAL      PRIMARY KEY,
        email        VARCHAR     NOT NULL,
        ip_address   VARCHAR     NOT NULL DEFAULT '',
        success      BOOLEAN     NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_email      ON login_attempts(email, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip         ON login_attempts(ip_address, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_cleanup    ON login_attempts(created_at)`);
    console.log("[db] login_attempts table ready");
  } catch (err: any) {
    console.warn("[db] login_attempts migration:", err.message);
  }

  // ── password_history — future reuse-prevention framework ──────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_history (
        id           VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        password_hash VARCHAR    NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pwd_history_user ON password_history(user_id, created_at DESC)`);
    console.log("[db] password_history table ready");
  } catch (err: any) {
    console.warn("[db] password_history migration:", err.message);
  }

  // ── monitoring_daily_summary — persistent daily request metrics ───────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS monitoring_daily_summary (
        id              VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_date   DATE        NOT NULL,
        total_requests  BIGINT      NOT NULL DEFAULT 0,
        errors_4xx      BIGINT      NOT NULL DEFAULT 0,
        errors_5xx      BIGINT      NOT NULL DEFAULT 0,
        slow_requests   BIGINT      NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(snapshot_date)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mon_daily_date ON monitoring_daily_summary(snapshot_date DESC)`);
    console.log("[db] monitoring_daily_summary table ready");
  } catch (err: any) {
    console.warn("[db] monitoring_daily_summary migration:", err.message);
  }

  // ── monitoring_endpoint_stats — per-route trend snapshots ─────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS monitoring_endpoint_stats (
        id              VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_date   DATE        NOT NULL,
        route           VARCHAR(256) NOT NULL,
        total_requests  BIGINT      NOT NULL DEFAULT 0,
        avg_ms          INTEGER     NOT NULL DEFAULT 0,
        max_ms          INTEGER     NOT NULL DEFAULT 0,
        errors_4xx      BIGINT      NOT NULL DEFAULT 0,
        errors_5xx      BIGINT      NOT NULL DEFAULT 0,
        slow_hits       BIGINT      NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mon_endpoint_date  ON monitoring_endpoint_stats(snapshot_date DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mon_endpoint_route ON monitoring_endpoint_stats(route, snapshot_date DESC)`);
    console.log("[db] monitoring_endpoint_stats table ready");
  } catch (err: any) {
    console.warn("[db] monitoring_endpoint_stats migration:", err.message);
  }

  // ── financial_alerts — anomaly alert records from reconciliation ──────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_alerts (
        id                          VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        check_type                  VARCHAR(64) NOT NULL,
        severity                    VARCHAR(16) NOT NULL DEFAULT 'warning',
        entity_type                 VARCHAR(64),
        entity_id                   VARCHAR,
        message                     TEXT        NOT NULL,
        details                     JSONB,
        country_code                VARCHAR(2),
        status                      VARCHAR(16) NOT NULL DEFAULT 'open',
        source_reconciliation_id    VARCHAR     REFERENCES reconciliation_results(id) ON DELETE SET NULL,
        acknowledged_at             TIMESTAMPTZ,
        acknowledged_by             VARCHAR     REFERENCES users(id) ON DELETE SET NULL,
        resolved_at                 TIMESTAMPTZ,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_alerts_status   ON financial_alerts(status, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_alerts_severity ON financial_alerts(severity, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_alerts_country  ON financial_alerts(country_code, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_alerts_recon    ON financial_alerts(source_reconciliation_id)`);
    console.log("[db] financial_alerts table ready");
  } catch (err: any) {
    console.warn("[db] financial_alerts migration:", err.message);
  }

  // ── financial_alerts Phase 2.5: dedup columns + missing indexes ───────────
  // Adds alert_fingerprint (deterministic dedup key), occurrence tracking,
  // and first/last detected timestamps. Also adds missing check_type index.
  try {
    await pool.query(`ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS details JSONB`);
    await pool.query(`ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS alert_fingerprint VARCHAR(512) NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await pool.query(`ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await pool.query(`ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS occurrence_count  INTEGER      NOT NULL DEFAULT 1`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_alerts_fingerprint ON financial_alerts(alert_fingerprint, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_alerts_check_type  ON financial_alerts(check_type, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_alerts_last_det    ON financial_alerts(last_detected_at DESC)`);
    console.log("[db] financial_alerts dedup columns + indexes ready");
  } catch (err: any) {
    console.warn("[db] financial_alerts dedup migration:", err.message);
  }

  // ── reconciliation_results: missing check_type index ──────────────────────
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reconcil_check_type ON reconciliation_results(check_type, severity)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reconcil_country    ON reconciliation_results(country_code, run_at DESC)`);
    console.log("[db] reconciliation_results additional indexes ready");
  } catch (err: any) {
    console.warn("[db] reconciliation_results extra indexes:", err.message);
  }

  // ── monitoring_daily_summary: missing updated_at column (idempotent) ──────
  try {
    await pool.query(`ALTER TABLE monitoring_daily_summary ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    console.log("[db] monitoring_daily_summary updated_at column ready");
  } catch (err: any) {
    console.warn("[db] monitoring_daily_summary updated_at:", err.message);
  }

  // ── login_attempts cleanup index (Section B validation) ───────────────────
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, success, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time    ON login_attempts(ip_address, success, created_at DESC)`);
    console.log("[db] login_attempts composite indexes ready");
  } catch (err: any) {
    console.warn("[db] login_attempts indexes:", err.message);
  }

  // ── Clinical Workspace — appointments outcome & follow-up columns ──────────
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS outcome_note TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS follow_up_recommended BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS referral_needed BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS follow_up_recommended_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS intake_responses JSONB`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_followup ON appointments(follow_up_recommended_at DESC NULLS LAST) WHERE follow_up_recommended_at IS NOT NULL`);
    console.log("[db] clinical workspace appointment columns ready");
  } catch (err: any) {
    console.warn("[db] clinical workspace appointment columns:", err.message);
  }

  // ── Clinical Workspace — patient_notes table ───────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_notes (
        id            VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id   VARCHAR     NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        patient_id    VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        appointment_id VARCHAR,
        content       TEXT        NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_patient_notes_provider_patient ON patient_notes(provider_id, patient_id)`);
    console.log("[db] patient_notes table ready");
  } catch (err: any) {
    console.warn("[db] patient_notes migration:", err.message);
  }

  // ── Clinical Sprint: outcome_updated action in appointment_action enum ─────
  // Required for PATCH /api/appointments/:id/outcome → appointment_events INSERT
  try {
    await pool.query(`ALTER TYPE appointment_action ADD VALUE IF NOT EXISTS 'outcome_updated'`);
    console.log("[db] appointment_action enum: outcome_updated ready");
  } catch (err: any) {
    console.warn("[db] appointment_action outcome_updated:", err.message);
  }

  // ── Reschedule Proposal Sprint: propose + reschedule_response enum values ──
  // "propose" = provider proposes a new time (reschedule_proposed status)
  // "reschedule_response" = patient accepts or rejects the proposal
  try {
    await pool.query(`ALTER TYPE appointment_action ADD VALUE IF NOT EXISTS 'propose'`);
    await pool.query(`ALTER TYPE appointment_action ADD VALUE IF NOT EXISTS 'reschedule_response'`);
    console.log("[db] appointment_action enum: propose + reschedule_response ready");
  } catch (err: any) {
    console.warn("[db] appointment_action propose/reschedule_response:", err.message);
  }

  // ── Phase C: payments.refund_status guard column ─────────────────────────
  // Used by the Stripe refund duplicate-prevention guard. Separate from
  // appointments.refund_status (which tracks the appointment-level state).
  try {
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_refund_status ON payments(refund_status) WHERE refund_status IS NOT NULL`);
    console.log("[db] payments.refund_status ready");
  } catch (err: any) {
    console.warn("[db] payments.refund_status migration:", err.message);
  }

  // ── Phase C: appointments.video_room_url column ───────────────────────────
  // Stores the Daily.co (or other provider) room URL for telemedicine visits.
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS video_room_url TEXT`);
    console.log("[db] appointments.video_room_url ready");
  } catch (err: any) {
    console.warn("[db] appointments.video_room_url migration:", err.message);
  }

  // ── Phase C: appointments.google_calendar_event_id column ─────────────────
  // Google Calendar event ID stored per-appointment for calendar sync.
  // Column is in Drizzle schema but lacked an explicit startup migration.
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT`);
    console.log("[db] appointments.google_calendar_event_id ready");
  } catch (err: any) {
    console.warn("[db] appointments.google_calendar_event_id migration:", err.message);
  }

  // ── Phase D: Location Intelligence — users location enrichment ─────────────
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS place_id TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS formatted_address TEXT`);
    console.log("[db] users location columns ready");
  } catch (err: any) {
    console.warn("[db] Phase D users location:", err.message);
  }

  // ── Phase D: Location Intelligence — providers clinic address & home visit ─
  try {
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_address_line1 TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_address_line2 TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_postal_code TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_formatted_address TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_place_id TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS home_visit_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS max_travel_distance_km INTEGER`);
    console.log("[db] providers clinic/home-visit columns ready");
  } catch (err: any) {
    console.warn("[db] Phase D providers location:", err.message);
  }

  // ── Phase D: Location Intelligence — family_members address fields ──────────
  try {
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS address_line1 TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS address_line2 TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS city TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS state TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS postal_code TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS country TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS formatted_address TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS place_id TEXT`);
    await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS use_parent_address BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log("[db] family_members address columns ready");
  } catch (err: any) {
    console.warn("[db] Phase D family_members location:", err.message);
  }

  // ── Phase D: Location Intelligence — saved_addresses table ─────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_addresses (
        id                VARCHAR       PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           VARCHAR       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nickname          TEXT          NOT NULL DEFAULT 'Home',
        address_line1     TEXT,
        address_line2     TEXT,
        city              TEXT,
        state             TEXT,
        postal_code       TEXT,
        country           TEXT,
        latitude          DOUBLE PRECISION,
        longitude         DOUBLE PRECISION,
        formatted_address TEXT,
        place_id          TEXT,
        is_default        BOOLEAN       NOT NULL DEFAULT FALSE,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_saved_addresses_user_id ON saved_addresses(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_saved_addresses_default ON saved_addresses(user_id, is_default) WHERE is_default = TRUE`);
    console.log("[db] saved_addresses table ready");
  } catch (err: any) {
    console.warn("[db] Phase D saved_addresses:", err.message);
  }

  // ── Phase D: Location Analytics — bookings_by_city view ──────────────────
  try {
    await pool.query(`
      CREATE OR REPLACE VIEW v_bookings_by_city AS
      SELECT
        COALESCE(a.patient_address, u.city, 'Unknown') AS city_label,
        a.country_code,
        COUNT(*) AS booking_count,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
      FROM appointments a
      LEFT JOIN users u ON u.id = a.patient_id
      GROUP BY COALESCE(a.patient_address, u.city, 'Unknown'), a.country_code
    `);
    console.log("[db] v_bookings_by_city view ready");
  } catch (err: any) {
    console.warn("[db] Phase D v_bookings_by_city:", err.message);
  }

  // ── KYC E1: Mobile verification columns on users ─────────────────────────
  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS mobile_verified BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS mobile_verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS mobile_verification_status TEXT NOT NULL DEFAULT 'unverified',
        ADD COLUMN IF NOT EXISTS mobile_verification_attempts INTEGER NOT NULL DEFAULT 0
    `);
    console.log("[db] mobile verification columns on users ready");
  } catch (err: any) {
    console.warn("[db] KYC E1 mobile verification columns:", err.message);
  }

  // ── KYC E2: Resubmission tracking columns on providers ──────────────────
  try {
    await pool.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_resubmitted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS profile_updated_after_submission BOOLEAN NOT NULL DEFAULT FALSE
    `);
    console.log("[db] resubmission tracking columns on providers ready");
  } catch (err: any) {
    console.warn("[db] KYC E2 resubmission tracking columns:", err.message);
  }

  // ── providers.updated_at column (DDL — required before any status update) ─
  try {
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    console.log("[db] providers.updated_at column ready");
  } catch (err: any) {
    console.warn("[db] providers.updated_at migration error:", err.message);
  }

  // ── Add modality column to provider_schedule_templates (DDL) ─────────────
  try {
    await pool.query(`
      ALTER TABLE provider_schedule_templates
        ADD COLUMN IF NOT EXISTS modality TEXT DEFAULT NULL
    `);
    console.log("[db] provider_schedule_templates.modality column ensured");
  } catch (err: any) {
    console.warn("[db] provider_schedule_templates modality column:", err.message);
  }

  // ── provider_admin_notes ──────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_admin_notes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        is_pinned BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pan_provider ON provider_admin_notes(provider_id, created_at DESC)`);
    // Ensure all expected columns exist (table may have been created in an earlier session with a different schema)
    await pool.query(`ALTER TABLE provider_admin_notes ADD COLUMN IF NOT EXISTS admin_id TEXT`);
    await pool.query(`ALTER TABLE provider_admin_notes ADD COLUMN IF NOT EXISTS content TEXT`);
    await pool.query(`ALTER TABLE provider_admin_notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE provider_admin_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    // Ensure id column has a default so INSERT without specifying id works
    await pool.query(`ALTER TABLE provider_admin_notes ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`).catch(() => {});
    await pool.query(`ALTER TABLE provider_admin_notes ALTER COLUMN id SET DEFAULT gen_random_uuid()`).catch(() => {});
    console.log("[db] provider_admin_notes table ready");
  } catch (err: any) {
    console.warn("[db] provider_admin_notes:", err.message);
  }

  // ── Phase 6: Performance hardening indexes ────────────────────────────────
  // Covers hot query paths: notification listing, audit log lookups,
  // appointment timelines, message pagination, ledger history.
  const p6Indexes: Array<[string, string]> = [
    ["idx_user_notif_user_created",          `CREATE INDEX IF NOT EXISTS idx_user_notif_user_created ON user_notifications(user_id, created_at DESC)`],
    ["idx_audit_logs_user_created",          `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC)`],
    ["idx_audit_logs_entity",                `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`],
    ["idx_appointments_patient_time",        `CREATE INDEX IF NOT EXISTS idx_appointments_patient_time ON appointments(patient_id, created_at DESC)`],
    ["idx_appointments_provider_time",       `CREATE INDEX IF NOT EXISTS idx_appointments_provider_time ON appointments(provider_id, created_at DESC)`],
    ["idx_realtime_msgs_created",            `CREATE INDEX IF NOT EXISTS idx_realtime_msgs_created ON realtime_messages(conversation_id, created_at DESC)`],
    ["idx_convos_participants",              `CREATE INDEX IF NOT EXISTS idx_convos_participants ON chat_conversations(patient_id, provider_id)`],
    ["idx_provider_ledger_provider_created", `CREATE INDEX IF NOT EXISTS idx_provider_ledger_provider_created ON provider_ledger(provider_id, created_at DESC)`],
    ["idx_wallet_txns_wallet_created",       `CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet_created ON wallet_transactions(wallet_id, created_at DESC)`],
    ["idx_system_events_country_created",    `CREATE INDEX IF NOT EXISTS idx_system_events_country_created ON system_events(country_code, created_at DESC) WHERE country_code IS NOT NULL`],
    // Missing indexes identified in forensic audit (June 2026)
    ["idx_appointments_date",               `CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)`],
    ["idx_appointments_provider_date",      `CREATE INDEX IF NOT EXISTS idx_appointments_provider_date ON appointments(provider_id, date)`],
    ["idx_mkt_ledger_appt_type_status",     `CREATE INDEX IF NOT EXISTS idx_mkt_ledger_appt_type_status ON marketplace_ledger(appointment_id, transaction_type, status)`],
    ["idx_payments_appointment_id",         `CREATE INDEX IF NOT EXISTS idx_payments_appointment_id ON payments(appointment_id) WHERE appointment_id IS NOT NULL`],
    ["idx_waitlist_provider_date_status",   `CREATE INDEX IF NOT EXISTS idx_waitlist_provider_date_status ON waitlist_entries(provider_id, preferred_date, status)`],
  ];
  for (const [name, sql] of p6Indexes) {
    try { await pool.query(sql); }
    catch (e) { console.warn(`[db] Phase 6 index ${name}:`, (e as Error).message); }
  }
  console.log("[db] performance hardening indexes ready");

  // ── payment_providers: admin-controlled payment gateway registry ──────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_providers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_key VARCHAR NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        is_enabled BOOLEAN NOT NULL DEFAULT false,
        environment VARCHAR NOT NULL DEFAULT 'production',
        priority INTEGER NOT NULL DEFAULT 100,
        country_codes TEXT[],
        currency_codes TEXT[],
        credentials JSONB DEFAULT '{}',
        feature_flags JSONB DEFAULT '{}',
        maintenance_mode BOOLEAN NOT NULL DEFAULT false,
        health_status VARCHAR NOT NULL DEFAULT 'unknown',
        last_health_check TIMESTAMPTZ,
        last_test_result JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payment_providers_enabled ON payment_providers(is_enabled, priority)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payment_providers_key ON payment_providers(provider_key)`);

    const seed = [
      { key: 'wallet',        name: 'Wallet',          descr: 'In-app wallet balance — instant payment',            enabled: true,  prio: 10, countries: null,           env: 'production' },
      { key: 'cash',          name: 'Cash',             descr: 'Pay at appointment — provider confirms receipt',      enabled: true,  prio: 20, countries: null,           env: 'production' },
      { key: 'bank_transfer', name: 'Bank Transfer',    descr: 'Direct bank transfer — confirmed after verification', enabled: true,  prio: 30, countries: null,           env: 'production' },
      { key: 'stripe',        name: 'Stripe',           descr: 'Credit / debit card via Stripe checkout',            enabled: true,  prio: 40, countries: null,           env: 'production' },
      { key: 'razorpay',      name: 'Razorpay',         descr: 'Card, UPI, and netbanking for Indian users',          enabled: false, prio: 50, countries: ['IN'],         env: 'sandbox'    },
      { key: 'paypal',        name: 'PayPal',           descr: 'PayPal checkout (international)',                     enabled: false, prio: 60, countries: null,           env: 'sandbox'    },
      { key: 'crypto',        name: 'Crypto Wallet',    descr: 'Cryptocurrency payments — future implementation',     enabled: false, prio: 70, countries: null,           env: 'sandbox'    },
      { key: 'apple_pay',     name: 'Apple Pay',        descr: 'Apple Pay via Stripe (iOS Safari)',                   enabled: false, prio: 80, countries: null,           env: 'sandbox'    },
      { key: 'google_pay',    name: 'Google Pay',       descr: 'Google Pay via Stripe (Android/Chrome)',              enabled: false, prio: 90, countries: null,           env: 'sandbox'    },
    ];

    for (const p of seed) {
      await pool.query(`
        INSERT INTO payment_providers (provider_key, display_name, description, is_enabled, environment, priority, country_codes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (provider_key) DO NOTHING
      `, [p.key, p.name, p.descr, p.enabled, p.env, p.prio, p.countries]);
    }
    console.log('[db] payment_providers table ready + seeded');
  } catch (err: any) {
    console.warn('[db] payment_providers:', err.message);
  }

  // ── Revenue & Billing Center — Rule Engine Tables [SCHEMA-SETUP] ──────────
  // Sprint: Revenue-Billing Architecture Migration
  // Creates all 7 rule tables that power the unified RevenueEngine.
  // Each table in its own try-catch so one failure doesn't block the rest.

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_fee_rules (
        id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name            TEXT NOT NULL,
        description     TEXT,
        enabled         BOOLEAN NOT NULL DEFAULT true,
        priority        INTEGER NOT NULL DEFAULT 100,
        fee_type        TEXT NOT NULL DEFAULT 'percent',
        percent_value   NUMERIC(8,4) DEFAULT 0,
        fixed_amount    NUMERIC(10,2) DEFAULT 0,
        min_fee         NUMERIC(10,2),
        max_fee         NUMERIC(10,2),
        target_scope    TEXT NOT NULL DEFAULT 'global',
        country_code    TEXT,
        provider_type   TEXT,
        service_category TEXT,
        modality        TEXT,
        effective_from  TIMESTAMPTZ,
        effective_to    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[db] platform_fee_rules table ready');
  } catch (err: any) {
    console.warn('[db] platform_fee_rules:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name                TEXT NOT NULL,
        description         TEXT,
        enabled             BOOLEAN NOT NULL DEFAULT true,
        priority            INTEGER NOT NULL DEFAULT 100,
        commission_type     TEXT NOT NULL DEFAULT 'global',
        commission_percent  NUMERIC(8,4) NOT NULL DEFAULT 10,
        fixed_amount        NUMERIC(10,2) DEFAULT 0,
        provider_id         VARCHAR,
        provider_type       TEXT,
        service_category    TEXT,
        tier                TEXT,
        country_code        TEXT,
        effective_from      TIMESTAMPTZ,
        effective_to        TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[db] commission_rules table ready');
  } catch (err: any) {
    console.warn('[db] commission_rules:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_method_rules (
        id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        payment_method      TEXT NOT NULL UNIQUE,
        label               TEXT NOT NULL,
        enabled             BOOLEAN NOT NULL DEFAULT true,
        maintenance_mode    BOOLEAN NOT NULL DEFAULT false,
        surcharge_type      TEXT NOT NULL DEFAULT 'none',
        surcharge_value     NUMERIC(8,4) DEFAULT 0,
        discount_type       TEXT NOT NULL DEFAULT 'none',
        discount_value      NUMERIC(8,4) DEFAULT 0,
        allowed_countries   TEXT[],
        allowed_currencies  TEXT[],
        priority            INTEGER NOT NULL DEFAULT 100,
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[db] payment_method_rules table ready');
  } catch (err: any) {
    console.warn('[db] payment_method_rules:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS travel_fee_rules (
        id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name              TEXT NOT NULL,
        description       TEXT,
        enabled           BOOLEAN NOT NULL DEFAULT true,
        priority          INTEGER NOT NULL DEFAULT 100,
        fee_type          TEXT NOT NULL DEFAULT 'flat',
        flat_amount       NUMERIC(10,2) DEFAULT 0,
        per_km_rate       NUMERIC(8,4) DEFAULT 0,
        min_distance_km   NUMERIC(8,2),
        max_distance_km   NUMERIC(8,2),
        radius_km         NUMERIC(8,2),
        zone_definition   JSONB,
        country_code      TEXT,
        provider_type     TEXT,
        effective_from    TIMESTAMPTZ,
        effective_to      TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[db] travel_fee_rules table ready');
  } catch (err: any) {
    console.warn('[db] travel_fee_rules:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payout_config (
        id                          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name                        TEXT NOT NULL,
        description                 TEXT,
        enabled                     BOOLEAN NOT NULL DEFAULT true,
        schedule                    TEXT NOT NULL DEFAULT 'weekly',
        reserve_percent             NUMERIC(8,4) DEFAULT 0,
        holdback_percent            NUMERIC(8,4) DEFAULT 0,
        refund_protection_percent   NUMERIC(8,4) DEFAULT 5,
        min_payout_amount           NUMERIC(10,2) DEFAULT 10,
        max_payout_amount           NUMERIC(10,2),
        country_code                TEXT,
        provider_type               TEXT,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[db] payout_config table ready');
  } catch (err: any) {
    console.warn('[db] payout_config:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS revenue_share_rules (
        id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name              TEXT NOT NULL,
        description       TEXT,
        enabled           BOOLEAN NOT NULL DEFAULT true,
        priority          INTEGER NOT NULL DEFAULT 100,
        participant_type  TEXT NOT NULL DEFAULT 'platform',
        share_percent     NUMERIC(8,4) NOT NULL DEFAULT 0,
        fixed_amount      NUMERIC(10,2) DEFAULT 0,
        country_code      TEXT,
        provider_type     TEXT,
        service_category  TEXT,
        effective_from    TIMESTAMPTZ,
        effective_to      TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[db] revenue_share_rules table ready');
  } catch (err: any) {
    console.warn('[db] revenue_share_rules:', err.message);
  }

  // ── Sprint RX-01: Revenue Engine financial snapshot columns on appointments ──
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS commission_rate              NUMERIC(8,4)  DEFAULT 0`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS commission_amount            NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_earnings_snapshot  NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_surcharge_amount    NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS travel_fee_snapshot         NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS platform_revenue_snapshot   NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS platform_fee_amount         NUMERIC(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS re_applied_rules            JSONB`);
    console.log('[db] appointment financial snapshot columns ready');
  } catch (err: any) {
    console.warn('[db] Sprint RX-01 appointment columns:', err.message);
  }

  // ── Sprint RX-01: booking_revenue_shares persistence table ─────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_revenue_shares (
        id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        appointment_id   VARCHAR NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        participant_type TEXT NOT NULL,
        label            TEXT NOT NULL,
        amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
        percent          NUMERIC(8,4)  NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_booking_revenue_shares_appt ON booking_revenue_shares(appointment_id)`);
    console.log('[db] booking_revenue_shares table ready');
  } catch (err: any) {
    console.warn('[db] Sprint RX-01 booking_revenue_shares:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_rules (
        id                          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        credit_type                 TEXT NOT NULL UNIQUE,
        label                       TEXT NOT NULL,
        enabled                     BOOLEAN NOT NULL DEFAULT true,
        max_balance_usd             NUMERIC(10,2),
        expiry_days                 INTEGER,
        can_combine_with_promo      BOOLEAN NOT NULL DEFAULT true,
        can_combine_with_membership BOOLEAN NOT NULL DEFAULT true,
        min_transaction_amount      NUMERIC(10,2) DEFAULT 0,
        country_code                TEXT,
        notes                       TEXT,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[db] wallet_rules table ready');
  } catch (err: any) {
    console.warn('[db] wallet_rules:', err.message);
  }

  // ── Seed default payment method rules (idempotent) ─────────────────────────
  try {
    const defaultPaymentMethods = [
      { method: 'cash',          label: 'Cash',          surchargeType: 'none', surchargeValue: 0, discountType: 'none', discountValue: 0, priority: 10 },
      { method: 'bank_transfer', label: 'Bank Transfer',  surchargeType: 'none', surchargeValue: 0, discountType: 'none', discountValue: 0, priority: 20 },
      { method: 'wallet',        label: 'Wallet Credits', surchargeType: 'none', surchargeValue: 0, discountType: 'percent', discountValue: 2, priority: 30 },
      { method: 'card',          label: 'Credit/Debit Card', surchargeType: 'percent', surchargeValue: 3, discountType: 'none', discountValue: 0, priority: 40 },
      { method: 'stripe',        label: 'Stripe',         surchargeType: 'percent', surchargeValue: 3, discountType: 'none', discountValue: 0, priority: 50 },
      { method: 'crypto',        label: 'Crypto',         surchargeType: 'percent', surchargeValue: 1, discountType: 'none', discountValue: 0, priority: 60 },
      { method: 'paypal',        label: 'PayPal',         surchargeType: 'percent', surchargeValue: 2, discountType: 'none', discountValue: 0, priority: 70 },
      { method: 'apple_pay',     label: 'Apple Pay',      surchargeType: 'none', surchargeValue: 0, discountType: 'none', discountValue: 0, priority: 80 },
      { method: 'google_pay',    label: 'Google Pay',     surchargeType: 'none', surchargeValue: 0, discountType: 'none', discountValue: 0, priority: 90 },
    ];
    for (const pm of defaultPaymentMethods) {
      await pool.query(`
        INSERT INTO payment_method_rules
          (payment_method, label, enabled, surcharge_type, surcharge_value, discount_type, discount_value, priority)
        VALUES ($1, $2, true, $3, $4, $5, $6, $7)
        ON CONFLICT (payment_method) DO NOTHING
      `, [pm.method, pm.label, pm.surchargeType, pm.surchargeValue, pm.discountType, pm.discountValue, pm.priority]);
    }
    console.log('[db] payment_method_rules seeded with defaults');
  } catch (err: any) {
    console.warn('[db] payment_method_rules seed:', err.message);
  }

  // ── Seed default wallet rules ──────────────────────────────────────────────
  try {
    const walletDefaults = [
      { creditType: 'wallet_credit',      label: 'Wallet Credits',      expiryDays: null },
      { creditType: 'gift_card',          label: 'Gift Card',           expiryDays: 365  },
      { creditType: 'referral_credit',    label: 'Referral Reward',     expiryDays: 180  },
      { creditType: 'refund_credit',      label: 'Refund Credit',       expiryDays: null },
      { creditType: 'promotional_credit', label: 'Promotional Credit',  expiryDays: 90   },
    ];
    for (const w of walletDefaults) {
      await pool.query(`
        INSERT INTO wallet_rules (credit_type, label, expiry_days)
        VALUES ($1, $2, $3)
        ON CONFLICT (credit_type) DO NOTHING
      `, [w.creditType, w.label, w.expiryDays]);
    }
    console.log('[db] wallet_rules defaults seeded');
  } catch (err: any) {
    console.warn('[db] wallet_rules seed:', err.message);
  }

  console.log('[db] Revenue & Billing Center schema ready');

  // ── P1: MFA / Two-Factor Authentication ──────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mfa_secrets (
        user_id     VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        secret      TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        setup_completed       BOOLEAN NOT NULL DEFAULT false,
        backup_codes_generated BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mfa_secrets_enabled ON mfa_secrets(user_id) WHERE enabled = true`);
    console.log('[db] mfa_secrets table ready');
  } catch (err: any) { console.warn('[db] mfa_secrets:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
        id        VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id   VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used      BOOLEAN NOT NULL DEFAULT false,
        used_at   TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON mfa_recovery_codes(user_id, used)`);
    console.log('[db] mfa_recovery_codes table ready');
  } catch (err: any) { console.warn('[db] mfa_recovery_codes:', err.message); }

  // ── P1: Stripe Connect Architecture ──────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_stripe_accounts (
        id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id         VARCHAR NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
        stripe_account_id   TEXT,
        account_type        VARCHAR NOT NULL DEFAULT 'express',
        onboarding_complete BOOLEAN NOT NULL DEFAULT false,
        charges_enabled     BOOLEAN NOT NULL DEFAULT false,
        payouts_enabled     BOOLEAN NOT NULL DEFAULT false,
        details_submitted   BOOLEAN NOT NULL DEFAULT false,
        requirements_due    JSONB DEFAULT '[]',
        requirements_errors JSONB DEFAULT '[]',
        country             VARCHAR,
        currency            VARCHAR,
        onboarding_url      TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_psa_provider ON provider_stripe_accounts(provider_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_psa_stripe_account ON provider_stripe_accounts(stripe_account_id) WHERE stripe_account_id IS NOT NULL`);
    console.log('[db] provider_stripe_accounts table ready');
  } catch (err: any) { console.warn('[db] provider_stripe_accounts:', err.message); }

  // ── P1: Payout Schedules (Automated Payouts) ─────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payout_schedules (
        provider_id         VARCHAR PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
        schedule_type       VARCHAR NOT NULL DEFAULT 'manual',
        minimum_amount_usd  NUMERIC NOT NULL DEFAULT 25,
        hold_days           INTEGER NOT NULL DEFAULT 3,
        enabled             BOOLEAN NOT NULL DEFAULT true,
        next_payout_at      TIMESTAMPTZ,
        last_payout_at      TIMESTAMPTZ,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_schedules_enabled ON payout_schedules(enabled, next_payout_at) WHERE enabled = true`);
    console.log('[db] payout_schedules table ready');
  } catch (err: any) { console.warn('[db] payout_schedules:', err.message); }

  // ── P1: payout_requests: add stripe_transfer_id + payout_batch_id columns ───
  try {
    await pool.query(`ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT`);
    await pool.query(`ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS payout_batch_id TEXT`);
    await pool.query(`ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS payment_method VARCHAR DEFAULT 'manual'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_req_batch ON payout_requests(payout_batch_id) WHERE payout_batch_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_payout_req_transfer ON payout_requests(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL`);
    console.log('[db] payout_requests P1 columns ready');
  } catch (err: any) { console.warn('[db] payout_requests P1 columns:', err.message); }

  // ── P3: Clinical Workspace Completion ─────────────────────────────────────

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS soap_notes (
        id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        patient_id  VARCHAR NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
        appointment_id VARCHAR REFERENCES appointments(id)    ON DELETE SET NULL,
        subjective  TEXT,
        objective   TEXT,
        assessment  TEXT,
        plan        TEXT,
        version     INTEGER NOT NULL DEFAULT 1,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_soap_notes_patient  ON soap_notes(patient_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_soap_notes_provider ON soap_notes(provider_id, patient_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_soap_notes_appt     ON soap_notes(appointment_id) WHERE appointment_id IS NOT NULL`);
    console.log('[db] soap_notes ready');
  } catch (err: any) { console.warn('[db] P3 soap_notes:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS soap_note_versions (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        soap_note_id VARCHAR NOT NULL REFERENCES soap_notes(id) ON DELETE CASCADE,
        version      INTEGER NOT NULL,
        subjective   TEXT,
        objective    TEXT,
        assessment   TEXT,
        plan         TEXT,
        edited_by    VARCHAR NOT NULL REFERENCES users(id),
        edited_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_soap_versions_note ON soap_note_versions(soap_note_id, version DESC)`);
    console.log('[db] soap_note_versions ready');
  } catch (err: any) { console.warn('[db] P3 soap_note_versions:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diagnoses (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id     VARCHAR NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
        provider_id    VARCHAR NOT NULL REFERENCES providers(id)  ON DELETE CASCADE,
        appointment_id VARCHAR REFERENCES appointments(id)         ON DELETE SET NULL,
        code           TEXT,
        title          TEXT NOT NULL,
        description    TEXT,
        category       TEXT NOT NULL DEFAULT 'primary',
        status         TEXT NOT NULL DEFAULT 'active',
        diagnosed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at    TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_diagnoses_patient  ON diagnoses(patient_id, status, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_diagnoses_provider ON diagnoses(provider_id, patient_id)`);
    console.log('[db] diagnoses ready');
  } catch (err: any) { console.warn('[db] P3 diagnoses:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS treatment_plans (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id     VARCHAR NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
        provider_id    VARCHAR NOT NULL REFERENCES providers(id)  ON DELETE CASCADE,
        appointment_id VARCHAR REFERENCES appointments(id)         ON DELETE SET NULL,
        title          TEXT NOT NULL,
        description    TEXT,
        goals          TEXT,
        recommendations TEXT,
        status         TEXT NOT NULL DEFAULT 'active',
        start_date     DATE,
        end_date       DATE,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient  ON treatment_plans(patient_id, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_treatment_plans_provider ON treatment_plans(provider_id, patient_id)`);
    console.log('[db] treatment_plans ready');
  } catch (err: any) { console.warn('[db] P3 treatment_plans:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS treatment_tasks (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id      VARCHAR NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        description  TEXT,
        status       TEXT NOT NULL DEFAULT 'pending',
        due_date     DATE,
        completed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_treatment_tasks_plan ON treatment_tasks(plan_id, status)`);
    console.log('[db] treatment_tasks ready');
  } catch (err: any) { console.warn('[db] P3 treatment_tasks:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_attachments (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id     VARCHAR NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
        provider_id    VARCHAR REFERENCES providers(id)        ON DELETE SET NULL,
        appointment_id VARCHAR REFERENCES appointments(id)     ON DELETE SET NULL,
        category       TEXT NOT NULL DEFAULT 'general',
        title          TEXT NOT NULL,
        file_url       TEXT NOT NULL,
        file_type      TEXT,
        file_size      INTEGER,
        notes          TEXT,
        uploaded_by    VARCHAR NOT NULL REFERENCES users(id),
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clinical_attachments_patient ON clinical_attachments(patient_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clinical_attachments_appt    ON clinical_attachments(appointment_id) WHERE appointment_id IS NOT NULL`);
    console.log('[db] clinical_attachments ready');
  } catch (err: any) { console.warn('[db] P3 clinical_attachments:', err.message); }

  try {
    await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
    await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS refill_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS refill_of VARCHAR REFERENCES prescriptions(id)`);
    console.log('[db] prescriptions lifecycle columns ready');
  } catch (err: any) { console.warn('[db] P3 prescriptions lifecycle:', err.message); }

  // ── P7: Legal, Consent & Compliance Framework — core tables ──────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legal_documents (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        slug                  TEXT NOT NULL,
        title                 TEXT NOT NULL,
        description           TEXT,
        doc_type              TEXT NOT NULL,
        target_roles          TEXT[] NOT NULL DEFAULT '{}',
        country_code          TEXT,
        is_required           BOOLEAN NOT NULL DEFAULT TRUE,
        requires_reacceptance BOOLEAN NOT NULL DEFAULT FALSE,
        status                TEXT NOT NULL DEFAULT 'draft',
        current_version_id    VARCHAR,
        created_by            VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_documents_slug ON legal_documents(slug)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_documents_status    ON legal_documents(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_documents_doc_type  ON legal_documents(doc_type)`);
    console.log('[db] legal_documents table ready');
  } catch (err: any) { console.warn('[db] P7 legal_documents:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legal_document_versions (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id    VARCHAR NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
        version        TEXT NOT NULL,
        content        TEXT NOT NULL DEFAULT '',
        changelog      TEXT,
        status         TEXT NOT NULL DEFAULT 'draft',
        effective_date TIMESTAMPTZ,
        expires_at     TIMESTAMPTZ,
        published_at   TIMESTAMPTZ,
        published_by   VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_versions_doc_ver ON legal_document_versions(document_id, version)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_versions_doc    ON legal_document_versions(document_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_versions_status ON legal_document_versions(document_id, status)`);
    // FK from legal_documents.current_version_id → legal_document_versions.id (deferred — table now exists)
    await pool.query(`ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS current_version_id VARCHAR REFERENCES legal_document_versions(id) ON DELETE SET NULL`);
    console.log('[db] legal_document_versions table ready');
  } catch (err: any) { console.warn('[db] P7 legal_document_versions:', err.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legal_acceptances (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id   VARCHAR NOT NULL REFERENCES legal_documents(id),
        version_id    VARCHAR NOT NULL REFERENCES legal_document_versions(id),
        role_snapshot TEXT NOT NULL,
        ip_address    TEXT,
        user_agent    TEXT,
        source        TEXT NOT NULL DEFAULT 'unknown',
        metadata      JSONB,
        accepted_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_accept_user    ON legal_acceptances(user_id, accepted_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_accept_doc     ON legal_acceptances(document_id, accepted_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_accept_version ON legal_acceptances(version_id)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_accept_user_ver ON legal_acceptances(user_id, version_id)`);
    console.log('[db] legal_acceptances table ready');
  } catch (err: any) { console.warn('[db] P7 legal_acceptances:', err.message); }

  // ── P7: Seed the 23 canonical legal document types as draft placeholders ──
  try {
    const SEED_DOCS = [
      { slug: 'platform_terms',         title: 'Platform Terms of Service',       doc_type: 'platform_terms',         target_roles: ['patient','provider'],  is_required: true },
      { slug: 'privacy_policy',         title: 'Privacy Policy',                  doc_type: 'privacy_policy',         target_roles: ['patient','provider'],  is_required: true },
      { slug: 'patient_agreement',      title: 'Patient Agreement',               doc_type: 'patient_agreement',      target_roles: ['patient'],             is_required: true },
      { slug: 'provider_agreement',     title: 'Provider Service Agreement',      doc_type: 'provider_agreement',     target_roles: ['provider'],            is_required: true },
      { slug: 'medical_disclaimer',     title: 'Medical Disclaimer',              doc_type: 'medical_disclaimer',     target_roles: ['patient','provider'],  is_required: true },
      { slug: 'payment_authorization',  title: 'Payment Authorization',           doc_type: 'payment_authorization',  target_roles: ['patient'],             is_required: true },
      { slug: 'refund_policy',          title: 'Refund Policy',                   doc_type: 'refund_policy',          target_roles: ['patient'],             is_required: false },
      { slug: 'cancellation_policy',    title: 'Cancellation Policy',             doc_type: 'cancellation_policy',    target_roles: ['patient','provider'],  is_required: false },
      { slug: 'telehealth_consent',     title: 'Telehealth Consent',              doc_type: 'telehealth_consent',     target_roles: ['patient'],             is_required: true },
      { slug: 'home_visit_consent',     title: 'Home Visit Consent',              doc_type: 'home_visit_consent',     target_roles: ['patient'],             is_required: true },
      { slug: 'caregiver_consent',      title: 'Caregiver Services Consent',      doc_type: 'caregiver_consent',      target_roles: ['patient'],             is_required: true },
      { slug: 'prescription_consent',   title: 'Prescription Acknowledgement',    doc_type: 'prescription_consent',   target_roles: ['patient'],             is_required: true },
      { slug: 'minor_consent',          title: 'Minor Treatment Consent',         doc_type: 'minor_consent',          target_roles: ['patient'],             is_required: true },
      { slug: 'guardian_consent',       title: 'Guardian Authorization',          doc_type: 'guardian_consent',       target_roles: ['patient'],             is_required: true },
      { slug: 'communication_consent',  title: 'Communication Consent',           doc_type: 'communication_consent',  target_roles: ['patient','provider'],  is_required: false },
      { slug: 'cookie_consent',         title: 'Cookie Consent',                  doc_type: 'cookie_consent',         target_roles: ['patient','provider'],  is_required: false },
      { slug: 'data_processing_consent',title: 'Data Processing Agreement (GDPR)',doc_type: 'data_processing_consent',target_roles: ['patient','provider'],  is_required: true },
      { slug: 'clinical_data_consent',  title: 'Clinical Data Consent',           doc_type: 'clinical_data_consent',  target_roles: ['patient'],             is_required: true },
      { slug: 'membership_terms',       title: 'Membership Terms & Conditions',   doc_type: 'membership_terms',       target_roles: ['patient'],             is_required: true },
      { slug: 'package_terms',          title: 'Package Terms & Conditions',      doc_type: 'package_terms',          target_roles: ['patient'],             is_required: false },
      { slug: 'gift_card_terms',        title: 'Gift Card Terms & Conditions',    doc_type: 'gift_card_terms',        target_roles: ['patient'],             is_required: false },
      { slug: 'provider_code_of_conduct',title:'Provider Code of Conduct',        doc_type: 'provider_code_of_conduct',target_roles: ['provider'],           is_required: true },
      { slug: 'patient_code_of_conduct',title: 'Patient Code of Conduct',         doc_type: 'patient_code_of_conduct',target_roles: ['patient'],             is_required: false },
    ];
    for (const doc of SEED_DOCS) {
      await pool.query(`
        INSERT INTO legal_documents (slug, title, doc_type, target_roles, is_required, status, description)
        VALUES ($1,$2,$3,$4,$5,'draft',$6)
        ON CONFLICT (slug) DO NOTHING
      `, [doc.slug, doc.title, doc.doc_type, doc.target_roles, doc.is_required,
          'Placeholder — legal content will be provided by the legal team before publishing.']);
    }
    console.log('[db] legal document registry seeded (23 document types)');
  } catch (err: any) { console.warn('[db] P7 seed legal docs:', err.message); }

  // ── C22: Communication hardening — message editing audit trail ─────────────
  try {
    await pool.query(`ALTER TABLE realtime_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE realtime_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_edit_history (
        id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id       VARCHAR NOT NULL REFERENCES realtime_messages(id) ON DELETE CASCADE,
        previous_content TEXT    NOT NULL,
        edited_by        VARCHAR NOT NULL REFERENCES users(id),
        edited_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_msg_edit_history_msg ON message_edit_history(message_id, edited_at DESC)`);
    console.log('[db] message editing audit trail ready');
  } catch (err: any) { console.warn('[db] C22 message editing:', err.message); }

  // ── Lifecycle Sprint: provider_category_permissions column name ───────────────
  // Drizzle schema now uses varchar("category") so the DB column must be "category".
  // If a previous migration renamed it to "category_id", rename it back.
  try {
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'provider_category_permissions'
            AND column_name = 'category_id'
        ) THEN
          ALTER TABLE provider_category_permissions RENAME COLUMN category_id TO category;
        END IF;
      END $$
    `);
    console.log('[db] provider_category_permissions.category column ready');
  } catch (err: any) { console.warn('[db] Lifecycle Sprint category column:', err.message); }

  // ── Lifecycle Sprint: provider_category_permissions missing columns ──────────
  // The live DB may have been created with a different schema (granted_by/granted_at/is_active
  // instead of enabled/assigned_by_admin/created_at). Add any missing columns safely.
  try {
    await pool.query(`ALTER TABLE provider_category_permissions ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE provider_category_permissions ADD COLUMN IF NOT EXISTS assigned_by_admin BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE provider_category_permissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
    console.log('[db] provider_category_permissions columns ready');
  } catch (err: any) { console.warn('[db] Lifecycle Sprint pcp columns:', err.message); }

  // ── appointments.payment_method — tracks which payment rail was used ─────
  // Present in Drizzle schema; backfilled here so Supabase stays in sync.
  // Needed by the ledger-reconcile cron to skip cash/bank_transfer/wallet rows.
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card'`);
    console.log('[db] appointments.payment_method column ready');
  } catch (err: any) { console.warn('[db] appointments.payment_method column:', err.message); }

  // ── Patient sign-off code for session completion ─────────────────────────
  // A random 4-digit code is generated when an appointment moves to in_progress
  // and sent to the patient. The provider must enter it to complete the session.
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sign_off_code TEXT`);
    console.log('[db] appointments.sign_off_code column ready');
  } catch (err: any) { console.warn('[db] sign_off_code column:', err.message); }

  // ── Provider Category & Specialization hierarchy ─────────────────────────
  // Three-level taxonomy: provider_category → provider_subcategory → specialization
  // (specialization reuses existing providers.specialization column)
  try {
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS provider_category TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS provider_subcategory TEXT`);
    console.log('[db] providers: provider_category + provider_subcategory columns ready');
  } catch (err: any) { console.warn('[db] provider category columns:', err.message); }

  // ── Provider banking / payout fields ─────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS bank_name TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS account_holder TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS payment_rail TEXT DEFAULT 'ach'`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS routing_number TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS iban_number TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS swift_code TEXT`);
    await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS account_number TEXT`);
    console.log('[db] providers banking columns ready');
  } catch (err: any) { console.warn('[db] providers banking columns:', err.message); }

  // ── sub_services sub_group taxonomy column ────────────────────────────────
  try {
    await pool.query(`ALTER TABLE sub_services ADD COLUMN IF NOT EXISTS sub_group TEXT`);
  } catch (err: any) { console.warn('[db] sub_services sub_group column:', err.message); }

  // ── P-FINAL: services.currency schema guard ───────────────────────────────
  // Rule 1: Service prices are stored in provider native currency (services.currency).
  // The USD→native price backfill has been removed — production data was already
  // migrated. New services must be created with the correct native currency from day one.
  try {
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD'`);
    console.log('[db] services.currency column ready');
  } catch (err: any) { console.warn('[db] P-FINAL services.currency:', err.message); }

  // Rule 6: Comprehensive booking snapshot — booking/provider/patient currency + USD reporting.
  try {
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_currency  TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_currency TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_currency  TEXT`);
    await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS final_total_usd   NUMERIC(10,2)`);
    console.log('[db] appointments currency snapshot columns ready');
  } catch (err: any) { console.warn('[db] P-FINAL appointments currency cols:', err.message); }

  // Rules 8 & 9: Fixed local pricing for packages (no exchange-rate sensitivity).
  try {
    await pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS local_prices JSONB DEFAULT '{}'`);
    console.log('[db] packages.local_prices ready');
  } catch (err: any) { console.warn('[db] P-FINAL packages.local_prices:', err.message); }
}

/**
 * runCatalogSeed — idempotent catalog data setup.
 *
 * Seeds the 7 canonical provider categories, their catalog_service groups, and
 * ensures sub_services have the correct catalog_service_id FK. Also merges any
 * legacy category slugs into the canonical set.
 *
 * Called fire-and-forget after HTTP listen (same timing as the old deferred
 * migrations). Safe to re-run on every boot — all operations are ON CONFLICT
 * DO NOTHING / DO UPDATE or WHERE NOT EXISTS guards.
 */
export async function runCatalogSeed(): Promise<void> {
  console.log("[db:catalog] Starting catalog seed…");

  // ── Sub-service catalogue seed (idempotent — upserts sub_group on conflict) ─
  try {
    if (SUB_SERVICE_SEED.length > 0) {
      const placeholders: string[] = [];
      const values: (string | number | boolean)[] = [];
      let idx = 1;
      for (const s of SUB_SERVICE_SEED) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, true, NOW())`);
        values.push(s.name, s.category, s.duration, s.subGroup);
      }
      const { rowCount } = await pool.query(
        `INSERT INTO sub_services (name, category, duration_minutes, sub_group, is_active, created_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (name, category) DO UPDATE SET sub_group = EXCLUDED.sub_group`,
        values,
      );
      if ((rowCount ?? 0) > 0) {
        console.log(`[db:catalog] sub_services catalogue seed: upserted ${rowCount} entries (incl. sub_group backfill)`);
      }
    }
  } catch (err: any) {
    console.warn("[db:catalog] sub_services catalogue seed (non-fatal):", err.message);
  }

  // ── Catalog hierarchy fix: upsert categories + groups + backfill FKs ───────
  try {
    // 1. Ensure all 7 canonical categories exist with slugs matching providerTypeEnum
    await pool.query(`
      INSERT INTO categories (id, slug, name, description, icon, sort_order, is_active)
      VALUES
        (gen_random_uuid(), 'physician',            'Medical Doctors & Specialists',              'Primary care physicians, specialists, and sub-specialty consultations',                      '🩺', 1, true),
        (gen_random_uuid(), 'mental_health',        'Mental Health & Behavioral Professionals',   'Psychiatrists, psychologists, counselors, and behavioral health coaches',                    '🧠', 2, true),
        (gen_random_uuid(), 'nutrition',            'Nutrition, Dietetics & Metabolic Wellness',  'Clinical dietitians and nutrition specialists for diet, metabolism, and weight management',  '🥗', 3, true),
        (gen_random_uuid(), 'rehabilitation',       'Physical Therapy & Rehabilitation',          'Physiotherapists, chiropractors, and rehabilitation specialists',                           '🦴', 4, true),
        (gen_random_uuid(), 'dental',               'Dental Care Professionals',                  'Dentists and orthodontic specialists for dental health and cosmetic treatments',             '🦷', 5, true),
        (gen_random_uuid(), 'alternative_medicine', 'Alternative, Holistic & Integrative Medicine','Holistic health practitioners and integrative medicine specialists',                        '🌿', 6, true),
        (gen_random_uuid(), 'nursing',              'Maternal, Nursing & Allied Health Support',  'Registered nurses, midwives, and allied health professionals',                              '❤️', 7, true)
      ON CONFLICT (slug) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        icon        = EXCLUDED.icon,
        sort_order  = EXCLUDED.sort_order,
        is_active   = true,
        deleted_at  = NULL
    `);

    // 2. For each seed sub_group, ensure a catalog_services row exists linked to the right category
    //    Uses a VALUES list of (category_slug, group_name, sort_order) and inserts only if missing.
    const groupDefs: [string, string, number][] = [
      // physician
      ["physician", "Primary Care & General Medicine", 1],
      ["physician", "Internal Medicine",               2],
      ["physician", "Cardiology",                      3],
      ["physician", "Endocrinology",                   4],
      ["physician", "Gastroenterology",                5],
      ["physician", "Neurology",                       6],
      ["physician", "Pulmonology",                     7],
      ["physician", "Rheumatology",                    8],
      ["physician", "Dermatology",                     9],
      ["physician", "Pediatrics",                      10],
      ["physician", "Women's Health",                  11],
      ["physician", "Men's Health",                    12],
      // mental_health
      ["mental_health", "Psychiatry",              1],
      ["mental_health", "Psychology & Therapy",    2],
      ["mental_health", "Addiction & Recovery",    3],
      ["mental_health", "Coaching & Support",      4],
      // nutrition
      ["nutrition", "Clinical Nutrition",     1],
      ["nutrition", "Weight Management",      2],
      ["nutrition", "Performance Nutrition",  3],
      ["nutrition", "Lifestyle Nutrition",    4],
      // rehabilitation
      ["rehabilitation", "Physical Therapy",              1],
      ["rehabilitation", "Neurological Rehabilitation",   2],
      ["rehabilitation", "Orthopedic Rehabilitation",     3],
      ["rehabilitation", "Sports Medicine",               4],
      ["rehabilitation", "Occupational Health",           5],
      ["rehabilitation", "Chiropractic & Osteopathy",     6],
      // dental
      ["dental", "General Dentistry",                 1],
      ["dental", "Cosmetic Dentistry",                2],
      ["dental", "Orthodontics",                      3],
      ["dental", "Pediatric Dentistry",               4],
      ["dental", "Oral Medicine",                     5],
      ["dental", "Implant & Restorative Dentistry",   6],
      // alternative_medicine
      ["alternative_medicine", "Integrative Medicine",    1],
      ["alternative_medicine", "Ayurveda",                2],
      ["alternative_medicine", "Naturopathy",             3],
      ["alternative_medicine", "Homeopathy",              4],
      ["alternative_medicine", "Mind-Body Wellness",      5],
      ["alternative_medicine", "Traditional Therapies",   6],
      // nursing
      ["nursing", "Maternal Support",          1],
      ["nursing", "Nursing Services",          2],
      ["nursing", "Speech & Language Therapy", 3],
      ["nursing", "Occupational Therapy",      4],
      ["nursing", "Allied Health",             5],
    ];

    for (const [slug, grpName, sortOrd] of groupDefs) {
      await pool.query(`
        INSERT INTO catalog_services (id, category_id, name, sort_order, is_active)
        SELECT gen_random_uuid(), cat.id, $1, $2, true
        FROM   categories cat
        WHERE  cat.slug = $3
          AND  cat.deleted_at IS NULL
          AND  NOT EXISTS (
            SELECT 1 FROM catalog_services cs2
            WHERE  cs2.category_id = cat.id
              AND  LOWER(cs2.name) = LOWER($1)
              AND  cs2.deleted_at IS NULL
          )
      `, [grpName, sortOrd, slug]);
    }

    // 3. Backfill catalog_service_id on sub_services where sub_group matches catalog_services.name
    const { rowCount: backfilled } = await pool.query(`
      UPDATE sub_services ss
      SET    catalog_service_id = cs.id
      FROM   catalog_services cs
      JOIN   categories cat ON cat.id = cs.category_id
      WHERE  LOWER(ss.sub_group) = LOWER(cs.name)
        AND  ss.category::text   = cat.slug
        AND  ss.catalog_service_id IS NULL
        AND  ss.deleted_at IS NULL
        AND  cs.deleted_at IS NULL
    `);

    console.log(`[db:catalog] Catalog hierarchy fix complete — backfilled ${backfilled ?? 0} sub_service FK(s)`);
  } catch (err: any) {
    console.warn("[db:catalog] Catalog hierarchy fix (non-fatal):", err.message);
  }

  // ── Sync provider_category display name from provider_type (single source of truth) ──
  // provider_category is a redundant display-name field; always derive it from provider_type.
  try {
    await pool.query(`
      UPDATE providers
      SET    provider_category = CASE provider_type
               WHEN 'physician'            THEN 'Medical Doctors & Specialists'
               WHEN 'mental_health'        THEN 'Mental Health & Behavioral Professionals'
               WHEN 'nutrition'            THEN 'Nutrition, Dietetics & Metabolic Wellness'
               WHEN 'rehabilitation'       THEN 'Physical Therapy & Rehabilitation'
               WHEN 'dental'               THEN 'Dental Care Professionals'
               WHEN 'alternative_medicine' THEN 'Alternative, Holistic & Integrative Medicine'
               WHEN 'nursing'              THEN 'Maternal, Nursing & Allied Health Support'
               ELSE provider_category
             END
      WHERE  provider_type IN (
               'physician','mental_health','nutrition','rehabilitation',
               'dental','alternative_medicine','nursing'
             )
        AND  provider_category IS DISTINCT FROM CASE provider_type
               WHEN 'physician'            THEN 'Medical Doctors & Specialists'
               WHEN 'mental_health'        THEN 'Mental Health & Behavioral Professionals'
               WHEN 'nutrition'            THEN 'Nutrition, Dietetics & Metabolic Wellness'
               WHEN 'rehabilitation'       THEN 'Physical Therapy & Rehabilitation'
               WHEN 'dental'               THEN 'Dental Care Professionals'
               WHEN 'alternative_medicine' THEN 'Alternative, Holistic & Integrative Medicine'
               WHEN 'nursing'              THEN 'Maternal, Nursing & Allied Health Support'
               ELSE provider_category
             END
    `);
    console.log("[db] provider_category sync from provider_type: OK");
  } catch (err: any) {
    console.warn("[db] provider_category sync (non-fatal):", err.message);
  }

  console.log("[db:catalog] Catalog seed complete.");
}
