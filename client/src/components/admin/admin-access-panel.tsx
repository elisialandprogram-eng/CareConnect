import { formatDate } from "@/lib/datetime";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Shield, Users, Globe, MapPin, Pencil, Power,
  CheckCircle, XCircle, ExternalLink, Eye, EyeOff,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminRole {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  country_code: string | null;
  is_suspended: boolean;
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return formatDate(iso, { year: "numeric", month: "short", day: "numeric" });
}

function initials(u: AdminUser) {
  return `${u.first_name?.[0] ?? ""}${u.last_name?.[0] ?? ""}`.toUpperCase() || "?";
}

const ROLE_COLORS: Record<string, string> = {
  super_admin:    "bg-red-50 text-red-700 border-red-200",
  country_admin:  "bg-blue-50 text-blue-700 border-blue-200",
  support_agent:  "bg-teal-50 text-teal-700 border-teal-200",
  content_editor: "bg-purple-50 text-purple-700 border-purple-200",
  finance_admin:  "bg-orange-50 text-orange-700 border-orange-200",
  audit_viewer:   "bg-muted/50 text-muted-foreground border-border",
};

function RoleBadge({ name, display }: { name: string | null; display?: string | null }) {
  if (!name) return <span className="text-xs text-muted-foreground">No role</span>;
  return (
    <Badge variant="outline" className={`text-xs ${ROLE_COLORS[name] ?? "bg-muted text-muted-foreground"}`}>
      {display ?? name.replace(/_/g, " ")}
    </Badge>
  );
}

// ── Add admin dialog ───────────────────────────────────────────────────────────

function AddAdminDialog({
  open, roles, onClose, onSaved,
}: {
  open: boolean;
  roles: AdminRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "",
    phone: "", roleName: "", countryCode: "", notes: "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  const isGlobalRole = form.roleName === "super_admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.roleName) {
       toast({ title: t("admin.fill_required_fields", "Please fill all required fields"), variant: "destructive" });
      return;
    }
    if (form.password.length < 8) {
       toast({ title: t("admin.password_min_admin", "Password must be at least 8 characters"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/admin-users", {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        email:     form.email.trim().toLowerCase(),
        password:  form.password,
        phone:     form.phone || undefined,
        roleName:  form.roleName,
        countryCode: isGlobalRole ? undefined : (form.countryCode || undefined),
        notes:     form.notes || undefined,
      });
       toast({ title: t("admin.admin_created", "Admin user created successfully") });
      setForm({ firstName: "", lastName: "", email: "", password: "", phone: "", roleName: "", countryCode: "", notes: "" });
      onSaved();
    } catch (err: any) {
       toast({ title: err?.message ?? t("admin.create_admin_failed", "Failed to create admin"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-add-admin">
        <DialogHeader>
         <DialogTitle>{t("admin.add_admin_user", "Add Admin User")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
               <Label>{t("admin.first_name_required", "First Name *")}</Label>
              <Input data-testid="input-admin-firstname" value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Jane" />
            </div>
            <div className="space-y-1">
               <Label>{t("admin.last_name_required", "Last Name *")}</Label>
              <Input data-testid="input-admin-lastname" value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Smith" />
            </div>
          </div>
          <div className="space-y-1">
             <Label>{t("admin.email_required", "Email Address *")}</Label>
            <Input data-testid="input-admin-email" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="admin@example.com" />
          </div>
          <div className="space-y-1">
             <Label>{t("admin.password_required", "Password * (min. 8 characters)")}</Label>
            <div className="relative">
              <Input
                data-testid="input-admin-password"
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={e => set("password", e.target.value)}
                 placeholder={t("admin.config.secure_password", "Secure password")}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPass(p => !p)}
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
             <Label>{t("admin.phone_optional", "Phone (optional)")}</Label>
            <Input data-testid="input-admin-phone" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+36 20 123 4567" />
          </div>
          <div className="space-y-1">
             <Label>{t("admin.access_level_role_required", "Access Level / Role *")}</Label>
            <Select value={form.roleName} onValueChange={v => set("roleName", v)}>
              <SelectTrigger data-testid="select-admin-role">
                 <SelectValue placeholder={t("admin.select_role", "Select a role…")} />
              </SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.id} value={r.name}>
                    <div>
                      <p className="font-medium text-sm">{r.displayName}</p>
                      {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.roleName && (() => {
              const r = roles.find(x => x.name === form.roleName);
              return r ? <p className="text-xs text-muted-foreground mt-1">{r.permissions.length} permissions granted</p> : null;
            })()}
          </div>
          {!isGlobalRole && (
            <div className="space-y-1">
               <Label>{t("admin.country_scope", "Country Scope")}</Label>
              <Select value={form.countryCode || "__global__"} onValueChange={v => set("countryCode", v === "__global__" ? "" : v)}>
                <SelectTrigger data-testid="select-admin-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="__global__">{t("admin.global_all_countries", "Global (all countries)")}</SelectItem>
                   <SelectItem value="HU">{t("country.hungary", "Hungary")} (HU)</SelectItem>
                   <SelectItem value="IR">{t("country.iran", "Iran")} (IR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isGlobalRole && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
               <Globe className="h-3 w-3" /> {t("admin.super_admin_global_scope", "Super admins have global scope — access to all countries.")}
            </p>
          )}
          <div className="space-y-1">
             <Label>{t("admin.notes_optional", "Notes (optional)")}</Label>
            <Textarea
              data-testid="input-admin-notes"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
               placeholder={t("admin.config.access_reason_placeholder", "Reason for access, team, reporting line, etc.")}
              rows={2}
            />
          </div>
          <DialogFooter className="pt-2">
             <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
            <Button type="submit" disabled={loading} data-testid="button-create-admin">
               {loading ? t("admin.creating", "Creating…") : t("admin.create_admin", "Create Admin")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit role dialog ───────────────────────────────────────────────────────────

function EditRoleDialog({
  user, roles, onClose, onSaved,
}: {
  user: AdminUser | null;
  roles: AdminRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [roleName, setRoleName] = useState(user?.role_name ?? "");
  const [countryCode, setCountryCode] = useState(user?.assignment_country ?? "");
  const [notes, setNotes] = useState(user?.notes ?? "");

  const isGlobalRole = roleName === "super_admin";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      await apiRequest("PATCH", `/api/admin/admin-users/${user.id}/assignment`, {
        roleName: roleName || undefined,
        countryCode: isGlobalRole ? null : (countryCode || undefined),
        notes: notes || undefined,
        isActive: true,
      });
       toast({ title: t("admin.access_level_updated", "Access level updated") });
      onSaved();
    } catch (err: any) {
       toast({ title: err?.message ?? t("admin.update_failed", "Failed to update"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-edit-role">
        <DialogHeader>
           <DialogTitle>{t("admin.edit_access_level", "Edit Access Level")}</DialogTitle>
        </DialogHeader>
        {user && (
          <form onSubmit={handleSave} className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Editing access for <strong>{user.first_name} {user.last_name}</strong>
            </p>
            <div className="space-y-1">
               <Label>{t("admin.role", "Role")}</Label>
              <Select value={roleName} onValueChange={setRoleName}>
                <SelectTrigger data-testid="select-edit-role">
                 <SelectValue placeholder={t("admin.choose_role", "Choose role…")} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.name}>{r.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isGlobalRole && (
              <div className="space-y-1">
                 <Label>{t("admin.country_scope", "Country Scope")}</Label>
                <Select value={countryCode || "__global__"} onValueChange={v => setCountryCode(v === "__global__" ? "" : v)}>
                  <SelectTrigger data-testid="select-edit-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="__global__">{t("admin.global", "Global")}</SelectItem>
                     <SelectItem value="HU">{t("country.hungary", "Hungary")} (HU)</SelectItem>
                     <SelectItem value="IR">{t("country.iran", "Iran")} (IR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
               <Label>{t("admin.notes", "Notes")}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="input-edit-notes" />
            </div>
            <DialogFooter>
               <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
              <Button type="submit" disabled={loading} data-testid="button-save-role">
                 {loading ? t("common.saving", "Saving…") : t("admin.save_changes", "Save Changes")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AdminAccessPanel() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState("users");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [toggleTarget, setToggleTarget] = useState<{ user: AdminUser; activate: boolean } | null>(null);

  const { data: adminUsers = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/admin-users"],
  });

  const { data: roles = [] } = useQuery<AdminRole[]>({
    queryKey: ["/api/rbac/roles"],
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/admin-users/${id}/deactivate`, { isActive }),
    onSuccess: (_, vars) => {
       toast({ title: vars.isActive ? t("admin.admin_activated", "Admin activated") : t("admin.admin_deactivated", "Admin deactivated") });
      qc.invalidateQueries({ queryKey: ["/api/admin/admin-users"] });
      setToggleTarget(null);
    },
     onError: (e: any) => toast({ title: e?.message ?? t("admin.config.failed", "Failed"), variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return adminUsers;
    const q = search.toLowerCase();
    return adminUsers.filter(u =>
      `${u.first_name} ${u.last_name} ${u.email} ${u.role_display_name ?? ""}`.toLowerCase().includes(q),
    );
  }, [adminUsers, search]);

  const stats = {
    total:  adminUsers.length,
    active: adminUsers.filter(u => u.assignment_active !== false && !u.is_suspended).length,
    roles:  roles.length,
  };

  return (
    <div className="space-y-6">
      {/* Stats + actions row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          {[
             { label: t("admin.config.total_admins", "Total admins"), value: stats.total },
             { label: t("admin.config.active", "Active"),       value: stats.active },
             { label: t("admin.roles", "Roles"),        value: stats.roles },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold tabular-nums" data-testid={`stat-rbac-${s.label.toLowerCase()}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
       <Button variant="outline" size="sm" onClick={() => navigate("/admin/users")} data-testid="link-full-admin-page">
             <ExternalLink className="h-4 w-4 mr-1.5" /> {t("admin.full_page", "Full Page")}
          </Button>
          <Button onClick={() => setShowAdd(true)} data-testid="button-add-admin">
             <Plus className="h-4 w-4 mr-1.5" /> {t("admin.add_admin_user", "Add Admin User")}
          </Button>
        </div>
      </div>

      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-rbac-users">
             <Users className="h-4 w-4 mr-1.5" /> {t("admin.admin_users", "Admin Users")}
          </TabsTrigger>
          <TabsTrigger value="roles" data-testid="tab-rbac-roles">
             <Shield className="h-4 w-4 mr-1.5" /> {t("admin.roles_permissions", "Roles & Permissions")}
          </TabsTrigger>
        </TabsList>

        {/* ── Users list ── */}
        <TabsContent value="users" className="pt-4 space-y-4">
          <Input
             placeholder={t("admin.search_admins", "Search by name or email…")}
            className="w-64"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-admins"
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                       <TableHead>{t("admin.user", "User")}</TableHead>
                       <TableHead>{t("admin.access_level", "Access Level")}</TableHead>
                       <TableHead>{t("admin.scope", "Scope")}</TableHead>
                       <TableHead>{t("admin.last_login", "Last Login")}</TableHead>
                       <TableHead>{t("admin.status", "Status")}</TableHead>
                       <TableHead className="text-right">{t("admin.actions", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                       <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">{t("common.loading", "Loading…")}</TableCell></TableRow>
                    )}
                    {!isLoading && filtered.length === 0 && (
                       <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">{t("admin.no_admin_users", "No admin users found. Add one above.")}</TableCell></TableRow>
                    )}
                    {filtered.map(u => {
                      const isSelf = u.id === currentUser?.id;
                      const isActive = u.assignment_active !== false && !u.is_suspended;
                      return (
                        <TableRow key={u.id} data-testid={`row-admin-${u.id}`} className={!isActive ? "opacity-60" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
                                  {initials(u)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm leading-tight">
                                  {u.first_name} {u.last_name}
                                   {isSelf && <span className="ml-1 text-xs text-primary">({t("common.you", "you")})</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><RoleBadge name={u.role_name} display={u.role_display_name} /></TableCell>
                          <TableCell>
                            {u.assignment_country
                              ? <span className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" />{u.assignment_country}</span>
                               : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="h-3 w-3" />{t("admin.global", "Global")}</span>
                            }
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(u.last_login_at)}</TableCell>
                          <TableCell>
                            {isActive
                               ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-3.5 w-3.5" />{t("admin.config.active", "Active")}</span>
                               : <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="h-3.5 w-3.5" />{t("admin.inactive", "Inactive")}</span>
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => setEditUser(u)}
                                disabled={isSelf}
                                data-testid={`button-edit-admin-${u.id}`}
                                 title={t("admin.edit_access_level", "Edit access level")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className={isActive ? "text-destructive hover:text-destructive" : "text-green-600"}
                                onClick={() => setToggleTarget({ user: u, activate: !isActive })}
                                disabled={isSelf}
                                data-testid={`button-toggle-admin-${u.id}`}
                                 title={isActive ? t("admin.deactivate", "Deactivate") : t("admin.activate", "Activate")}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Roles list ── */}
        <TabsContent value="roles" className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {roles.map(r => (
              <Card key={r.id} data-testid={`card-role-${r.name}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold">{r.displayName}</CardTitle>
                     {r.isSystem && <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("admin.system", "System")}</Badge>}
                  </div>
                  {r.description && <CardDescription className="text-xs">{r.description}</CardDescription>}
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                     {t("admin.config.permissions_granted", "{{count}} permissions granted", { count: r.permissions.length })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {r.permissions.slice(0, 6).map(p => {
                      const [mod, action] = p.split(":");
                      return (
                        <span key={p} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {mod}:{action}
                        </span>
                      );
                    })}
                    {r.permissions.length > 6 && (
                      <span className="text-[10px] text-muted-foreground italic">+{r.permissions.length - 6} more</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {roles.length === 0 && (
               <div className="col-span-3 text-center text-muted-foreground py-10">{t("admin.no_roles_loaded", "No roles loaded.")}</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddAdminDialog
        open={showAdd}
        roles={roles}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ["/api/admin/admin-users"] }); }}
      />

      <EditRoleDialog
        user={editUser}
        roles={roles}
        onClose={() => setEditUser(null)}
        onSaved={() => { setEditUser(null); qc.invalidateQueries({ queryKey: ["/api/admin/admin-users"] }); }}
      />

      <AlertDialog open={!!toggleTarget} onOpenChange={v => { if (!v) setToggleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
               {toggleTarget?.activate ? t("admin.config.activate_admin_account", "Activate admin account") : t("admin.config.deactivate_admin_account", "Deactivate admin account")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.activate
                 ? `${t("admin.reenable_access_for", "Re-enable admin access for")} ${toggleTarget.user.first_name} ${toggleTarget.user.last_name}?`
                 : `${t("admin.suspend_access_for", "Suspend admin access for")} ${toggleTarget?.user.first_name} ${toggleTarget?.user.last_name}? ${t("admin.cannot_login", "They will not be able to log in.")}`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={toggleTarget?.activate ? "" : "bg-destructive hover:bg-destructive/90"}
              onClick={() => toggleTarget && deactivateMutation.mutate({ id: toggleTarget.user.id, isActive: toggleTarget.activate })}
              data-testid="button-confirm-toggle"
            >
               {toggleTarget?.activate ? t("admin.config.activate", "Activate") : t("admin.config.deactivate", "Deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
