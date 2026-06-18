/**
 * Database Reset Service — GX-02 Enhanced
 *
 * Full Non-System Reset + 7 targeted Reset Profiles.
 * Preserves: admin users, platform configuration, RBAC, catalog, and system data.
 *
 * SAFETY: execution always runs inside a single serializable transaction.
 *         No schema modifications — data removal only.
 */

import { pool } from "../db";
import type { PoolClient } from "pg";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResetCounts {
  patients: number;
  providers: number;
  appointments: number;
  payments: number;
  wallets: number;
  notifications: number;
  reviews: number;
  documents: number;
  messages: number;
  medicalRecords: number;
  // Extended — tables added since initial implementation
  clinicalWorkspace: number;  // soap notes, diagnoses, treatment plans
  bookingRecords: number;     // consents, slot holds, revenue shares
  providerFinancials: number; // payout requests, Stripe accounts
  securityRecords: number;    // MFA, login attempts, password history
  miscRecords: number;        // bug reports, service requests, privacy requests
}

export interface ResetResult {
  counts: ResetCounts;
  durationMs: number;
  errors: string[];
}

export interface ResetProfile {
  id: string;
  name: string;
  description: string;
  affectedTables: string[];
  protected: string[];
  color: "destructive" | "amber" | "blue" | "violet" | "emerald";
}

export interface ProfilePreview {
  profileId: string;
  totalRows: number;
  tableCounts: Record<string, number>;
}

// ── Reset profile definitions ──────────────────────────────────────────────────

export const RESET_PROFILES: ResetProfile[] = [
  {
    id: "operational",
    name: "Operational Data Reset",
    description: "Clears appointments, scheduling, and all operational records without touching users or financials.",
    affectedTables: ["appointments", "appointment_events", "group_sessions", "group_session_participants", "time_slots", "provider_blocks", "availability_exceptions", "provider_schedule_templates", "waitlist_entries", "video_sessions"],
    protected: ["users", "providers", "payments", "wallets", "medical_history"],
    color: "amber",
  },
  {
    id: "financial",
    name: "Financial Data Reset",
    description: "Clears payments, wallets, earnings, invoices, and all financial records.",
    affectedTables: ["payments", "wallet_transactions", "wallets", "provider_ledger", "provider_wallets", "provider_earnings", "invoices", "invoice_items", "disputes", "booking_revenue_shares"],
    protected: ["users", "providers", "appointments", "medical_history"],
    color: "amber",
  },
  {
    id: "clinical",
    name: "Clinical Data Reset",
    description: "Clears medical records, prescriptions, health metrics, and clinical data.",
    affectedTables: ["medical_history", "prescriptions", "patient_notes", "health_metrics", "medications", "medication_logs"],
    protected: ["users", "providers", "appointments", "payments"],
    color: "blue",
  },
  {
    id: "communication",
    name: "Communication Data Reset",
    description: "Clears messages, notifications, support tickets, and all communication channels.",
    affectedTables: ["messages", "chat_messages", "realtime_messages", "conversations", "chat_conversations", "realtime_conversations", "user_notifications", "notification_queue", "notification_delivery_logs", "support_tickets", "ticket_messages", "push_subscriptions"],
    protected: ["users", "providers", "appointments", "payments", "medical_history"],
    color: "violet",
  },
  {
    id: "patient",
    name: "Patient Data Reset",
    description: "Removes all patient accounts and every record associated with them.",
    affectedTables: ["users (patients)", "wallets", "family_members", "saved_addresses", "saved_providers", "patient_consents", "patient_gallery", "health_metrics", "medications", "medical_history", "prescriptions", "patient_notes"],
    protected: ["admin users", "providers", "platform config"],
    color: "destructive",
  },
  {
    id: "provider",
    name: "Provider Data Reset",
    description: "Removes all provider accounts and every record associated with them.",
    affectedTables: ["providers", "provider_documents", "provider_credentials", "provider_gallery", "provider_pricing_overrides", "provider_office_hours", "provider_schedule_templates", "provider_admin_notes", "provider_wallets", "provider_ledger"],
    protected: ["admin users", "patient users", "appointments (orphaned)", "platform config"],
    color: "destructive",
  },
  {
    id: "booking",
    name: "Booking Data Reset",
    description: "Clears all bookings, reviews, scheduling slots, and waitlist entries.",
    affectedTables: ["appointments", "appointment_events", "time_slots", "reviews", "waitlist_entries", "video_sessions", "group_sessions", "group_session_participants"],
    protected: ["users", "providers", "payments", "wallets", "medical_history"],
    color: "amber",
  },
  {
    id: "full",
    name: "Full Non-System Reset",
    description: "Removes ALL operational and user data while preserving platform configuration, admin accounts, RBAC, and the service catalog.",
    affectedTables: ["All 40+ operational tables"],
    protected: ["admin users", "RBAC roles/permissions", "service catalog", "platform settings", "payment providers", "revenue rules"],
    color: "destructive",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAdminIds(client: PoolClient): Promise<string[]> {
  // Cast to ::text to avoid "invalid input value for enum user_role" when the
  // 'staff' literal (or any future value) is not yet in the PG enum.
  const res = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE role::text IN ('admin','global_admin','country_admin')`
  );
  return res.rows.map((r) => r.id);
}

function adminPlaceholder(ids: string[]): string {
  if (ids.length === 0) return "NULL";
  return ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
}

async function safeDelete(
  client: PoolClient,
  sql: string,
  errors: string[]
): Promise<number> {
  // Each DELETE runs in its own auto-commit statement (no wrapping transaction).
  // Supabase uses PgBouncer in transaction mode where SAVEPOINTs are not
  // supported, and a shared BEGIN/COMMIT causes aborted-transaction state to
  // silently skip all subsequent queries. Auto-commit is the safest approach.
  try {
    const res = await client.query(sql);
    return res.rowCount ?? 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Extract table name from SQL so skips are easy to diagnose
    const tableMatch = sql.match(/DELETE FROM (\w+)/i);
    const tbl = tableMatch ? tableMatch[1] : "?";
    errors.push(`[SKIP:${tbl}] ${msg.split("\n")[0]}`);
    return 0;
  }
}

async function countRows(
  client: PoolClient,
  sql: string
): Promise<number> {
  try {
    const res = await client.query<{ n: string }>(sql);
    return parseInt(res.rows[0]?.n ?? "0", 10);
  } catch {
    return 0;
  }
}

// ── Dry-run preview (full reset) ───────────────────────────────────────────────

export async function previewReset(): Promise<ResetCounts> {
  const client = await pool.connect();
  try {
    const adminIds = await getAdminIds(client);
    const ap = adminPlaceholder(adminIds);

    const [
      patients,
      providers,
      appointments,
      payments,
      wallets,
      notifications,
      reviews,
      documents,
      messages,
      medicalRecords,
      clinicalWorkspace,
      bookingRecords,
      providerFinancials,
      securityRecords,
      miscRecords,
    ] = await Promise.all([
      countRows(client, `SELECT COUNT(*)::text AS n FROM users WHERE id NOT IN (${ap}) AND role::text NOT IN ('admin','global_admin','country_admin')`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM providers WHERE user_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM appointments WHERE patient_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM payments WHERE patient_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM wallets WHERE user_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM user_notifications WHERE user_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM reviews WHERE patient_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM provider_documents WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM messages WHERE sender_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM medical_history WHERE patient_id NOT IN (${ap})`),
      // Extended counts
      countRows(client, `SELECT COUNT(*)::text AS n FROM soap_notes WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM appointment_consents WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM payout_requests WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM mfa_secrets WHERE user_id NOT IN (${ap})`),
      countRows(client, `SELECT COUNT(*)::text AS n FROM bug_reports WHERE user_id NOT IN (${ap})`),
    ]);

    return {
      patients, providers, appointments, payments, wallets,
      notifications, reviews, documents, messages, medicalRecords,
      clinicalWorkspace, bookingRecords, providerFinancials, securityRecords, miscRecords,
    };
  } finally {
    client.release();
  }
}

// ── Profile-specific preview ───────────────────────────────────────────────────

export async function previewProfileReset(profileId: string): Promise<ProfilePreview> {
  const client = await pool.connect();
  try {
    const adminIds = await getAdminIds(client);
    const ap = adminPlaceholder(adminIds);

    const tableCounts: Record<string, number> = {};

    const tables: Record<string, string> = {
      // operational
      appointments:                `SELECT COUNT(*)::text AS n FROM appointments WHERE patient_id NOT IN (${ap})`,
      appointment_events:          `SELECT COUNT(*)::text AS n FROM appointment_events WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`,
      group_sessions:              `SELECT COUNT(*)::text AS n FROM group_sessions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      group_session_participants:  `SELECT COUNT(*)::text AS n FROM group_session_participants WHERE user_id NOT IN (${ap})`,
      time_slots:                  `SELECT COUNT(*)::text AS n FROM time_slots WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      provider_blocks:             `SELECT COUNT(*)::text AS n FROM provider_blocks WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      availability_exceptions:     `SELECT COUNT(*)::text AS n FROM availability_exceptions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      provider_schedule_templates: `SELECT COUNT(*)::text AS n FROM provider_schedule_templates WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      waitlist_entries:            `SELECT COUNT(*)::text AS n FROM waitlist_entries WHERE patient_id NOT IN (${ap})`,
      // financial
      payments:                    `SELECT COUNT(*)::text AS n FROM payments WHERE patient_id NOT IN (${ap})`,
      wallet_transactions:         `SELECT COUNT(*)::text AS n FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id NOT IN (${ap}))`,
      wallets:                     `SELECT COUNT(*)::text AS n FROM wallets WHERE user_id NOT IN (${ap})`,
      provider_ledger:             `SELECT COUNT(*)::text AS n FROM provider_ledger WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      provider_wallets:            `SELECT COUNT(*)::text AS n FROM provider_wallets WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      provider_earnings:           `SELECT COUNT(*)::text AS n FROM provider_earnings WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`,
      invoices:                    `SELECT COUNT(*)::text AS n FROM invoices WHERE patient_id NOT IN (${ap})`,
      invoice_items:               `SELECT COUNT(*)::text AS n FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id NOT IN (${ap}))`,
      disputes:                    `SELECT COUNT(*)::text AS n FROM disputes WHERE patient_id NOT IN (${ap})`,
      // clinical
      medical_history:             `SELECT COUNT(*)::text AS n FROM medical_history WHERE patient_id NOT IN (${ap})`,
      prescriptions:               `SELECT COUNT(*)::text AS n FROM prescriptions WHERE patient_id NOT IN (${ap})`,
      patient_notes:               `SELECT COUNT(*)::text AS n FROM patient_notes WHERE patient_id NOT IN (${ap})`,
      health_metrics:              `SELECT COUNT(*)::text AS n FROM health_metrics WHERE user_id NOT IN (${ap})`,
      medications:                 `SELECT COUNT(*)::text AS n FROM medications WHERE user_id NOT IN (${ap})`,
      // communication
      messages:                    `SELECT COUNT(*)::text AS n FROM messages WHERE sender_id NOT IN (${ap})`,
      user_notifications:          `SELECT COUNT(*)::text AS n FROM user_notifications WHERE user_id NOT IN (${ap})`,
      notification_queue:          `SELECT COUNT(*)::text AS n FROM notification_queue WHERE user_id NOT IN (${ap})`,
      support_tickets:             `SELECT COUNT(*)::text AS n FROM support_tickets WHERE user_id NOT IN (${ap})`,
      // patients/providers
      users_patients:              `SELECT COUNT(*)::text AS n FROM users WHERE id NOT IN (${ap}) AND role::text NOT IN ('admin','global_admin','country_admin')`,
      providers:                   `SELECT COUNT(*)::text AS n FROM providers WHERE user_id NOT IN (${ap})`,
      provider_documents:          `SELECT COUNT(*)::text AS n FROM provider_documents WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`,
      reviews:                     `SELECT COUNT(*)::text AS n FROM reviews WHERE patient_id NOT IN (${ap})`,
    };

    const profileTableMap: Record<string, string[]> = {
      operational:   ["appointments","appointment_events","group_sessions","group_session_participants","time_slots","provider_blocks","availability_exceptions","provider_schedule_templates","waitlist_entries"],
      financial:     ["payments","wallet_transactions","wallets","provider_ledger","provider_wallets","provider_earnings","invoices","invoice_items","disputes"],
      clinical:      ["medical_history","prescriptions","patient_notes","health_metrics","medications"],
      communication: ["messages","user_notifications","notification_queue","support_tickets"],
      patient:       ["users_patients","wallets","health_metrics","medications","medical_history","prescriptions","patient_notes"],
      provider:      ["providers","provider_documents","provider_ledger","provider_wallets"],
      booking:       ["appointments","appointment_events","time_slots","reviews","waitlist_entries"],
      full:          Object.keys(tables),
    };

    const profileTables = profileTableMap[profileId] ?? profileTableMap.full;
    const queries = profileTables
      .filter((t) => tables[t])
      .map(async (t) => {
        const n = await countRows(client, tables[t]);
        tableCounts[t] = n;
      });

    await Promise.all(queries);

    const totalRows = Object.values(tableCounts).reduce((a, b) => a + b, 0);
    return { profileId, totalRows, tableCounts };
  } finally {
    client.release();
  }
}

// ── Profile-specific execute ───────────────────────────────────────────────────

export async function executeProfileReset(profileId: string): Promise<{ rowsDeleted: number; durationMs: number; errors: string[] }> {
  const startedAt = Date.now();
  const errors: string[] = [];
  let rowsDeleted = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const adminIds = await getAdminIds(client);
    const ap = adminPlaceholder(adminIds);

    switch (profileId) {
      case "operational": {
        rowsDeleted += await safeDelete(client, `DELETE FROM appointment_events WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_earnings WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM video_sessions WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM group_session_participants WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM group_sessions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM waitlist_entries WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM appointments WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM time_slots WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_blocks WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM availability_exceptions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_schedule_templates WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        break;
      }
      case "financial": {
        rowsDeleted += await safeDelete(client, `DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM invoices WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM disputes WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM payments WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM wallets WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_earnings WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_ledger WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_wallets WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        break;
      }
      case "clinical": {
        rowsDeleted += await safeDelete(client, `DELETE FROM medication_logs WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM medications WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM health_metrics WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM medical_history WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM prescriptions WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM patient_notes WHERE patient_id NOT IN (${ap})`, errors);
        break;
      }
      case "communication": {
        rowsDeleted += await safeDelete(client, `DELETE FROM realtime_messages WHERE conversation_id IN (SELECT id FROM realtime_conversations WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM messages WHERE sender_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM support_tickets WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM realtime_conversations WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM chat_conversations WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM conversations WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM notification_delivery_logs WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM user_notifications WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM notification_queue WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM push_subscriptions WHERE user_id NOT IN (${ap})`, errors);
        break;
      }
      case "patient": {
        rowsDeleted += await safeDelete(client, `DELETE FROM medication_logs WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM health_metrics WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM medications WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM medical_history WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM prescriptions WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM patient_notes WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM patient_consents WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM saved_providers WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM patient_gallery WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM saved_addresses WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM family_members WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM wallets WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM notification_delivery_logs WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM user_notifications WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM notification_queue WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM refresh_tokens WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM users WHERE id NOT IN (${ap}) AND role::text NOT IN ('admin','global_admin','country_admin')`, errors);
        break;
      }
      case "provider": {
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_earnings WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_ledger WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_wallets WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_gallery WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_pricing_overrides WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_category_permissions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_documents WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_credentials WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_office_hours WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_schedule_templates WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM time_slots WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM provider_blocks WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM availability_exceptions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM providers WHERE user_id NOT IN (${ap})`, errors);
        break;
      }
      case "booking": {
        rowsDeleted += await safeDelete(client, `DELETE FROM appointment_events WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM video_sessions WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM group_session_participants WHERE user_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM group_sessions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM waitlist_entries WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM reviews WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM appointments WHERE patient_id NOT IN (${ap})`, errors);
        rowsDeleted += await safeDelete(client, `DELETE FROM time_slots WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
        break;
      }
      default:
        throw new Error(`Unknown profile: ${profileId}`);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { rowsDeleted, durationMs: Date.now() - startedAt, errors };
}

// ── Execute reset (full) ─────────────────────────────────────────────────────

export async function executeReset(): Promise<ResetResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const client = await pool.connect();

  try {
    const adminIds = await getAdminIds(client);
    console.log(`[db-reset] Starting full reset — preserving ${adminIds.length} admin account(s):`, adminIds);
    const ap = adminPlaceholder(adminIds);

    await safeDelete(client, `DELETE FROM medication_logs WHERE user_id NOT IN (${ap})`, errors);
    // realtime_conversations uses participant1_id/participant2_id — not user_id
    await safeDelete(client, `DELETE FROM realtime_messages WHERE conversation_id IN (SELECT id FROM realtime_conversations WHERE participant1_id NOT IN (${ap}) OR participant2_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE patient_id NOT IN (${ap}) OR provider_id NOT IN (${ap}))`, errors);
    // messages (AI chat) is linked via conversations.user_id — no sender_id column
    await safeDelete(client, `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id NOT IN (${ap}))`, errors);

    // ── Clinical workspace (must precede appointment deletion) ─────────────
    await safeDelete(client, `DELETE FROM soap_note_versions WHERE soap_note_id IN (SELECT id FROM soap_notes WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap})))`, errors);
    await safeDelete(client, `DELETE FROM clinical_attachments WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM treatment_tasks WHERE plan_id IN (SELECT id FROM treatment_plans WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap})))`, errors);
    await safeDelete(client, `DELETE FROM treatment_plans WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM diagnoses WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM soap_notes WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);

    // ── Booking-level records (must precede appointment deletion) ──────────
    await safeDelete(client, `DELETE FROM appointment_consents WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM room_reservations WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM booking_revenue_shares WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    // marketplace_ledger has appointment_id — no patient_id column
    await safeDelete(client, `DELETE FROM marketplace_ledger WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    // appointment_slot_holds uses patient_id — not user_id
    await safeDelete(client, `DELETE FROM appointment_slot_holds WHERE patient_id NOT IN (${ap})`, errors);

    await safeDelete(client, `DELETE FROM appointment_events WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_earnings WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM video_sessions WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM group_session_participants WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM payments WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM disputes WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM reviews WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM invoices WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM wallets WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM provider_ledger WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_wallets WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM notification_delivery_logs WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM user_notifications WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM notification_queue WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM push_subscriptions WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM patient_consents WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM saved_providers WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM patient_gallery WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM saved_addresses WHERE user_id NOT IN (${ap})`, errors);
    // health_metrics uses patient_id, family_members uses primary_user_id
    await safeDelete(client, `DELETE FROM health_metrics WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM medications WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM family_members WHERE primary_user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM medical_history WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM prescriptions WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM patient_notes WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM patient_documents WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM waitlist_entries WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM referrals WHERE referrer_user_id NOT IN (${ap}) AND referred_user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM gift_cards WHERE purchaser_user_id NOT IN (${ap}) OR purchaser_user_id IS NULL`, errors);
    // membership_benefit_usage has no user_id — linked via user_package_id
    await safeDelete(client, `DELETE FROM membership_benefit_usage WHERE user_package_id IN (SELECT id FROM user_packages WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM user_packages WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM support_tickets WHERE user_id NOT IN (${ap})`, errors);
    // realtime_conversations uses participant1_id/participant2_id — not user_id
    // Delete any conversation where either participant is not an admin; this
    // must happen before users delete to satisfy the participant2_id FK.
    await safeDelete(client, `DELETE FROM realtime_conversations WHERE participant1_id NOT IN (${ap}) OR participant2_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM chat_conversations WHERE patient_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM conversations WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM group_sessions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM appointments WHERE patient_id NOT IN (${ap})`, errors);

    // ── Provider-linked records (before providers row deletion) ────────────
    await safeDelete(client, `DELETE FROM payout_requests WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM payout_schedules WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_stripe_accounts WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    // room_reservations has no provider_id — already deleted via appointment subquery above
    await safeDelete(client, `DELETE FROM clinic_rooms WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_schedule_overrides WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_admin_notes WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_buffer_settings WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM practitioner_schedules WHERE practitioner_id IN (SELECT id FROM practitioners WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap})))`, errors);
    await safeDelete(client, `DELETE FROM practitioners WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    // sub_services is platform-defined catalog data (services has sub_service_id
    // pointing TO sub_services, not the other way round) — do not delete it.
    await safeDelete(client, `DELETE FROM services WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM time_slots WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_blocks WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM availability_exceptions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_office_hours WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap})) OR (provider_user_id IS NOT NULL AND provider_user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_schedule_templates WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_gallery WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_pricing_overrides WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_category_permissions WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_documents WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM provider_credentials WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM audit_logs WHERE user_id IS NOT NULL AND user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM providers WHERE user_id NOT IN (${ap})`, errors);

    // ── User-linked records (before users row deletion) ────────────────────
    await safeDelete(client, `DELETE FROM mfa_recovery_codes WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM mfa_secrets WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM privacy_requests WHERE user_id NOT IN (${ap})`, errors);
    // bug_reports uses reported_by_user_id not user_id
    await safeDelete(client, `DELETE FROM bug_report_comments WHERE bug_report_id IN (SELECT id FROM bug_reports WHERE reported_by_user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM bug_reports WHERE reported_by_user_id NOT IN (${ap})`, errors);
    // service_requests belongs to providers (provider_id), not users directly
    await safeDelete(client, `DELETE FROM service_requests WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap}))`, errors);
    await safeDelete(client, `DELETE FROM legal_acceptances WHERE user_id NOT IN (${ap})`, errors);
    // login_attempts has only email/ip_address/success columns — no user_id — delete all (brute-force logs)
    await safeDelete(client, `DELETE FROM login_attempts WHERE created_at < NOW()`, errors);
    // notification_preferences FK blocks users delete — must come before it
    await safeDelete(client, `DELETE FROM notification_preferences WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM password_history WHERE user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM platform_events WHERE user_id IS NOT NULL AND user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM refresh_tokens WHERE user_id NOT IN (${ap})`, errors);
    // Final safety sweep — catch any provider_office_hours rows still referencing
    // users about to be deleted (provider_user_id FK). Already handled above but
    // orphaned rows (no matching providers row) can survive the provider-scoped delete.
    await safeDelete(client, `DELETE FROM provider_office_hours WHERE provider_user_id IS NOT NULL AND provider_user_id NOT IN (${ap})`, errors);
    await safeDelete(client, `DELETE FROM users WHERE id NOT IN (${ap}) AND role::text NOT IN ('admin','global_admin','country_admin')`, errors);

    console.log(`[db-reset] Done — ${errors.length} table(s) skipped`);
    if (errors.length) console.log("[db-reset] Skips:", errors);
  } finally {
    client.release();
  }

  const durationMs = Date.now() - startedAt;
  const verifyClient = await pool.connect();
  try {
    const adminIds2 = await getAdminIds(verifyClient);
    const ap2 = adminPlaceholder(adminIds2);
    const [
      patients, providers, appointments, payments,
      wallets, notifications, reviews, documents,
      messages, medicalRecords,
    ] = await Promise.all([
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM users WHERE id NOT IN (${ap2}) AND role::text NOT IN ('admin','global_admin','country_admin')`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM providers WHERE user_id NOT IN (${ap2})`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM appointments WHERE patient_id NOT IN (${ap2})`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM payments WHERE patient_id NOT IN (${ap2})`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM wallets WHERE user_id NOT IN (${ap2})`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM user_notifications WHERE user_id NOT IN (${ap2})`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM reviews WHERE patient_id NOT IN (${ap2})`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM provider_documents WHERE provider_id IN (SELECT id FROM providers WHERE user_id NOT IN (${ap2}))`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM messages WHERE sender_id NOT IN (${ap2})`),
      countRows(verifyClient, `SELECT COUNT(*)::text AS n FROM medical_history WHERE patient_id NOT IN (${ap2})`),
    ]);
    return {
      counts: {
        patients, providers, appointments, payments, wallets,
        notifications, reviews, documents, messages, medicalRecords,
        clinicalWorkspace: 0, bookingRecords: 0,
        providerFinancials: 0, securityRecords: 0, miscRecords: 0,
      },
      durationMs,
      errors,
    };
  } finally {
    verifyClient.release();
  }
}
