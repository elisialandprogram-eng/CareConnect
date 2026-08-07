/**
 * script/reset-and-seed.ts
 *
 * ONE-TIME script: wipes all transactional data (keeping users & providers),
 * then seeds the new 7-category service catalogue.
 *
 * Run with: npx tsx script/reset-and-seed.ts
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── Catalogue definition ───────────────────────────────────────────────────────
// Structure: category → subcategories → services
// providerType: the providerTypeEnum value for sub_services.category column

const CATALOGUE = [
  {
    slug: "physician",
    name: "🩺 Medical Doctors & Specialists",
    description: "Primary care physicians, specialists, and sub-specialty consultations",
    icon: "🩺",
    sortOrder: 1,
    subcategories: [
      {
        name: "Primary Care & General Medicine",
        providerType: "physician",
        services: [
          { name: "Acute Illness Consultation", description: "For immediate, short-term issues like colds, flu, infections, or rashes", durationMinutes: 30 },
          { name: "Routine Prescription Refill Session", description: "To safely review and renew ongoing maintenance medications", durationMinutes: 30 },
          { name: "Preventative Health & Screening Review", description: "Discussing age-appropriate wellness tests and health risk factors", durationMinutes: 45 },
          { name: "General Lab & Blood Test Interpretation", description: "Detailed walkthrough of blood panels, cholesterol, or vitamin levels", durationMinutes: 30 },
        ],
      },
      {
        name: "Dermatology & Aesthetics",
        providerType: "physician",
        services: [
          { name: "Acne & Rosacea Management Plan", description: "Custom topical and oral treatment plans for persistent skin issues", durationMinutes: 40 },
          { name: "Mole & Skin Lesion Photographic Review", description: "Visual analysis of skin anomalies to see if a biopsy is needed", durationMinutes: 30 },
          { name: "Anti-Aging & Cosmetic Consultation", description: "Pre-treatment evaluation for botox, fillers, lasers, or peels", durationMinutes: 45 },
          { name: "Hair Loss & Scalp Evaluation", description: "Specialized assessment for hair thinning, alopecia, or scalp issues", durationMinutes: 40 },
        ],
      },
      {
        name: "Pediatrics (Child Health)",
        providerType: "physician",
        services: [
          { name: "Newborn & Infant Development Check", description: "Tracking early growth milestones, feeding, and sleep health", durationMinutes: 45 },
          { name: "Pediatric Acute Triage", description: "Urgent evaluation for childhood fevers, coughs, or stomach bugs", durationMinutes: 30 },
          { name: "Childhood Behavioral Consultation", description: "Addressing developmental delays, sleep regressions, or ADHD screening", durationMinutes: 60 },
        ],
      },
      {
        name: "Women's Health & Obstetrics",
        providerType: "physician",
        services: [
          { name: "Contraceptive & Family Planning Counseling", description: "Helping patients choose and manage birth control methods", durationMinutes: 45 },
          { name: "Pre-Conception & Fertility Guidance", description: "Reviewing medical histories for couples planning a pregnancy", durationMinutes: 60 },
          { name: "Menopause & Hormonal Support Session", description: "Managing hot flashes, mood shifts, and hormone replacement options", durationMinutes: 45 },
        ],
      },
      {
        name: "Internal Medicine Sub-Specialties",
        providerType: "physician",
        services: [
          { name: "Specialist Second Opinion Review", description: "In-depth re-evaluation of complex diagnoses and treatment pathways", durationMinutes: 60 },
          { name: "Diabetes Management & Insulin Titration", description: "Reviewing glucose data and adjusting management plans", durationMinutes: 45 },
          { name: "Hypertension & Heart Risk Management", description: "Tailored protocols for blood pressure control and heart health", durationMinutes: 45 },
          { name: "Chronic Gut Health Consultation", description: "Diagnostic and dietary roadmaps for IBS, acid reflux, or colitis", durationMinutes: 60 },
        ],
      },
    ],
  },
  {
    slug: "mental_health",
    name: "🧠 Mental Health & Behavioral Professionals",
    description: "Psychiatrists, psychologists, counselors, and behavioral health coaches",
    icon: "🧠",
    sortOrder: 2,
    subcategories: [
      {
        name: "Psychiatry (Medical)",
        providerType: "mental_health",
        services: [
          { name: "Psychiatric Diagnostic Intake Evaluation", description: "Full clinical interview and mental health diagnostic formulation", durationMinutes: 90 },
          { name: "Medication Management Follow-up", description: "Monitoring response and side effects to adjust psychiatric prescriptions", durationMinutes: 30 },
        ],
      },
      {
        name: "Clinical Psychology & Psychotherapy",
        providerType: "mental_health",
        services: [
          { name: "Initial Therapy Intake Session", description: "Establishing client history and setting core therapeutic goals", durationMinutes: 60 },
          { name: "Individual Psychotherapy", description: "Evidence-based talk therapy for depression, anxiety, trauma, or stress", durationMinutes: 50 },
          { name: "Couples & Marriage Counseling", description: "Joint sessions focusing on communication, conflict resolution, and intimacy", durationMinutes: 60 },
          { name: "Family Therapy Session", description: "Structural therapy involving family members to resolve household distress", durationMinutes: 60 },
          { name: "Grief & Bereavement Support", description: "Focused emotional processing for navigating major losses or life changes", durationMinutes: 50 },
        ],
      },
      {
        name: "Supportive Counseling & Coaching",
        providerType: "mental_health",
        services: [
          { name: "Stress Management & Burnout Coaching", description: "Practical toolkits for building resilience and professional boundaries", durationMinutes: 50 },
          { name: "Crisis De-escalation & Support", description: "Immediate, short-term stabilization for acute emotional distress", durationMinutes: 45 },
          { name: "Life Design & Goal Accountability Coaching", description: "Non-clinical personal growth, career, and motivation planning", durationMinutes: 60 },
        ],
      },
    ],
  },
  {
    slug: "nutrition",
    name: "🥗 Nutrition, Dietetics & Metabolic Wellness",
    description: "Clinical dietitians and nutrition specialists for diet, metabolism, and weight management",
    icon: "🥗",
    sortOrder: 3,
    subcategories: [
      {
        name: "Clinical Nutrition",
        providerType: "nutrition",
        services: [
          { name: "Initial Diet & Metabolic Assessment", description: "Full analysis of eating habits, blood work, and body metrics", durationMinutes: 60 },
          { name: "Medical Nutrition Therapy (MNT)", description: "Therapeutic meal planning for diseases like diabetes or kidney issues", durationMinutes: 60 },
          { name: "Gut Health & Elimination Protocol", description: "Supervised food-sensitivity tracking and reintroduction programs", durationMinutes: 60 },
        ],
      },
      {
        name: "Weight Management & Performance",
        providerType: "nutrition",
        services: [
          { name: "Hormonal & PCOS Weight Management", description: "Dietary structures designed to manage hormonal weight gain", durationMinutes: 60 },
          { name: "Sports Nutrition & Macro-Targeting", description: "Meal and hydration timing built for athletic performance", durationMinutes: 45 },
          { name: "Custom 4-Week Meal Plan Delivery", description: "Creation and digital delivery of an individualized recipe guide", durationMinutes: 60 },
        ],
      },
    ],
  },
  {
    slug: "rehabilitation",
    name: "🦴 Physical Therapy & Rehabilitation",
    description: "Physiotherapists, chiropractors, and rehabilitation specialists",
    icon: "🦴",
    sortOrder: 4,
    subcategories: [
      {
        name: "Physical Therapy",
        providerType: "rehabilitation",
        services: [
          { name: "Musculoskeletal Injury Assessment", description: "Evaluating range of motion and pain triggers to locate injuries", durationMinutes: 60 },
          { name: "Guided Post-Op Rehabilitation Session", description: "Supervised movement therapy following joint or bone surgeries", durationMinutes: 60 },
          { name: "Ergonomic Workspace Correction Review", description: "Reviewing desk and seat setups to fix neck, wrist, or back pain", durationMinutes: 45 },
          { name: "Chronic Pain Movement Coaching", description: "Teaching safe exercises to maintain mobility with arthritis or fibromyalgia", durationMinutes: 60 },
        ],
      },
      {
        name: "Chiropractic & Osteopathy",
        providerType: "rehabilitation",
        services: [
          { name: "Postural & Spinal Realignment Consult", description: "Diagnostics regarding mechanical and structural body misalignment", durationMinutes: 60 },
        ],
      },
    ],
  },
  {
    slug: "dental",
    name: "🦷 Dental Care Professionals",
    description: "Dentists and orthodontic specialists for dental health and cosmetic treatments",
    icon: "🦷",
    sortOrder: 5,
    subcategories: [
      {
        name: "General Dental Services",
        providerType: "dental",
        services: [
          { name: "Virtual Teledentistry Triage", description: "Immediate assessment of dental pain or trauma to determine emergency urgency", durationMinutes: 30 },
          { name: "Cosmetic Smile Design Consultation", description: "Exploring options for clear aligners, veneers, or implants", durationMinutes: 45 },
          { name: "Orthodontic Progress Check", description: "Quick visual scan to verify if aligner or bracket progression is correct", durationMinutes: 30 },
        ],
      },
    ],
  },
  {
    slug: "alternative_medicine",
    name: "🌿 Alternative, Holistic & Integrative Medicine",
    description: "Holistic practitioners, wellness coaches, and integrative medicine specialists",
    icon: "🌿",
    sortOrder: 6,
    subcategories: [
      {
        name: "Holistic & Integrative Services",
        providerType: "alternative_medicine",
        services: [
          { name: "Integrative Wellness Intake", description: "Evaluating physical and emotional health using holistic metrics", durationMinutes: 60 },
          { name: "One-on-One Guided Somatic Breathwork", description: "Nervous-system regulation and stress relief through breathing", durationMinutes: 45 },
          { name: "Ayurvedic Constitution Analysis", description: "Determining biological body profiles to suggest lifestyle adjustments", durationMinutes: 60 },
        ],
      },
    ],
  },
  {
    slug: "nursing",
    name: "🧑‍⚕️ Maternal, Nursing & Allied Support",
    description: "Nurses, midwives, lactation specialists, and home care professionals",
    icon: "🧑‍⚕️",
    sortOrder: 7,
    subcategories: [
      {
        name: "Maternal & Home Care Services",
        providerType: "nursing",
        services: [
          { name: "Virtual Lactation & Breastfeeding Support", description: "Troubleshooting latching issues or infant feeding difficulties", durationMinutes: 45 },
          { name: "Newborn Sleep & Care Parent Coaching", description: "Educating parents on infant sleep, soothing, and safety basics", durationMinutes: 45 },
          { name: "Home Care Nurse Assessment Planning", description: "Structuring home-visit schedules and medical equipment needs", durationMinutes: 60 },
        ],
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeDelete(client: any, sql: string) {
  try {
    await client.query("SAVEPOINT _sd");
    const res = await client.query(sql);
    await client.query("RELEASE SAVEPOINT _sd");
    console.log(`  ✓ ${sql.substring(0, 60).trim()} — ${res.rowCount} rows`);
  } catch (e: any) {
    await client.query("ROLLBACK TO SAVEPOINT _sd").catch(() => {});
    await client.query("RELEASE SAVEPOINT _sd").catch(() => {});
    if (e.code === "42P01") {
      console.log(`  ⚠ skip (no table): ${sql.substring(0, 60).trim()}`);
    } else {
      throw e;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    console.log("\n=== GoldenLife Reset & Seed ===\n");

    // ── Step 1: Data wipe (inside transaction for rollback safety) ────────────
    console.log("\n1. Wiping transactional data...");
    await client.query("BEGIN");

    // Appointment-dependent tables first (some cascade, but be explicit)
    await safeDelete(client, "DELETE FROM booking_revenue_shares");
    await safeDelete(client, "DELETE FROM appointment_events");
    await safeDelete(client, "DELETE FROM prescriptions");
    await safeDelete(client, "DELETE FROM patient_notes");
    await safeDelete(client, "DELETE FROM patient_consents");
    await safeDelete(client, "DELETE FROM intake_responses");
    await safeDelete(client, "DELETE FROM room_reservations");
    await safeDelete(client, "DELETE FROM invoice_items");
    await safeDelete(client, "DELETE FROM invoices");
    await safeDelete(client, "DELETE FROM provider_earnings");
    await safeDelete(client, "DELETE FROM group_session_participants");
    await safeDelete(client, "DELETE FROM waitlist_entries");
    await safeDelete(client, "DELETE FROM membership_benefit_usage");
    await safeDelete(client, "DELETE FROM payments");
    await safeDelete(client, "DELETE FROM appointments");

    // Scheduling
    await safeDelete(client, "DELETE FROM time_slots");
    await safeDelete(client, "DELETE FROM provider_time_off");
    await safeDelete(client, "DELETE FROM group_sessions");

    // Notifications
    await safeDelete(client, "DELETE FROM notification_delivery_logs");
    await safeDelete(client, "DELETE FROM user_notifications");

    // Financial — zero balances, clear ledger
    await safeDelete(client, "DELETE FROM provider_ledger");
    await safeDelete(client, "DELETE FROM wallet_transactions");
    await client.query("UPDATE wallets SET balance = '0.00', updated_at = NOW()");
    await client.query("UPDATE provider_wallets SET available_balance = '0.00', lifetime_earnings = '0.00', updated_at = NOW()");
    console.log("  ✓ Wallet balances zeroed");

    // Services & packages (service_price_history cascades from services)
    await safeDelete(client, "DELETE FROM service_requests");
    await safeDelete(client, "DELETE FROM service_price_history");
    await safeDelete(client, "DELETE FROM service_practitioners");
    await safeDelete(client, "DELETE FROM package_services");
    await safeDelete(client, "DELETE FROM services");
    await safeDelete(client, "DELETE FROM package_benefits");
    await safeDelete(client, "DELETE FROM user_packages");
    await safeDelete(client, "DELETE FROM service_packages");

    // Promos & referrals
    await safeDelete(client, "DELETE FROM referrals");
    await safeDelete(client, "DELETE FROM promo_codes");

    // Old catalogue (must clear sub_services before catalog_services before categories)
    await safeDelete(client, "DELETE FROM sub_services");
    await safeDelete(client, "DELETE FROM catalog_services");
    await safeDelete(client, "DELETE FROM categories");
    await safeDelete(client, "DELETE FROM service_categories");

    console.log("\n2. Seeding new 7-category catalogue...");

    for (const cat of CATALOGUE) {
      // Insert top-level category
      const catRes = await client.query(
        `INSERT INTO categories (id, slug, name, description, icon, sort_order, is_active, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW())
         RETURNING id`,
        [cat.slug, cat.name, cat.description, cat.icon, cat.sortOrder]
      );
      const categoryId = catRes.rows[0].id;
      console.log(`  ✓ Category: ${cat.name}`);

      for (let si = 0; si < cat.subcategories.length; si++) {
        const sub = cat.subcategories[si];

        // Insert catalog_service (sub-category)
        const csRes = await client.query(
          `INSERT INTO catalog_services (id, category_id, name, sort_order, is_active, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, true, NOW())
           RETURNING id`,
          [categoryId, sub.name, si]
        );
        const catalogServiceId = csRes.rows[0].id;
        console.log(`    ✓ Subcategory: ${sub.name} (${sub.services.length} services)`);

        // Insert sub_services (individual services)
        for (let svi = 0; svi < sub.services.length; svi++) {
          const svc = sub.services[svi];
          await client.query(
            `INSERT INTO sub_services
               (id, category, catalog_service_id, name, description, duration_minutes,
                base_price, platform_fee, tax_percentage, pricing_type,
                is_active, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                     '0.00', '0.00', '0.00', 'fixed',
                     true, NOW())`,
            [sub.providerType, catalogServiceId, svc.name, svc.description, svc.durationMinutes]
          );
        }

      }
    }

    await client.query("COMMIT");
    console.log("\n✅ Reset & seed complete.\n");

  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\n❌ Error — rolled back:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
