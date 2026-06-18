/**
 * UAT Seed Service
 *
 * Populates the database with realistic test accounts for UAT cycles:
 *   - 2 patients  (Emma Kovács, Dávid Barros)
 *   - 2 providers (Dr. Anna Szabó — rehabilitation, Dr. Bence Molnár — physician)
 *   - 2 services per provider
 *   - 4 appointments (2 past+completed with reviews, 2 upcoming+confirmed)
 *   - 2 patient wallets  (pre-loaded with $150 / $200)
 *   - 2 payment records (for completed appointments)
 *   - 2 reviews          (one per completed appointment)
 *   - office hours for both providers
 *
 * All operations are idempotent — re-running adds only what is missing.
 * Seed accounts are identified by their @goldenlife.dev email domain so the
 * database-reset tool will remove them correctly (non-admin roles).
 */

import bcrypt from "bcrypt";
import { pool } from "../db";

export const UAT_PASSWORD = "UATgolden24!";
export const UAT_COUNTRY  = "HU";

export const SEED_EMAILS = {
  patient1:  "uat.patient1@goldenlife.dev",
  patient2:  "uat.patient2@goldenlife.dev",
  physio:    "uat.physio@goldenlife.dev",
  physician: "uat.doctor@goldenlife.dev",
} as const;

export interface SeedAccount {
  role:     string;
  name:     string;
  email:    string;
  password: string;
}

export interface SeedCounts {
  users:        number;
  providers:    number;
  services:     number;
  officeHours:  number;
  appointments: number;
  wallets:      number;
  payments:     number;
  reviews:      number;
}

export interface SeedResult {
  accounts:     SeedAccount[];
  created:      SeedCounts;
  alreadyExists: boolean;
}

export interface SeedStatus {
  patient1:     boolean;
  patient2:     boolean;
  physio:       boolean;
  physician:    boolean;
  appointments: number;
}

// ── Status check (no writes) ─────────────────────────────────────────────────

export async function getSeedStatus(): Promise<SeedStatus> {
  const client = await pool.connect();
  try {
    const { rows: uRows } = await client.query<{ email: string }>(
      `SELECT email FROM users WHERE email = ANY($1)`,
      [Object.values(SEED_EMAILS)]
    );
    const emails = new Set(uRows.map((r) => r.email));

    const { rows: aRows } = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM appointments
        WHERE patient_id IN (
              SELECT id FROM users WHERE email = ANY($1)
              )`,
      [Object.values(SEED_EMAILS)]
    );

    return {
      patient1:     emails.has(SEED_EMAILS.patient1),
      patient2:     emails.has(SEED_EMAILS.patient2),
      physio:       emails.has(SEED_EMAILS.physio),
      physician:    emails.has(SEED_EMAILS.physician),
      appointments: parseInt(aRows[0]?.n ?? "0", 10),
    };
  } finally {
    client.release();
  }
}

// ── Execute seed ─────────────────────────────────────────────────────────────

export async function executeSeed(): Promise<SeedResult> {
  const hashedPw = await bcrypt.hash(UAT_PASSWORD, 10);
  const client   = await pool.connect();

  const created: SeedCounts = {
    users: 0, providers: 0, services: 0, officeHours: 0,
    appointments: 0, wallets: 0, payments: 0, reviews: 0,
  };

  // Date helpers (stored as TEXT in the DB)
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function daysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  try {
    await client.query("BEGIN");

    // ── 1. Users ─────────────────────────────────────────────────────────────
    const userData = [
      { email: SEED_EMAILS.patient1, fn: "Emma",   ln: "Kovács",  phone: "+36301234567", role: "patient",  city: "Budapest" },
      { email: SEED_EMAILS.patient2, fn: "Dávid",  ln: "Barros",  phone: "+36209876543", role: "patient",  city: "Debrecen" },
      { email: SEED_EMAILS.physio,     fn: "Anna",  ln: "Szabó",   phone: "+36701112233", role: "provider", city: "Budapest" },
      { email: SEED_EMAILS.physician, fn: "Bence", ln: "Molnár",  phone: "+36204445566", role: "provider", city: "Budapest" },
    ];
    for (const u of userData) {
      const r = await client.query(
        `INSERT INTO users
           (email, password, first_name, last_name, phone, role, country_code,
            is_email_verified, city)
         VALUES ($1,$2,$3,$4,$5,$6::user_role,'HU'::country_code,true,$7)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [u.email, hashedPw, u.fn, u.ln, u.phone, u.role, u.city]
      );
      if ((r.rowCount ?? 0) > 0) created.users++;
    }

    // Resolve all user IDs
    const { rows: uRows } = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = ANY($1)`,
      [Object.values(SEED_EMAILS)]
    );
    const uid: Record<string, string> = {};
    for (const r of uRows) uid[r.email] = r.id;

    const p1Id        = uid[SEED_EMAILS.patient1]!;
    const p2Id        = uid[SEED_EMAILS.patient2]!;
    const physioUid   = uid[SEED_EMAILS.physio]!;
    const doctorUid   = uid[SEED_EMAILS.physician]!;

    if (!p1Id || !p2Id || !physioUid || !doctorUid) {
      throw new Error("UAT seed: one or more user IDs could not be resolved");
    }

    // ── 2. Providers ─────────────────────────────────────────────────────────
    const provDefs = [
      {
        userId:       physioUid,
        ptype:        "rehabilitation",
        spec:         "Sports Rehabilitation, Manual Therapy, Orthopedic Recovery",
        bio:          "Certified physiotherapist with 8 years of experience treating sports injuries and post-operative patients. Available for both clinic and home visits across Budapest.",
        yrs:          8,
        consFee:      "75.00",
        homeFee:      "120.00",
        teleFee:      "60.00",
        rating:       "4.8",
      },
      {
        userId:       doctorUid,
        ptype:        "physician",
        spec:         "General Practice, Internal Medicine, Preventive Care",
        bio:          "Compassionate GP with over 12 years of experience in general and internal medicine. Fluent in English and Hungarian. Offers telehealth and in-clinic consultations.",
        yrs:          12,
        consFee:      "60.00",
        homeFee:      "95.00",
        teleFee:      "50.00",
        rating:       "4.7",
      },
    ];

    const providerIds: Record<string, string> = {};

    for (const pDef of provDefs) {
      // Check existing to preserve idempotency (no unique constraint on user_id)
      const { rows: existing } = await client.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1 LIMIT 1`,
        [pDef.userId]
      );
      if (existing.length > 0) {
        providerIds[pDef.userId] = existing[0].id;
        continue;
      }

      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO providers (
           user_id, provider_type, specialization, bio, years_experience,
           languages, consultation_fee, home_visit_fee, telemedicine_fee,
           is_verified, is_active, status, available_days,
           working_hours_start, working_hours_end, country_code,
           rating, total_reviews, city, max_patients_per_day
         ) VALUES (
           $1, $2, $3, $4, $5,
           ARRAY['en','hu'], $6, $7, $8,
           true, true, 'approved',
           ARRAY['monday','tuesday','wednesday','thursday','friday'],
           '09:00', '17:00', 'HU'::country_code,
           $9, 0, 'Budapest', 10
         ) RETURNING id`,
        [pDef.userId, pDef.ptype, pDef.spec, pDef.bio, pDef.yrs,
         pDef.consFee, pDef.homeFee, pDef.teleFee, pDef.rating]
      );
      providerIds[pDef.userId] = ins[0].id;
      created.providers++;
    }

    const physioProviderId = providerIds[physioUid]!;
    const doctorProviderId = providerIds[doctorUid]!;

    // ── 3. Services (2 per provider) ─────────────────────────────────────────
    const svcDefs = [
      { pid: physioProviderId, name: "Initial Assessment",     dur: 60, price: "75.00", mode: "both" },
      { pid: physioProviderId, name: "Follow-up Therapy",      dur: 45, price: "55.00", mode: "both" },
      { pid: doctorProviderId, name: "General Consultation",   dur: 30, price: "60.00", mode: "both" },
      { pid: doctorProviderId, name: "Full Health Check-up",   dur: 60, price: "90.00", mode: "clinic_only" },
    ];

    const svcIds: Record<string, string> = {};

    for (const s of svcDefs) {
      const { rows: ex } = await client.query<{ id: string }>(
        `SELECT id FROM services WHERE provider_id=$1 AND name=$2 AND deleted_at IS NULL LIMIT 1`,
        [s.pid, s.name]
      );
      if (ex.length > 0) {
        svcIds[s.name] = ex[0].id;
        continue;
      }
      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO services
           (provider_id, name, duration, price, location_mode, is_active, country_code)
         VALUES ($1,$2,$3,$4,$5,true,'HU'::country_code)
         RETURNING id`,
        [s.pid, s.name, s.dur, s.price, s.mode]
      );
      svcIds[s.name] = ins[0].id;
      created.services++;
    }

    // ── 4. Office hours ───────────────────────────────────────────────────────
    const weekdaySchedule = JSON.stringify({
      mon: { enabled: true, start: "09:00", end: "17:00" },
      tue: { enabled: true, start: "09:00", end: "17:00" },
      wed: { enabled: true, start: "09:00", end: "17:00" },
      thu: { enabled: true, start: "09:00", end: "17:00" },
      fri: { enabled: true, start: "09:00", end: "17:00" },
      sat: { enabled: false, start: "09:00", end: "13:00" },
      sun: { enabled: false, start: "09:00", end: "13:00" },
    });

    for (const [puId, pvId] of [[physioUid, physioProviderId], [doctorUid, doctorProviderId]]) {
      const r = await client.query(
        `INSERT INTO provider_office_hours
           (provider_user_id, provider_id, weekly_schedule, timezone)
         VALUES ($1,$2,$3,'Europe/Budapest')
         ON CONFLICT (provider_user_id) DO NOTHING
         RETURNING id`,
        [puId, pvId, weekdaySchedule]
      );
      if ((r.rowCount ?? 0) > 0) created.officeHours++;
    }

    // ── 5. Wallets (patients only) ────────────────────────────────────────────
    const walletDefs = [
      { userId: p1Id, balance: "150.00" },
      { userId: p2Id, balance: "200.00" },
    ];
    const walletIds: Record<string, string> = {};
    for (const w of walletDefs) {
      const { rows: ex } = await client.query<{ id: string }>(
        `SELECT id FROM wallets WHERE user_id=$1 LIMIT 1`, [w.userId]
      );
      if (ex.length > 0) { walletIds[w.userId] = ex[0].id; continue; }
      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO wallets (user_id, balance, currency)
         VALUES ($1,$2,'USD') RETURNING id`,
        [w.userId, w.balance]
      );
      walletIds[w.userId] = ins[0].id;
      created.wallets++;
    }

    // ── 6. Appointments ───────────────────────────────────────────────────────
    // Two completed (past) + two confirmed (upcoming)
    const aptDefs = [
      {
        num: "UAT-2024-001",
        patId:  p1Id,     provId: physioProviderId,
        svcId:  svcIds["Initial Assessment"],
        date:   daysAgo(10),     start: "10:00", end: "11:00",
        visit:  "clinic",        status: "completed",   pay: "completed",
        total:  "75.00",
      },
      {
        num: "UAT-2024-002",
        patId:  p1Id,     provId: doctorProviderId,
        svcId:  svcIds["General Consultation"],
        date:   daysFromNow(5),  start: "14:00", end: "14:30",
        visit:  "online",        status: "confirmed",   pay: "pending",
        total:  "60.00",
      },
      {
        num: "UAT-2024-003",
        patId:  p2Id,     provId: doctorProviderId,
        svcId:  svcIds["Full Health Check-up"],
        date:   daysAgo(7),      start: "09:00", end: "10:00",
        visit:  "clinic",        status: "completed",   pay: "completed",
        total:  "90.00",
      },
      {
        num: "UAT-2024-004",
        patId:  p2Id,     provId: physioProviderId,
        svcId:  svcIds["Follow-up Therapy"],
        date:   daysFromNow(3),  start: "11:00", end: "11:45",
        visit:  "home",          status: "confirmed",   pay: "pending",
        total:  "55.00",
      },
    ];

    const aptIds: Record<string, string> = {};

    for (const a of aptDefs) {
      const { rows: ex } = await client.query<{ id: string }>(
        `SELECT id FROM appointments WHERE appointment_number=$1 LIMIT 1`,
        [a.num]
      );
      if (ex.length > 0) { aptIds[a.num] = ex[0].id; continue; }

      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO appointments (
           appointment_number, patient_id, provider_id, service_id,
           date, start_time, end_time,
           visit_type, status, payment_status,
           total_amount, country_code
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::visit_type,$9::appointment_status,$10::payment_status,$11,'HU'::country_code)
         RETURNING id`,
        [a.num, a.patId, a.provId, a.svcId ?? null,
         a.date, a.start, a.end,
         a.visit, a.status, a.pay, a.total]
      );
      aptIds[a.num] = ins[0].id;
      created.appointments++;
    }

    // ── 7. Payments (completed appointments only) ─────────────────────────────
    const completedApts = aptDefs.filter((a) => a.pay === "completed");
    for (const a of completedApts) {
      const aptId = aptIds[a.num];
      if (!aptId) continue;
      const { rows: ex } = await client.query<{ id: string }>(
        `SELECT id FROM payments WHERE appointment_id=$1 LIMIT 1`, [aptId]
      );
      if (ex.length > 0) continue;
      await client.query(
        `INSERT INTO payments (appointment_id, patient_id, amount, currency, payment_method, status, country_code)
         VALUES ($1,$2,$3,'USD','cash','completed'::payment_status,'HU'::country_code)`,
        [aptId, a.patId, a.total]
      );
      created.payments++;
    }

    // ── 8. Reviews (completed appointments only) ──────────────────────────────
    const reviewDefs = [
      {
        num:      "UAT-2024-001",
        patId:    p1Id,
        provId:   physioProviderId,
        rating:   5,
        comment:  "Excellent assessment — Anna was thorough, professional, and clearly explained every step of the treatment plan.",
      },
      {
        num:      "UAT-2024-003",
        patId:    p2Id,
        provId:   doctorProviderId,
        rating:   4,
        comment:  "Dr. Molnár was very attentive and answered all my questions. The clinic was clean and the appointment started on time.",
      },
    ];

    for (const rv of reviewDefs) {
      const aptId = aptIds[rv.num];
      if (!aptId) continue;
      const { rows: ex } = await client.query<{ id: string }>(
        `SELECT id FROM reviews WHERE appointment_id=$1 LIMIT 1`, [aptId]
      );
      if (ex.length > 0) continue;
      await client.query(
        `INSERT INTO reviews (appointment_id, patient_id, provider_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5)`,
        [aptId, rv.patId, rv.provId, rv.rating, rv.comment]
      );
      // Bump provider rating/review count
      await client.query(
        `UPDATE providers
            SET total_reviews = total_reviews + 1,
                rating = (
                  SELECT ROUND(AVG(r.rating)::numeric, 1)
                  FROM reviews r WHERE r.provider_id = providers.id
                )
          WHERE id = $1`,
        [rv.provId]
      );
      created.reviews++;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    accounts: [
      { role: "patient",  name: "Emma Kovács",                         email: SEED_EMAILS.patient1, password: UAT_PASSWORD },
      { role: "patient",  name: "Dávid Barros",                        email: SEED_EMAILS.patient2, password: UAT_PASSWORD },
      { role: "provider", name: "Dr. Anna Szabó (Physiotherapist)",    email: SEED_EMAILS.physio,   password: UAT_PASSWORD },
      { role: "provider", name: "Dr. Bence Molnár (Physician)",         email: SEED_EMAILS.physician, password: UAT_PASSWORD },
    ],
    created,
    alreadyExists: created.users === 0,
  };
}
