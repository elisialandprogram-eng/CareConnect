/**
 * Controlled DB cleanup for the test/dev Supabase environment.
 *
 * Safety:
 *  - Aborts unless SUPABASE_DATABASE_URL is set (we never want to nuke a Replit-managed prod DB by accident).
 *  - Aborts if the URL host contains "prod" or matches a hard-coded production host (extend as needed).
 *  - Wraps everything in a single transaction so partial failures roll back.
 *
 * Preserves:
 *  - All schema (tables, enums, indexes, sequences definitions).
 *  - Admin users (role IN admin / global_admin / country_admin).
 *  - Service catalog: services, service_categories, service_translations (kept by default, set CLEAR_CATALOG=1 to wipe).
 *
 * Wipes:
 *  - All transactional data tables that exist in the schema.
 *  - All non-admin users and their associated rows.
 *  - All providers and their cascaded data.
 *
 * Resets:
 *  - appointment_number_seq, invoice_number_seq, group_session_seq (if they exist) -> 1.
 *
 * Outputs:
 *  - JSON report to stdout AND written to .local/db-cleanup-report.json.
 */

import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const { Pool } = pg;

const dburl = process.env.SUPABASE_DATABASE_URL;
if (!dburl) {
  console.error("ABORT: SUPABASE_DATABASE_URL is not set. Refusing to run cleanup against fallback DB.");
  process.exit(1);
}

let urlHost;
try {
  urlHost = new URL(dburl).host;
} catch (e) {
  console.error("ABORT: SUPABASE_DATABASE_URL is malformed:", e.message);
  process.exit(1);
}

const PRODUCTION_HOST_DENYLIST = (process.env.PROD_DB_HOSTS || "").split(",").filter(Boolean);
if (PRODUCTION_HOST_DENYLIST.includes(urlHost)) {
  console.error(`ABORT: Host '${urlHost}' is in the production denylist. Cleanup refused.`);
  process.exit(1);
}
if (/(^|[._-])prod([._-]|$)/i.test(urlHost)) {
  console.error(`ABORT: Host '${urlHost}' looks like a production host (matches /prod/). Cleanup refused.`);
  process.exit(1);
}

const CLEAR_CATALOG = process.env.CLEAR_CATALOG === "1";

const pool = new Pool({
  connectionString: dburl,
  max: 5,
  ssl: { rejectUnauthorized: false },
});

// Tables we explicitly want to wipe (in dependency-safe order is unnecessary
// because we'll use TRUNCATE ... CASCADE inside a single statement). Anything
// not present is silently skipped.
const TRANSACTIONAL_TABLES = [
  // Appointments / billing
  "appointment_events",
  "appointments",
  "invoice_items",
  "invoices",
  "payments",
  "wallet_transactions",
  "wallets",
  "user_wallets",
  "group_session_participants",
  "group_sessions",
  // Chat / messaging
  "messages",
  "conversations",
  "chat_messages",
  "chat_conversations",
  "realtime_messages",
  "realtime_conversations",
  // Notifications
  "notifications",
  "user_notifications",
  "notification_queue",
  "notification_delivery_logs",
  "notification_preferences",
  "push_subscriptions",
  // Reviews / video / scheduling
  "reviews",
  "video_sessions",
  "time_slots",
  // Pricing history
  "provider_pricing_overrides",
  "service_price_history",
  // Support
  "ticket_messages",
  "support_tickets",
  // Patient data
  "family_members",
  "medical_history",
  "prescriptions",
  "medications",
  "medication_logs",
  "health_metrics",
  "patient_consents",
  "saved_providers",
  // Misc transactional
  "service_requests",
  "waitlist_entries",
  "referrals",
  "audit_logs",
  // Auth (must wipe since users are wiped)
  "refresh_tokens",
];

const PROVIDER_TABLES = [
  "practitioners",
  "medical_practitioners",
  "service_practitioners",
  "provider_earnings",
  "provider_office_hours",
  "provider_time_off",
  "providers",
  "provider_services",
  "provider_availability",
  "provider_documents",
  "provider_payouts",
  "provider_settings",
];

const CATALOG_TABLES = [
  "services",
  "sub_services",
  "service_categories",
  "service_translations",
  "service_packages",
  "package_services",
  "catalog_services",
  "categories",
];

const SEQUENCES_TO_RESET = [
  "appointment_number_seq",
  "invoice_number_seq",
  "group_session_seq",
];

async function listTables(client) {
  const r = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `);
  return r.rows.map(x => x.table_name);
}

async function listSequences(client) {
  const r = await client.query(`
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema='public' ORDER BY sequence_name
  `);
  return r.rows.map(x => x.sequence_name);
}

async function rowCounts(client, tables) {
  const out = {};
  for (const t of tables) {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    out[t] = r.rows[0].n;
  }
  return out;
}

async function main() {
  const client = await pool.connect();
  const report = {
    startedAt: new Date().toISOString(),
    host: urlHost,
    clearCatalog: CLEAR_CATALOG,
    before: {},
    after: {},
    deleted: {},
    truncated: [],
    skipped: [],
    sequenceResets: {},
    adminsBefore: [],
    adminsAfter: [],
    orphans: {},
    notes: [],
  };

  try {
    // 0. Identify which tables actually exist
    const existing = new Set(await listTables(client));
    const existingSeqs = new Set(await listSequences(client));

    // 1. Pre-counts on every table (full schema snapshot)
    const allTables = [...existing].sort();
    report.before = await rowCounts(client, allTables);

    // 2. Snapshot admins
    const adminsBeforeRes = await client.query(
      `SELECT id, email, role FROM users WHERE role IN ('admin','global_admin','country_admin') ORDER BY role, email`
    );
    report.adminsBefore = adminsBeforeRes.rows;

    if (report.adminsBefore.length === 0) {
      throw new Error("Refusing to run: no admin users found. Aborting to avoid leaving the system without an admin.");
    }

    // 3. Build the list of tables to truncate
    const truncateList = [];
    for (const t of TRANSACTIONAL_TABLES) {
      if (existing.has(t)) truncateList.push(t);
      else report.skipped.push(t);
    }
    for (const t of PROVIDER_TABLES) {
      if (existing.has(t)) truncateList.push(t);
      else report.skipped.push(t);
    }
    if (CLEAR_CATALOG) {
      for (const t of CATALOG_TABLES) {
        if (existing.has(t)) truncateList.push(t);
        else report.skipped.push(t);
      }
    }

    // 4. Run cleanup in a single transaction
    await client.query("BEGIN");

    // 4a. TRUNCATE all transactional + provider tables together so FKs don't matter (CASCADE).
    if (truncateList.length > 0) {
      const list = truncateList.map(t => `"${t}"`).join(", ");
      await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      report.truncated.push(...truncateList);
    }

    // 4b. Delete non-admin users (everything related to them was already cascaded away above where FKs exist).
    const delUsers = await client.query(
      `DELETE FROM users WHERE role NOT IN ('admin','global_admin','country_admin')`
    );
    report.deleted.users_non_admin = delUsers.rowCount;

    // 5. Reset requested sequences (idempotent, only if they exist).
    for (const seq of SEQUENCES_TO_RESET) {
      if (existingSeqs.has(seq)) {
        await client.query(`ALTER SEQUENCE "${seq}" RESTART WITH 1`);
        report.sequenceResets[seq] = 1;
      } else {
        report.sequenceResets[seq] = "skipped (does not exist)";
      }
    }

    // 6. Sanity FK / orphan checks: discovered dynamically from
    // information_schema so we never reference columns that don't exist.
    const fks = await client.query(`
      SELECT
        tc.table_name        AS child,
        kcu.column_name      AS fk,
        ccu.table_name       AS parent,
        ccu.column_name      AS pk
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema    = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema    = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema    = 'public'
    `);
    for (const { child, fk, parent, pk } of fks.rows) {
      if (!existing.has(child) || !existing.has(parent)) continue;
      try {
        const r = await client.query(
          `SELECT COUNT(*)::int AS n FROM "${child}" c
           WHERE c."${fk}" IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM "${parent}" p WHERE p."${pk}" = c."${fk}")`
        );
        if (r.rows[0].n > 0) report.orphans[`${child}.${fk} -> ${parent}.${pk}`] = r.rows[0].n;
      } catch (e) {
        report.notes.push(`orphan check ${child}.${fk}: ${e.message}`);
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    report.error = e.message;
    console.error("CLEANUP FAILED, transaction rolled back:", e);
    fs.mkdirSync(".local", { recursive: true });
    fs.writeFileSync(".local/db-cleanup-report.json", JSON.stringify(report, null, 2));
    process.exit(2);
  }

  // 7. Post-counts (outside the txn)
  report.after = await rowCounts(client, [...await listTables(client)].sort());

  const adminsAfterRes = await client.query(
    `SELECT id, email, role FROM users WHERE role IN ('admin','global_admin','country_admin') ORDER BY role, email`
  );
  report.adminsAfter = adminsAfterRes.rows;

  // 8. VACUUM ANALYZE (must be outside transaction; per-table)
  for (const t of [...await listTables(client)].sort()) {
    try { await client.query(`VACUUM ANALYZE "${t}"`); } catch (e) { report.notes.push(`VACUUM ${t}: ${e.message}`); }
  }

  client.release();
  await pool.end();

  // 9. Compute summary
  let totalDeleted = 0;
  for (const t of Object.keys(report.before)) {
    const b = report.before[t] ?? 0;
    const a = report.after[t] ?? 0;
    if (b > a) totalDeleted += (b - a);
  }
  report.totalRowsDeleted = totalDeleted;
  report.finishedAt = new Date().toISOString();

  fs.mkdirSync(".local", { recursive: true });
  fs.writeFileSync(".local/db-cleanup-report.json", JSON.stringify(report, null, 2));

  // Pretty stdout summary
  console.log("\n=========== DB CLEANUP REPORT ===========");
  console.log(`Host:           ${report.host}`);
  console.log(`Clear catalog:  ${report.clearCatalog}`);
  console.log(`Tables truncated (${report.truncated.length}): ${report.truncated.join(", ") || "(none)"}`);
  console.log(`Tables skipped (do not exist) (${report.skipped.length}): ${report.skipped.join(", ") || "(none)"}`);
  console.log(`Non-admin users deleted: ${report.deleted.users_non_admin}`);
  console.log(`Total rows deleted:      ${report.totalRowsDeleted}`);
  console.log(`Admins remaining:        ${report.adminsAfter.length}`);
  for (const a of report.adminsAfter) console.log(`  - ${a.role.padEnd(14)} ${a.email}`);
  console.log("Sequence resets:");
  for (const [s, v] of Object.entries(report.sequenceResets)) console.log(`  - ${s}: ${v}`);
  console.log("\nBefore -> After (changed only):");
  for (const t of Object.keys(report.before).sort()) {
    const b = report.before[t] ?? 0;
    const a = report.after[t] ?? 0;
    if (b !== a) console.log(`  ${t.padEnd(40)} ${String(b).padStart(8)} -> ${String(a).padStart(8)}`);
  }
  if (Object.keys(report.orphans).length === 0) {
    console.log("\nOrphan check: OK (none found)");
  } else {
    console.log("\nOrphan check: FOUND");
    for (const [k, v] of Object.entries(report.orphans)) console.log(`  ${k}: ${v}`);
  }
  console.log(`\nFull JSON report written to .local/db-cleanup-report.json`);
  console.log("==========================================\n");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(3);
});
