import { formatDate } from "@/lib/datetime";
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { QK } from "@/lib/query-keys";
import {
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  Search,
  Share2,
  ShieldOff,
  Loader2,
  FilePlus,
  FileCheck,
} from "lucide-react";

type PatientDoc = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  documentType: string;
  title: string;
  fileUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  visibility: string;
  sharedWithProviderIds: string[];
  countryCode: string;
  createdAt: string;
};

const DOC_TYPES = [
  { value: "all", label: "All types" },
  { value: "medical_report", label: "Medical Report" },
  { value: "test_result", label: "Test Result" },
  { value: "referral", label: "Referral" },
  { value: "prescription", label: "Prescription" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  medical_report: "bg-blue-100 text-blue-800",
  test_result: "bg-purple-100 text-purple-800",
  referral: "bg-amber-100 text-amber-800",
  prescription: "bg-green-100 text-green-800",
  insurance: "bg-orange-100 text-orange-800",
  other: "bg-muted text-foreground",
};

function typeLabel(t: string) {
  return DOC_TYPES.find(d => d.value === t)?.label ?? t;
}

function fileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MyDocumentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [shareDoc, setShareDoc] = useState<PatientDoc | null>(null);
  const [shareProviderId, setShareProviderId] = useState("");

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("other");
  const [uploading, setUploading] = useState(false);

  const { data: docs = [], isLoading } = useQuery<PatientDoc[]>({
    queryKey: QK.patientDocuments(typeFilter !== "all" ? typeFilter : undefined),
    queryFn: () => {
      const qs = typeFilter !== "all" ? `?type=${typeFilter}` : "";
      return fetch(`/api/patient/documents${qs}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/patient/documents/${id}`),
    onSuccess: () => {
      toast({ title: "Document deleted" });
      qc.invalidateQueries({ queryKey: QK.patientDocuments() });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const shareMutation = useMutation({
    mutationFn: ({ docId, providerId, shared }: { docId: string; providerId: string; shared: boolean }) =>
      apiRequest("PATCH", `/api/patient/documents/${docId}/share`, { providerId, shared }),
    onSuccess: () => {
      toast({ title: "Sharing updated" });
      qc.invalidateQueries({ queryKey: QK.patientDocuments() });
      setShareDoc(null);
      setShareProviderId("");
    },
    onError: () => toast({ title: "Failed to update sharing", variant: "destructive" }),
  });

  async function handleUpload() {
    if (!uploadFile) return;
    if (!uploadTitle.trim()) {
      toast({ title: "Please enter a document title", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("title", uploadTitle.trim());
      fd.append("documentType", uploadType);
      const res = await fetch("/api/patient/documents/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      toast({ title: "Document uploaded" });
      qc.invalidateQueries({ queryKey: QK.patientDocuments() });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle("");
      setUploadType("other");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const filtered = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <PageBreadcrumbs items={[{ label: "My Documents" }]} />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8 space-y-6">

        {/* Header row */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-my-documents">
              <FileText className="h-7 w-7 text-primary" />
              My Documents
            </h1>
            <p className="text-muted-foreground mt-1">
              Upload and manage your medical documents. Control which providers can see them.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)} data-testid="button-upload-document">
            <FilePlus className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-9"
              data-testid="input-document-search"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {DOC_TYPES.map(t => (
              <Button
                key={t.value}
                size="sm"
                variant={typeFilter === t.value ? "default" : "outline"}
                onClick={() => setTypeFilter(t.value)}
                className="h-8 text-xs px-2.5"
                data-testid={`button-filter-${t.value}`}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Document list */}
        <Card>
          <CardHeader>
            <CardTitle>
              {typeFilter === "all" ? "All Documents" : typeLabel(typeFilter)}
              {!isLoading && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filtered.length})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Click the share button to give a provider read-only access to a document.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-documents">
                <FileCheck className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No documents yet</p>
                <p className="text-sm mt-1">Upload your first medical document to get started.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map(doc => (
                  <div
                    key={doc.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-4"
                    data-testid={`row-document-${doc.id}`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate" data-testid={`text-doc-title-${doc.id}`}>
                          {doc.title}
                        </span>
                        <Badge className={`text-xs ${TYPE_COLORS[doc.documentType] || TYPE_COLORS.other}`}>
                          {typeLabel(doc.documentType)}
                        </Badge>
                        {doc.sharedWithProviderIds?.length > 0 && (
                          <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300">
                            <Share2 className="h-3 w-3 mr-1" />
                            Shared ({doc.sharedWithProviderIds.length})
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                        <span>Uploaded {formatDate(doc.createdAt)}</span>
                        {doc.mimeType && (
                          <span>{doc.mimeType.split("/")[1]?.toUpperCase()}</span>
                        )}
                        {doc.fileSizeBytes && <span>{fileSize(doc.fileSizeBytes)}</span>}
                        {doc.appointmentId && (
                          <span className="text-blue-600">Linked to appointment</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="h-8 px-2.5"
                        data-testid={`button-view-document-${doc.id}`}
                      >
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5"
                        onClick={() => { setShareDoc(doc); setShareProviderId(""); }}
                        data-testid={`button-share-document-${doc.id}`}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => setDeleteId(doc.id)}
                        data-testid={`button-delete-document-${doc.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={o => { if (!o && !uploading) { setUploadOpen(false); setUploadFile(null); setUploadTitle(""); setUploadType("other"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Supported formats: PDF, JPG, PNG, WebP. Maximum 10 MB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Document title</Label>
              <Input
                id="doc-title"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="e.g. Blood test results June 2026"
                data-testid="input-upload-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Document type</Label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger id="doc-type" data-testid="select-upload-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.filter(t => t.value !== "all").map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-file">File</Label>
              <input
                ref={fileRef}
                id="doc-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                data-testid="input-upload-file"
              />
              {uploadFile && (
                <p className="text-xs text-muted-foreground">{uploadFile.name} ({fileSize(uploadFile.size)})</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={uploading} onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              data-testid="button-confirm-upload"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" />Upload</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the file. Any providers you shared it with will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-document"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share dialog */}
      <Dialog open={!!shareDoc} onOpenChange={o => { if (!o) { setShareDoc(null); setShareProviderId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share Document</DialogTitle>
            <DialogDescription>
              Enter a provider ID to share "<strong>{shareDoc?.title}</strong>" with them. They'll get read-only access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {shareDoc && shareDoc.sharedWithProviderIds?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Currently shared with:</p>
                {shareDoc.sharedWithProviderIds.map(pid => (
                  <div key={pid} className="flex items-center justify-between text-sm bg-muted rounded px-3 py-1.5">
                    <span className="font-mono text-xs truncate">{pid}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-red-600 hover:bg-red-50"
                      onClick={() => shareMutation.mutate({ docId: shareDoc.id, providerId: pid, shared: false })}
                      disabled={shareMutation.isPending}
                      data-testid={`button-unshare-${pid}`}
                    >
                      <ShieldOff className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="share-provider-id">Provider ID to share with</Label>
              <Input
                id="share-provider-id"
                value={shareProviderId}
                onChange={e => setShareProviderId(e.target.value)}
                placeholder="Provider ID…"
                data-testid="input-share-provider-id"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShareDoc(null); setShareProviderId(""); }}>Cancel</Button>
            <Button
              onClick={() => shareDoc && shareProviderId && shareMutation.mutate({ docId: shareDoc.id, providerId: shareProviderId, shared: true })}
              disabled={!shareProviderId.trim() || shareMutation.isPending}
              data-testid="button-confirm-share"
            >
              {shareMutation.isPending ? "Sharing…" : "Share"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
