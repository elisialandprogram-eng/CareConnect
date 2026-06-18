-- =============================================================================
-- GoldenLife — Hard Reset Test Data
-- =============================================================================
-- Wraps the entire reset in ONE transaction.
-- Dynamic PL/pgSQL skips any table that does not exist in this DB.
--
-- PRESERVED (never touched):
--   admin users        — users WHERE role IN (admin/global_admin/country_admin)
--   admin_roles        — RBAC role definitions
--   rbac_permissions   — RBAC permission keys
--   role_permissions   — RBAC role↔permission mapping
--   admin_assignments  — kept only for surviving admin users
--   sub_services       — service catalogue items  ← user-listed
--   categories         — top-level service categories  ← user-listed
--   catalog_services   — FK parent of sub_services (MUST stay or CASCADE wipes sub_services)
--   packages           — membership package definitions  ← user-listed
--   package_benefits   — membership package benefit rows  ← user-listed
--
-- WIPED: everything else — providers, users (non-admin), appointments,
--        payments, wallets, health records, notifications, support tickets,
--        config tables (tax, platform_settings, locations, currency_rates …),
--        static content (faqs, blog_posts …), promo_codes, and more.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SAFETY GUARD: abort if no admin users exist
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM users WHERE role IN ('admin','global_admin','country_admin')) = 0 THEN
    RAISE EXCEPTION 'ABORT: no admin users found — refusing to run to avoid locking out the system';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 1: TRUNCATE all tables NOT in the preserve list.
--
-- CASCADE handles FK ordering automatically.
-- Tables in KEEP are never passed to TRUNCATE, so they stay intact.
--
-- IMPORTANT: catalog_services is preserved because sub_services has a FK
-- pointing to it.  Truncating catalog_services CASCADE would silently wipe
-- sub_services even if sub_services is not in the truncate list.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _keep TEXT[] := ARRAY[
    'users',
    'admin_roles',
    'rbac_permissions',
    'role_permissions',
    'admin_assignments',
    'sub_services',
    'categories',
    'catalog_services',   -- FK parent of sub_services — must be kept
    'packages',
    'package_benefits'
  ];
  _all     TEXT[];
  _to_wipe TEXT[];
  _sql     TEXT;
BEGIN
  -- Collect every public base table that exists right now
  SELECT array_agg(table_name)
  INTO   _all
  FROM   information_schema.tables
  WHERE  table_schema = 'public' AND table_type = 'BASE TABLE';

  -- Subtract the keep list
  SELECT array_agg(t ORDER BY t)
  INTO   _to_wipe
  FROM   unnest(_all) AS t
  WHERE  t <> ALL(_keep);

  IF _to_wipe IS NULL OR array_length(_to_wipe, 1) = 0 THEN
    RAISE NOTICE 'Nothing to truncate.';
    RETURN;
  END IF;

  _sql := 'TRUNCATE TABLE '
       || (SELECT string_agg('"' || t || '"', ', ' ORDER BY t) FROM unnest(_to_wipe) AS t)
       || ' RESTART IDENTITY CASCADE';

  RAISE NOTICE 'Wiping % tables: %', array_length(_to_wipe, 1),
        (SELECT string_agg(t, ', ' ORDER BY t) FROM unnest(_to_wipe) AS t);

  EXECUTE _sql;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 2: Clean admin_assignments — keep only rows for surviving admin users
-- ---------------------------------------------------------------------------
DELETE FROM admin_assignments
WHERE user_id NOT IN (
  SELECT id FROM users
  WHERE role IN ('admin', 'global_admin', 'country_admin')
);

-- ---------------------------------------------------------------------------
-- STEP 3: Delete non-admin users (patients, providers, etc.)
-- ---------------------------------------------------------------------------
DELETE FROM users
WHERE role NOT IN ('admin', 'global_admin', 'country_admin');

-- ---------------------------------------------------------------------------
-- STEP 4: Reset sequences (idempotent — only if they exist)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'appointment_number_seq') THEN
    ALTER SEQUENCE appointment_number_seq RESTART WITH 1;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'invoice_number_seq') THEN
    ALTER SEQUENCE invoice_number_seq RESTART WITH 1;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'group_session_seq') THEN
    ALTER SEQUENCE group_session_seq RESTART WITH 1;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 5: Verification
-- ---------------------------------------------------------------------------
SELECT
  'non_admin_users' AS entity,
  (SELECT COUNT(*)::int FROM users WHERE role NOT IN ('admin','global_admin','country_admin')) AS remaining
UNION ALL SELECT 'admin_users',   (SELECT COUNT(*)::int FROM users WHERE role IN ('admin','global_admin','country_admin'))
UNION ALL SELECT 'providers',     (SELECT COUNT(*)::int FROM providers)
UNION ALL SELECT 'appointments',  (SELECT COUNT(*)::int FROM appointments)
UNION ALL SELECT 'payments',      (SELECT COUNT(*)::int FROM payments)
UNION ALL SELECT 'wallets',       (SELECT COUNT(*)::int FROM wallets)
UNION ALL SELECT 'sub_services',  (SELECT COUNT(*)::int FROM sub_services)
UNION ALL SELECT 'catalog_services', (SELECT COUNT(*)::int FROM catalog_services)
UNION ALL SELECT 'categories',    (SELECT COUNT(*)::int FROM categories)
UNION ALL SELECT 'packages',      (SELECT COUNT(*)::int FROM packages)
UNION ALL SELECT 'admin_roles',   (SELECT COUNT(*)::int FROM admin_roles)
UNION ALL SELECT 'rbac_permissions', (SELECT COUNT(*)::int FROM rbac_permissions)
ORDER BY entity;

-- Surviving admin users
SELECT id, email, role FROM users
WHERE role IN ('admin', 'global_admin', 'country_admin')
ORDER BY role, email;

COMMIT;
