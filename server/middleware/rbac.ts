/**
 * Role-Based Access Control middleware.
 *
 * Defines the permission catalogue, per-role default grants, and the
 * `requirePermission(perm)` Express middleware factory that enforces them.
 *
 * Permission keys follow the "module:action" convention.
 * Super-admins (legacy `admin` / `global_admin`) bypass all checks.
 * Other admins are checked against their active admin_assignment row.
 */

import { pool } from "../db";
import type { Response, NextFunction } from "express";
import { isAdminRole } from "./country";

// ── Permission catalogue ───────────────────────────────────────────────────────

export const PERMISSIONS = {
  // Users
  USERS_VIEW: "users:view",
  USERS_CREATE: "users:create",
  USERS_EDIT: "users:edit",
  USERS_DELETE: "users:delete",
  USERS_SUSPEND: "users:suspend",

  // Providers
  PROVIDERS_VIEW: "providers:view",
  PROVIDERS_APPROVE: "providers:approve",
  PROVIDERS_REJECT: "providers:reject",
  PROVIDERS_DELETE: "providers:delete",
  PROVIDERS_VERIFY: "providers:verify",

  // Documents & credentials
  DOCUMENTS_VIEW: "documents:view",
  DOCUMENTS_VERIFY: "documents:verify",

  // Appointments
  APPOINTMENTS_VIEW: "appointments:view",
  APPOINTMENTS_MANAGE: "appointments:manage",

  // Payments
  PAYMENTS_VIEW: "payments:view",
  PAYMENTS_REFUND: "payments:refund",
  PAYMENTS_MANAGE: "payments:manage",

  // Support tickets
  TICKETS_VIEW: "tickets:view",
  TICKETS_RESPOND: "tickets:respond",
  TICKETS_RESOLVE: "tickets:resolve",

  // Content (FAQs, announcements, blogs)
  CONTENT_VIEW: "content:view",
  CONTENT_EDIT: "content:edit",

  // Analytics & reports
  ANALYTICS_VIEW: "analytics:view",

  // Platform settings (tax, promo codes, etc.)
  SETTINGS_VIEW: "settings:view",
  SETTINGS_EDIT: "settings:edit",

  // Admin management (create / deactivate other admins)
  ADMINS_MANAGE: "admins:manage",

  // Audit log
  AUDIT_VIEW: "audit:view",

  // System monitoring
  MONITORING_VIEW: "monitoring:view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ── Human-readable permission metadata for seeding ────────────────────────────

export const PERMISSION_CATALOG: Array<{
  key: Permission;
  module: string;
  action: string;
  description: string;
}> = [
  { key: PERMISSIONS.USERS_VIEW,        module: "users",        action: "view",     description: "View users" },
  { key: PERMISSIONS.USERS_CREATE,      module: "users",        action: "create",   description: "Create user accounts" },
  { key: PERMISSIONS.USERS_EDIT,        module: "users",        action: "edit",     description: "Edit user profiles" },
  { key: PERMISSIONS.USERS_DELETE,      module: "users",        action: "delete",   description: "Delete user accounts" },
  { key: PERMISSIONS.USERS_SUSPEND,     module: "users",        action: "suspend",  description: "Suspend / unsuspend users" },
  { key: PERMISSIONS.PROVIDERS_VIEW,    module: "providers",    action: "view",     description: "View provider profiles" },
  { key: PERMISSIONS.PROVIDERS_APPROVE, module: "providers",    action: "approve",  description: "Approve provider applications" },
  { key: PERMISSIONS.PROVIDERS_REJECT,  module: "providers",    action: "reject",   description: "Reject provider applications" },
  { key: PERMISSIONS.PROVIDERS_DELETE,  module: "providers",    action: "delete",   description: "Delete providers" },
  { key: PERMISSIONS.PROVIDERS_VERIFY,  module: "providers",    action: "verify",   description: "Verify provider profiles and credentials" },
  { key: PERMISSIONS.DOCUMENTS_VIEW,    module: "documents",    action: "view",     description: "View provider documents and credentials" },
  { key: PERMISSIONS.DOCUMENTS_VERIFY,  module: "documents",    action: "verify",   description: "Approve or reject provider documents" },
  { key: PERMISSIONS.APPOINTMENTS_VIEW,   module: "appointments", action: "view",   description: "View all appointments" },
  { key: PERMISSIONS.APPOINTMENTS_MANAGE, module: "appointments", action: "manage", description: "Manage appointment statuses" },
  { key: PERMISSIONS.PAYMENTS_VIEW,     module: "payments",     action: "view",     description: "View payments & revenue" },
  { key: PERMISSIONS.PAYMENTS_REFUND,   module: "payments",     action: "refund",   description: "Issue refunds" },
  { key: PERMISSIONS.PAYMENTS_MANAGE,   module: "payments",     action: "manage",   description: "Manage payment settings" },
  { key: PERMISSIONS.TICKETS_VIEW,      module: "tickets",      action: "view",     description: "View support tickets" },
  { key: PERMISSIONS.TICKETS_RESPOND,   module: "tickets",      action: "respond",  description: "Reply to support tickets" },
  { key: PERMISSIONS.TICKETS_RESOLVE,   module: "tickets",      action: "resolve",  description: "Resolve/close support tickets" },
  { key: PERMISSIONS.CONTENT_VIEW,      module: "content",      action: "view",     description: "View site content" },
  { key: PERMISSIONS.CONTENT_EDIT,      module: "content",      action: "edit",     description: "Edit site content (FAQs, announcements)" },
  { key: PERMISSIONS.ANALYTICS_VIEW,    module: "analytics",    action: "view",     description: "View analytics & reports" },
  { key: PERMISSIONS.SETTINGS_VIEW,     module: "settings",     action: "view",     description: "View platform settings" },
  { key: PERMISSIONS.SETTINGS_EDIT,     module: "settings",     action: "edit",     description: "Edit platform settings" },
  { key: PERMISSIONS.ADMINS_MANAGE,     module: "admins",       action: "manage",   description: "Create, edit, and deactivate admin accounts" },
  { key: PERMISSIONS.AUDIT_VIEW,        module: "audit",        action: "view",     description: "View audit logs" },
  { key: PERMISSIONS.MONITORING_VIEW,   module: "monitoring",   action: "view",     description: "View system health and monitoring events" },
];

// ── Default role → permissions map (used for DB seeding) ──────────────────────

const ALL_PERMS = Object.values(PERMISSIONS) as Permission[];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: ALL_PERMS,

  country_admin: [
    PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_EDIT,
    PERMISSIONS.USERS_DELETE, PERMISSIONS.USERS_SUSPEND,
    PERMISSIONS.PROVIDERS_VIEW, PERMISSIONS.PROVIDERS_APPROVE, PERMISSIONS.PROVIDERS_REJECT,
    PERMISSIONS.PROVIDERS_VERIFY, PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_VERIFY,
    PERMISSIONS.APPOINTMENTS_VIEW, PERMISSIONS.APPOINTMENTS_MANAGE,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.TICKETS_VIEW, PERMISSIONS.TICKETS_RESPOND, PERMISSIONS.TICKETS_RESOLVE,
    PERMISSIONS.CONTENT_VIEW, PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.AUDIT_VIEW, PERMISSIONS.MONITORING_VIEW,
  ],

  operations_admin: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.PROVIDERS_VIEW, PERMISSIONS.PROVIDERS_APPROVE, PERMISSIONS.PROVIDERS_REJECT,
    PERMISSIONS.PROVIDERS_VERIFY, PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.APPOINTMENTS_VIEW, PERMISSIONS.APPOINTMENTS_MANAGE,
    PERMISSIONS.CONTENT_VIEW, PERMISSIONS.CONTENT_EDIT,
    PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.SETTINGS_VIEW,
  ],

  finance_admin: [
    PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_REFUND, PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.APPOINTMENTS_VIEW, PERMISSIONS.USERS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],

  support_admin: [
    PERMISSIONS.TICKETS_VIEW, PERMISSIONS.TICKETS_RESPOND, PERMISSIONS.TICKETS_RESOLVE,
    PERMISSIONS.USERS_VIEW, PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_VIEW,
  ],

  verification_admin: [
    PERMISSIONS.PROVIDERS_VIEW, PERMISSIONS.PROVIDERS_APPROVE, PERMISSIONS.PROVIDERS_REJECT,
    PERMISSIONS.PROVIDERS_VERIFY,
    PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.DOCUMENTS_VERIFY,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],

  read_only_admin: [
    PERMISSIONS.USERS_VIEW, PERMISSIONS.PROVIDERS_VIEW, PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.TICKETS_VIEW, PERMISSIONS.CONTENT_VIEW,
    PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.DOCUMENTS_VIEW, PERMISSIONS.MONITORING_VIEW,
  ],
};

export const DEFAULT_ROLE_META: Array<{
  name: string;
  displayName: string;
  description: string;
}> = [
  { name: "super_admin",         displayName: "Super Admin",         description: "Full access to all features and settings across all countries" },
  { name: "country_admin",       displayName: "Country Admin",       description: "Full access scoped to one country, cannot manage other admins" },
  { name: "operations_admin",    displayName: "Operations Admin",    description: "Manage providers, services, appointments, and content" },
  { name: "finance_admin",       displayName: "Finance Admin",       description: "View and manage payments, refunds, and revenue reports" },
  { name: "support_admin",       displayName: "Support Admin",       description: "Handle support tickets and assist users" },
  { name: "verification_admin",  displayName: "Verification Admin",  description: "Review and verify provider documents, credentials, and profiles" },
  { name: "read_only_admin",     displayName: "Read-Only Admin",     description: "View-only access across all modules; cannot modify data" },
];

// ── In-process permission cache (mirrors auth cache) ──────────────────────────

const PERM_CACHE_TTL = 30_000;
type PermCacheEntry = {
  perms: Set<string>;
  country: string | null;
  roleName: string | null;
  expires: number;
};
const permCache = new Map<string, PermCacheEntry>();

export function invalidatePermCache(userId: string): void {
  permCache.delete(userId);
}

export async function loadUserPermissions(
  userId: string,
): Promise<{ perms: Set<string>; country: string | null; roleName: string | null }> {
  const now = Date.now();
  const cached = permCache.get(userId);
  if (cached && cached.expires > now) {
    return { perms: cached.perms, country: cached.country, roleName: cached.roleName };
  }

  const result = await pool.query(
    `SELECT rp.permission_key, aa.country_code, ar.name AS role_name
     FROM admin_assignments aa
     JOIN admin_roles ar ON ar.id = aa.role_id
     JOIN role_permissions rp ON rp.role_id = aa.role_id
     WHERE aa.user_id = $1
       AND aa.is_active = true
       AND (aa.expires_at IS NULL OR aa.expires_at > NOW())
     ORDER BY aa.is_active DESC, aa.created_at DESC NULLS LAST
     LIMIT 500`,
    [userId],
  );

  const perms = new Set<string>(result.rows.map((r: any) => r.permission_key));
  const country: string | null = result.rows[0]?.country_code ?? null;
  const roleName: string | null = result.rows[0]?.role_name ?? null;

  permCache.set(userId, { perms, country, roleName, expires: now + PERM_CACHE_TTL });
  return { perms, country, roleName };
}

// ── requirePermission middleware factory ───────────────────────────────────────

export function requirePermission(permission: Permission) {
  return async (req: any, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { role } = req.user;

    // Legacy global_admin / admin → treated as super_admin, bypass all checks
    if (role === "global_admin" || role === "admin") {
      next();
      return;
    }

    // Non-admin users are never allowed (includes all specialized admin role variants)
    if (!isAdminRole(role)) {
      res.status(403).json({ message: "Admin access required" });
      return;
    }

    try {
      const { perms, roleName } = await loadUserPermissions(req.user.id);

      // No assignment yet → fall back to defaults for this admin's role name
      const defaultForRole =
        DEFAULT_ROLE_PERMISSIONS[roleName ?? "country_admin"] ??
        DEFAULT_ROLE_PERMISSIONS.country_admin;
      const effectivePerms = perms.size > 0 ? perms : new Set<string>(defaultForRole);

      if (!effectivePerms.has(permission)) {
        res.status(403).json({ message: `Permission denied: ${permission}` });
        return;
      }
      next();
    } catch {
      res.status(500).json({ message: "Permission check failed" });
    }
  };
}

// ── Permissions matrix helper (for admin UI) ───────────────────────────────────

export function getPermissionsMatrix(): Array<{
  role: string;
  displayName: string;
  permissions: string[];
}> {
  return DEFAULT_ROLE_META.map((r) => ({
    role: r.name,
    displayName: r.displayName,
    permissions: DEFAULT_ROLE_PERMISSIONS[r.name] ?? [],
  }));
}
