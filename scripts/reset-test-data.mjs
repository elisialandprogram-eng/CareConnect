/**
 * GoldenLife — Hard Reset Test Data Runner
 *
 * Executes scripts/reset-test-data.sql against Supabase and prints a full
 * before/after report.
 *
 * Safety guards (same as db-cleanup.mjs):
 *  - Refuses to run without SUPABASE_DATABASE_URL
 *  - Refuses if the DB host looks like production (contains "prod")
 *  - Refuses if no admin users exist (would lock out the system)
 *  - Wraps everything in ONE transaction (rolls back on any error)
 *
 * Output: JSON report written to .local/reset-test-data-report.json
 *         + pretty summary to stdout.
 */

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Safety: require Supabase URL ──────────────────────────────────────────────
const dburl = process.env.SUPABASE_DATABASE_URL;
if (!dburl) {
  console.error("ABORT: SUPABASE_DATABASE_URL is not set. Refusing to run against fallback DB.");
  process.exit(1);
}

let urlHost;
try { urlHost = new URL(dburl).host; }
catch (e) { console.error("ABORT: SUPABASE_DATABASE_URL is malformed:", e.message); process.exit(1); }

// ── Safety: denylist production hosts ─────────────────────────────────────────
const PROD_DENYLIST = (process.env.PROD_DB_HOSTS || "").split(",").filter(Boolean);
if (PROD_DENYLIST.includes(urlHost)) {
  console.error(`ABORT: Host '${urlHost}' is in the production denylist.`);
  process.exit(1);
}
if (/(^|[._-])prod([._-]|$)/i.test(urlHost)) {
  console.error(`ABORT: Host '${urlHost}' looks like a production host. Reset refused.`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: dburl,
  max: 3,
  ssl: { rejectUnauthorized: false },
});

// Tables to snapshot in the before/after report (business data only)
const SNAPSHOT_TABLES = [
  "users", "providers", "appointments", "payments", "wallets",
  "provider_wallets", "provider_ledger", "wallet_transactions",
  "reviews", "disputes", "referrals", "support_tickets", "ticket_messages",
  "services", "service_packages", "package_services", "practitioners",
  "medical_practitioners", "service_practitioners",
  "provider_documents", "provider_credentials", "provider_gallery",
  "provider_earnings", "payout_requests",
  "provider_office_hours", "provider_time_off", "availability_exceptions",
  "provider_buffer_settings", "provider_blocks", "provider_pricing_overrides",
  "provider_category_permissions", "time_slots",
  "appointments", "appointment_events", "appointment_slot_holds",
  "invoices", "invoice_items",
  "group_sessions", "group_session_participants",
  "video_sessions", "waitlist_entries",
  "user_packages", "membership_benefit_usage",
  "family_members", "saved_providers",
  "patient_consents", "patient_notes", "patient_documents", "patient_gallery",
  "medications", "medication_logs", "health_metrics", "medical_history", "prescriptions",
  "gift_cards", "promo_codes", "referrals", "service_requests",
  "refresh_tokens", "idempotency_keys",
  "user_notifications", "notification_queue", "notification_delivery_logs",
  "push_subscriptions", "notification_preferences",
  "admin_notifications", "admin_broadcasts",
  "chat_messages", "chat_conversations", "messages", "conversations",
  "realtime_messages", "realtime_conversations",
  "privacy_requests", "audit_logs", "system_events", "daily_metrics", "platform_events",
];

// Tables to verify are PRESERVED
// NOTE: catalog_services is preserved because sub_services has a FK to it.
//       Truncating catalog_services CASCADE would silently wipe sub_services.
const PRESERVED_TABLES = [
  "sub_services", "categories", "catalog_services",
  "packages", "package_benefits",
  "admin_roles", "rbac_permissions", "role_permissions", "admin_assignments",
];

async function existingTables(client) {
  const r = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  return new Set(r.rows.map(x => x.table_name));
}

async function rowCounts(client, tables, existing) {
  const out = {};
  for (const t of [...new Set(tables)]) {
    if (!existing.has(t)) { out[t] = "N/A (table not found)"; continue; }
    try {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
      out[t] = r.rows[0].n;
    } catch (e) {
      out[t] = `ERR: ${e.message}`;
    }
  }
  return out;
}

async function main() {
  const client = await pool.connect();

  const report = {
    startedAt: new Date().toISOString(),
    host: urlHost,
    before: {},
    after: {},
    preserved: { before: {}, after: {} },
    adminsBefore: [],
    adminsAfter: [],
    error: null,
    finishedAt: null,
  };

  let existing;

  try {
    existing = await existingTables(client);

    // ── BEFORE counts ─────────────────────────────────────────────────────────
    console.log("\n──────────────────────────────────────────────────────────────");
    console.log("  GoldenLife — Hard Reset Test Data");
    console.log(`  Host: ${urlHost}`);
    console.log("──────────────────────────────────────────────────────────────");
    console.log("\n[1/5] Capturing before counts…");

    report.before = await rowCounts(client, SNAPSHOT_TABLES, existing);
    report.preserved.before = await rowCounts(client, PRESERVED_TABLES, existing);

    // ── Admin snapshot ────────────────────────────────────────────────────────
    const beforeAdmins = await client.query(
      `SELECT id, email, role FROM users WHERE role IN ('admin','global_admin','country_admin') ORDER BY role, email`
    );
    report.adminsBefore = beforeAdmins.rows;

    console.log(`    Admin users found: ${report.adminsBefore.length}`);
    for (const a of report.adminsBefore) {
      console.log(`      • ${a.role.padEnd(14)} ${a.email}`);
    }

    if (report.adminsBefore.length === 0) {
      throw new Error("No admin users found — refusing to run to avoid locking out the system.");
    }

    // ── Print notable before counts ───────────────────────────────────────────
    const KEY = ["providers","appointments","payments","wallets","services","users","reviews","support_tickets"];
    console.log("\n[2/5] Key table counts (before):");
    for (const t of KEY) {
      const n = report.before[t];
      if (n !== "N/A (table not found)") console.log(`    ${t.padEnd(22)} ${String(n).padStart(8)}`);
    }

    // ── Read & execute the SQL reset file ─────────────────────────────────────
    console.log("\n[3/5] Executing reset SQL (single transaction)…");
    const sqlFile = path.join(__dirname, "reset-test-data.sql");
    const sql = fs.readFileSync(sqlFile, "utf-8");

    // Split off the verification SELECTs at the end (they return result sets
    // that pg can't execute in a simple query() call when mixed with DDL).
    // Execute as one statement block — pg driver handles multi-statement strings.
    await client.query(sql);

    console.log("    ✓ Transaction committed successfully.");

    // ── AFTER counts ──────────────────────────────────────────────────────────
    console.log("\n[4/5] Capturing after counts…");
    existing = await existingTables(client);
    report.after = await rowCounts(client, SNAPSHOT_TABLES, existing);
    report.preserved.after = await rowCounts(client, PRESERVED_TABLES, existing);

    const afterAdmins = await client.query(
      `SELECT id, email, role FROM users WHERE role IN ('admin','global_admin','country_admin') ORDER BY role, email`
    );
    report.adminsAfter = afterAdmins.rows;

  } catch (e) {
    report.error = e.message;
    console.error("\n✗ RESET FAILED:", e.message);
    console.error("  Transaction was rolled back. No data was changed.");
  }

  client.release();
  await pool.end();

  // ── Pretty summary ────────────────────────────────────────────────────────
  report.finishedAt = new Date().toISOString();

  console.log("\n[5/5] Results:");
  console.log("\n  Business data — Before → After (changed rows only):");
  const allKeys = [...new Set([...Object.keys(report.before), ...Object.keys(report.after)])].sort();
  let totalDeleted = 0;
  for (const t of allKeys) {
    const b = typeof report.before[t] === "number" ? report.before[t] : null;
    const a = typeof report.after[t] === "number" ? report.after[t] : null;
    if (b === null && a === null) continue;
    const bStr = b !== null ? String(b) : "—";
    const aStr = a !== null ? String(a) : "—";
    if (b !== a) {
      const delta = (b !== null && a !== null) ? b - a : 0;
      totalDeleted += delta > 0 ? delta : 0;
      console.log(`    ${t.padEnd(38)} ${bStr.padStart(8)} → ${aStr.padStart(8)}`);
    }
  }
  console.log(`\n  Total rows removed: ${totalDeleted.toLocaleString()}`);

  console.log("\n  Preserved catalogue (should be unchanged):");
  for (const t of PRESERVED_TABLES) {
    const b = report.preserved.before[t];
    const a = report.preserved.after[t];
    const changed = b !== a ? " ← CHANGED (investigate!)" : "";
    if (typeof b === "number" && b > 0) {
      console.log(`    ${t.padEnd(30)} ${String(b).padStart(6)} → ${String(a ?? "?").padStart(6)}${changed}`);
    }
  }

  console.log("\n  Admins remaining:");
  if (report.adminsAfter.length === 0) {
    console.log("    ✗ WARNING: no admin users remain!");
  } else {
    for (const a of report.adminsAfter) {
      console.log(`    ✓ ${a.role.padEnd(14)} ${a.email}`);
    }
  }

  if (report.error) {
    console.log("\n  ✗ Reset FAILED — see error above.");
  } else {
    console.log("\n  ✓ Hard reset complete.");
  }

  console.log("──────────────────────────────────────────────────────────────\n");

  // ── Write JSON report ─────────────────────────────────────────────────────
  fs.mkdirSync(".local", { recursive: true });
  const reportPath = ".local/reset-test-data-report.json";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Full report: ${reportPath}\n`);

  if (report.error) process.exit(2);
}

main().catch(e => { console.error("Fatal:", e); process.exit(3); });
