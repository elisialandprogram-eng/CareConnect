/**
 * seed-validation.ts
 * Quick script to insert test data for Sprint 8 validation.
 * Run once: npx tsx script/seed-validation.ts
 */
import { db, pool } from "../server/db";
import { users, providers } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq, and } from "drizzle-orm";

async function seedValidation() {
  console.log("[seed-validation] Connecting to Supabase…");
  await pool.query("SELECT 1"); // warm up

  // ── 1. IR admin user ────────────────────────────────────────────────────────
  const irAdminEmail = "admin-ir@goldenlife.test";
  const irAdminPw    = await bcrypt.hash("AdminIR1!", 10);
  const existIR = await db.select().from(users).where(eq(users.email, irAdminEmail));
  let irAdminId: string;
  if (existIR.length === 0) {
    const [u] = await db.insert(users).values({
      email: irAdminEmail,
      password: irAdminPw,
      firstName: "Admin",
      lastName: "IR",
      phone: "+989121234567",
      role: "admin",
      countryCode: "IR",
      isEmailVerified: true,
    }).returning();
    irAdminId = u.id;
    console.log("✓ IR admin created:", irAdminEmail, "id:", irAdminId);
  } else {
    irAdminId = existIR[0].id;
    console.log("✓ IR admin exists:", irAdminEmail, "id:", irAdminId);
  }

  // ── 2. Find test provider (82c7c853) ────────────────────────────────────────
  const HU_PROVIDER_ID = "82c7c853-965a-4299-9b49-0a730def028d";
  const provRes = await pool.query(
    `SELECT id, user_id, status, country_code FROM providers WHERE id = $1`,
    [HU_PROVIDER_ID]
  );
  if (provRes.rows.length === 0) {
    console.error("Provider not found:", HU_PROVIDER_ID, "— run seed-admin first");
    process.exit(1);
  }
  const prov = provRes.rows[0];
  console.log("✓ Provider:", prov.id, "status:", prov.status, "country:", prov.country_code);

  // ── 3. Insert 2 provider documents (pending_review) ─────────────────────────
  const idCardCheck = await pool.query(
    `SELECT id FROM provider_documents WHERE provider_id = $1 AND document_type = 'id_card'`,
    [HU_PROVIDER_ID]
  );
  let idCardId: string;
  if (idCardCheck.rows.length === 0) {
    const r = await pool.query(
      `INSERT INTO provider_documents
         (id, provider_id, document_type, document_url, file_name,
          verification_status, document_criticality, created_at)
       VALUES (gen_random_uuid()::text, $1, 'id_card',
               'https://placehold.co/400x300?text=ID+Card',
               'id_card_sample.jpg', 'pending_review', 'critical', NOW())
       RETURNING id, provider_id, document_type, verification_status`,
      [HU_PROVIDER_ID]
    );
    idCardId = r.rows[0].id;
    console.log("✓ id_card document created:", JSON.stringify(r.rows[0]));
  } else {
    idCardId = idCardCheck.rows[0].id;
    // Reset to pending_review for fresh test
    await pool.query(
      `UPDATE provider_documents SET verification_status = 'pending_review', verified_by = NULL, verified_at = NULL, admin_note = NULL WHERE id = $1`,
      [idCardId]
    );
    console.log("✓ id_card reset to pending_review:", idCardId);
  }

  const insuranceCheck = await pool.query(
    `SELECT id FROM provider_documents WHERE provider_id = $1 AND document_type = 'insurance'`,
    [HU_PROVIDER_ID]
  );
  let insuranceId: string;
  if (insuranceCheck.rows.length === 0) {
    const r = await pool.query(
      `INSERT INTO provider_documents
         (id, provider_id, document_type, document_url, file_name,
          verification_status, document_criticality, created_at)
       VALUES (gen_random_uuid()::text, $1, 'insurance',
               'https://placehold.co/400x300?text=Insurance',
               'insurance_cert.pdf', 'pending_review', 'critical', NOW())
       RETURNING id, provider_id, document_type, verification_status`,
      [HU_PROVIDER_ID]
    );
    insuranceId = r.rows[0].id;
    console.log("✓ insurance document created:", JSON.stringify(r.rows[0]));
  } else {
    insuranceId = insuranceCheck.rows[0].id;
    await pool.query(
      `UPDATE provider_documents SET verification_status = 'pending_review', verified_by = NULL, verified_at = NULL, admin_note = NULL WHERE id = $1`,
      [insuranceId]
    );
    console.log("✓ insurance reset to pending_review:", insuranceId);
  }

  // Also reset provider status to pending_documents for the auto-advance test
  await pool.query(
    `UPDATE providers SET status = 'pending_documents', updated_at = NOW() WHERE id = $1`,
    [HU_PROVIDER_ID]
  );
  console.log("✓ Provider status reset to pending_documents");

  // ── 4. Insert service request (pending_review) ───────────────────────────────
  const srCheck = await pool.query(
    `SELECT id, status FROM service_requests WHERE provider_id = $1 AND service_name = 'Post-Operative Rehabilitation' LIMIT 1`,
    [HU_PROVIDER_ID]
  );
  let serviceReqId: string;
  if (srCheck.rows.length === 0) {
    const r = await pool.query(
      `INSERT INTO service_requests
         (id, provider_id, category, service_name, sub_service_name,
          suggested_price, description, location_mode, status, country_code,
          created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, 'physiotherapy',
               'Post-Operative Rehabilitation', 'Hip Replacement Recovery',
               12000, 'Specialized rehabilitation for patients recovering from hip replacement surgery.',
               'clinic_only', 'pending_review', 'HU', NOW(), NOW())
       RETURNING id, provider_id, status, service_name, country_code`,
      [HU_PROVIDER_ID]
    );
    serviceReqId = r.rows[0].id;
    console.log("✓ service_request created:", JSON.stringify(r.rows[0]));
  } else {
    serviceReqId = srCheck.rows[0].id;
    await pool.query(
      `UPDATE service_requests SET status = 'pending_review', updated_at = NOW() WHERE id = $1`,
      [serviceReqId]
    );
    console.log("✓ service_request reset to pending_review:", serviceReqId);
  }

  console.log("\n=== Seed complete ===");
  console.log("IR Admin:      ", irAdminEmail, "/ AdminIR1!");
  console.log("Provider ID:   ", HU_PROVIDER_ID);
  console.log("id_card doc:   ", idCardId);
  console.log("insurance doc: ", insuranceId);
  console.log("service_req:   ", serviceReqId);

  await pool.end();
  process.exit(0);
}

seedValidation().catch(e => { console.error(e); process.exit(1); });
