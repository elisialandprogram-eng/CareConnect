-- Multi-country support migration: add country_code enum + columns,
-- expand user_role enum, backfill data, then enforce NOT NULL.
BEGIN;

-- 1. Country code enum
DO $$ BEGIN
  CREATE TYPE country_code AS ENUM ('HU', 'IR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Expand user_role enum with new admin roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'global_admin';
COMMIT; -- Postgres requires committing enum additions before they can be used.
BEGIN;
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'country_admin';
COMMIT;

BEGIN;

-- 3. Add country_code column (nullable first; backfill; then NOT NULL).
ALTER TABLE users            ADD COLUMN IF NOT EXISTS country_code country_code;
ALTER TABLE providers        ADD COLUMN IF NOT EXISTS country_code country_code;
ALTER TABLE services         ADD COLUMN IF NOT EXISTS country_code country_code;
ALTER TABLE appointments     ADD COLUMN IF NOT EXISTS country_code country_code;
ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS country_code country_code;
ALTER TABLE payments         ADD COLUMN IF NOT EXISTS country_code country_code;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS country_code country_code;

-- 4. Backfill providers from existing country/currency text.
UPDATE providers SET country_code = CASE
  WHEN currency = 'IRR' OR country ILIKE '%iran%' THEN 'IR'::country_code
  ELSE 'HU'::country_code
END
WHERE country_code IS NULL;

-- 5. Backfill users:
--    - providers/admins: align with their provider record if they have one
--    - patients: align with the provider of their most recent appointment
--    - everyone else: HU
UPDATE users u SET country_code = COALESCE(
  (SELECT p.country_code FROM providers p WHERE p.user_id = u.id LIMIT 1),
  (
    SELECT p.country_code
    FROM appointments a
    JOIN providers p ON p.id = a.provider_id
    WHERE a.patient_id = u.id
    ORDER BY a.created_at DESC NULLS LAST
    LIMIT 1
  ),
  'HU'::country_code
)
WHERE country_code IS NULL;

-- 6. Backfill services from their provider.
UPDATE services s SET country_code = COALESCE(
  (SELECT p.country_code FROM providers p WHERE p.id = s.provider_id),
  'HU'::country_code
)
WHERE country_code IS NULL;

-- 7. Backfill appointments from their service or provider.
UPDATE appointments a SET country_code = COALESCE(
  (SELECT s.country_code FROM services s WHERE s.id = a.service_id),
  (SELECT p.country_code FROM providers p WHERE p.id = a.provider_id),
  'HU'::country_code
)
WHERE country_code IS NULL;

-- 8. Backfill invoices and payments from their appointment.
UPDATE invoices i SET country_code = COALESCE(
  (SELECT a.country_code FROM appointments a WHERE a.id = i.appointment_id),
  'HU'::country_code
)
WHERE country_code IS NULL;

UPDATE payments pm SET country_code = COALESCE(
  (SELECT a.country_code FROM appointments a WHERE a.id = pm.appointment_id),
  'HU'::country_code
)
WHERE country_code IS NULL;

-- 9. Backfill service_requests from their provider.
UPDATE service_requests sr SET country_code = COALESCE(
  (SELECT p.country_code FROM providers p WHERE p.id = sr.provider_id),
  'HU'::country_code
)
WHERE country_code IS NULL;

-- 10. Enforce NOT NULL + default for new rows.
ALTER TABLE users            ALTER COLUMN country_code SET NOT NULL, ALTER COLUMN country_code SET DEFAULT 'HU';
ALTER TABLE providers        ALTER COLUMN country_code SET NOT NULL, ALTER COLUMN country_code SET DEFAULT 'HU';
ALTER TABLE services         ALTER COLUMN country_code SET NOT NULL, ALTER COLUMN country_code SET DEFAULT 'HU';
ALTER TABLE appointments     ALTER COLUMN country_code SET NOT NULL, ALTER COLUMN country_code SET DEFAULT 'HU';
ALTER TABLE invoices         ALTER COLUMN country_code SET NOT NULL, ALTER COLUMN country_code SET DEFAULT 'HU';
ALTER TABLE payments         ALTER COLUMN country_code SET NOT NULL, ALTER COLUMN country_code SET DEFAULT 'HU';
ALTER TABLE service_requests ALTER COLUMN country_code SET NOT NULL, ALTER COLUMN country_code SET DEFAULT 'HU';

-- 11. Indexes for the new column (only on heavily-filtered tables).
CREATE INDEX IF NOT EXISTS idx_services_country_code         ON services(country_code);
CREATE INDEX IF NOT EXISTS idx_appointments_country_code     ON appointments(country_code);
CREATE INDEX IF NOT EXISTS idx_service_requests_country_code ON service_requests(country_code);

-- 12. Promote existing admins to global_admin.
UPDATE users SET role = 'global_admin' WHERE role = 'admin';

COMMIT;
