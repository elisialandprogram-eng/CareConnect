import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Shield, CheckCircle2, XCircle } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface MatrixEntry {
  role: string;
  displayName: string;
  permissions: string[];
}

const ALL_PERMISSIONS = [
  { key: "users:view", group: "Users", label: "View" },
  { key: "users:create", group: "Users", label: "Create" },
  { key: "users:edit", group: "Users", label: "Edit" },
  { key: "users:delete", group: "Users", label: "Delete" },
  { key: "users:suspend", group: "Users", label: "Suspend" },
  { key: "providers:view", group: "Providers", label: "View" },
  { key: "providers:approve", group: "Providers", label: "Approve" },
  { key: "providers:reject", group: "Providers", label: "Reject" },
  { key: "providers:delete", group: "Providers", label: "Delete" },
  { key: "providers:verify", group: "Providers", label: "Verify" },
  { key: "documents:view", group: "Documents", label: "View" },
  { key: "documents:verify", group: "Documents", label: "Verify" },
  { key: "appointments:view", group: "Appointments", label: "View" },
  { key: "appointments:manage", group: "Appointments", label: "Manage" },
  { key: "payments:view", group: "Payments", label: "View" },
  { key: "payments:refund", group: "Payments", label: "Refund" },
  { key: "payments:manage", group: "Payments", label: "Manage" },
  { key: "tickets:view", group: "Support", label: "View" },
  { key: "tickets:respond", group: "Support", label: "Respond" },
  { key: "tickets:resolve", group: "Support", label: "Resolve" },
  { key: "content:view", group: "Content", label: "View" },
  { key: "content:edit", group: "Content", label: "Edit" },
  { key: "analytics:view", group: "Analytics", label: "View" },
  { key: "settings:view", group: "Settings", label: "View" },
  { key: "settings:edit", group: "Settings", label: "Edit" },
  { key: "admins:manage", group: "Admins", label: "Manage" },
  { key: "audit:view", group: "Audit", label: "View" },
  { key: "monitoring:view", group: "Monitoring", label: "View" },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  country_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  operations_admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  finance_admin: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  support_admin: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  verification_admin: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  read_only_admin: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const GROUPS = [...new Set(ALL_PERMISSIONS.map((p) => p.group))];

export default function RbacPermissionsMatrix() {
  const { t } = useTranslation();

  const { data: matrix, isLoading } = useQuery<MatrixEntry[]>({
    queryKey: ["/api/admin/permissions-matrix"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!matrix) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("admin.rbac.title", "Role Permissions Matrix")}
          </CardTitle>
          <CardDescription>
            {t("admin.rbac.description", "All {{roles}} system roles and their {{perms}} permissions. Green = granted, grey = denied.", {
              roles: matrix.length,
              perms: ALL_PERMISSIONS.length,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground sticky left-0 bg-muted/80 backdrop-blur-sm z-10 min-w-[160px]">
                      {t("admin.rbac.permission_col", "Permission")}
                    </th>
                    {matrix.map((r) => (
                      <th key={r.role} className="py-3 px-3 font-medium text-center min-w-[120px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r.role] ?? "bg-muted text-muted-foreground"}`}>
                            {r.displayName}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((group) => {
                    const groupPerms = ALL_PERMISSIONS.filter((p) => p.group === group);
                    return groupPerms.map((perm, i) => (
                      <tr
                        key={perm.key}
                        className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i === 0 ? "border-t-2 border-t-border/60" : ""}`}
                        data-testid={`row-perm-${perm.key}`}
                      >
                        <td className="py-2.5 px-4 sticky left-0 bg-background z-10">
                          <div className="flex items-baseline gap-1.5">
                            {i === 0 && (
                              <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs mr-1 font-normal text-muted-foreground shrink-0">
                                {group}
                              </span>
                            )}
                            {i > 0 && <span className="w-[58px] shrink-0" />}
                            <span className="text-muted-foreground">{perm.label}</span>
                          </div>
                        </td>
                        {matrix.map((r) => {
                          const granted = r.permissions.includes(perm.key);
                          return (
                            <td key={r.role} className="py-2.5 px-3 text-center" data-testid={`cell-${r.role}-${perm.key}`}>
                              {granted ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Role cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {matrix.map((r) => (
          <Card key={r.role} data-testid={`card-role-${r.role}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r.role] ?? "bg-muted"}`}>
                  {r.displayName}
                </span>
                <span className="text-muted-foreground font-normal">
                  {t("admin.rbac.perms_count", "({{count}} perms)", { count: r.permissions.length })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {r.permissions.map((p) => (
                  <span key={p} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground font-mono">
                    {p}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
