/**
 * Environment Management Service — GX-02
 *
 * DB health snapshot, environment snapshot, test data detection,
 * platform stats, and configuration protection report.
 */

import { pool } from "../db";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DbHealthData {
  topTables: Array<{
    table: string;
    liveRows: number;
    deadRows: number;
    totalSizeBytes: number;
    indexSizeBytes: number;
    lastAutovacuum: string | null;
    lastAnalyze: string | null;
  }>;
  cacheHitRate: { heap: number; index: number };
  unusedIndexes: Array<{ table: string; index: string; scans: number }>;
  totalDatabaseSizeBytes: number;
}

export interface EnvironmentSnapshot {
  capturedAt: string;
  recordCounts: Record<string, number>;
  configCounts: Record<string, number>;
  adminUsers: Array<{ id: string; email: string; role: string }>;
  systemSettings: Record<string, unknown>;
}

export interface TestDataReport {
  detectedAt: string;
  seededUsers: Array<{ id: string; email: string; role: string; createdAt: string }>;
  testProviders: Array<{ id: string; userId: string; clinicName: string | null; status: string }>;
  totalTestUsers: number;
  totalTestProviders: number;
  classification: {
    safeToDelete: number;
    reviewRequired: number;
    protected: number;
  };
}

export interface PlatformStats {
  generatedAt: string;
  users: { total: number; patients: number; providers: number; admins: number };
  appointments: { total: number; upcoming: number; completed: number; cancelled: number };
  financial: { totalPayments: number; totalWalletBalance: string; totalProviderEarnings: string };
  content: { services: number; categories: number; reviews: number; supportTickets: number };
  notifications: { queued: number; delivered: number };
  system: { auditLogEntries: number; activeJobs: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function safeCount(sql: string): Promise<number> {
  try {
    const client = await pool.connect();
    try {
      const res = await client.query<{ n: string }>(sql);
      return parseInt(res.rows[0]?.n ?? "0", 10);
    } finally {
      client.release();
    }
  } catch {
    return 0;
  }
}

async function safeQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const client = await pool.connect();
    try {
      const res = await client.query(sql, params);
      return res.rows as T[];
    } finally {
      client.release();
    }
  } catch {
    return [];
  }
}

// ── DB Health ──────────────────────────────────────────────────────────────────

export async function getDbHealth(): Promise<DbHealthData> {
  const client = await pool.connect();
  try {
    const [tablesRes, cacheRes, unusedRes, sizeRes] = await Promise.all([
      client.query(`
        SELECT
          t.relname AS table_name,
          s.n_live_tup AS live_rows,
          s.n_dead_tup AS dead_rows,
          pg_total_relation_size(t.oid) AS total_size_bytes,
          pg_indexes_size(t.oid) AS index_size_bytes,
          s.last_autovacuum,
          s.last_analyze
        FROM pg_class t
        JOIN pg_stat_user_tables s ON s.relname = t.relname
        WHERE t.relkind = 'r'
        ORDER BY pg_total_relation_size(t.oid) DESC
        LIMIT 30
      `),
      client.query(`
        SELECT
          ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS heap_hit_rate,
          ROUND(100.0 * sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) AS idx_hit_rate
        FROM pg_statio_user_tables
      `),
      client.query(`
        SELECT
          t.relname AS table_name,
          i.relname AS index_name,
          s.idx_scan AS scans
        FROM pg_stat_user_indexes s
        JOIN pg_index ix ON ix.indexrelid = s.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        WHERE s.idx_scan < 5
          AND NOT ix.indisprimary
          AND NOT ix.indisunique
        ORDER BY s.idx_scan ASC
        LIMIT 15
      `),
      client.query(`SELECT pg_database_size(current_database())::text AS sz`),
    ]);

    return {
      topTables: tablesRes.rows.map((r) => ({
        table: r.table_name,
        liveRows: parseInt(r.live_rows ?? "0", 10),
        deadRows: parseInt(r.dead_rows ?? "0", 10),
        totalSizeBytes: parseInt(r.total_size_bytes ?? "0", 10),
        indexSizeBytes: parseInt(r.index_size_bytes ?? "0", 10),
        lastAutovacuum: r.last_autovacuum ?? null,
        lastAnalyze: r.last_analyze ?? null,
      })),
      cacheHitRate: {
        heap: parseFloat(cacheRes.rows[0]?.heap_hit_rate ?? "0"),
        index: parseFloat(cacheRes.rows[0]?.idx_hit_rate ?? "0"),
      },
      unusedIndexes: unusedRes.rows.map((r) => ({
        table: r.table_name,
        index: r.index_name,
        scans: parseInt(r.scans ?? "0", 10),
      })),
      totalDatabaseSizeBytes: parseInt(sizeRes.rows[0]?.sz ?? "0", 10),
    };
  } finally {
    client.release();
  }
}

// ── Environment Snapshot ───────────────────────────────────────────────────────

export async function captureEnvironmentSnapshot(): Promise<EnvironmentSnapshot> {
  const client = await pool.connect();
  try {
    const [adminRes] = await Promise.all([
      client.query<{ id: string; email: string; role: string }>(
        `SELECT id, email, role FROM users WHERE role::text IN ('admin','global_admin','country_admin') ORDER BY role, email`
      ),
    ]);

    const countQueries: Array<[string, string]> = [
      ["users_total",         `SELECT COUNT(*)::text AS n FROM users`],
      ["users_patients",      `SELECT COUNT(*)::text AS n FROM users WHERE role = 'patient'`],
      ["users_providers",     `SELECT COUNT(*)::text AS n FROM providers`],
      ["appointments_total",  `SELECT COUNT(*)::text AS n FROM appointments`],
      ["payments_total",      `SELECT COUNT(*)::text AS n FROM payments`],
      ["reviews_total",       `SELECT COUNT(*)::text AS n FROM reviews`],
      ["notifications_total", `SELECT COUNT(*)::text AS n FROM user_notifications`],
    ];

    const configQueries: Array<[string, string]> = [
      ["categories",          `SELECT COUNT(*)::text AS n FROM categories`],
      ["services",            `SELECT COUNT(*)::text AS n FROM services`],
      ["payment_providers",   `SELECT COUNT(*)::text AS n FROM payment_providers`],
      ["commission_rules",    `SELECT COUNT(*)::text AS n FROM commission_rules`],
      ["platform_fee_rules",  `SELECT COUNT(*)::text AS n FROM platform_fee_rules`],
      ["rbac_roles",          `SELECT COUNT(*)::text AS n FROM roles`],
      ["rbac_permissions",    `SELECT COUNT(*)::text AS n FROM permissions`],
      ["promo_codes",         `SELECT COUNT(*)::text AS n FROM promo_codes`],
      ["packages",            `SELECT COUNT(*)::text AS n FROM packages`],
    ];

    const runCounts = async (pairs: Array<[string, string]>) => {
      const result: Record<string, number> = {};
      await Promise.all(
        pairs.map(async ([key, sql]) => {
          try {
            const res = await client.query<{ n: string }>(sql);
            result[key] = parseInt(res.rows[0]?.n ?? "0", 10);
          } catch {
            result[key] = 0;
          }
        })
      );
      return result;
    };

    const [recordCounts, configCounts] = await Promise.all([
      runCounts(countQueries),
      runCounts(configQueries),
    ]);

    return {
      capturedAt: new Date().toISOString(),
      recordCounts,
      configCounts,
      adminUsers: adminRes.rows,
      systemSettings: {},
    };
  } finally {
    client.release();
  }
}

// ── Test Data Detection ────────────────────────────────────────────────────────

export async function detectTestData(): Promise<TestDataReport> {
  const client = await pool.connect();
  try {
    const [usersRes, providersRes] = await Promise.all([
      client.query<{ id: string; email: string; role: string; created_at: string }>(
        `SELECT id, email, role, created_at
         FROM users
         WHERE (
           email ILIKE '%test%'
           OR email ILIKE '%demo%'
           OR email ILIKE '%uat%'
           OR email ILIKE '%seed%'
           OR email ILIKE '%fake%'
           OR email ILIKE '%dummy%'
           OR email ILIKE '%example.com%'
           OR email ILIKE '%goldenlife.health%'
         )
         AND role::text NOT IN ('admin','global_admin','country_admin')
         ORDER BY created_at DESC
         LIMIT 100`
      ),
      client.query<{ id: string; user_id: string; clinic_name: string | null; status: string }>(
        `SELECT p.id, p.user_id, p.clinic_name, p.status
         FROM providers p
         JOIN users u ON u.id = p.user_id
         WHERE (
           u.email ILIKE '%test%'
           OR u.email ILIKE '%demo%'
           OR u.email ILIKE '%uat%'
           OR u.email ILIKE '%seed%'
           OR u.email ILIKE '%fake%'
           OR u.email ILIKE '%dummy%'
           OR u.email ILIKE '%example.com%'
           OR u.email ILIKE '%goldenlife.health%'
         )
         AND u.role::text NOT IN ('admin','global_admin','country_admin')
         ORDER BY p.id DESC
         LIMIT 50`
      ),
    ]);

    const seededUsers = usersRes.rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
    }));

    const testProviders = providersRes.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      clinicName: r.clinic_name,
      status: r.status,
    }));

    return {
      detectedAt: new Date().toISOString(),
      seededUsers,
      testProviders,
      totalTestUsers: seededUsers.length,
      totalTestProviders: testProviders.length,
      classification: {
        safeToDelete: seededUsers.filter((u) =>
          u.email.includes("uat") || u.email.includes("seed") || u.email.includes("demo")
        ).length,
        reviewRequired: seededUsers.filter((u) =>
          u.email.includes("test") || u.email.includes("dummy") || u.email.includes("fake")
        ).length,
        protected: 0,
      },
    };
  } finally {
    client.release();
  }
}

// ── Platform Stats ─────────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const [
    usersTotal,
    usersPatients,
    usersProviders,
    usersAdmins,
    apptTotal,
    apptUpcoming,
    apptCompleted,
    apptCancelled,
    totalPayments,
    services,
    categories,
    reviews,
    tickets,
    notifQueued,
    notifDelivered,
    auditEntries,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*)::text AS n FROM users`),
    safeCount(`SELECT COUNT(*)::text AS n FROM users WHERE role = 'patient'`),
    safeCount(`SELECT COUNT(*)::text AS n FROM providers`),
    safeCount(`SELECT COUNT(*)::text AS n FROM users WHERE role::text IN ('admin','global_admin','country_admin')`),
    safeCount(`SELECT COUNT(*)::text AS n FROM appointments`),
    safeCount(`SELECT COUNT(*)::text AS n FROM appointments WHERE status IN ('confirmed','pending')`),
    safeCount(`SELECT COUNT(*)::text AS n FROM appointments WHERE status = 'completed'`),
    safeCount(`SELECT COUNT(*)::text AS n FROM appointments WHERE status IN ('cancelled','rejected')`),
    safeCount(`SELECT COUNT(*)::text AS n FROM payments`),
    safeCount(`SELECT COUNT(*)::text AS n FROM services WHERE is_active = true`),
    safeCount(`SELECT COUNT(*)::text AS n FROM categories WHERE is_active = true`),
    safeCount(`SELECT COUNT(*)::text AS n FROM reviews`),
    safeCount(`SELECT COUNT(*)::text AS n FROM support_tickets`),
    safeCount(`SELECT COUNT(*)::text AS n FROM notification_queue WHERE status = 'pending'`),
    safeCount(`SELECT COUNT(*)::text AS n FROM notification_delivery_logs`),
    safeCount(`SELECT COUNT(*)::text AS n FROM audit_logs`),
  ]);

  const walletRows = await safeQuery<{ total: string }>(
    `SELECT COALESCE(SUM(balance_usd), 0)::text AS total FROM wallets`
  );
  const earningRows = await safeQuery<{ total: string }>(
    `SELECT COALESCE(SUM(net_amount), 0)::text AS total FROM provider_earnings`
  );

  return {
    generatedAt: new Date().toISOString(),
    users: { total: usersTotal, patients: usersPatients, providers: usersProviders, admins: usersAdmins },
    appointments: { total: apptTotal, upcoming: apptUpcoming, completed: apptCompleted, cancelled: apptCancelled },
    financial: {
      totalPayments,
      totalWalletBalance: walletRows[0]?.total ?? "0",
      totalProviderEarnings: earningRows[0]?.total ?? "0",
    },
    content: { services, categories, reviews, supportTickets: tickets },
    notifications: { queued: notifQueued, delivered: notifDelivered },
    system: { auditLogEntries: auditEntries, activeJobs: 2 },
  };
}
