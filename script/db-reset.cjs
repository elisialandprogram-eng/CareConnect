/**
 * db-reset.js
 * Full database data reset — keeps admin users, service catalog, system config.
 * Deletes all operational/business data in FK-safe order.
 *
 * Usage: node script/db-reset.js
 */

"use strict";

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function run(label, sql, params = []) {
  try {
    const r = await pool.query(sql, params);
    const n = r.rowCount ?? 0;
    console.log(`  ✓ ${label}${n > 0 ? ` (${n} rows)` : ""}`);
    return n;
  } catch (e) {
    console.error(`  ✗ ${label}: ${e.message}`);
    return 0;
  }
}

async function tableExists(name) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name]
  );
  return r.rows.length > 0;
}

async function safeTruncate(table) {
  if (!(await tableExists(table))) return;
  await run(`TRUNCATE ${table}`, `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
}

async function main() {
  const client = await pool.connect();

  try {
    // ── Capture admin IDs to protect ─────────────────────────────────────────
    const adminResult = await client.query(
      `SELECT id, email, role FROM users WHERE role IN ('global_admin','admin') ORDER BY role`
    );
    const adminIds = adminResult.rows.map((r) => r.id);
    console.log("\n══════════════════════════════════════════════════");
    console.log("  GOLDEN LIFE DATABASE RESET");
    console.log("══════════════════════════════════════════════════\n");
    console.log(`  Admin accounts to PRESERVE (${adminIds.length}):`);
    adminResult.rows.forEach((r) => console.log(`    • ${r.email} [${r.role}]`));
    console.log();

    if (adminIds.length === 0) {
      throw new Error("No admin accounts found — aborting to prevent full user wipe.");
    }

    // ── Disable FK enforcement (Supabase-compatible) ──────────────────────────
    console.log("  → Disabling FK trigger enforcement...");
    await client.query(`SET session_replication_role = 'replica'`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1 — Appointment dependents (most constrained)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 1] Appointment dependents");
    for (const t of [
      "room_reservations",
      "membership_benefit_usage",
      "marketplace_ledger",
      "video_sessions",
      "appointment_events",
      "appointment_consents",
      "appointment_slot_holds",
      "invoice_items",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2 — Reviews, disputes, clinical leaf tables
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 2] Reviews, disputes, clinical");
    for (const t of [
      "reviews",
      "disputes",
      "patient_notes",
      "medical_history",
      "medications",
      "medication_logs",
      "health_metrics",
      "prescriptions",
      "patient_gallery",
      "patient_documents",
      "patient_consents",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3 — Financial: invoices, payments
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 3] Invoices and payments");
    for (const t of ["invoices", "payments"]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4 — Group sessions
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 4] Group sessions");
    for (const t of ["group_session_participants", "group_sessions"]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5 — Core appointments
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 5] Core appointments");
    await run("  TRUNCATE appointments", `TRUNCATE TABLE appointments RESTART IDENTITY CASCADE`, [], client);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 6 — Provider financial records
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 6] Provider financial records");
    for (const t of [
      "provider_earnings",
      "provider_ledger",
      "payout_requests",
      "provider_wallets",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7 — Provider schedule/availability
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 7] Provider schedule and availability");
    for (const t of [
      "provider_schedule_overrides",
      "provider_schedule_templates",
      "provider_blocks",
      "provider_buffer_settings",
      "availability_exceptions",
      "provider_time_off",
      "provider_office_hours",
      "clinic_rooms",
      "time_slots",
      "practitioner_schedules",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 8 — Provider docs, credentials, gallery
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 8] Provider documents and credentials");
    for (const t of [
      "provider_documents",
      "provider_credentials",
      "provider_gallery",
      "provider_category_permissions",
      "provider_pricing_overrides",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 9 — Services (provider-specific, NOT catalog)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 9] Provider-specific services");
    for (const t of [
      "service_price_history",
      "service_practitioners",
      "waitlist_entries",
      "package_services",
      "service_requests",
      "services",
      "service_packages",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 10 — Practitioners
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 10] Practitioners and medical practitioners");
    for (const t of ["practitioners", "medical_practitioners"]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 11 — Providers (after all dependents cleared)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 11] Provider profiles");
    await run("  TRUNCATE providers", `TRUNCATE TABLE providers RESTART IDENTITY CASCADE`, [], client);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 12 — User finances and social
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 12] User finances, social, family");
    for (const t of [
      "wallet_transactions",
      "wallets",
      "referrals",
      "gift_cards",
      "user_packages",
      "family_members",
      "saved_providers",
      "saved_addresses",
      "locations",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 13 — Notifications and messaging
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 13] Notifications and messaging");
    for (const t of [
      "notification_delivery_logs",
      "notification_queue",
      "user_notifications",
      "push_subscriptions",
      "notification_preferences",
      "realtime_messages",
      "realtime_conversations",
      "chat_messages",
      "chat_conversations",
      "messages",
      "conversations",
      "admin_broadcasts",
      "admin_notifications",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 14 — Support, bugs, disputes
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 14] Support tickets and bug reports");
    for (const t of [
      "ticket_messages",
      "support_tickets",
      "bug_report_comments",
      "bug_reports",
      "privacy_requests",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 15 — Packages and memberships
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 15] Packages and memberships");
    for (const t of ["package_benefits", "packages"]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 16 — Promo codes and financial alerts
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 16] Promo codes and financial alerts");
    for (const t of ["promo_codes", "financial_alerts"]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 17 — Monitoring, analytics, audit trails
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 17] Monitoring, analytics, audit trails");
    for (const t of [
      "platform_events",
      "monitoring_daily_summary",
      "monitoring_endpoint_stats",
      "daily_metrics",
      "reconciliation_results",
      "system_events",
      "audit_logs",
      "idempotency_keys",
      "rate_limit_hits",
      "login_attempts",
      "password_history",
      "refresh_tokens",
    ]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 18 — Content (test blog posts, announcements, FAQs)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 18] Test content");
    for (const t of ["blog_posts", "announcements", "faqs", "content_blocks"]) {
      await run(`  TRUNCATE ${t}`, `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`, [], client);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 19 — Delete non-admin users (surgical DELETE, not TRUNCATE)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Phase 19] Non-admin users");
    const placeholders = adminIds.map((_, i) => `$${i + 1}`).join(",");
    const delUsers = await client.query(
      `DELETE FROM users WHERE id NOT IN (${placeholders})`,
      adminIds
    );
    console.log(`  ✓ DELETE non-admin users (${delUsers.rowCount} rows)`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 20 — Restore FK enforcement
    // ═══════════════════════════════════════════════════════════════════════════
    await client.query(`SET session_replication_role = 'origin'`);
    console.log("\n  → FK enforcement restored.");

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n  [Validation] Post-reset row counts");
    const checks = [
      ["users (admin only)", `SELECT COUNT(*) FROM users`],
      ["users non-admin", `SELECT COUNT(*) FROM users WHERE role NOT IN ('global_admin','admin')`],
      ["providers", `SELECT COUNT(*) FROM providers`],
      ["appointments", `SELECT COUNT(*) FROM appointments`],
      ["payments", `SELECT COUNT(*) FROM payments`],
      ["reviews", `SELECT COUNT(*) FROM reviews`],
      ["wallets", `SELECT COUNT(*) FROM wallets`],
      ["packages", `SELECT COUNT(*) FROM packages`],
      ["categories (kept)", `SELECT COUNT(*) FROM categories`],
      ["sub_services (kept)", `SELECT COUNT(*) FROM sub_services`],
      ["catalog_services (kept)", `SELECT COUNT(*) FROM catalog_services`],
      ["admin_roles (kept)", `SELECT COUNT(*) FROM admin_roles`],
      ["rbac_permissions (kept)", `SELECT COUNT(*) FROM rbac_permissions`],
    ];
    const results = [];
    for (const [label, sql] of checks) {
      const r = await client.query(sql);
      const count = parseInt(r.rows[0].count, 10);
      const ok = label.includes("kept") || label.includes("admin only")
        ? count > 0
        : count === 0;
      const icon = ok ? "✓" : "✗";
      const note = !ok && count > 0 ? ` ← UNEXPECTED RESIDUAL DATA` : "";
      console.log(`    ${icon} ${label.padEnd(30)} ${count}${note}`);
      results.push({ label, count, ok });
    }

    // Admin accounts
    const adminCheck = await client.query(
      `SELECT email, role FROM users WHERE role IN ('global_admin','admin')`
    );
    console.log("\n  Admin accounts preserved:");
    adminCheck.rows.forEach((r) => console.log(`    • ${r.email} [${r.role}]`));

    const failures = results.filter((r) => !r.ok);
    if (failures.length === 0) {
      console.log("\n  ✅ RESET COMPLETE — database is clean.");
    } else {
      console.log(`\n  ⚠️  ${failures.length} validation issue(s) detected.`);
    }

    return { adminIds, results, failures };
  } finally {
    client.release();
    await pool.end();
  }
}

main()
  .then(({ results, failures }) => {
    process.exit(failures.length > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("\n  FATAL:", e.message);
    process.exit(1);
  });
