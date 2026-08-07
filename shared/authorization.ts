/**
 * Canonical authorization vocabulary shared by server and client.
 *
 * `user_role` remains a coarse compatibility role in the database. Fine
 * grained administrator roles live in admin_assignments and are listed
 * separately below so the two concepts are not accidentally conflated.
 */
export const USER_ROLES = ["patient", "provider", "admin", "global_admin", "country_admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_USER_ROLES = ["admin", "global_admin", "country_admin"] as const;
export const RBAC_ADMIN_ROLES = [
  "super_admin",
  "country_admin",
  "operations_admin",
  "finance_admin",
  "support_admin",
  "verification_admin",
  "read_only_admin",
] as const;

export const ALL_ADMIN_ROLES = [
  ...ADMIN_USER_ROLES,
  "operations_admin",
  "finance_admin",
  "support_admin",
  "verification_admin",
  "read_only_admin",
] as const;

export const GLOBAL_ADMIN_ROLES = ["admin", "global_admin"] as const;

export function isAdminRoleName(role: string | null | undefined): boolean {
  return (ALL_ADMIN_ROLES as readonly string[]).includes(role ?? "");
}

export function isGlobalAdminRoleName(role: string | null | undefined): boolean {
  return (GLOBAL_ADMIN_ROLES as readonly string[]).includes(role ?? "");
}