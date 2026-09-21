import { formatDate, formatDateTime } from "@/lib/datetime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Eye, Edit, Archive, CheckCircle, Clock,
  Users, Search, RefreshCw, BookOpen, History, AlertTriangle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface LegalDoc {
  id: string; slug: string; title: string; description?: string;
  doc_type: string; target_roles: string[]; country_code?: string;
  is_required: boolean; requires_reacceptance: boolean; status: string;
  current_version_id?: string; current_version?: string; version_status?: string;
  effective_date?: string; published_at?: string; created_by_name?: string;
  acceptance_count?: number; created_at: string;
}

interface LegalVersion {
  id: string; document_id: string; version: string; content: string;
  changelog?: string; status: string; effective_date?: string;
  expires_at?: string; published_at?: string; published_by_name?: string;
  acceptance_count?: number; created_at: string;
}

interface LegalAcceptance {
  id: string; user_id: string; document_id: string; version_id: string;
  role_snapshot: string; ip_address?: string; source: string;
  email: string; first_name: string; last_name: string;
  document_title?: string; document_slug?: string; version_number: string; accepted_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: "platform_terms",         label: "Platform Terms" },
  { value: "privacy_policy",         label: "Privacy Policy" },
  { value: "patient_agreement",      label: "Member Agreement" },
  { value: "provider_agreement",     label: "Provider Agreement" },
  { value: "medical_disclaimer",     label: "Medical Disclaimer" },
  { value: "payment_authorization",  label: "Payment Authorization" },
  { value: "refund_policy",          label: "Refund Policy" },
  { value: "cancellation_policy",    label: "Cancellation Policy" },
  { value: "telehealth_consent",     label: "Telehealth Consent" },
  { value: "home_visit_consent",     label: "Home Visit Consent" },
  { value: "caregiver_consent",      label: "Caregiver Consent" },
  { value: "prescription_consent",   label: "Prescription Consent" },
  { value: "minor_consent",          label: "Minor Consent" },
  { value: "guardian_consent",       label: "Guardian Consent" },
  { value: "communication_consent",  label: "Communication Consent" },
  { value: "cookie_consent",         label: "Cookie Consent" },
  { value: "data_processing_consent","label": "Data Processing Consent" },
  { value: "clinical_data_consent",  label: "Clinical Data Consent" },
  { value: "membership_terms",       label: "Membership Terms" },
  { value: "package_terms",          label: "Package Terms" },
  { value: "gift_card_terms",        label: "Gift Card Terms" },
  { value: "provider_code_of_conduct","label": "Provider Code of Conduct" },
  { value: "patient_code_of_conduct","label": "Member Code of Conduct" },
];

const TARGET_ROLES = ["patient", "provider", "admin"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// ── Schemas ────────────────────────────────────────────────────────────────────
const newDocSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9_]+$/, "Lowercase letters, digits, underscores only"),
  title: z.string().min(1, "Title required"),
  description: z.string().optional(),
  docType: z.string().min(1, "Document type required"),
  targetRoles: z.array(z.string()).default([]),
  countryCode: z.string().optional(),
  isRequired: z.boolean().default(true),
  requiresReacceptance: z.boolean().default(false),
});

const newVersionSchema = z.object({
  version: z.string().min(1, "Version required (e.g. 1.0.0)"),
  content: z.string().default(""),
  changelog: z.string().optional(),
  effectiveDate: z.string().optional(),
});

type NewDocForm = z.infer<typeof newDocSchema>;
type NewVersionForm = z.infer<typeof newVersionSchema>;

function configText(t: any, key: string, fallback: string, options?: Record<string, unknown>) {
  return String(t(`admin.config.${key}`, { defaultValue: fallback, ...options }));
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function documentLabel(
  t: any,
  value: { docType?: string | null; slug?: string | null; title?: string | null },
): string {
  const type = value.docType ?? value.slug ?? "";
  const knownType = DOC_TYPES.find(item => item.value === type);
  if (knownType) {
    return configText(t, `doc_type_${knownType.value}`, knownType.label);
  }

  const title = value.title?.trim();
  if (title && title !== value.slug) return title;

  const slug = value.slug?.trim();
  if (!slug) return "—";
  return slug
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function fmt(dt?: string | null) {
  if (!dt) return "—";
  return formatDate(dt, { day: "2-digit", month: "short", year: "numeric" });
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>
      {configText(t, status, status)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Document Registry
// ─────────────────────────────────────────────────────────────────────────────
function DocumentRegistry() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingDoc, setEditingDoc] = useState<LegalDoc | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<LegalDoc | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data: docs = [], isLoading } = useQuery<LegalDoc[]>({
    queryKey: ["/api/admin/legal/documents", statusFilter, search],
    queryFn: () => apiRequest("GET", `/api/admin/legal/documents?${params}`).then(r => r.json()),
  });

  const form = useForm<NewDocForm>({ resolver: zodResolver(newDocSchema), defaultValues: { slug: "", title: "", docType: "platform_terms", targetRoles: [], isRequired: true, requiresReacceptance: false } });

  const createMut = useMutation({
    mutationFn: (data: NewDocForm) => apiRequest("POST", "/api/admin/legal/documents", data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: configText(t, "document_created", "Document created") });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
      setShowCreate(false);
      form.reset();
    },
    onError: (e: any) => toast({ title: configText(t, "error", "Error"), description: e.message, variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/legal/documents/${id}`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: configText(t, "document_archived", "Document archived") });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
    },
    onError: (e: any) => toast({ title: configText(t, "error", "Error"), description: e.message, variant: "destructive" }),
  });

  const roleOptions = TARGET_ROLES.map(r => ({ value: r, label: r }));
  const watchedRoles = form.watch("targetRoles");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder={configText(t, "search", "Search…")} className="pl-9" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-doc-search" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{configText(t, "all_statuses", "All statuses")}</SelectItem>
            <SelectItem value="draft">{configText(t, "draft", "Draft")}</SelectItem>
            <SelectItem value="published">{configText(t, "published", "Published")}</SelectItem>
            <SelectItem value="archived">{configText(t, "archived", "Archived")}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-doc">
          <Plus className="h-4 w-4 mr-2" /> {configText(t, "new_document", "New document")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> {configText(t, "loading", "Loading…")}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{configText(t, "title", "Title")}</TableHead>
                <TableHead>{configText(t, "type", "Type")}</TableHead>
                <TableHead>{configText(t, "roles", "Roles")}</TableHead>
                <TableHead>{configText(t, "version", "Version")}</TableHead>
                <TableHead>{configText(t, "status", "Status")}</TableHead>
                <TableHead>{configText(t, "acceptances", "Acceptances")}</TableHead>
                <TableHead>{configText(t, "published_date", "Published")}</TableHead>
                <TableHead className="w-28">{configText(t, "actions", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{configText(t, "no_documents", "No documents found")}</TableCell></TableRow>
              )}
              {docs.map(doc => (
                <TableRow key={doc.id} data-testid={`row-doc-${doc.id}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{documentLabel(t, { docType: doc.doc_type, slug: doc.slug, title: doc.title })}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{configText(t, `doc_type_${doc.doc_type}`, DOC_TYPES.find(x => x.value === doc.doc_type)?.label ?? doc.doc_type)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(doc.target_roles ?? []).map(r => <Badge key={r} variant="outline" className="text-xs">{r}</Badge>)}
                      {(!doc.target_roles || doc.target_roles.length === 0) && <span className="text-xs text-muted-foreground">{configText(t, "all", "All")}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{doc.current_version ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={doc.status} /></TableCell>
                  <TableCell className="text-sm">{doc.acceptance_count ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmt(doc.published_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedDoc(doc)} title={configText(t, "view_versions", "View versions")} data-testid={`button-view-doc-${doc.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDoc(doc)} title={configText(t, "edit", "Edit")} data-testid={`button-edit-doc-${doc.id}`}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {doc.status !== "archived" && (
                        <Button size="sm" variant="ghost" onClick={() => archiveMut.mutate(doc.id)} title={configText(t, "archive", "Archive")} data-testid={`button-archive-doc-${doc.id}`}>
                          <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Document Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
           <DialogTitle>{configText(t, "create_document", "Create Legal Document")}</DialogTitle>
           <DialogDescription>{configText(t, "create_document_desc", "Define the document registry entry. Actual content is added via versions.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(d => createMut.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{configText(t, "slug", "Slug")} <span className="text-destructive">*</span></Label>
                <Input {...form.register("slug")} placeholder="platform_terms" data-testid="input-doc-slug" />
                {form.formState.errors.slug && <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>{configText(t, "document_type", "Document Type")} <span className="text-destructive">*</span></Label>
                <Select defaultValue="platform_terms" onValueChange={v => form.setValue("docType", v)}>
                  <SelectTrigger data-testid="select-doc-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(docType => <SelectItem key={docType.value} value={docType.value}>{configText(t, `doc_type_${docType.value}`, docType.label)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{configText(t, "title", "Title")} <span className="text-destructive">*</span></Label>
              <Input {...form.register("title")} placeholder="Platform Terms of Service" data-testid="input-doc-title" />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>{configText(t, "description", "Description")}</Label>
              <Textarea {...form.register("description")} rows={2} placeholder="Brief summary of this document's purpose" data-testid="textarea-doc-description" />
            </div>
            <div className="space-y-1">
              <Label>{configText(t, "target_roles", "Target Roles")} <span className="text-xs text-muted-foreground">{configText(t, "target_roles_hint", "(leave empty = all roles)")}</span></Label>
              <div className="flex gap-4">
                {TARGET_ROLES.map(role => (
                  <label key={role} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={watchedRoles.includes(role)}
                      onChange={e => {
                        const current = form.getValues("targetRoles");
                        form.setValue("targetRoles", e.target.checked ? [...current, role] : current.filter(r => r !== role));
                      }}
                      data-testid={`checkbox-role-${role}`}
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.watch("isRequired")} onCheckedChange={v => form.setValue("isRequired", v)} data-testid="switch-is-required" />
                {configText(t, "required_acceptance", "Required acceptance")}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.watch("requiresReacceptance")} onCheckedChange={v => form.setValue("requiresReacceptance", v)} data-testid="switch-requires-reacceptance" />
                {configText(t, "reacceptance_update", "Requires re-acceptance on update")}
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>{configText(t, "cancel", "Cancel")}</Button>
              <Button type="submit" disabled={createMut.isPending} data-testid="button-submit-create-doc">
                {createMut.isPending ? configText(t, "creating", "Creating…") : configText(t, "create_document_button", "Create Document")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      {editingDoc && (
        <EditDocumentDialog doc={editingDoc} onClose={() => setEditingDoc(null)} />
      )}

      {/* Version Management Dialog */}
      {selectedDoc && (
        <VersionManagementDialog doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Document Dialog
// ─────────────────────────────────────────────────────────────────────────────
function EditDocumentDialog({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const form = useForm<Partial<NewDocForm>>({
    defaultValues: {
      title: doc.title,
      description: doc.description ?? "",
      docType: doc.doc_type,
      targetRoles: doc.target_roles ?? [],
      isRequired: doc.is_required,
      requiresReacceptance: doc.requires_reacceptance,
    },
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/admin/legal/documents/${doc.id}`, data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: configText(t, "document_updated", "Document updated") });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
      onClose();
    },
    onError: (e: any) => toast({ title: configText(t, "error", "Error"), description: e.message, variant: "destructive" }),
  });

  const watchedRoles = form.watch("targetRoles") ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{configText(t, "edit_document", "Edit document")} — {doc.slug}</DialogTitle>
          <DialogDescription>{configText(t, "edit_document_desc", "Update document metadata. Content is managed via versions.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(d => updateMut.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <Label>{configText(t, "title", "Title")}</Label>
            <Input {...form.register("title")} data-testid="input-edit-title" />
          </div>
          <div className="space-y-1">
            <Label>{configText(t, "description", "Description")}</Label>
            <Textarea {...form.register("description")} rows={2} data-testid="textarea-edit-description" />
          </div>
          <div className="space-y-1">
            <Label>{configText(t, "document_type", "Document type")}</Label>
            <Select defaultValue={doc.doc_type} onValueChange={v => form.setValue("docType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map(item => <SelectItem key={item.value} value={item.value}>{configText(t, `doc_type_${item.value}`, item.label)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{configText(t, "target_roles", "Target roles")}</Label>
            <div className="flex gap-4">
              {TARGET_ROLES.map(role => (
                <label key={role} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watchedRoles.includes(role)}
                    onChange={e => {
                      const current = form.getValues("targetRoles") ?? [];
                      form.setValue("targetRoles", e.target.checked ? [...current, role] : current.filter(r => r !== role));
                    }}
                  />
                  {role}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={form.watch("isRequired")} onCheckedChange={v => form.setValue("isRequired", v)} />
              Required acceptance
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={form.watch("requiresReacceptance")} onCheckedChange={v => form.setValue("requiresReacceptance", v)} />
              {configText(t, "reacceptance", "Re-acceptance on update")}
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>{configText(t, "cancel", "Cancel")}</Button>
            <Button type="submit" disabled={updateMut.isPending}>{updateMut.isPending ? configText(t, "saving", "Saving…") : configText(t, "save_changes", "Save changes")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Version Management Dialog
// ─────────────────────────────────────────────────────────────────────────────
function VersionManagementDialog({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [editingVersion, setEditingVersion] = useState<LegalVersion | null>(null);

  const { data: versions = [], isLoading } = useQuery<LegalVersion[]>({
    queryKey: ["/api/admin/legal/documents", doc.id, "versions"],
    queryFn: () => apiRequest("GET", `/api/admin/legal/documents/${doc.id}/versions`).then(r => r.json()),
  });

  const vForm = useForm<NewVersionForm>({
    resolver: zodResolver(newVersionSchema),
    defaultValues: { version: "", content: "", changelog: "" },
  });

  const createVersionMut = useMutation({
    mutationFn: (data: NewVersionForm) => apiRequest("POST", `/api/admin/legal/documents/${doc.id}/versions`, data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: configText(t, "version_created", "Version created") });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents", doc.id, "versions"] });
      setShowNewVersion(false);
      vForm.reset();
    },
    onError: (e: any) => toast({ title: configText(t, "error", "Error"), description: e.message, variant: "destructive" }),
  });

  const publishMut = useMutation({
    mutationFn: ({ versionId, requiresReacceptance }: { versionId: string; requiresReacceptance: boolean }) =>
      apiRequest("POST", `/api/admin/legal/documents/${doc.id}/versions/${versionId}/publish`, { requiresReacceptance }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: configText(t, "version_published", "Version published") });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents", doc.id, "versions"] });
    },
    onError: (e: any) => toast({ title: configText(t, "error", "Error"), description: e.message, variant: "destructive" }),
  });

  const archiveVersionMut = useMutation({
    mutationFn: (versionId: string) =>
      apiRequest("POST", `/api/admin/legal/documents/${doc.id}/versions/${versionId}/archive`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: configText(t, "version_archived", "Version archived") });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents", doc.id, "versions"] });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {doc.title}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{doc.slug} · <StatusBadge status={doc.status} /></DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold">{configText(t, "version_history", "Version history")}</h4>
            {doc.status !== "archived" && (
              <Button size="sm" onClick={() => setShowNewVersion(true)} data-testid="button-new-version">
                <Plus className="h-3.5 w-3.5 mr-1" /> {configText(t, "new_version", "New version")}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6"><RefreshCw className="h-4 w-4 animate-spin" /> {configText(t, "loading", "Loading…")}</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{configText(t, "no_versions", "No versions yet. Create the first version to add content.")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map(ver => (
                <div key={ver.id} className="border rounded-lg p-4 space-y-2" data-testid={`version-card-${ver.id}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm">v{ver.version}</span>
                      <StatusBadge status={ver.status} />
                      {ver.status === "published" && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs">{configText(t, "current", "Current")}</Badge>}
                    </div>
                    <div className="flex gap-2">
                      {ver.status === "draft" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditingVersion(ver)} data-testid={`button-edit-version-${ver.id}`}>
                            <Edit className="h-3.5 w-3.5 mr-1" /> {configText(t, "edit", "Edit")}
                          </Button>
                          <Button size="sm" onClick={() => publishMut.mutate({ versionId: ver.id, requiresReacceptance: doc.requires_reacceptance })} disabled={publishMut.isPending} data-testid={`button-publish-version-${ver.id}`}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> {configText(t, "publish", "Publish")}
                          </Button>
                        </>
                      )}
                      {ver.status !== "archived" && ver.status !== "published" && (
                        <Button size="sm" variant="ghost" onClick={() => archiveVersionMut.mutate(ver.id)} data-testid={`button-archive-version-${ver.id}`}>
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {ver.changelog && <p className="text-xs text-muted-foreground">{ver.changelog}</p>}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {ver.effective_date && <span><Clock className="h-3 w-3 inline mr-1" />{configText(t, "effective", "Effective")}: {fmt(ver.effective_date)}</span>}
                    {ver.published_at && <span><CheckCircle className="h-3 w-3 inline mr-1" />{configText(t, "published_date", "Published")}: {fmt(ver.published_at)}{ver.published_by_name && ` ${configText(t, "by", "by")} ${ver.published_by_name}`}</span>}
                    <span><Users className="h-3 w-3 inline mr-1" />{ver.acceptance_count ?? 0} {configText(t, "acceptances", "acceptances")}</span>
                  </div>
                  {ver.content && (
                    <div className="mt-2 text-xs bg-muted/40 rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                      {ver.content.length > 500 ? ver.content.slice(0, 500) + "\n…(truncated)" : ver.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New Version Form */}
          {showNewVersion && (
            <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
               <h5 className="text-sm font-semibold">{configText(t, "new_version", "New version")}</h5>
              <form onSubmit={vForm.handleSubmit(d => createVersionMut.mutate(d))} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{configText(t, "version_number", "Version number")} <span className="text-destructive">*</span></Label>
                    <Input {...vForm.register("version")} placeholder="1.0.0" data-testid="input-version-number" />
                    {vForm.formState.errors.version && <p className="text-xs text-destructive">{vForm.formState.errors.version.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>{configText(t, "effective_date", "Effective date")}</Label>
                    <Input type="date" {...vForm.register("effectiveDate")} data-testid="input-version-effective-date" />
                  </div>
                </div>
                <div className="space-y-1">
                   <Label>{configText(t, "changelog", "Changelog (what changed in this version)")}</Label>
                  <Input {...vForm.register("changelog")} placeholder="Initial version" data-testid="input-version-changelog" />
                </div>
                <div className="space-y-1">
                   <Label>{configText(t, "content_markdown", "Content (Markdown)")}</Label>
                  <Textarea {...vForm.register("content")} rows={8} placeholder="# Platform Terms of Service&#10;&#10;Placeholder content — legal team will provide final text." className="font-mono text-xs" data-testid="textarea-version-content" />
                </div>
                <div className="flex justify-end gap-2">
                   <Button type="button" variant="outline" size="sm" onClick={() => setShowNewVersion(false)}>{configText(t, "cancel", "Cancel")}</Button>
                  <Button type="submit" size="sm" disabled={createVersionMut.isPending} data-testid="button-submit-version">
                     {createVersionMut.isPending ? configText(t, "saving", "Saving…") : configText(t, "save_draft", "Save draft")}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Acceptance Audit
// ─────────────────────────────────────────────────────────────────────────────
function AcceptanceAudit() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [docId, setDocId] = useState("all");

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (source !== "all") params.set("source", source);
  if (docId !== "all") params.set("documentId", docId);

  const { data: result, isLoading } = useQuery<{ acceptances: LegalAcceptance[]; total: number }>({
    queryKey: ["/api/admin/legal/acceptances", search, source, docId],
    queryFn: () => apiRequest("GET", `/api/admin/legal/acceptances?${params}&limit=100`).then(r => r.json()),
  });

  const { data: docs = [] } = useQuery<LegalDoc[]>({
    queryKey: ["/api/admin/legal/documents"],
    queryFn: () => apiRequest("GET", "/api/admin/legal/documents").then(r => r.json()),
  });

  const acceptances = result?.acceptances ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder={configText(t, "search_by_name_email", "Search by name or email…")} className="pl-9" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-acceptance-search" />
        </div>
        <Select value={docId} onValueChange={setDocId}>
          <SelectTrigger className="w-52" data-testid="select-acceptance-doc">
             <SelectValue placeholder={configText(t, "all_documents", "All documents")} />
          </SelectTrigger>
          <SelectContent>
             <SelectItem value="all">{configText(t, "all_documents", "All documents")}</SelectItem>
             {docs.map(d => <SelectItem key={d.id} value={d.id}>{documentLabel(t, { docType: d.doc_type, slug: d.slug, title: d.title })}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-40" data-testid="select-acceptance-source">
             <SelectValue placeholder={configText(t, "all_sources", "All sources")} />
          </SelectTrigger>
          <SelectContent>
             <SelectItem value="all">{configText(t, "all_sources", "All sources")}</SelectItem>
             <SelectItem value="registration">{configText(t, "registration", "Registration")}</SelectItem>
             <SelectItem value="booking">{configText(t, "booking", "Booking")}</SelectItem>
             <SelectItem value="onboarding">{configText(t, "onboarding", "Onboarding")}</SelectItem>
             <SelectItem value="admin_prompted">{configText(t, "admin_prompted", "Admin prompted")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">{result?.total ?? 0} {configText(t, "total_acceptance_records", "total acceptance records")}</div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> {configText(t, "loading", "Loading…")}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{configText(t, "user", "User")}</TableHead>
                <TableHead>{configText(t, "document", "Document")}</TableHead>
                <TableHead>{configText(t, "version", "Version")}</TableHead>
                <TableHead>{configText(t, "role", "Role")}</TableHead>
                <TableHead>{configText(t, "source", "Source")}</TableHead>
                <TableHead>{configText(t, "ip_address", "IP address")}</TableHead>
                <TableHead>{configText(t, "accepted_at", "Accepted at")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acceptances.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{configText(t, "no_acceptance_records", "No acceptance records found")}</TableCell></TableRow>
              )}
              {acceptances.map(a => (
                <TableRow key={a.id} data-testid={`row-acceptance-${a.id}`}>
                  <TableCell>
                    <div className="text-sm font-medium">{a.first_name} {a.last_name}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{documentLabel(t, { slug: a.document_slug, title: a.document_title })}</TableCell>
                  <TableCell className="text-sm font-mono">v{a.version_number}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{a.role_snapshot}</Badge></TableCell>
                  <TableCell className="text-xs">{a.source}</TableCell>
                  <TableCell className="text-xs font-mono">{a.ip_address ?? "—"}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(a.accepted_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Pending Re-Acceptances
// ─────────────────────────────────────────────────────────────────────────────
function PendingReacceptances() {
  const { t } = useTranslation();
  const { data: pending = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/legal/pending-reacceptances"],
    queryFn: () => apiRequest("GET", "/api/admin/legal/pending-reacceptances").then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-300">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4" />
           <span className="font-semibold">{configText(t, "about_reacceptance", "About re-acceptance")}</span>
        </div>
         {configText(t, "reacceptance_explanation", "When a document with Requires Re-Acceptance is updated and published, all affected users must accept the new version before they can continue using the platform. This table shows how many users are pending per document.")}
      </div>

      {isLoading ? (
         <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> {configText(t, "loading", "Loading…")}</div>
      ) : pending.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-70" />
           <p className="text-sm font-medium">{configText(t, "all_users_up_to_date", "All users are up to date")}</p>
           <p className="text-xs mt-1">{configText(t, "no_pending_reacceptances", "No pending re-acceptances required")}</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{configText(t, "document", "Document")}</TableHead>
                <TableHead>{configText(t, "current_version", "Current version")}</TableHead>
                <TableHead>{configText(t, "users_pending", "Users pending")}</TableHead>
                <TableHead>{configText(t, "status", "Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((item: any) => (
                <TableRow key={item.document_id} data-testid={`row-pending-${item.document_id}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{documentLabel(t, { slug: item.slug, title: item.title })}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">v{item.current_version}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{item.users_pending}</span>
                    </div>
                  </TableCell>
                   <TableCell><span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded">{configText(t, "reacceptance_required", "Re-acceptance required")}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — Inventory Summary (WS1)
// ─────────────────────────────────────────────────────────────────────────────
function DocumentInventory() {
  const { t } = useTranslation();
  const { data: docs = [] } = useQuery<LegalDoc[]>({
    queryKey: ["/api/admin/legal/documents"],
    queryFn: () => apiRequest("GET", "/api/admin/legal/documents").then(r => r.json()),
  });

  const byType = DOC_TYPES.map(t => {
    const doc = docs.find(d => d.doc_type === t.value);
    return { ...t, doc };
  });

  const published = docs.filter(d => d.status === "published").length;
  const draft = docs.filter(d => d.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{published}</div>
             <div className="text-xs text-muted-foreground">{configText(t, "published_documents", "Published documents")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{draft}</div>
             <div className="text-xs text-muted-foreground">{configText(t, "draft_documents", "Draft documents")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-muted-foreground">{DOC_TYPES.length - docs.length}</div>
             <div className="text-xs text-muted-foreground">{configText(t, "not_yet_created", "Not yet created")}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
               <TableHead>{configText(t, "document_type", "Document type")}</TableHead>
               <TableHead>{configText(t, "status", "Status")}</TableHead>
               <TableHead>{configText(t, "required", "Required")}</TableHead>
               <TableHead>{configText(t, "acceptances", "Acceptances")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
             {byType.map(({ value, label, doc }) => (
              <TableRow key={value} data-testid={`row-inventory-${value}`}>
               <TableCell className="text-sm font-medium">{configText(t, `doc_type_${value}`, label)}</TableCell>
                <TableCell>
                   {doc ? <StatusBadge status={doc.status} /> : <span className="text-xs text-muted-foreground italic">{configText(t, "not_created", "Not created")}</span>}
                </TableCell>
                   <TableCell>{doc ? (doc.is_required ? <Badge variant="default" className="text-xs">{configText(t, "required", "Required")}</Badge> : <span className="text-xs text-muted-foreground">{configText(t, "optional", "Optional")}</span>) : "—"}</TableCell>
                <TableCell className="text-sm">{doc?.acceptance_count ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────────────────────────────────────
export function LegalCompliancePanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
           <h2 className="text-xl font-semibold">{configText(t, "legal_compliance", "Legal & Compliance")}</h2>
           <p className="text-sm text-muted-foreground">{configText(t, "legal_compliance_desc", "Version-controlled legal documents, consent tracking, and acceptance auditing")}</p>
        </div>
      </div>

      <Tabs defaultValue="registry" className="w-full">
        <TabsList className="tabs-colorful tabs-warm grid w-full grid-cols-4">
          <TabsTrigger value="registry" data-testid="tab-registry">
             <FileText className="h-4 w-4 mr-2" /> {configText(t, "document_registry", "Document registry")}
          </TabsTrigger>
          <TabsTrigger value="acceptances" data-testid="tab-acceptances">
             <CheckCircle className="h-4 w-4 mr-2" /> {configText(t, "acceptance_audit", "Acceptance audit")}
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
             <AlertTriangle className="h-4 w-4 mr-2" /> {configText(t, "reacceptances", "Re-acceptances")}
          </TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">
             <BookOpen className="h-4 w-4 mr-2" /> {configText(t, "inventory", "Inventory")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="mt-6">
          <DocumentRegistry />
        </TabsContent>
        <TabsContent value="acceptances" className="mt-6">
          <AcceptanceAudit />
        </TabsContent>
        <TabsContent value="pending" className="mt-6">
          <PendingReacceptances />
        </TabsContent>
        <TabsContent value="inventory" className="mt-6">
          <DocumentInventory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
