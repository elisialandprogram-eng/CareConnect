/**
 * Frontend permission utilities.
 * Loads the current admin's role + permissions from the /api/admin/my-permissions
 * endpoint and exposes a `canAccess(permission)` helper.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";

export type PermissionKey =
  | "users:view" | "users:create" | "users:edit" | "users:delete" | "users:suspend"
  | "providers:view" | "providers:approve" | "providers:reject" | "providers:delete" | "providers:verify"
  | "documents:view" | "documents:verify"
  | "appointments:view" | "appointments:manage"
  | "payments:view" | "payments:refund" | "payments:manage"
  | "tickets:view" | "tickets:respond" | "tickets:resolve"
  | "content:view" | "content:edit"
  | "analytics:view"
  | "settings:view" | "settings:edit"
  | "admins:manage"
  | "audit:view"
  | "monitoring:view";

interface MyPermissionsResponse {
  roleName: string | null;
  permissions: PermissionKey[];
  countryCode: string | null;
}

export function usePermissions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "global_admin" || user?.role === "country_admin";

  const { data } = useQuery<MyPermissionsResponse>({
    queryKey: ["/api/admin/my-permissions"],
    enabled: !!user && isAdmin,
    staleTime: 30_000,
  });

  const isSuperAdmin = user?.role === "admin" || user?.role === "global_admin";

  function canAccess(permission: PermissionKey): boolean {
    if (!user) return false;
    if (isSuperAdmin) return true;
    if (!data) return isAdmin;
    return data.permissions.includes(permission);
  }

  return {
    permissions: data?.permissions ?? [],
    roleName: data?.roleName ?? null,
    countryCode: data?.countryCode ?? null,
    canAccess,
    isSuperAdmin,
    isAdmin,
  };
}

export const PERMISSIONS_MATRIX = [
  {
    group: "Users",
    items: [
      { key: "users:view" as PermissionKey, label: "View users" },
      { key: "users:create" as PermissionKey, label: "Create users" },
      { key: "users:edit" as PermissionKey, label: "Edit users" },
      { key: "users:delete" as PermissionKey, label: "Delete users" },
      { key: "users:suspend" as PermissionKey, label: "Suspend users" },
    ],
  },
  {
    group: "Providers",
    items: [
      { key: "providers:view" as PermissionKey, label: "View providers" },
      { key: "providers:approve" as PermissionKey, label: "Approve providers" },
      { key: "providers:reject" as PermissionKey, label: "Reject providers" },
      { key: "providers:delete" as PermissionKey, label: "Delete providers" },
      { key: "providers:verify" as PermissionKey, label: "Verify providers" },
    ],
  },
  {
    group: "Documents",
    items: [
      { key: "documents:view" as PermissionKey, label: "View documents" },
      { key: "documents:verify" as PermissionKey, label: "Verify documents" },
    ],
  },
  {
    group: "Appointments",
    items: [
      { key: "appointments:view" as PermissionKey, label: "View appointments" },
      { key: "appointments:manage" as PermissionKey, label: "Manage appointments" },
    ],
  },
  {
    group: "Payments",
    items: [
      { key: "payments:view" as PermissionKey, label: "View payments" },
      { key: "payments:refund" as PermissionKey, label: "Issue refunds" },
      { key: "payments:manage" as PermissionKey, label: "Manage payments" },
    ],
  },
  {
    group: "Support",
    items: [
      { key: "tickets:view" as PermissionKey, label: "View tickets" },
      { key: "tickets:respond" as PermissionKey, label: "Respond to tickets" },
      { key: "tickets:resolve" as PermissionKey, label: "Resolve tickets" },
    ],
  },
  {
    group: "Content",
    items: [
      { key: "content:view" as PermissionKey, label: "View content" },
      { key: "content:edit" as PermissionKey, label: "Edit content" },
    ],
  },
  {
    group: "Platform",
    items: [
      { key: "analytics:view" as PermissionKey, label: "View analytics" },
      { key: "settings:view" as PermissionKey, label: "View settings" },
      { key: "settings:edit" as PermissionKey, label: "Edit settings" },
      { key: "admins:manage" as PermissionKey, label: "Manage admins" },
      { key: "audit:view" as PermissionKey, label: "View audit logs" },
      { key: "monitoring:view" as PermissionKey, label: "View monitoring" },
    ],
  },
];
