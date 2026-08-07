import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/datetime";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { isGlobalAdmin } from "@/lib/roles";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { QK } from "@/lib/query-keys";
import {
  Users, ShieldCheck, Activity, Plus, Pencil, UserX, UserCheck,
  Key, Trash2, ChevronLeft, Globe, MapPin, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  country_code: string | null;
  is_suspended: boolean | null;
  last_login_at: string | null;
  created_at: string;
  assignment_id: string | null;
  assignment_active: boolean | null;
  assignment_country: string | null;
  expires_at: string | null;
  notes: string | null;
  role_id: string | null;
  role_name: string | null;
  role_display_name: string | null;
}

interface AdminRole {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  super_admin:      "bg-red-100 text-red-800 border-red-200",
  country_admin:    "bg-purple-100 text-purple-800 border-purple-200",
  operations_admin: "bg-blue-100 text-blue-800 border-blue-200",
  finance_admin:    "bg-green-100 text-green-800 border-green-200",
  support_admin:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  read_only_admin:  "bg-muted text-foreground border-border",
};

const MODULE_COLORS: Record<string, string> = {
  users:        "bg-blue-50 text-blue-700",
  providers:    "bg-teal-50 text-teal-700",
  appointments: "bg-indigo-50 text-indigo-700",
  payments:     "bg-green-50 text-green-700",
  tickets:      "bg-orange-50 text-orange-700",
  content:      "bg-pink-50 text-pink-700",
  analytics:    "bg-purple-50 text-purple-700",
  settings:     "bg-muted/50 text-foreground",
  admins:       "bg-red-50 text-red-700",
  audit:        "bg-yellow-50 text-yellow-700",
};

function RoleBadge({ roleName, displayName }: { roleName: string | null; displayName?: string | null }) {
  if (!roleName) return <span className="text-muted-foreground text-xs">No role</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${ROLE_COLORS[roleName] ?? "bg-muted text-foreground border-border"}`}>
      {displayName ?? roleName}
    </span>
  );
}

function formatDate(iso: string | null) {
  return formatDateTime(iso) || "—";
}

// ── Create Admin Dialog ────────────────────────────────────────────────────────

function CreateAdminDialog({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: AdminRole[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "",
    roleName: "", countryCode: "HU", notes: "",
  });
  const [loading, setLoading] = useState(false);

  const selectedRole = roles.find(r => r.name === form.roleName);
  const isGlobal = form.roleName === "super_admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.roleName) {
      toast({ title: "All required fields must be filled", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/admin-users", {
        ...form,
        countryCode: isGlobal ? undefined : form.countryCode,
      });
      toast({ title: "Admin created successfully" });
      qc.invalidateQueries({ queryKey: QK.adminAdminUsers() });
      onCreated();
      setForm({ firstName: "", lastName: "", email: "", password: "", roleName: "", countryCode: "HU", notes: "" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to create admin", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-create-admin">
        <DialogHeader>
          <DialogTitle>Create Admin User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First Name *</Label>
              <Input data-testid="input-first-name" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} placeholder="John" />
            </div>
            <div className="space-y-1">
              <Label>Last Name *</Label>
              <Input data-testid="input-last-name" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Doe" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email *</Label>
            <Input data-testid="input-email" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Password * (min 8 chars)</Label>
            <Input data-testid="input-password" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
          </div>
          <div className="space-y-1">
            <Label>Role *</Label>
            <Select value={form.roleName} onValueChange={v => setForm(p => ({ ...p, roleName: v }))}>
              <SelectTrigger data-testid="select-role">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.name} value={r.name}>
                    <div className="flex flex-col">
                      <span>{r.displayName}</span>
                      <span className="text-xs text-muted-foreground">{r.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole && (
              <p className="text-xs text-muted-foreground mt-1">{selectedRole.permissions.length} permissions</p>
            )}
          </div>
          {!isGlobal && (
            <div className="space-y-1">
              <Label>Country Scope</Label>
              <Select value={form.countryCode} onValueChange={v => setForm(p => ({ ...p, countryCode: v }))}>
                <SelectTrigger data-testid="select-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HU">Hungary (HU)</SelectItem>
                  <SelectItem value="IR">Iran (IR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isGlobal && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" /> Super admins have global scope (all countries).
            </p>
          )}
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Input data-testid="input-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Reason for access…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="button-create-admin">
              {loading ? "Creating…" : "Create Admin"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Role Dialog ───────────────────────────────────────────────────────────

function EditRoleDialog({
  user,
  roles,
  onClose,
}: {
  user: AdminUser | null;
  roles: AdminRole[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [roleName, setRoleName] = useState(user?.role_name ?? "");
  const [countryCode, setCountryCode] = useState(user?.assignment_country ?? user?.country_code ?? "HU");
  const [loading, setLoading] = useState(false);

  const isGlobal = roleName === "super_admin";

  async function handleSave() {
    if (!user || !roleName) return;
    setLoading(true);
    try {
      await apiRequest("PATCH", `/api/admin/admin-users/${user.id}/assignment`, {
        roleName,
        countryCode: isGlobal ? null : countryCode,
      });
      toast({ title: "Role updated" });
      qc.invalidateQueries({ queryKey: QK.adminAdminUsers() });
      onClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to update role", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent data-testid="dialog-edit-role">
        <DialogHeader>
          <DialogTitle>Change Role — {user?.first_name} {user?.last_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={roleName} onValueChange={setRoleName}>
              <SelectTrigger data-testid="select-edit-role">
                <SelectValue placeholder="Choose role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.name} value={r.name}>{r.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isGlobal && (
            <div className="space-y-1">
              <Label>Country Scope</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger data-testid="select-edit-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HU">Hungary (HU)</SelectItem>
                  <SelectItem value="IR">Iran (IR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading} data-testid="button-save-role">
            {loading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("admins");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  if (!user || !isGlobalAdmin(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Global admin access required.</p>
        <Button variant="outline" onClick={() => navigate("/admin")} data-testid="button-back-admin">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { data: adminUsers = [], isLoading: loadingUsers } = useQuery<AdminUser[]>({
    queryKey: QK.adminAdminUsers(),
  });

  const { data: roles = [] } = useQuery<AdminRole[]>({
    queryKey: QK.rbacRoles(),
  });

  const { data: auditData } = useQuery<{ logs: AuditEntry[]; total: number }>({
    queryKey: QK.adminRbacAuditLog(),
    enabled: tab === "audit",
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/admin-users/${id}/deactivate`, { isActive }),
    onSuccess: () => {
      toast({ title: "Admin status updated" });
      qc.invalidateQueries({ queryKey: QK.adminAdminUsers() });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/admin/session-revoke/${userId}`, {}),
    onSuccess: () => {
      toast({ title: "All sessions revoked" });
      setRevokeTarget(null);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/admin-users/${id}`),
    onSuccess: () => {
      toast({ title: "Admin deleted" });
      qc.invalidateQueries({ queryKey: QK.adminAdminUsers() });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const filtered = adminUsers.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.first_name + " " + u.last_name).toLowerCase().includes(q) ||
      (u.role_display_name ?? "").toLowerCase().includes(q)
    );
  });

  // Group permissions by module for the roles tab
  function groupPermsByModule(perms: string[]) {
    const map: Record<string, string[]> = {};
    for (const p of perms) {
      const [mod, action] = p.split(":");
      if (!map[mod]) map[mod] = [];
      map[mod].push(action);
    }
    return map;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} data-testid="button-back">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Management</h1>
            <p className="text-sm text-muted-foreground">Manage admin users, roles, and permissions</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Admins", value: adminUsers.length, icon: Users },
            { label: "Active", value: adminUsers.filter(u => !u.is_suspended).length, icon: UserCheck },
            { label: "Suspended", value: adminUsers.filter(u => u.is_suspended).length, icon: UserX },
            { label: "Roles Defined", value: roles.length, icon: ShieldCheck },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <s.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-2xl font-bold tabular-nums" data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="admins" data-testid="tab-admins">
              <Users className="h-4 w-4 mr-1.5" /> Admin Users
            </TabsTrigger>
            <TabsTrigger value="roles" data-testid="tab-roles">
              <ShieldCheck className="h-4 w-4 mr-1.5" /> Roles & Permissions
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">
              <Activity className="h-4 w-4 mr-1.5" /> Audit Log
            </TabsTrigger>
          </TabsList>

          {/* ── Admin Users Tab ── */}
          <TabsContent value="admins" className="pt-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Input
                className="max-w-xs"
                placeholder="Search by name, email, or role…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-admins"
              />
              <Button onClick={() => setShowCreate(true)} data-testid="button-add-admin">
                <Plus className="h-4 w-4 mr-1.5" /> New Admin
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Name / Email</TableHead>
                        <TableHead scope="col">Role</TableHead>
                        <TableHead scope="col">Scope</TableHead>
                        <TableHead scope="col">Status</TableHead>
                        <TableHead scope="col">Last Login</TableHead>
                        <TableHead scope="col" className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingUsers && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                        </TableRow>
                      )}
                      {!loadingUsers && filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No admin users found.</TableCell>
                        </TableRow>
                      )}
                      {filtered.map(u => (
                        <TableRow key={u.id} data-testid={`row-admin-${u.id}`} className={u.is_suspended ? "opacity-60" : ""}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{u.first_name} {u.last_name}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <RoleBadge roleName={u.role_name} displayName={u.role_display_name} />
                          </TableCell>
                          <TableCell>
                            {u.assignment_country ? (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {u.assignment_country}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Globe className="h-3 w-3" /> Global
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {u.is_suspended
                              ? <Badge variant="destructive" className="text-xs">Suspended</Badge>
                              : <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">Active</Badge>
                            }
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" /> {u.last_login_at ? formatDate(u.last_login_at) : "Never"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => setEditUser(u)}
                                title="Change role"
                                data-testid={`button-edit-role-${u.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => deactivateMutation.mutate({ id: u.id, isActive: !!u.is_suspended })}
                                title={u.is_suspended ? "Activate" : "Deactivate"}
                                data-testid={`button-toggle-${u.id}`}
                              >
                                {u.is_suspended ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => setRevokeTarget(u)}
                                title="Revoke all sessions"
                                data-testid={`button-revoke-${u.id}`}
                              >
                                <Key className="h-3.5 w-3.5" />
                              </Button>
                              {u.id !== user?.id && (
                                <Button
                                  size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget(u)}
                                  title="Delete admin"
                                  data-testid={`button-delete-${u.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Roles & Permissions Tab ── */}
          <TabsContent value="roles" className="pt-4">
            <div className="grid gap-4">
              {roles.map(role => {
                const grouped = groupPermsByModule(role.permissions);
                return (
                  <Card key={role.id} data-testid={`card-role-${role.name}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <RoleBadge roleName={role.name} displayName={role.displayName} />
                          {role.isSystem && (
                            <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">system</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{role.permissions.length} permissions</span>
                      </div>
                      {role.description && (
                        <CardDescription className="text-sm mt-1">{role.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {Object.entries(grouped).map(([module, actions]) => (
                          <div key={module} className="flex items-start gap-2 flex-wrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${MODULE_COLORS[module] ?? "bg-muted/50 text-foreground"}`}>
                              {module}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {actions.map(a => (
                                <span key={a} className="text-xs border rounded px-1.5 py-0.5 text-muted-foreground">
                                  {a}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {role.permissions.length === 0 && (
                          <p className="text-xs text-muted-foreground">No permissions assigned.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Audit Log Tab ── */}
          <TabsContent value="audit" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Admin Activity Log</CardTitle>
                <CardDescription>All admin account changes, role assignments, and session events.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Actor</TableHead>
                        <TableHead scope="col">Action</TableHead>
                        <TableHead scope="col">Target</TableHead>
                        <TableHead scope="col">Details</TableHead>
                        <TableHead scope="col">IP</TableHead>
                        <TableHead scope="col">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!auditData && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                        </TableRow>
                      )}
                      {auditData?.logs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No audit entries found.</TableCell>
                        </TableRow>
                      )}
                      {auditData?.logs.map(log => {
                        let details: any = {};
                        try { details = JSON.parse(log.details ?? "{}"); } catch {}
                        return (
                          <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                            <TableCell className="text-xs">
                              <p className="font-medium">{log.actor_name ?? "—"}</p>
                              <p className="text-muted-foreground">{log.actor_email ?? "—"}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize">{log.action}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{log.entity_type} {log.entity_id ? `…${log.entity_id.slice(-6)}` : ""}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">{log.ip_address ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(log.created_at)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {auditData && (
                  <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                    Showing {auditData.logs.length} of {auditData.total} entries
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <CreateAdminDialog
        open={showCreate}
        roles={roles}
        onClose={() => setShowCreate(false)}
        onCreated={() => setShowCreate(false)}
      />

      <EditRoleDialog
        user={editUser}
        roles={roles}
        onClose={() => setEditUser(null)}
      />

      {/* Revoke sessions confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={v => { if (!v) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke All Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              All active sessions for <strong>{revokeTarget?.email}</strong> will be immediately invalidated.
              They will need to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
              data-testid="button-confirm-revoke"
            >
              Revoke Sessions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Admin User</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.email}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
