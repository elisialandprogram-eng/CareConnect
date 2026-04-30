export type Role =
  | "patient"
  | "provider"
  | "admin"
  | "global_admin"
  | "country_admin"
  | string
  | null
  | undefined;

export function isAdminRole(role: Role): boolean {
  return role === "admin" || role === "global_admin" || role === "country_admin";
}

export function isGlobalAdmin(role: Role): boolean {
  return role === "admin" || role === "global_admin";
}
