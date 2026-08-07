import {
  ALL_ADMIN_ROLES,
  GLOBAL_ADMIN_ROLES,
  type UserRole,
} from "@shared/authorization";

export type Role =
  | UserRole
  | string
  | null
  | undefined;

export function isAdminRole(role: Role): boolean {
  return (ALL_ADMIN_ROLES as readonly string[]).includes(role ?? "");
}

export function isGlobalAdmin(role: Role): boolean {
  return (GLOBAL_ADMIN_ROLES as readonly string[]).includes(role ?? "");
}
