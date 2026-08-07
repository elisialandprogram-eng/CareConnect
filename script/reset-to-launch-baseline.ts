/**
 * reset-to-launch-baseline.ts
 *
 * Clears all historical / UAT / test operational data and leaves GoldenLife
 * in a clean launch-ready state.
 *
 * PRESERVED:  admin accounts, categories, sub_services, platform_settings,
 *             commission_rules, currency_rates, payment_providers,
 *             legal_documents, legal_document_versions, admin_roles,
 *             rbac_permissions, role_permissions, catalog_services.
 *
 * CLEARED:    all users (non-admin), providers, appointments, payments,
 *             wallets, messages, reviews, clinical records, documents,
 *             notifications, audit logs, monitoring data, and all
 *             other operational tables.
 *
 * Run with:  npx tsx script/reset-to-launch-baseline.ts
 */

import { Pool } from "pg";

const CONN = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!CONN) throw new Error("No database URL found (SUPABASE_DATABASE_URL or DATABASE_URL)");

async function main() {
  const pool = new Pool({ connectionString: CONN, max: 3 });
  const client = await pool.connect();

  const log = (msg: string) => console.log(msg);
  const sep = () => log("─".repeat(62));

  try {
    sep();
    log("  GoldenLife — Reset to Launch Baseline");
    sep();

    // ── 1. Identify admin accounts to preserve ───────────────────────────
    const adminRows = await client.query(
      `SELECT id, email, role FROM users
       WHERE role IN ('global_admin', 'admin', 'country_admin')
       ORDER BY created_at`,
    );
    if (adminRows.rows.length === 0) {
      throw new Error("No admin accounts found — aborting to prevent lockout.");
    }
    const adminIds = adminRows.rows.map((r: any) => r.id) as string[];
    log(`\n✓ Preserving ${adminIds.length} admin account(s):`);
    adminRows.rows.forEach((r: any) => log(`    ${r.email}  (${r.role})`));

    log("\n── Clearing operational data ───────────────────────────────────");

    let total = 0;

    // Disable FK triggers for the session so we can delete in any order
    // without having to resolve every FK chain.
    await client.query("SET session_replication_role = 'replica'");

    async function del(sql: string, label: string) {
      try {
        const r = await client.query(sql);
        const n = r.rowCount ?? 0;
        if (n > 0) {
          log(`  ✓ ${label.padEnd(40)} ${n} rows`);
          total += n;
        }
      } catch (e: any) {
        if (e.code === "42P01") return; // table does not exist — skip
        log(`  ⚠ ${label}: ${e.message}`);
      }
    }

    async function trunc(table: string) {
      try {
        const r = await client.query(`SELECT COUNT(*)::int n FROM ${table}`);
        const n = r.rows[0].n as number;
        await client.query(`DELETE FROM ${table}`);
        if (n > 0) {
          log(`  ✓ ${table.padEnd(40)} ${n} rows`);
          total += n;
        }
      } catch (e: any) {
        if (e.code === "42P01") return;
        log(`  ⚠ ${table}: ${e.message}`);
      }
    }

    // ── Clinical / SOAP ──
    await del("DELETE FROM soap_note_versions",            "soap_note_versions");
    await del("DELETE FROM clinical_attachments",          "clinical_attachments");
    await del("DELETE FROM soap_notes",                    "soap_notes");
    await del("DELETE FROM prescriptions",                 "prescriptions");
    await del("DELETE FROM treatment_tasks",               "treatment_tasks");
    await del("DELETE FROM diagnoses",                     "diagnoses");
    await del("DELETE FROM treatment_plans",               "treatment_plans");
    await del("DELETE FROM medical_history",               "medical_history");
    await del("DELETE FROM medications",                   "medications");
    await del("DELETE FROM medication_logs",               "medication_logs");
    await del("DELETE FROM health_metrics",                "health_metrics");
    await del("DELETE FROM patient_notes",                 "patient_notes");

    // ── Financial ──
    await del("DELETE FROM appointment_events",            "appointment_events");
    await del("DELETE FROM booking_revenue_shares",        "booking_revenue_shares");
    await del("DELETE FROM provider_earnings",             "provider_earnings");
    await del("DELETE FROM payments",                      "payments");
    await del("DELETE FROM wallet_transactions",           "wallet_transactions");
    await del("DELETE FROM wallets",                       "wallets");
    await del("DELETE FROM provider_wallets",              "provider_wallets");
    await del("DELETE FROM provider_ledger",               "provider_ledger");
    await del("DELETE FROM invoice_items",                 "invoice_items");
    await del("DELETE FROM invoices",                      "invoices");
    await del("DELETE FROM referrals",                     "referrals");
    await del("DELETE FROM user_packages",                 "user_packages");
    await del("DELETE FROM membership_benefit_usage",      "membership_benefit_usage");
    await del("DELETE FROM package_benefits",              "package_benefits");
    await del("DELETE FROM promo_codes",                   "promo_codes");
    await del("DELETE FROM service_price_history",         "service_price_history");
    await del("DELETE FROM payout_requests",               "payout_requests");
    await del("DELETE FROM payout_schedules",              "payout_schedules");
    await del("DELETE FROM gift_cards",                    "gift_cards");
    await del("DELETE FROM financial_alerts",              "financial_alerts");
    await del("DELETE FROM refund_rules",                  "refund_rules");
    await del("DELETE FROM disputes",                      "disputes");

    // ── Appointments / sessions ──
    await del("DELETE FROM reviews",                       "reviews");
    await del("DELETE FROM video_sessions",                "video_sessions");
    await del("DELETE FROM room_reservations",             "room_reservations");
    await del("DELETE FROM group_session_participants",    "group_session_participants");
    await del("DELETE FROM group_sessions",                "group_sessions");
    await del("DELETE FROM patient_consents",              "patient_consents");
    await del("DELETE FROM appointment_consents",          "appointment_consents");
    await del("DELETE FROM appointment_slot_holds",        "appointment_slot_holds");
    await del("DELETE FROM appointments",                  "appointments");

    // ── Provider schedule / time / rooms ──
    await del("DELETE FROM time_slots",                    "time_slots");
    await del("DELETE FROM provider_schedule_templates",   "provider_schedule_templates");
    await del("DELETE FROM provider_schedule_overrides",   "provider_schedule_overrides");
    await del("DELETE FROM provider_office_hours",         "provider_office_hours");
    await del("DELETE FROM provider_time_off",             "provider_time_off");
    await del("DELETE FROM availability_exceptions",       "availability_exceptions");
    await del("DELETE FROM provider_buffer_settings",      "provider_buffer_settings");
    await del("DELETE FROM provider_blocks",               "provider_blocks");
    await del("DELETE FROM provider_pricing_overrides",    "provider_pricing_overrides");
    await del("DELETE FROM clinic_rooms",                  "clinic_rooms");

    // ── Provider operational data ──
    await del("DELETE FROM waitlist_entries",              "waitlist_entries");
    await del("DELETE FROM saved_providers",               "saved_providers");
    await del("DELETE FROM service_requests",              "service_requests");
    await del("DELETE FROM provider_documents",            "provider_documents");
    await del("DELETE FROM provider_credentials",          "provider_credentials");
    await del("DELETE FROM provider_gallery",              "provider_gallery");
    await del("DELETE FROM provider_category_permissions", "provider_category_permissions");
    await del("DELETE FROM provider_admin_notes",          "provider_admin_notes");
    await del("DELETE FROM provider_stripe_accounts",      "provider_stripe_accounts");
    await del("DELETE FROM admin_notifications",           "admin_notifications");
    await del("DELETE FROM admin_assignments",             "admin_assignments");
    await del("DELETE FROM medical_practitioners",         "medical_practitioners");
    await del("DELETE FROM practitioners",                 "practitioners");
    await del("DELETE FROM services",                      "services");
    await del("DELETE FROM providers",                     "providers");

    // ── Patient / user data ──
    await del("DELETE FROM family_members",                "family_members");
    await del("DELETE FROM patient_documents",             "patient_documents");
    await del("DELETE FROM patient_gallery",               "patient_gallery");
    await del("DELETE FROM saved_addresses",               "saved_addresses");

    // ── Communication ──
    await del("DELETE FROM message_edit_history",          "message_edit_history");
    await del("DELETE FROM realtime_messages",             "realtime_messages");
    await del("DELETE FROM realtime_conversations",        "realtime_conversations");
    await del("DELETE FROM chat_messages",                 "chat_messages");
    await del("DELETE FROM chat_conversations",            "chat_conversations");
    await del("DELETE FROM conversations",                 "conversations");
    await del("DELETE FROM ticket_messages",               "ticket_messages");
    await del("DELETE FROM bug_report_comments",           "bug_report_comments");
    await del("DELETE FROM support_tickets",               "support_tickets");
    await del("DELETE FROM bug_reports",                   "bug_reports");

    // ── Notifications / auth / privacy ──
    await del("DELETE FROM user_notifications",            "user_notifications");
    await del("DELETE FROM notification_preferences",      "notification_preferences");
    await del("DELETE FROM push_subscriptions",            "push_subscriptions");
    await del("DELETE FROM refresh_tokens",                "refresh_tokens");
    await del("DELETE FROM login_attempts",                "login_attempts");
    await del("DELETE FROM mfa_secrets",                   "mfa_secrets");
    await del("DELETE FROM mfa_recovery_codes",            "mfa_recovery_codes");
    await del("DELETE FROM legal_acceptances",             "legal_acceptances");
    await del("DELETE FROM password_history",              "password_history");
    await del("DELETE FROM privacy_requests",              "privacy_requests");
    await del("DELETE FROM packages",                      "packages");
    await del("DELETE FROM invoice_templates",             "invoice_templates");
    await del("DELETE FROM blog_posts",                    "blog_posts");

    // ── Non-admin users ──
    const ph = adminIds.map((_: string, i: number) => `$${i + 1}`).join(", ");
    const delUsers = await client.query(
      `DELETE FROM users WHERE id NOT IN (${ph})`,
      adminIds,
    );
    const nu = delUsers.rowCount ?? 0;
    log(`  ✓ ${"users (non-admin)".padEnd(40)} ${nu} rows`);
    total += nu;

    // Re-enable FK triggers
    await client.query("SET session_replication_role = 'origin'");

    // ── Pure monitoring tables ──
    log("\n── Clearing monitoring & audit tables ──────────────────────────");
    await trunc("idempotency_keys");
    await trunc("rate_limit_hits");
    await trunc("reconciliation_results");
    await trunc("system_events");
    await trunc("audit_logs");
    await trunc("monitoring_daily_summary");
    await trunc("monitoring_endpoint_stats");
    await trunc("platform_events");
    await trunc("notification_delivery_logs");

    // ── Verify reference data is intact ─────────────────────────────────
    log("\n── Verifying reference data ────────────────────────────────────");
    const refTables = [
      "categories", "sub_services", "catalog_services",
      "platform_settings", "commission_rules", "currency_rates",
      "payment_providers", "legal_documents", "admin_roles",
      "rbac_permissions", "role_permissions",
    ];
    for (const t of refTables) {
      try {
        const r = await client.query(`SELECT COUNT(*)::int n FROM ${t}`);
        log(`  ✓ ${t.padEnd(40)} ${r.rows[0].n} rows (preserved)`);
      } catch {
        // table may not exist — skip
      }
    }

    // ── Final admin count check ──────────────────────────────────────────
    const adminCheck = await client.query(
      `SELECT COUNT(*)::int n FROM users WHERE role IN ('global_admin','admin','country_admin')`,
    );
    log(`\n  ✓ Admin accounts preserved: ${adminCheck.rows[0].n}`);
    log(`  ✓ Total rows cleared:        ${total}`);

    sep();
    log("  ✅  Database reset to launch baseline complete.");
    sep();

  } catch (err: any) {
    log(`\n❌  Reset failed: ${err.message}`);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
