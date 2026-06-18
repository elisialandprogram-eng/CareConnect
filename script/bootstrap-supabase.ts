/**
 * script/bootstrap-supabase.ts
 *
 * One-shot Supabase schema bootstrap.
 * Creates ALL enums, tables, sequences, indexes, and seed data in dependency order.
 * Safe to re-run — every statement uses IF NOT EXISTS or DO $$ BEGIN … EXCEPTION guards.
 *
 * Usage:
 *   SUPABASE_DATABASE_URL=<pooled_url> npx tsx script/bootstrap-supabase.ts
 */

import { Pool } from "pg";

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  console.error("[bootstrap] FATAL: SUPABASE_DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 3,
  connectionTimeoutMillis: 15_000,
  options: "-c TimeZone=UTC",
});

async function run(sql: string, label: string) {
  try {
    await pool.query(sql);
    console.log(`  ✓ ${label}`);
  } catch (err: any) {
    // 42P07 = duplicate table, 42710 = duplicate object — idempotent
    if (["42P07", "42710", "23505"].includes(err.code)) {
      console.log(`  ~ ${label} (already exists)`);
    } else {
      console.error(`  ✗ ${label}: ${err.message}`);
      throw err;
    }
  }
}

async function main() {
  console.log("[bootstrap] Starting Supabase schema bootstrap…");
  const client = await pool.connect();

  try {
    // ── Step 1: Enums ────────────────────────────────────────────────────────
    console.log("\n[1/6] Creating enums…");

    const enums: [string, string[]][] = [
      ["user_role",               ["patient","provider","admin","global_admin","country_admin"]],
      ["country_code",            ["HU","IR"]],
      ["provider_type",           ["physician","mental_health","nutrition","rehabilitation","dental","alternative_medicine","nursing"]],
      ["appointment_status",      ["pending","approved","confirmed","in_progress","completed","cancelled","rejected","rescheduled","no_show","cancelled_by_patient","cancelled_by_provider","reschedule_requested","reschedule_proposed","expired"]],
      ["visit_type",              ["online","home","clinic"]],
      ["payment_status",          ["pending","completed","refunded","failed"]],
      ["payment_method",          ["card","crypto","cash","bank_transfer"]],
      ["group_session_status",    ["scheduled","live","completed","cancelled"]],
      ["group_attendance",        ["registered","joined","no_show"]],
      ["ticket_status",           ["open","in_progress","resolved","closed"]],
      ["ticket_priority",         ["low","medium","high","urgent"]],
      ["audit_action",            ["create","update","delete","login","logout","view","export","approve","reject","refund","role_change","document_verify","payment_action","suspend","verify"]],
      ["system_event_type",       ["api_error","payment_failure","notification_failure","slow_endpoint","failed_job","auth_failure"]],
      ["system_event_severity",   ["info","warning","error","critical"]],
      ["appointment_action",      ["book","cancel","reschedule","no_show","approve","confirm","start","complete","reject","outcome_updated"]],
      ["content_type",            ["homepage","about","terms","privacy","faq","blog"]],
      ["announcement_type",       ["info","warning","success","error"]],
      ["medical_history_type",    ["diagnosis","procedure","lab_result","vaccination","allergy"]],
      ["wallet_tx_type",          ["topup","debit","refund","adjustment","reversal"]],
      ["wallet_tx_status",        ["pending","completed","failed","reversed"]],
      ["pricing_type",            ["fixed","hourly","session"]],
      ["earning_status",          ["pending","paid"]],
      ["block_type",              ["vacation","leave","break","other"]],
      ["package_target",          ["patient","provider","both"]],
      ["package_status",          ["pending","active","expired","cancelled","paused"]],
      ["benefit_key",             ["service_discount_percent","platform_fee_discount","wallet_bonus","featured_provider","reduced_commission","priority_support","free_cancellations"]],
      ["bug_category",            ["bug","feature_request","payment_issue","booking_issue","account_issue","service_issue","ui_issue","performance_issue","other"]],
      ["bug_severity",            ["low","medium","high","critical"]],
      ["bug_priority",            ["low","medium","high","urgent"]],
      ["bug_status",              ["new","triaged","in_progress","waiting_for_user","resolved","closed","duplicate","rejected"]],
    ];

    for (const [name, values] of enums) {
      const vals = values.map(v => `'${v}'`).join(",");
      await run(
        `DO $$ BEGIN CREATE TYPE ${name} AS ENUM (${vals}); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `enum: ${name}`
      );
    }

    // ── Step 2: Core tables (no FK dependencies or FK to self-contained group) ─
    console.log("\n[2/6] Creating base tables…");

    await run(`CREATE TABLE IF NOT EXISTS users (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      mobile_number TEXT,
      role user_role NOT NULL DEFAULT 'patient',
      avatar_url TEXT,
      profile_image_url TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      saved_latitude DOUBLE PRECISION,
      saved_longitude DOUBLE PRECISION,
      place_id TEXT,
      formatted_address TEXT,
      gender TEXT,
      date_of_birth TIMESTAMP,
      preferred_pronouns TEXT,
      occupation TEXT,
      marital_status TEXT,
      social_number TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_relation TEXT,
      blood_group TEXT,
      height_cm INTEGER,
      weight_kg DECIMAL(5,2),
      known_allergies TEXT,
      medical_conditions TEXT,
      current_medications TEXT,
      past_surgeries TEXT,
      insurance_provider TEXT,
      insurance_policy_number TEXT,
      primary_care_physician TEXT,
      google_calendar_id TEXT,
      google_access_token TEXT,
      google_refresh_token TEXT,
      is_email_verified BOOLEAN NOT NULL DEFAULT false,
      is_suspended BOOLEAN NOT NULL DEFAULT false,
      suspension_reason TEXT,
      email_otp_hash TEXT,
      email_otp_expires_at TIMESTAMP,
      otp_attempts INTEGER NOT NULL DEFAULT 0,
      last_otp_sent_at TIMESTAMP,
      mobile_verified BOOLEAN NOT NULL DEFAULT false,
      mobile_verified_at TIMESTAMP,
      mobile_verification_status TEXT DEFAULT 'unverified',
      mobile_verification_attempts INTEGER NOT NULL DEFAULT 0,
      language_preference TEXT DEFAULT 'en',
      preferred_currency TEXT,
      timezone TEXT,
      country_code country_code NOT NULL DEFAULT 'HU',
      referral_code TEXT UNIQUE,
      referred_by_user_id VARCHAR,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: users");

    await run(`CREATE INDEX IF NOT EXISTS idx_users_country_code ON users(country_code)`, "index: users.country_code");

    await run(`CREATE TABLE IF NOT EXISTS providers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      provider_type TEXT NOT NULL DEFAULT 'doctor',
      professional_title TEXT,
      specialization TEXT,
      secondary_specialties TEXT[] NOT NULL DEFAULT '{}',
      bio TEXT,
      years_experience INTEGER DEFAULT 0,
      education TEXT,
      certifications TEXT[] NOT NULL DEFAULT '{}',
      languages TEXT[] NOT NULL DEFAULT '{}',
      license_number TEXT,
      licensing_authority TEXT,
      license_expiry_date TIMESTAMP,
      license_document_url TEXT,
      national_provider_id TEXT,
      qualifications TEXT,
      available_days TEXT[] NOT NULL DEFAULT '{}',
      available_time_slots TEXT[] NOT NULL DEFAULT '{}',
      working_hours_start TEXT DEFAULT '09:00',
      working_hours_end TEXT DEFAULT '18:00',
      max_patients_per_day INTEGER,
      primary_service_location TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      country_code country_code NOT NULL DEFAULT 'HU',
      service_radius_km INTEGER,
      multiple_service_areas BOOLEAN DEFAULT false,
      google_maps_location TEXT,
      consultation_fee DECIMAL(10,2),
      home_visit_fee DECIMAL(10,2),
      telemedicine_fee DECIMAL(10,2),
      emergency_care_fee DECIMAL(10,2),
      insurance_accepted TEXT[] NOT NULL DEFAULT '{}',
      payment_methods TEXT[] NOT NULL DEFAULT '{}',
      background_check_status TEXT DEFAULT 'pending',
      identity_verification_status TEXT DEFAULT 'pending',
      malpractice_coverage TEXT,
      compliance_approval_status TEXT DEFAULT 'pending',
      two_factor_enabled BOOLEAN DEFAULT false,
      preferred_contact_method TEXT,
      provider_agreement_accepted BOOLEAN DEFAULT false,
      data_processing_agreement_accepted BOOLEAN DEFAULT false,
      telemedicine_agreement_accepted BOOLEAN DEFAULT false,
      code_of_conduct_accepted BOOLEAN DEFAULT false,
      affiliated_hospital TEXT,
      on_call_availability BOOLEAN DEFAULT false,
      emergency_contact TEXT,
      internal_notes TEXT,
      is_verified BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      risk_score INTEGER DEFAULT 0,
      bookings_enabled BOOLEAN DEFAULT true,
      status TEXT NOT NULL DEFAULT 'draft',
      rejection_reason TEXT,
      submitted_at TIMESTAMP,
      last_resubmitted_at TIMESTAMP,
      profile_updated_after_submission BOOLEAN DEFAULT false,
      start_date TIMESTAMP DEFAULT NOW(),
      end_date TIMESTAMP,
      rating DECIMAL(2,1) DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      clinic_address_line1 TEXT,
      clinic_address_line2 TEXT,
      clinic_postal_code TEXT,
      clinic_formatted_address TEXT,
      clinic_place_id TEXT,
      home_visit_enabled BOOLEAN NOT NULL DEFAULT false,
      max_travel_distance_km INTEGER,
      gallery TEXT[] NOT NULL DEFAULT '{}',
      account_type TEXT NOT NULL DEFAULT 'individual',
      clinic_name TEXT,
      clinic_registration_number TEXT,
      contact_person_name TEXT,
      business_address TEXT,
      permanent_address_line1 TEXT,
      permanent_address_line2 TEXT,
      permanent_city TEXT,
      permanent_state_region TEXT,
      permanent_postal_code TEXT,
      permanent_country TEXT,
      support_email TEXT,
      support_phone TEXT,
      service_modes TEXT[] NOT NULL DEFAULT '{}',
      display_title TEXT,
      primary_title TEXT,
      secondary_titles TEXT[] NOT NULL DEFAULT '{}',
      requested_title TEXT,
      title_request_reason TEXT,
      title_request_status TEXT DEFAULT 'none',
      title_reviewed_by VARCHAR,
      title_reviewed_at TIMESTAMP,
      cancellation_policy_hours INTEGER DEFAULT 0,
      cancellation_fee_percent DECIMAL(5,2) DEFAULT 0.00,
      minimum_notice_minutes INTEGER DEFAULT 60,
      maximum_booking_days INTEGER DEFAULT 90,
      availability_version INTEGER DEFAULT 1,
      search_vector tsvector,
      fee_split_ratio DECIMAL(5,4) DEFAULT 0.8000,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: providers");

    await run(`CREATE INDEX IF NOT EXISTS idx_providers_country_code ON providers(country_code)`, "index: providers.country_code");
    await run(`CREATE INDEX IF NOT EXISTS idx_providers_country_status ON providers(country_code, status)`, "index: providers country+status");

    await run(`CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: categories");

    await run(`CREATE TABLE IF NOT EXISTS service_categories (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: service_categories");

    await run(`CREATE TABLE IF NOT EXISTS catalog_services (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id VARCHAR REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: catalog_services");

    await run(`CREATE INDEX IF NOT EXISTS idx_catalog_services_category_id ON catalog_services(category_id)`, "index: catalog_services.category_id");

    await run(`CREATE TABLE IF NOT EXISTS sub_services (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      category provider_type NOT NULL,
      catalog_service_id VARCHAR REFERENCES catalog_services(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      platform_fee DECIMAL(10,2) DEFAULT 0.00,
      base_price DECIMAL(10,2) DEFAULT 0.00,
      duration_minutes INTEGER DEFAULT 30,
      buffer_before INTEGER DEFAULT 0,
      buffer_after INTEGER DEFAULT 0,
      tax_percentage DECIMAL(5,2) DEFAULT 0.00,
      pricing_type pricing_type DEFAULT 'fixed',
      is_active BOOLEAN DEFAULT true,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(name, category)
    )`, "table: sub_services");

    await run(`CREATE TABLE IF NOT EXISTS services (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      sub_service_id VARCHAR REFERENCES sub_services(id),
      name TEXT NOT NULL,
      description TEXT,
      duration INTEGER NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      admin_price_override DECIMAL(10,2),
      image_url TEXT,
      calendar_color TEXT DEFAULT '#10b981',
      enable_deposit BOOLEAN DEFAULT false,
      deposit_amount DECIMAL(10,2) DEFAULT 0.00,
      time_slot_length INTEGER,
      buffer_before INTEGER DEFAULT 0,
      buffer_after INTEGER DEFAULT 0,
      custom_duration BOOLEAN DEFAULT false,
      hide_price BOOLEAN DEFAULT false,
      hide_duration BOOLEAN DEFAULT false,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      platform_fee_override DECIMAL(10,2),
      home_visit_fee DECIMAL(10,2) DEFAULT 0.00,
      clinic_fee DECIMAL(10,2) DEFAULT 0.00,
      telemedicine_fee DECIMAL(10,2) DEFAULT 0.00,
      emergency_fee DECIMAL(10,2) DEFAULT 0.00,
      max_patients_per_day INTEGER,
      location_mode TEXT NOT NULL DEFAULT 'both',
      country_code country_code NOT NULL DEFAULT 'HU',
      pending_changes JSONB,
      pending_change_status TEXT,
      pending_change_submitted_by VARCHAR,
      pending_change_submitted_at TIMESTAMP,
      pending_change_reviewed_by VARCHAR,
      pending_change_reviewed_at TIMESTAMP,
      pending_change_reason TEXT,
      availability_hours JSONB,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: services");

    await run(`CREATE INDEX IF NOT EXISTS idx_services_provider_id ON services(provider_id)`, "index: services.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active)`, "index: services.is_active");
    await run(`CREATE INDEX IF NOT EXISTS idx_services_sub_service_id ON services(sub_service_id)`, "index: services.sub_service_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_services_country_code ON services(country_code)`, "index: services.country_code");
    await run(`CREATE INDEX IF NOT EXISTS idx_services_pending_change_status ON services(pending_change_status)`, "index: services.pending_change_status");

    await run(`CREATE TABLE IF NOT EXISTS service_price_history (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id VARCHAR NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      price DECIMAL(10,2) NOT NULL,
      home_visit_fee DECIMAL(10,2) DEFAULT 0.00,
      clinic_fee DECIMAL(10,2) DEFAULT 0.00,
      telemedicine_fee DECIMAL(10,2) DEFAULT 0.00,
      emergency_fee DECIMAL(10,2) DEFAULT 0.00,
      platform_fee_override DECIMAL(10,2),
      changed_by VARCHAR REFERENCES users(id),
      reason TEXT,
      changed_at TIMESTAMP DEFAULT NOW()
    )`, "table: service_price_history");

    await run(`CREATE TABLE IF NOT EXISTS service_packages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      name TEXT NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      duration INTEGER,
      image_url TEXT,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: service_packages");

    await run(`CREATE TABLE IF NOT EXISTS practitioners (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      name TEXT NOT NULL,
      title TEXT,
      specialization TEXT,
      bio TEXT,
      photo_url TEXT,
      business_name TEXT,
      years_experience INTEGER DEFAULT 0,
      languages TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      is_verified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: practitioners");

    await run(`CREATE TABLE IF NOT EXISTS service_practitioners (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id VARCHAR NOT NULL REFERENCES services(id),
      practitioner_id VARCHAR NOT NULL REFERENCES practitioners(id),
      fee DECIMAL(10,2) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: service_practitioners");

    await run(`CREATE TABLE IF NOT EXISTS practitioner_schedules (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      practitioner_id VARCHAR NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
      weekly_schedule JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: practitioner_schedules");

    await run(`CREATE TABLE IF NOT EXISTS package_services (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      package_id VARCHAR NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
      service_id VARCHAR NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0
    )`, "table: package_services");

    await run(`CREATE TABLE IF NOT EXISTS time_slots (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_booked BOOLEAN DEFAULT false,
      is_blocked BOOLEAN DEFAULT false,
      version INTEGER DEFAULT 1
    )`, "table: time_slots");

    await run(`CREATE INDEX IF NOT EXISTS idx_time_slots_provider_id ON time_slots(provider_id)`, "index: time_slots.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_time_slots_date ON time_slots(date)`, "index: time_slots.date");
    await run(`CREATE INDEX IF NOT EXISTS idx_time_slots_provider_date ON time_slots(provider_id, date)`, "index: time_slots provider+date");
    await run(`CREATE INDEX IF NOT EXISTS idx_time_slots_is_booked ON time_slots(is_booked)`, "index: time_slots.is_booked");

    await run(`CREATE TABLE IF NOT EXISTS provider_time_off (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_time_off");

    await run(`CREATE INDEX IF NOT EXISTS idx_provider_time_off_provider_id ON provider_time_off(provider_id)`, "index: provider_time_off.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_provider_time_off_dates ON provider_time_off(provider_id, start_date, end_date)`, "index: provider_time_off dates");

    await run(`CREATE SEQUENCE IF NOT EXISTS appointment_number_seq START 1`, "sequence: appointment_number_seq");

    await run(`CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_number TEXT UNIQUE,
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_member_id VARCHAR,
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      service_id VARCHAR REFERENCES services(id) ON DELETE SET NULL,
      practitioner_id VARCHAR REFERENCES practitioners(id),
      time_slot_id VARCHAR REFERENCES time_slots(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      visit_type visit_type NOT NULL,
      status appointment_status NOT NULL DEFAULT 'pending',
      payment_status payment_status DEFAULT 'pending',
      notes TEXT,
      private_note TEXT,
      patient_address TEXT,
      patient_latitude DOUBLE PRECISION,
      patient_longitude DOUBLE PRECISION,
      contact_person TEXT,
      contact_mobile TEXT,
      total_amount DECIMAL(10,2) NOT NULL,
      platform_fee_amount DECIMAL(10,2) DEFAULT 0.00,
      service_price_snapshot DECIMAL(10,2),
      promo_code TEXT,
      promo_discount DECIMAL(10,2) DEFAULT 0.00,
      tax_amount DECIMAL(10,2) DEFAULT 0.00,
      pricing_breakdown JSONB,
      invoice_generated BOOLEAN DEFAULT false,
      parent_appointment_id VARCHAR,
      is_rescheduled BOOLEAN DEFAULT false,
      google_calendar_event_id TEXT,
      cancelled_by TEXT,
      cancelled_at TIMESTAMP,
      refund_amount DECIMAL(10,2) DEFAULT 0.00,
      refund_status TEXT,
      display_currency TEXT,
      display_amount DECIMAL(14,2),
      exchange_rate_used DECIMAL(16,6),
      country_code country_code NOT NULL DEFAULT 'HU',
      outcome_note TEXT,
      follow_up_recommended BOOLEAN DEFAULT false,
      referral_needed BOOLEAN DEFAULT false,
      follow_up_recommended_at TIMESTAMP,
      intake_responses JSONB,
      video_room_url TEXT,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: appointments");

    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id)`, "index: appointments.patient_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_provider_id ON appointments(provider_id)`, "index: appointments.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`, "index: appointments.status");
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)`, "index: appointments.date");
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON appointments(created_at)`, "index: appointments.created_at");
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_country_code ON appointments(country_code)`, "index: appointments.country_code");
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_refund_status ON appointments(refund_status) WHERE refund_status IS NOT NULL`, "index: appointments.refund_status");
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_number ON appointments(appointment_number) WHERE appointment_number IS NOT NULL`, "index: appointments appointment_number");

    await run(`CREATE TABLE IF NOT EXISTS appointment_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
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
    )`, "table: appointment_events");

    await run(`CREATE INDEX IF NOT EXISTS idx_appt_events_appointment_id ON appointment_events(appointment_id)`, "index: appointment_events.appointment_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_appt_events_action ON appointment_events(action)`, "index: appointment_events.action");
    await run(`CREATE INDEX IF NOT EXISTS idx_appt_events_created_at ON appointment_events(created_at)`, "index: appointment_events.created_at");

    await run(`CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number TEXT NOT NULL UNIQUE,
      appointment_id VARCHAR NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      issue_date TIMESTAMP DEFAULT NOW() NOT NULL,
      due_date TIMESTAMP NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      tax_amount DECIMAL(10,2) DEFAULT 0.00,
      total_amount DECIMAL(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      pdf_url TEXT,
      last_reminder_at TIMESTAMP,
      reminder_count INTEGER NOT NULL DEFAULT 0,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: invoices");

    await run(`CREATE INDEX IF NOT EXISTS idx_invoices_country_code ON invoices(country_code)`, "index: invoices.country_code");

    await run(`CREATE TABLE IF NOT EXISTS invoice_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id VARCHAR NOT NULL REFERENCES invoices(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(10,2) NOT NULL,
      total_price DECIMAL(10,2) NOT NULL,
      practitioner_id VARCHAR REFERENCES practitioners(id)
    )`, "table: invoice_items");

    await run(`CREATE TABLE IF NOT EXISTS provider_earnings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      appointment_id VARCHAR NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      total_amount DECIMAL(10,2) NOT NULL,
      platform_fee DECIMAL(10,2) NOT NULL,
      provider_earning DECIMAL(10,2) NOT NULL,
      status earning_status NOT NULL DEFAULT 'pending',
      paid_at TIMESTAMP,
      paid_by_user_id VARCHAR REFERENCES users(id),
      payout_reference TEXT,
      display_currency TEXT,
      display_amount DECIMAL(14,2),
      exchange_rate_used DECIMAL(16,6),
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_earnings");

    await run(`CREATE INDEX IF NOT EXISTS idx_provider_earnings_provider_id ON provider_earnings(provider_id)`, "index: provider_earnings.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_provider_earnings_status ON provider_earnings(status)`, "index: provider_earnings.status");
    await run(`CREATE INDEX IF NOT EXISTS idx_provider_earnings_created_at ON provider_earnings(created_at)`, "index: provider_earnings.created_at");

    await run(`CREATE TABLE IF NOT EXISTS reviews (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      rating INTEGER NOT NULL,
      comment TEXT,
      provider_reply TEXT,
      provider_reply_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: reviews");

    await run(`CREATE INDEX IF NOT EXISTS idx_reviews_patient_id ON reviews(patient_id)`, "index: reviews.patient_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_reviews_provider_created ON reviews(provider_id, created_at)`, "index: reviews provider+created");

    await run(`CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR REFERENCES appointments(id),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      amount DECIMAL(10,2) NOT NULL,
      refunded_amount DECIMAL(10,2) DEFAULT 0.00,
      currency TEXT DEFAULT 'USD',
      payment_method TEXT NOT NULL DEFAULT 'card',
      status payment_status NOT NULL DEFAULT 'pending',
      stripe_payment_id TEXT,
      stripe_session_id TEXT,
      stripe_refund_id TEXT,
      refund_status TEXT,
      display_currency TEXT,
      display_amount DECIMAL(14,2),
      exchange_rate_used DECIMAL(16,6),
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: payments");

    await run(`CREATE INDEX IF NOT EXISTS idx_payments_appointment_id ON payments(appointment_id)`, "index: payments.appointment_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments(patient_id)`, "index: payments.patient_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`, "index: payments.status");
    await run(`CREATE INDEX IF NOT EXISTS idx_payments_country_code ON payments(country_code)`, "index: payments.country_code");
    await run(`CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at)`, "index: payments.created_at");

    await run(`CREATE TABLE IF NOT EXISTS group_sessions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      service_id VARCHAR REFERENCES services(id),
      title TEXT NOT NULL,
      description TEXT,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      max_participants INTEGER NOT NULL,
      price_per_user DECIMAL(10,2) NOT NULL,
      status group_session_status NOT NULL DEFAULT 'scheduled',
      meeting_link TEXT,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: group_sessions");

    await run(`CREATE INDEX IF NOT EXISTS idx_group_sessions_provider_id ON group_sessions(provider_id)`, "index: group_sessions.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_group_sessions_status ON group_sessions(status)`, "index: group_sessions.status");
    await run(`CREATE INDEX IF NOT EXISTS idx_group_sessions_start_time ON group_sessions(start_time)`, "index: group_sessions.start_time");
    await run(`CREATE INDEX IF NOT EXISTS idx_group_sessions_country_code ON group_sessions(country_code)`, "index: group_sessions.country_code");

    await run(`CREATE TABLE IF NOT EXISTS group_session_participants (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      payment_status payment_status NOT NULL DEFAULT 'pending',
      attendance_status group_attendance NOT NULL DEFAULT 'registered',
      amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payment_method TEXT,
      joined_at TIMESTAMP,
      refunded_at TIMESTAMP,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: group_session_participants");

    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_group_participant_session_user ON group_session_participants(session_id, user_id)`, "index: group_session_participants unique");
    await run(`CREATE INDEX IF NOT EXISTS idx_group_participants_user_id ON group_session_participants(user_id)`, "index: group_session_participants.user_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_group_participants_session_id ON group_session_participants(session_id)`, "index: group_session_participants.session_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_group_participants_country_code ON group_session_participants(country_code)`, "index: group_session_participants.country_code");

    await run(`CREATE TABLE IF NOT EXISTS chat_conversations (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      provider_id VARCHAR NOT NULL REFERENCES users(id),
      last_message TEXT,
      last_message_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: chat_conversations");

    await run(`CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id VARCHAR NOT NULL REFERENCES chat_conversations(id),
      sender_id VARCHAR NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: chat_messages");

    await run(`CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR REFERENCES users(id),
      title TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: conversations");

    await run(`CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: messages");

    await run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      token TEXT UNIQUE,
      token_hash TEXT UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: refresh_tokens");

    await run(`CREATE TABLE IF NOT EXISTS promo_codes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      discount_type TEXT NOT NULL,
      discount_value DECIMAL(10,2) NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      max_uses INTEGER,
      used_count INTEGER DEFAULT 0,
      valid_from TIMESTAMP NOT NULL,
      valid_until TIMESTAMP NOT NULL,
      is_active BOOLEAN DEFAULT true,
      applicable_providers TEXT[],
      min_amount DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: promo_codes");

    await run(`CREATE TABLE IF NOT EXISTS provider_pricing_overrides (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      consultation_fee DECIMAL(10,2),
      home_visit_fee DECIMAL(10,2),
      discount_percentage DECIMAL(5,2),
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_pricing_overrides");

    await run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR REFERENCES users(id),
      action audit_action NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id VARCHAR,
      details TEXT,
      before_state JSONB,
      after_state JSONB,
      payload JSONB,
      ip_address TEXT,
      user_agent TEXT,
      country_code TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: audit_logs");

    await run(`CREATE TABLE IF NOT EXISTS system_events (
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
    )`, "table: system_events");

    await run(`CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR REFERENCES users(id),
      assigned_to VARCHAR REFERENCES users(id),
      name TEXT,
      mobile_number TEXT,
      location TEXT,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status ticket_status NOT NULL DEFAULT 'open',
      priority ticket_priority NOT NULL DEFAULT 'medium',
      category TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    )`, "table: support_tickets");

    await run(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status)`, "index: support_tickets.status");
    await run(`CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON support_tickets(user_id)`, "index: support_tickets.user_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON support_tickets(created_at)`, "index: support_tickets.created_at");

    await run(`CREATE TABLE IF NOT EXISTS ticket_messages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id VARCHAR NOT NULL REFERENCES support_tickets(id),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      is_internal BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: ticket_messages");

    await run(`CREATE TABLE IF NOT EXISTS content_blocks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type content_type NOT NULL,
      is_published BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: content_blocks");

    await run(`CREATE TABLE IF NOT EXISTS faqs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      sort_order INTEGER DEFAULT 0,
      is_published BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: faqs");

    await run(`CREATE TABLE IF NOT EXISTS blog_posts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      author_id VARCHAR NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT,
      content TEXT NOT NULL,
      featured_image TEXT,
      tags TEXT[],
      is_published BOOLEAN DEFAULT false,
      published_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: blog_posts");

    await run(`CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type announcement_type NOT NULL DEFAULT 'info',
      target_audience TEXT DEFAULT 'all',
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: announcements");

    await run(`CREATE TABLE IF NOT EXISTS email_templates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      variables TEXT[],
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: email_templates");

    await run(`CREATE TABLE IF NOT EXISTS notification_queue (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: notification_queue");

    await run(`CREATE TABLE IF NOT EXISTS service_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      service_name TEXT NOT NULL,
      sub_service_name TEXT NOT NULL,
      suggested_price DECIMAL(10,2),
      description TEXT,
      location_mode TEXT NOT NULL DEFAULT 'both',
      status TEXT NOT NULL DEFAULT 'pending_review',
      admin_notes TEXT,
      rejection_reason TEXT,
      created_service_id VARCHAR REFERENCES services(id) ON DELETE SET NULL,
      country_code country_code NOT NULL DEFAULT 'HU',
      reviewed_by VARCHAR,
      reviewed_at TIMESTAMP,
      currency TEXT DEFAULT 'USD',
      duration_minutes INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: service_requests");

    await run(`CREATE INDEX IF NOT EXISTS idx_service_requests_provider_id ON service_requests(provider_id)`, "index: service_requests.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status)`, "index: service_requests.status");
    await run(`CREATE INDEX IF NOT EXISTS idx_service_requests_country_code ON service_requests(country_code)`, "index: service_requests.country_code");

    await run(`CREATE TABLE IF NOT EXISTS platform_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      category TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: platform_settings");

    await run(`CREATE TABLE IF NOT EXISTS locations (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: locations");

    await run(`CREATE TABLE IF NOT EXISTS daily_metrics (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      date TEXT NOT NULL UNIQUE,
      new_users INTEGER DEFAULT 0,
      new_providers INTEGER DEFAULT 0,
      total_appointments INTEGER DEFAULT 0,
      completed_appointments INTEGER DEFAULT 0,
      revenue DECIMAL(12,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: daily_metrics");

    await run(`CREATE TABLE IF NOT EXISTS prescriptions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR NOT NULL REFERENCES appointments(id),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      medication_name TEXT NOT NULL,
      dosage TEXT NOT NULL,
      frequency TEXT NOT NULL,
      duration TEXT NOT NULL,
      instructions TEXT,
      attachments TEXT[],
      issued_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      is_active BOOLEAN DEFAULT true
    )`, "table: prescriptions");

    await run(`CREATE TABLE IF NOT EXISTS family_members (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      primary_user_id VARCHAR NOT NULL REFERENCES users(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      date_of_birth TEXT,
      gender TEXT,
      phone TEXT,
      email TEXT,
      blood_type TEXT,
      allergies TEXT,
      medical_conditions TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      formatted_address TEXT,
      place_id TEXT,
      use_parent_address BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: family_members");

    await run(`CREATE TABLE IF NOT EXISTS saved_addresses (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL DEFAULT 'Home',
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      formatted_address TEXT,
      place_id TEXT,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: saved_addresses");

    await run(`CREATE TABLE IF NOT EXISTS medications (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      family_member_id VARCHAR REFERENCES family_members(id),
      name TEXT NOT NULL,
      dosage TEXT,
      frequency TEXT,
      times_of_day TEXT[],
      start_date TEXT,
      end_date TEXT,
      instructions TEXT,
      prescription_id VARCHAR REFERENCES prescriptions(id),
      reminder_enabled BOOLEAN NOT NULL DEFAULT true,
      color TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: medications");

    await run(`CREATE TABLE IF NOT EXISTS medication_logs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      medication_id VARCHAR NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'taken',
      taken_at TIMESTAMP DEFAULT NOW(),
      notes TEXT
    )`, "table: medication_logs");

    await run(`CREATE TABLE IF NOT EXISTS health_metrics (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      measured_at TIMESTAMP NOT NULL DEFAULT NOW(),
      weight_kg DECIMAL(5,2),
      height_cm INTEGER,
      systolic INTEGER,
      diastolic INTEGER,
      heart_rate INTEGER,
      blood_glucose DECIMAL(5,2),
      temperature_c DECIMAL(4,2),
      oxygen_saturation INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: health_metrics");

    await run(`CREATE TABLE IF NOT EXISTS medical_history (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      provider_id VARCHAR REFERENCES providers(id),
      type medical_history_type NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      date TIMESTAMP NOT NULL,
      attachments TEXT[],
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: medical_history");

    await run(`CREATE TABLE IF NOT EXISTS user_notifications (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      type TEXT,
      data TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: user_notifications");

    await run(`CREATE TABLE IF NOT EXISTS realtime_conversations (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      participant1_id VARCHAR NOT NULL REFERENCES users(id),
      participant2_id VARCHAR NOT NULL REFERENCES users(id),
      last_message TEXT,
      last_message_at TIMESTAMP DEFAULT NOW(),
      muted_by TEXT[] NOT NULL DEFAULT '{}',
      pinned_by TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: realtime_conversations");

    await run(`CREATE TABLE IF NOT EXISTS realtime_messages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id VARCHAR NOT NULL REFERENCES realtime_conversations(id),
      sender_id VARCHAR NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      read_at TIMESTAMP,
      attachment_url TEXT,
      attachment_type TEXT,
      attachment_name TEXT,
      voice_note_url TEXT,
      voice_duration_sec INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: realtime_messages");

    await run(`CREATE TABLE IF NOT EXISTS tax_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      country TEXT NOT NULL,
      tax_name TEXT NOT NULL,
      tax_rate DECIMAL(5,2) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      year INTEGER
    )`, "table: tax_settings");

    await run(`CREATE TABLE IF NOT EXISTS patient_consents (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      family_member_id VARCHAR REFERENCES family_members(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL,
      is_accepted BOOLEAN NOT NULL,
      consent_version TEXT DEFAULT '1.0',
      ip_address TEXT,
      user_agent TEXT,
      accepted_at TIMESTAMP DEFAULT NOW()
    )`, "table: patient_consents");

    await run(`CREATE TABLE IF NOT EXISTS medical_practitioners (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      name TEXT NOT NULL,
      specialization TEXT NOT NULL,
      experience INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: medical_practitioners");

    await run(`CREATE TABLE IF NOT EXISTS saved_providers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(patient_id, provider_id)
    )`, "table: saved_providers");

    await run(`CREATE TABLE IF NOT EXISTS notification_preferences (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) UNIQUE,
      email_enabled BOOLEAN NOT NULL DEFAULT true,
      sms_enabled BOOLEAN NOT NULL DEFAULT false,
      whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
      push_enabled BOOLEAN NOT NULL DEFAULT true,
      in_app_enabled BOOLEAN NOT NULL DEFAULT true,
      event_overrides TEXT,
      quiet_hours_start TEXT,
      quiet_hours_end TEXT,
      email_digest TEXT NOT NULL DEFAULT 'off',
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: notification_preferences");

    await run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: push_subscriptions");

    await run(`CREATE TABLE IF NOT EXISTS video_sessions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR NOT NULL REFERENCES appointments(id) UNIQUE,
      provider TEXT NOT NULL DEFAULT 'stub',
      room_url TEXT NOT NULL,
      room_name TEXT,
      patient_token TEXT,
      provider_token TEXT,
      expires_at TIMESTAMP,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: video_sessions");

    await run(`CREATE TABLE IF NOT EXISTS provider_office_hours (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_user_id VARCHAR NOT NULL REFERENCES users(id) UNIQUE,
      provider_id VARCHAR REFERENCES providers(id),
      weekly_schedule TEXT,
      timezone TEXT DEFAULT 'UTC',
      auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
      auto_reply_message TEXT DEFAULT 'Thanks for your message. I am currently outside my office hours and will reply as soon as possible.',
      emergency_contact TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_office_hours");

    await run(`CREATE TABLE IF NOT EXISTS notification_delivery_logs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      event_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT,
      error_message TEXT,
      payload TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: notification_delivery_logs");

    await run(`CREATE INDEX IF NOT EXISTS idx_ndl_created_at ON notification_delivery_logs(created_at)`, "index: notification_delivery_logs.created_at");
    await run(`CREATE INDEX IF NOT EXISTS idx_ndl_status ON notification_delivery_logs(status)`, "index: notification_delivery_logs.status");

    await run(`CREATE TABLE IF NOT EXISTS wallets (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) UNIQUE,
      balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      currency TEXT NOT NULL DEFAULT 'USD',
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: wallets");

    await run(`CREATE TABLE IF NOT EXISTS wallet_transactions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id VARCHAR NOT NULL REFERENCES wallets(id),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      type wallet_tx_type NOT NULL,
      status wallet_tx_status NOT NULL DEFAULT 'completed',
      amount DECIMAL(14,2) NOT NULL,
      balance_after DECIMAL(14,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      description TEXT,
      reference_type TEXT,
      reference_id TEXT,
      idempotency_key TEXT UNIQUE,
      created_by_id VARCHAR REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      amount_usd DECIMAL(14,4),
      exchange_rate_used DECIMAL(16,6)
    )`, "table: wallet_transactions");

    await run(`CREATE TABLE IF NOT EXISTS admin_broadcasts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id VARCHAR NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'all',
      channels TEXT[] NOT NULL DEFAULT '{in_app}',
      recipient_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: admin_broadcasts");

    await run(`CREATE TABLE IF NOT EXISTS refund_rules (
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
    )`, "table: refund_rules");

    await run(`CREATE TABLE IF NOT EXISTS referrals (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id VARCHAR NOT NULL REFERENCES users(id),
      referred_user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      reward_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      reward_currency TEXT NOT NULL DEFAULT 'USD',
      qualifying_appointment_id VARCHAR,
      qualified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: referrals");

    await run(`CREATE TABLE IF NOT EXISTS availability_exceptions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: availability_exceptions");

    await run(`CREATE INDEX IF NOT EXISTS idx_avail_exc_provider_date ON availability_exceptions(provider_id, date)`, "index: availability_exceptions provider+date");

    await run(`CREATE TABLE IF NOT EXISTS patient_notes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appointment_id VARCHAR,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: patient_notes");

    await run(`CREATE INDEX IF NOT EXISTS idx_patient_notes_provider ON patient_notes(provider_id)`, "index: patient_notes.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_patient_notes_patient ON patient_notes(patient_id)`, "index: patient_notes.patient_id");

    await run(`CREATE TABLE IF NOT EXISTS gift_cards (
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
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: gift_cards");

    await run(`CREATE TABLE IF NOT EXISTS disputes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id VARCHAR NOT NULL,
      patient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      resolution TEXT,
      resolved_by_user_id VARCHAR REFERENCES users(id),
      resolved_at TIMESTAMP,
      refund_issued BOOLEAN DEFAULT false,
      refund_amount DECIMAL(10,2) DEFAULT 0.00,
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: disputes");

    await run(`CREATE TABLE IF NOT EXISTS waitlist_entries (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      provider_id VARCHAR NOT NULL REFERENCES providers(id),
      service_id VARCHAR REFERENCES services(id),
      preferred_date TEXT,
      preferred_start_time TEXT,
      preferred_end_time TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      notified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: waitlist_entries");

    await run(`CREATE TABLE IF NOT EXISTS provider_gallery (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      public_id TEXT,
      caption TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_gallery");

    await run(`CREATE INDEX IF NOT EXISTS idx_provider_gallery_provider_id ON provider_gallery(provider_id)`, "index: provider_gallery.provider_id");

    await run(`CREATE TABLE IF NOT EXISTS patient_gallery (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      public_id TEXT,
      caption TEXT,
      file_type TEXT DEFAULT 'image',
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: patient_gallery");

    await run(`CREATE INDEX IF NOT EXISTS idx_patient_gallery_user_id ON patient_gallery(user_id)`, "index: patient_gallery.user_id");

    await run(`CREATE TABLE IF NOT EXISTS provider_documents (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_url TEXT NOT NULL,
      cloudinary_public_id TEXT,
      file_name TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      expiry_date TEXT,
      expiry_required BOOLEAN DEFAULT false,
      expired_at TIMESTAMP,
      reminder_days_before INTEGER DEFAULT 30,
      document_criticality TEXT DEFAULT 'optional',
      verified_by VARCHAR,
      verified_at TIMESTAMP,
      admin_note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_documents");

    await run(`CREATE INDEX IF NOT EXISTS idx_provider_documents_provider_id ON provider_documents(provider_id)`, "index: provider_documents.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_provider_documents_verification_status ON provider_documents(verification_status)`, "index: provider_documents.verification_status");

    await run(`CREATE TABLE IF NOT EXISTS provider_credentials (
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
    )`, "table: provider_credentials");

    await run(`CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider_id ON provider_credentials(provider_id)`, "index: provider_credentials.provider_id");

    await run(`CREATE TABLE IF NOT EXISTS provider_category_permissions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      category provider_type NOT NULL,
      granted_by VARCHAR REFERENCES users(id),
      granted_at TIMESTAMP DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT true,
      UNIQUE(provider_id, category)
    )`, "table: provider_category_permissions");

    await run(`CREATE TABLE IF NOT EXISTS invoice_templates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT 'HU',
      header_text TEXT,
      footer_text TEXT,
      logo_url TEXT,
      primary_color TEXT DEFAULT '#10b981',
      show_tax_breakdown BOOLEAN DEFAULT true,
      custom_fields JSONB,
      is_default BOOLEAN DEFAULT false,
      created_by VARCHAR REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: invoice_templates");

    await run(`CREATE TABLE IF NOT EXISTS admin_roles (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: admin_roles");

    await run(`CREATE TABLE IF NOT EXISTS rbac_permissions (
      key TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT
    )`, "table: rbac_permissions");

    await run(`CREATE TABLE IF NOT EXISTS role_permissions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id VARCHAR NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
      permission_key TEXT NOT NULL REFERENCES rbac_permissions(key) ON DELETE CASCADE
    )`, "table: role_permissions");

    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_role_permission ON role_permissions(role_id, permission_key)`, "index: role_permissions unique");

    await run(`CREATE TABLE IF NOT EXISTS admin_assignments (
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
    )`, "table: admin_assignments");

    await run(`CREATE INDEX IF NOT EXISTS idx_admin_assignments_user_id ON admin_assignments(user_id)`, "index: admin_assignments.user_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_admin_assignments_role_id ON admin_assignments(role_id)`, "index: admin_assignments.role_id");

    await run(`CREATE TABLE IF NOT EXISTS provider_buffer_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      practitioner_id VARCHAR REFERENCES practitioners(id) ON DELETE CASCADE,
      clinic_buffer_before INTEGER NOT NULL DEFAULT 0,
      clinic_buffer_after INTEGER NOT NULL DEFAULT 0,
      home_buffer_before INTEGER NOT NULL DEFAULT 15,
      home_buffer_after INTEGER NOT NULL DEFAULT 15,
      online_buffer_before INTEGER NOT NULL DEFAULT 0,
      online_buffer_after INTEGER NOT NULL DEFAULT 0,
      travel_radius_km DECIMAL(6,2) DEFAULT 0.00,
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_buffer_settings");

    await run(`CREATE INDEX IF NOT EXISTS idx_pbs_provider_id ON provider_buffer_settings(provider_id)`, "index: provider_buffer_settings.provider_id");

    await run(`CREATE TABLE IF NOT EXISTS provider_blocks (
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
    )`, "table: provider_blocks");

    await run(`CREATE INDEX IF NOT EXISTS idx_provider_blocks_provider_id ON provider_blocks(provider_id)`, "index: provider_blocks.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_provider_blocks_start ON provider_blocks(provider_id, start_datetime)`, "index: provider_blocks.provider_id+start");

    await run(`CREATE TABLE IF NOT EXISTS appointment_slot_holds (
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
    )`, "table: appointment_slot_holds");

    await run(`CREATE INDEX IF NOT EXISTS idx_slot_holds_provider_date ON appointment_slot_holds(provider_id, date)`, "index: appointment_slot_holds provider+date");
    await run(`CREATE INDEX IF NOT EXISTS idx_slot_holds_expires ON appointment_slot_holds(expires_at)`, "index: appointment_slot_holds.expires_at");

    await run(`CREATE TABLE IF NOT EXISTS packages (
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
    )`, "table: packages");

    await run(`CREATE TABLE IF NOT EXISTS package_benefits (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      package_id VARCHAR NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      benefit_key benefit_key NOT NULL,
      benefit_value DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      notes TEXT
    )`, "table: package_benefits");

    await run(`CREATE INDEX IF NOT EXISTS idx_package_benefits_pkg ON package_benefits(package_id)`, "index: package_benefits.package_id");

    await run(`CREATE TABLE IF NOT EXISTS user_packages (
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
      auto_renew BOOLEAN NOT NULL DEFAULT false,
      paused_at TIMESTAMP,
      grace_period_ends_at TIMESTAMP,
      renewal_notified_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: user_packages");

    await run(`CREATE INDEX IF NOT EXISTS idx_user_packages_user ON user_packages(user_id, status)`, "index: user_packages user+status");
    await run(`CREATE INDEX IF NOT EXISTS idx_user_packages_pkg ON user_packages(package_id)`, "index: user_packages.package_id");

    await run(`CREATE TABLE IF NOT EXISTS membership_benefit_usage (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_package_id VARCHAR NOT NULL REFERENCES user_packages(id) ON DELETE CASCADE,
      benefit_id VARCHAR REFERENCES package_benefits(id) ON DELETE SET NULL,
      benefit_type VARCHAR(100),
      quantity INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      appointment_id VARCHAR REFERENCES appointments(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: membership_benefit_usage");

    await run(`CREATE INDEX IF NOT EXISTS idx_benefit_usage_pkg ON membership_benefit_usage(user_package_id)`, "index: membership_benefit_usage.user_package_id");

    await run(`CREATE TABLE IF NOT EXISTS payout_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      amount DECIMAL(14,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      display_currency TEXT,
      display_amount DECIMAL(14,2),
      exchange_rate_used DECIMAL(16,6),
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
    )`, "table: payout_requests");

    await run(`CREATE TABLE IF NOT EXISTS provider_wallets (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
      available_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      pending_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      held_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      lifetime_earnings DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      currency TEXT NOT NULL DEFAULT 'USD',
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      frozen_reason TEXT,
      last_payout_date TIMESTAMP,
      country_code country_code NOT NULL DEFAULT 'HU',
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_wallets");

    await run(`CREATE TABLE IF NOT EXISTS provider_ledger (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      amount DECIMAL(14,2) NOT NULL,
      entry_type TEXT NOT NULL,
      reference_id TEXT,
      description TEXT,
      actor_id VARCHAR REFERENCES users(id),
      balance_after DECIMAL(14,2),
      country_code country_code NOT NULL DEFAULT 'HU',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      currency TEXT DEFAULT 'USD',
      amount_usd DECIMAL(14,4),
      exchange_rate_used DECIMAL(16,6)
    )`, "table: provider_ledger");

    await run(`CREATE INDEX IF NOT EXISTS idx_provider_ledger_provider_id ON provider_ledger(provider_id)`, "index: provider_ledger.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_provider_ledger_created_at ON provider_ledger(created_at)`, "index: provider_ledger.created_at");
    await run(`CREATE INDEX IF NOT EXISTS idx_provider_ledger_entry_type ON provider_ledger(entry_type)`, "index: provider_ledger.entry_type");

    await run(`CREATE TABLE IF NOT EXISTS patient_documents (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id VARCHAR NOT NULL REFERENCES users(id),
      family_member_id VARCHAR REFERENCES family_members(id) ON DELETE CASCADE,
      appointment_id VARCHAR REFERENCES appointments(id),
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
    )`, "table: patient_documents");

    await run(`CREATE TABLE IF NOT EXISTS platform_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type TEXT NOT NULL,
      user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      country_code TEXT,
      provider_id VARCHAR REFERENCES providers(id) ON DELETE SET NULL,
      service_category TEXT,
      service_mode TEXT,
      metadata TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: platform_events");

    await run(`CREATE TABLE IF NOT EXISTS bug_reports (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      country_code country_code NOT NULL DEFAULT 'HU',
      reported_by_user_id VARCHAR NOT NULL REFERENCES users(id),
      reporter_role TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      steps_to_reproduce TEXT,
      category bug_category NOT NULL DEFAULT 'bug',
      severity bug_severity NOT NULL DEFAULT 'medium',
      priority bug_priority NOT NULL DEFAULT 'medium',
      status bug_status NOT NULL DEFAULT 'new',
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
    )`, "table: bug_reports");

    await run(`CREATE TABLE IF NOT EXISTS bug_report_comments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      bug_report_id VARCHAR NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      role TEXT,
      message TEXT NOT NULL,
      attachment_url TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: bug_report_comments");

    await run(`CREATE TABLE IF NOT EXISTS provider_schedule_templates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_duration_mins INTEGER DEFAULT 30,
      buffer_before_mins INTEGER DEFAULT 0,
      buffer_after_mins INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      modality TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_schedule_templates");

    await run(`CREATE INDEX IF NOT EXISTS idx_sched_tmpl_provider ON provider_schedule_templates(provider_id)`, "index: provider_schedule_templates.provider_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_sched_tmpl_provider_day ON provider_schedule_templates(provider_id, day_of_week)`, "index: provider_schedule_templates provider+day");

    await run(`CREATE TABLE IF NOT EXISTS marketplace_ledger (
      id SERIAL PRIMARY KEY,
      appointment_id VARCHAR,
      source_account VARCHAR(64) NOT NULL,
      destination_account VARCHAR(64) NOT NULL,
      amount_cents INTEGER NOT NULL,
      transaction_type VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      currency_iso VARCHAR(3) NOT NULL DEFAULT 'USD',
      country_code VARCHAR(2) NOT NULL DEFAULT 'HU',
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )`, "table: marketplace_ledger");

    await run(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_appointment ON marketplace_ledger(appointment_id)`, "index: marketplace_ledger.appointment_id");
    await run(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_status ON marketplace_ledger(status)`, "index: marketplace_ledger.status");
    await run(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_dest ON marketplace_ledger(destination_account)`, "index: marketplace_ledger.destination");
    await run(`CREATE INDEX IF NOT EXISTS idx_mkt_ledger_created ON marketplace_ledger(created_at)`, "index: marketplace_ledger.created_at");

    // ── Remaining tables from runStartupMigrations ────────────────────────────
    await run(`CREATE TABLE IF NOT EXISTS provider_admin_notes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      admin_id VARCHAR NOT NULL REFERENCES users(id),
      note TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: provider_admin_notes");

    await run(`CREATE TABLE IF NOT EXISTS clinic_rooms (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      capacity INTEGER DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT true,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: clinic_rooms");

    await run(`CREATE TABLE IF NOT EXISTS room_reservations (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id VARCHAR NOT NULL REFERENCES clinic_rooms(id) ON DELETE CASCADE,
      appointment_id VARCHAR REFERENCES appointments(id) ON DELETE CASCADE,
      reserved_by VARCHAR NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: room_reservations");

    await run(`CREATE TABLE IF NOT EXISTS intake_schemas (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id VARCHAR NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      schema JSONB NOT NULL DEFAULT '[]',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`, "table: intake_schemas");

    await run(`CREATE TABLE IF NOT EXISTS provider_schedule_overrides (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      is_available BOOLEAN NOT NULL DEFAULT false,
      start_time TEXT,
      end_time TEXT,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: provider_schedule_overrides");

    await run(`CREATE TABLE IF NOT EXISTS privacy_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      processed_by VARCHAR REFERENCES users(id),
      processed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: privacy_requests");

    await run(`CREATE TABLE IF NOT EXISTS idempotency_keys (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL DEFAULT 'general',
      response_status INTEGER,
      response_body TEXT,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`, "table: idempotency_keys");

    await run(`CREATE TABLE IF NOT EXISTS financial_alerts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      message TEXT NOT NULL,
      metadata JSONB,
      country_code TEXT,
      is_resolved BOOLEAN NOT NULL DEFAULT false,
      resolved_by VARCHAR REFERENCES users(id),
      resolved_at TIMESTAMP,
      dedup_key TEXT,
      last_seen_at TIMESTAMP DEFAULT NOW(),
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: financial_alerts");

    await run(`CREATE INDEX IF NOT EXISTS idx_financial_alerts_dedup ON financial_alerts(dedup_key) WHERE dedup_key IS NOT NULL`, "index: financial_alerts.dedup_key");
    await run(`CREATE INDEX IF NOT EXISTS idx_financial_alerts_type ON financial_alerts(alert_type, is_resolved)`, "index: financial_alerts type+resolved");

    await run(`CREATE TABLE IF NOT EXISTS password_history (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: password_history");

    await run(`CREATE TABLE IF NOT EXISTS login_attempts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      ip_address TEXT,
      success BOOLEAN NOT NULL DEFAULT false,
      failure_reason TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`, "table: login_attempts");

    await run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created ON login_attempts(email, created_at)`, "index: login_attempts email+created");
    await run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_created ON login_attempts(ip_address, created_at)`, "index: login_attempts ip+created");

    // ── Step 3: FTS support ──────────────────────────────────────────────────
    console.log("\n[3/6] Setting up full-text search…");

    await run(`
      CREATE OR REPLACE FUNCTION providers_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('simple', coalesce(
            (SELECT first_name || ' ' || last_name FROM users WHERE id = NEW.user_id), ''
          )), 'A') ||
          setweight(to_tsvector('simple', coalesce(NEW.specialization, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(NEW.bio, '')), 'C') ||
          setweight(to_tsvector('simple', coalesce(array_to_string(NEW.secondary_specialties, ' '), '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `, "function: providers_search_vector_update");

    await run(`
      DO $$ BEGIN
        CREATE TRIGGER providers_search_vector_trigger
        BEFORE INSERT OR UPDATE ON providers
        FOR EACH ROW EXECUTE FUNCTION providers_search_vector_update();
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `, "trigger: providers_search_vector_trigger");

    await run(`CREATE INDEX IF NOT EXISTS idx_providers_search_vector ON providers USING GIN(search_vector)`, "index: providers.search_vector");
    await run(`CREATE INDEX IF NOT EXISTS idx_providers_country_status_active ON providers(country_code, status) WHERE is_active = true`, "index: providers fts country+status+active");

    // ── Step 4: Seed data ────────────────────────────────────────────────────
    console.log("\n[4/6] Seeding required data…");

    // Payment providers — already seeded by db:push or prior run; skip if rows exist
    const ppCount = await pool.query("SELECT COUNT(*) FROM payment_providers");
    if (parseInt(ppCount.rows[0].count) === 0) {
      await run(`
        INSERT INTO payment_providers (id, provider_key, display_name, description, is_enabled, environment, priority, country_codes, currency_codes, credentials, feature_flags, maintenance_mode, health_status)
        VALUES
          (gen_random_uuid(), 'stripe',       'Stripe',        'International card payments', true, 'live', 1, ARRAY['HU','IR'], ARRAY['USD','EUR','HUF'], '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'otp_bank',     'OTP Bank',      'Hungarian OTP Bank',          true, 'live', 2, ARRAY['HU'],     ARRAY['HUF','EUR'],       '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'wise',         'Wise',          'International bank transfer',  true, 'live', 3, ARRAY['HU','IR'], ARRAY['USD','EUR','HUF'], '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'paypal',       'PayPal',        'PayPal global payments',       true, 'live', 4, ARRAY['HU','IR'], ARRAY['USD','EUR'],       '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'revolut',      'Revolut',       'Revolut digital banking',      true, 'live', 5, ARRAY['HU','IR'], ARRAY['USD','EUR','HUF'], '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'shetab',       'Shetab Card',   'Iranian Shetab card network',  true, 'live', 6, ARRAY['IR'],     ARRAY['IRR'],             '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'sadad',        'Sadad',         'Iranian Sadad payment gateway', true, 'live', 7, ARRAY['IR'],     ARRAY['IRR'],             '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'cash',         'Cash',          'Cash payment on arrival',      true, 'live', 8, ARRAY['HU','IR'], ARRAY['USD','EUR','HUF','IRR'], '{}', '{}', false, 'unknown'),
          (gen_random_uuid(), 'bank_transfer','Bank Transfer',  'Direct bank transfer',         true, 'live', 9, ARRAY['HU','IR'], ARRAY['USD','EUR','HUF','IRR'], '{}', '{}', false, 'unknown')
      `, "seed: payment_providers");
    } else {
      console.log("  ~ seed: payment_providers (already seeded, skipped)");
    }

    // Currency rates — table uses (currency_code, rate_from_usd, fetched_at)
    const crCount = await pool.query("SELECT COUNT(*) FROM currency_rates");
    if (parseInt(crCount.rows[0].count) === 0) {
      await run(`
        INSERT INTO currency_rates (currency_code, rate_from_usd, fetched_at)
        VALUES
          ('USD', 1.0000,   NOW()),
          ('EUR', 1.0870,   NOW()),
          ('HUF', 0.00274,  NOW()),
          ('IRR', 0.0000238,NOW()),
          ('GBP', 1.2658,   NOW())
      `, "seed: currency_rates");
    } else {
      console.log("  ~ seed: currency_rates (already seeded, skipped)");
    }

    // Categories
    await run(`
      INSERT INTO categories (id, slug, name, description, icon, sort_order, is_active)
      SELECT * FROM (VALUES
        (gen_random_uuid()::text, 'physiotherapy',  'Physiotherapy',     'Expert physiotherapy services',       'activity',   1, true),
        (gen_random_uuid()::text, 'doctor',         'Doctor',            'Medical consultations and care',      'stethoscope',2, true),
        (gen_random_uuid()::text, 'home-care-nurse','Home Care Nursing', 'Professional home nursing services',  'heart',      3, true),
        (gen_random_uuid()::text, 'mental-health',  'Mental Health',     'Mental health support',               'brain',      4, true),
        (gen_random_uuid()::text, 'nutrition',      'Nutrition',         'Nutrition and dietary consulting',    'apple',      5, true)
      ) AS t(id, slug, name, description, icon, sort_order, is_active)
      WHERE NOT EXISTS (SELECT 1 FROM categories LIMIT 1)
    `, "seed: categories");

    // Tax settings
    await run(`
      INSERT INTO tax_settings (country, tax_name, tax_rate, is_active, year)
      SELECT * FROM (VALUES
        ('HU','Hungarian VAT',27.00,true,2024),
        ('IR','Iranian VAT',9.00,true,2024),
        ('global','No Tax',0.00,true,2024)
      ) AS t(country, tax_name, tax_rate, is_active, year)
      WHERE NOT EXISTS (SELECT 1 FROM tax_settings LIMIT 1)
    `, "seed: tax_settings");

    // Platform settings
    await run(`
      INSERT INTO platform_settings (key, value, category)
      SELECT * FROM (VALUES
        ('platform_fee_percent','15','billing'),
        ('currency','USD','billing'),
        ('booking_advance_days','90','booking'),
        ('cancellation_hours','24','booking'),
        ('session_timeout_hours','24','security'),
        ('max_login_attempts','5','security'),
        ('maintenance_mode','false','system'),
        ('referral_reward_amount','10.00','referrals'),
        ('referral_reward_currency','USD','referrals')
      ) AS t(key, value, category)
      WHERE NOT EXISTS (SELECT 1 FROM platform_settings LIMIT 1)
    `, "seed: platform_settings");

    // Sub-services
    await run(`
      INSERT INTO sub_services (category, name, description, base_price, duration_minutes, pricing_type, is_active)
      SELECT * FROM (VALUES
        ('physiotherapist'::provider_type, 'Initial Assessment',           'Comprehensive initial assessment',   80.00, 60,  'fixed'::pricing_type, true),
        ('physiotherapist'::provider_type, 'Manual Therapy',               'Hands-on physiotherapy treatment',  70.00, 45,  'fixed'::pricing_type, true),
        ('physiotherapist'::provider_type, 'Sports Rehabilitation',        'Sports injury rehabilitation',       75.00, 60,  'fixed'::pricing_type, true),
        ('physiotherapist'::provider_type, 'Post-Surgery Rehabilitation',  'Post-surgical recovery therapy',     90.00, 60,  'fixed'::pricing_type, true),
        ('doctor'::provider_type,          'General Consultation',         'General medical consultation',       60.00, 30,  'fixed'::pricing_type, true),
        ('doctor'::provider_type,          'Specialist Consultation',      'Specialist medical consultation',   120.00, 45,  'fixed'::pricing_type, true),
        ('doctor'::provider_type,          'Follow-up Visit',              'Follow-up medical visit',            40.00, 20,  'fixed'::pricing_type, true),
        ('nurse'::provider_type,           'Home Nursing Visit',           'Professional home nursing care',     55.00, 60,  'fixed'::pricing_type, true),
        ('nurse'::provider_type,           'Wound Care',                   'Professional wound dressing',        45.00, 30,  'fixed'::pricing_type, true),
        ('nurse'::provider_type,           'IV Therapy',                   'Intravenous therapy administration', 85.00, 60,  'fixed'::pricing_type, true)
      ) AS t(category, name, description, base_price, duration_minutes, pricing_type, is_active)
      WHERE NOT EXISTS (SELECT 1 FROM sub_services LIMIT 1)
    `, "seed: sub_services");

    // ── Step 5: Additional runtime tables from runStartupMigrations ───────────
    console.log("\n[5/6] Ensuring runtime tables…");

    // These are created by runStartupMigrations at startup but we add them here
    // so they're present before the server first starts.
    // These 4 tables were created by db:push with the correct schema already.
    // runStartupMigrations() will add any missing indexes/columns at startup.
    // We just verify they exist.
    await run(`CREATE TABLE IF NOT EXISTS reconciliation_results (
      id           VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
      run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      check_type   VARCHAR(64) NOT NULL,
      severity     VARCHAR(16) NOT NULL DEFAULT 'ok',
      entity_type  VARCHAR(64),
      entity_id    VARCHAR(256),
      message      TEXT,
      details      JSONB,
      country_code VARCHAR(2),
      resolved_at  TIMESTAMPTZ
    )`, "table: reconciliation_results");

    await run(`CREATE INDEX IF NOT EXISTS idx_reconcil_run_at ON reconciliation_results(run_at DESC)`, "index: reconciliation_results.run_at");
    await run(`CREATE INDEX IF NOT EXISTS idx_reconcil_severity ON reconciliation_results(severity, run_at DESC)`, "index: reconciliation_results.severity");

    await run(`CREATE TABLE IF NOT EXISTS monitoring_daily_summary (
      id             VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
      snapshot_date  DATE         NOT NULL,
      total_requests BIGINT       NOT NULL DEFAULT 0,
      errors_4xx     BIGINT       NOT NULL DEFAULT 0,
      errors_5xx     BIGINT       NOT NULL DEFAULT 0,
      slow_requests  BIGINT       NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`, "table: monitoring_daily_summary");

    await run(`CREATE INDEX IF NOT EXISTS idx_mon_daily_date ON monitoring_daily_summary(snapshot_date DESC)`, "index: monitoring_daily_summary.snapshot_date");

    await run(`CREATE TABLE IF NOT EXISTS monitoring_endpoint_stats (
      id             VARCHAR      PRIMARY KEY DEFAULT gen_random_uuid(),
      snapshot_date  DATE         NOT NULL,
      route          VARCHAR(256) NOT NULL,
      total_requests BIGINT       NOT NULL DEFAULT 0,
      avg_ms         INTEGER      NOT NULL DEFAULT 0,
      max_ms         INTEGER      NOT NULL DEFAULT 0,
      errors_4xx     BIGINT       NOT NULL DEFAULT 0,
      errors_5xx     BIGINT       NOT NULL DEFAULT 0,
      slow_hits      BIGINT       NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`, "table: monitoring_endpoint_stats");

    await run(`CREATE INDEX IF NOT EXISTS idx_mon_endpoint_date  ON monitoring_endpoint_stats(snapshot_date DESC)`, "index: monitoring_endpoint_stats.date");
    await run(`CREATE INDEX IF NOT EXISTS idx_mon_endpoint_route ON monitoring_endpoint_stats(route, snapshot_date DESC)`, "index: monitoring_endpoint_stats.route");

    await run(`CREATE TABLE IF NOT EXISTS rate_limit_hits (
      key      VARCHAR(512) PRIMARY KEY,
      hits     INTEGER      NOT NULL DEFAULT 1,
      reset_at TIMESTAMPTZ  NOT NULL
    )`, "table: rate_limit_hits");

    await run(`CREATE INDEX IF NOT EXISTS idx_ratelimit_reset_at ON rate_limit_hits(reset_at)`, "index: rate_limit_hits.reset_at");

    // ── Step 6: Verify ────────────────────────────────────────────────────────
    console.log("\n[6/6] Verifying schema…");
    const { rows } = await client.query(`
      SELECT COUNT(*) as table_count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    console.log(`  ✓ ${rows[0].table_count} tables present in public schema`);

    const { rows: enumRows } = await client.query(`
      SELECT COUNT(*) as enum_count FROM pg_type
      WHERE typcategory = 'E' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `);
    console.log(`  ✓ ${enumRows[0].enum_count} enums present`);

    console.log("\n[bootstrap] ✅ Supabase schema bootstrap COMPLETE");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("[bootstrap] FATAL:", err.message);
  process.exit(1);
});
