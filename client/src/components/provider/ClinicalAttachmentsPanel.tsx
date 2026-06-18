import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, X, Trash2, ExternalLink, Paperclip, FileImage, FileText, FlaskConical } from "lucide-react";
import { formatDate } from "@/lib/datetime";

interface ClinicalAttachment {
  id: string;
  patient_id: string;
  provider_id?: string;
  appointment_id?: string;
  category: string;
  title: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  notes?: string;
  uploaded_by: string;
  uploaded_by_name?: string;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  lab_result:        <FlaskConical className="h-3.5 w-3.5" />,
  imaging:           <FileImage className="h-3.5 w-3.5" />,
  report:            <FileText className="h-3.5 w-3.5" />,
  prescription_scan: <FileText className="h-3.5 w-3.5" />,
  referral:          <FileText className="h-3.5 w-3.5" />,
  general:           <Paperclip className="h-3.5 w-3.5" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General", lab_result: "Lab Result", imaging: "Imaging",
  report: "Report", prescription_scan: "Prescription", referral: "Referral",
};

const EMPTY_FORM = {
  category: "general", title: "", fileUrl: "", fileType: "", notes: "",
};

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function ClinicalAttachmentsPanel({
  patientId,
  appointmentId,
  appointmentStatus,
}: {
  patientId: string;
  appointmentId?: string;
  appointmentStatus?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterCategory, setFilterCategory] = useState("all");

  const QK = ["/api/provider/patients", patientId, "attachments"];

  const { data: attachments, isLoading } = useQuery<ClinicalAttachment[]>({
    queryKey: QK,
    queryFn: () => apiRequest("GET", `/api/provider/patients/${patientId}/attachments`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await apiRequest("POST", "/api/provider/attachments", {
        ...data,
        patientId,
        appointmentId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast({ title: t("clinical.attachment_saved", "Attachment added") });
    },
    onError: () => toast({ title: t("clinical.attachment_failed", "Failed to add attachment"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/provider/attachments/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast({ title: t("clinical.attachment_deleted", "Attachment deleted") });
    },
    onError: () => toast({ title: t("clinical.attachment_delete_failed", "Failed to delete"), variant: "destructive" }),
  });

  const canWrite = !appointmentStatus || ["in_progress", "completed"].includes(appointmentStatus);

  const filtered = filterCategory === "all"
    ? (attachments ?? [])
    : (attachments ?? []).filter((a) => a.category === filterCategory);

  return (
    <div className="space-y-4" data-testid="section-attachments">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {["all", "lab_result", "imaging", "report", "general"].map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={filterCategory === cat ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFilterCategory(cat)}
              data-testid={`button-filter-attachment-${cat}`}
            >
              {cat === "all" ? "All" : CATEGORY_LABELS[cat] ?? cat}
            </Button>
          ))}
        </div>
        {canWrite && (
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => { setShowForm(!showForm); setForm(EMPTY_FORM); }}
            data-testid="button-toggle-attachment-form"
          >
            {showForm
              ? <><X className="h-3 w-3 mr-1" />{t("common.cancel", "Cancel")}</>
              : <><Plus className="h-3 w-3 mr-1" />{t("clinical.add_attachment", "Add attachment")}</>}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("clinical.attachment_category", "Category")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-attachment-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("clinical.attachment_title", "Title")} *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t("clinical.attachment_title_placeholder", "e.g. Blood panel results")}
                  data-testid="input-attachment-title"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("clinical.attachment_url", "File URL")} *</Label>
                <Input
                  value={form.fileUrl}
                  onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
                  placeholder="https://..."
                  data-testid="input-attachment-url"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("clinical.attachment_notes", "Notes (optional)")}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  data-testid="textarea-attachment-notes"
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={!form.title.trim() || !form.fileUrl.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
              data-testid="button-save-attachment"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t("clinical.save_attachment", "Save attachment")}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-attachments">
          {t("clinical.no_attachments", "No attachments on record.")}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((att) => (
            <div key={att.id} className="rounded-lg border p-3 flex items-start gap-2" data-testid={`attachment-item-${att.id}`}>
              <span className="text-muted-foreground mt-0.5 shrink-0">
                {CATEGORY_ICONS[att.category] ?? <Paperclip className="h-3.5 w-3.5" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium">{att.title}</p>
                  <Badge variant="outline" className="text-[10px] py-0">{CATEGORY_LABELS[att.category] ?? att.category}</Badge>
                  {att.file_size && <span className="text-xs text-muted-foreground">{formatBytes(att.file_size)}</span>}
                </div>
                {att.notes && <p className="text-xs text-muted-foreground mt-0.5">{att.notes}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{formatDate(att.created_at)}</span>
                  {att.uploaded_by_name && <span className="text-xs text-muted-foreground">· {att.uploaded_by_name}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm" variant="ghost" className="h-7 w-7 p-0"
                  onClick={() => window.open(att.file_url, "_blank")}
                  data-testid={`button-open-attachment-${att.id}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
                {canWrite && (
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(att.id)}
                    data-testid={`button-delete-attachment-${att.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
