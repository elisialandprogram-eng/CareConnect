import { useState } from "react";
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
  document_title?: string; version_number: string; accepted_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: "platform_terms",         label: "Platform Terms" },
  { value: "privacy_policy",         label: "Privacy Policy" },
  { value: "patient_agreement",      label: "Patient Agreement" },
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
  { value: "patient_code_of_conduct","label": "Patient Code of Conduct" },
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

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(dt?: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Document Registry
// ─────────────────────────────────────────────────────────────────────────────
function DocumentRegistry() {
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
      toast({ title: "Document created" });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
      setShowCreate(false);
      form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/legal/documents/${id}`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Document archived" });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const roleOptions = TARGET_ROLES.map(r => ({ value: r, label: r }));
  const watchedRoles = form.watch("targetRoles");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search documents…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-doc-search" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-doc">
          <Plus className="h-4 w-4 mr-2" /> New Document
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title / Slug</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acceptances</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No documents found</TableCell></TableRow>
              )}
              {docs.map(doc => (
                <TableRow key={doc.id} data-testid={`row-doc-${doc.id}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{doc.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">{doc.slug}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{DOC_TYPES.find(t => t.value === doc.doc_type)?.label ?? doc.doc_type}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(doc.target_roles ?? []).map(r => <Badge key={r} variant="outline" className="text-xs">{r}</Badge>)}
                      {(!doc.target_roles || doc.target_roles.length === 0) && <span className="text-xs text-muted-foreground">all</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{doc.current_version ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={doc.status} /></TableCell>
                  <TableCell className="text-sm">{doc.acceptance_count ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmt(doc.published_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedDoc(doc)} title="View versions" data-testid={`button-view-doc-${doc.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDoc(doc)} title="Edit" data-testid={`button-edit-doc-${doc.id}`}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {doc.status !== "archived" && (
                        <Button size="sm" variant="ghost" onClick={() => archiveMut.mutate(doc.id)} title="Archive" data-testid={`button-archive-doc-${doc.id}`}>
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
            <DialogTitle>Create Legal Document</DialogTitle>
            <DialogDescription>Define the document registry entry. Actual content is added via versions.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(d => createMut.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Slug <span className="text-destructive">*</span></Label>
                <Input {...form.register("slug")} placeholder="platform_terms" data-testid="input-doc-slug" />
                {form.formState.errors.slug && <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Document Type <span className="text-destructive">*</span></Label>
                <Select defaultValue="platform_terms" onValueChange={v => form.setValue("docType", v)}>
                  <SelectTrigger data-testid="select-doc-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input {...form.register("title")} placeholder="Platform Terms of Service" data-testid="input-doc-title" />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea {...form.register("description")} rows={2} placeholder="Brief summary of this document's purpose" data-testid="textarea-doc-description" />
            </div>
            <div className="space-y-1">
              <Label>Target Roles <span className="text-xs text-muted-foreground">(leave empty = all roles)</span></Label>
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
                Required acceptance
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.watch("requiresReacceptance")} onCheckedChange={v => form.setValue("requiresReacceptance", v)} data-testid="switch-requires-reacceptance" />
                Requires re-acceptance on update
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending} data-testid="button-submit-create-doc">
                {createMut.isPending ? "Creating…" : "Create Document"}
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
      toast({ title: "Document updated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const watchedRoles = form.watch("targetRoles") ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Document — {doc.slug}</DialogTitle>
          <DialogDescription>Update document metadata. Content is managed via versions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(d => updateMut.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input {...form.register("title")} data-testid="input-edit-title" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea {...form.register("description")} rows={2} data-testid="textarea-edit-description" />
          </div>
          <div className="space-y-1">
            <Label>Document Type</Label>
            <Select defaultValue={doc.doc_type} onValueChange={v => form.setValue("docType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Target Roles</Label>
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
              Re-acceptance on update
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateMut.isPending}>{updateMut.isPending ? "Saving…" : "Save Changes"}</Button>
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
      toast({ title: "Version created" });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents", doc.id, "versions"] });
      setShowNewVersion(false);
      vForm.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const publishMut = useMutation({
    mutationFn: ({ versionId, requiresReacceptance }: { versionId: string; requiresReacceptance: boolean }) =>
      apiRequest("POST", `/api/admin/legal/documents/${doc.id}/versions/${versionId}/publish`, { requiresReacceptance }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Version published" });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/legal/documents", doc.id, "versions"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archiveVersionMut = useMutation({
    mutationFn: (versionId: string) =>
      apiRequest("POST", `/api/admin/legal/documents/${doc.id}/versions/${versionId}/archive`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Version archived" });
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
            <h4 className="text-sm font-semibold">Version History</h4>
            {doc.status !== "archived" && (
              <Button size="sm" onClick={() => setShowNewVersion(true)} data-testid="button-new-version">
                <Plus className="h-3.5 w-3.5 mr-1" /> New Version
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No versions yet. Create the first version to add content.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map(ver => (
                <div key={ver.id} className="border rounded-lg p-4 space-y-2" data-testid={`version-card-${ver.id}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm">v{ver.version}</span>
                      <StatusBadge status={ver.status} />
                      {ver.status === "published" && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs">Current</Badge>}
                    </div>
                    <div className="flex gap-2">
                      {ver.status === "draft" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditingVersion(ver)} data-testid={`button-edit-version-${ver.id}`}>
                            <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button size="sm" onClick={() => publishMut.mutate({ versionId: ver.id, requiresReacceptance: doc.requires_reacceptance })} disabled={publishMut.isPending} data-testid={`button-publish-version-${ver.id}`}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Publish
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
                    {ver.effective_date && <span><Clock className="h-3 w-3 inline mr-1" />Effective: {fmt(ver.effective_date)}</span>}
                    {ver.published_at && <span><CheckCircle className="h-3 w-3 inline mr-1" />Published: {fmt(ver.published_at)}{ver.published_by_name && ` by ${ver.published_by_name}`}</span>}
                    <span><Users className="h-3 w-3 inline mr-1" />{ver.acceptance_count ?? 0} acceptances</span>
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
              <h5 className="text-sm font-semibold">New Version</h5>
              <form onSubmit={vForm.handleSubmit(d => createVersionMut.mutate(d))} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Version number <span className="text-destructive">*</span></Label>
                    <Input {...vForm.register("version")} placeholder="1.0.0" data-testid="input-version-number" />
                    {vForm.formState.errors.version && <p className="text-xs text-destructive">{vForm.formState.errors.version.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Effective date</Label>
                    <Input type="date" {...vForm.register("effectiveDate")} data-testid="input-version-effective-date" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Changelog (what changed in this version)</Label>
                  <Input {...vForm.register("changelog")} placeholder="Initial version" data-testid="input-version-changelog" />
                </div>
                <div className="space-y-1">
                  <Label>Content (Markdown)</Label>
                  <Textarea {...vForm.register("content")} rows={8} placeholder="# Platform Terms of Service&#10;&#10;Placeholder content — legal team will provide final text." className="font-mono text-xs" data-testid="textarea-version-content" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowNewVersion(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={createVersionMut.isPending} data-testid="button-submit-version">
                    {createVersionMut.isPending ? "Saving…" : "Save Draft"}
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
          <Input placeholder="Search by name or email…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-acceptance-search" />
        </div>
        <Select value={docId} onValueChange={setDocId}>
          <SelectTrigger className="w-52" data-testid="select-acceptance-doc">
            <SelectValue placeholder="All documents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All documents</SelectItem>
            {docs.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-40" data-testid="select-acceptance-source">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="registration">Registration</SelectItem>
            <SelectItem value="booking">Booking</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="admin_prompted">Admin prompted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">{result?.total ?? 0} total acceptance records</div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Accepted At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acceptances.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No acceptance records found</TableCell></TableRow>
              )}
              {acceptances.map(a => (
                <TableRow key={a.id} data-testid={`row-acceptance-${a.id}`}>
                  <TableCell>
                    <div className="text-sm font-medium">{a.first_name} {a.last_name}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{a.document_title ?? "—"}</TableCell>
                  <TableCell className="text-sm font-mono">v{a.version_number}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{a.role_snapshot}</Badge></TableCell>
                  <TableCell className="text-xs">{a.source}</TableCell>
                  <TableCell className="text-xs font-mono">{a.ip_address ?? "—"}</TableCell>
                  <TableCell className="text-xs">{new Date(a.accepted_at).toLocaleString("en-GB")}</TableCell>
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
  const { data: pending = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/legal/pending-reacceptances"],
    queryFn: () => apiRequest("GET", "/api/admin/legal/pending-reacceptances").then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-300">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-semibold">About Re-Acceptance</span>
        </div>
        When a document with <strong>Requires Re-Acceptance</strong> is updated and published, all affected users must accept the new version before they can continue using the platform. This table shows how many users are pending per document.
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : pending.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-70" />
          <p className="text-sm font-medium">All users are up to date</p>
          <p className="text-xs mt-1">No pending re-acceptances required</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Current Version</TableHead>
                <TableHead>Users Pending</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((item: any) => (
                <TableRow key={item.document_id} data-testid={`row-pending-${item.document_id}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{item.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.slug}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">v{item.current_version}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{item.users_pending}</span>
                    </div>
                  </TableCell>
                  <TableCell><span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded">Re-acceptance required</span></TableCell>
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
            <div className="text-xs text-muted-foreground">Published documents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{draft}</div>
            <div className="text-xs text-muted-foreground">Draft documents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-muted-foreground">{DOC_TYPES.length - docs.length}</div>
            <div className="text-xs text-muted-foreground">Not yet created</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document Type</TableHead>
              <TableHead>Registry Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Acceptances</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byType.map(({ value, label, doc }) => (
              <TableRow key={value} data-testid={`row-inventory-${value}`}>
                <TableCell className="text-sm font-medium">{label}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{doc?.slug ?? "—"}</TableCell>
                <TableCell>
                  {doc ? <StatusBadge status={doc.status} /> : <span className="text-xs text-muted-foreground italic">Not created</span>}
                </TableCell>
                <TableCell>{doc ? (doc.is_required ? <Badge variant="default" className="text-xs">Required</Badge> : <span className="text-xs text-muted-foreground">Optional</span>) : "—"}</TableCell>
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">Legal & Compliance</h2>
          <p className="text-sm text-muted-foreground">Version-controlled legal documents, consent tracking, and acceptance auditing</p>
        </div>
      </div>

      <Tabs defaultValue="registry" className="w-full">
        <TabsList className="tabs-colorful tabs-warm grid w-full grid-cols-4">
          <TabsTrigger value="registry" data-testid="tab-registry">
            <FileText className="h-4 w-4 mr-2" /> Document Registry
          </TabsTrigger>
          <TabsTrigger value="acceptances" data-testid="tab-acceptances">
            <CheckCircle className="h-4 w-4 mr-2" /> Acceptance Audit
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            <AlertTriangle className="h-4 w-4 mr-2" /> Re-Acceptances
          </TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            <BookOpen className="h-4 w-4 mr-2" /> Inventory
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
