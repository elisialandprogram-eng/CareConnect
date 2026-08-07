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
import { Plus, Pencil, Trash2, Loader2, X, Stethoscope } from "lucide-react";
import { formatDate } from "@/lib/datetime";

interface Diagnosis {
  id: string;
  patient_id: string;
  provider_id: string;
  appointment_id?: string;
  code?: string;
  title: string;
  description?: string;
  category: "primary" | "secondary" | "chronic" | "resolved";
  status: "active" | "resolved" | "monitoring";
  diagnosed_at: string;
  resolved_at?: string;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  primary:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  secondary: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  chronic:   "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  resolved:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const STATUS_COLORS: Record<string, string> = {
  active:     "default",
  resolved:   "secondary",
  monitoring: "outline",
};

const EMPTY_FORM = {
  code: "", title: "", description: "",
  category: "primary" as Diagnosis["category"],
  status: "active" as Diagnosis["status"],
  diagnosedAt: new Date().toISOString().slice(0, 10),
};

export function DiagnosesPanel({
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const QK = ["/api/provider/patients", patientId, "diagnoses"];

  const { data: diagnoses, isLoading } = useQuery<Diagnosis[]>({
    queryKey: QK,
    queryFn: () => apiRequest("GET", `/api/provider/patients/${patientId}/diagnoses`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await apiRequest("POST", "/api/provider/diagnoses", {
        ...data,
        patientId,
        appointmentId,
        diagnosedAt: new Date(data.diagnosedAt).toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast({ title: t("clinical.diagnosis_saved", "Diagnosis saved") });
    },
    onError: () => toast({ title: t("clinical.diagnosis_failed", "Failed to save diagnosis"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof EMPTY_FORM> }) => {
      const res = await apiRequest("PATCH", `/api/provider/diagnoses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      setEditingId(null);
      toast({ title: t("clinical.diagnosis_updated", "Diagnosis updated") });
    },
    onError: () => toast({ title: t("clinical.diagnosis_update_failed", "Failed to update"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/diagnoses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast({ title: t("clinical.diagnosis_deleted", "Diagnosis deleted") });
    },
    onError: () => toast({ title: t("clinical.diagnosis_delete_failed", "Failed to delete"), variant: "destructive" }),
  });

  const canWrite = !appointmentStatus || ["in_progress", "completed"].includes(appointmentStatus);

  function startEdit(d: Diagnosis) {
    setForm({
      code: d.code ?? "",
      title: d.title,
      description: d.description ?? "",
      category: d.category,
      status: d.status,
      diagnosedAt: d.diagnosed_at ? new Date(d.diagnosed_at).toISOString().slice(0, 10) : "",
    });
    setEditingId(d.id);
    setShowForm(true);
  }

  return (
    <div className="space-y-4" data-testid="section-diagnoses">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => {
              if (showForm && !editingId) { setShowForm(false); }
              else { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }
            }}
            data-testid="button-toggle-diagnosis-form"
          >
            {showForm && !editingId
              ? <><X className="h-3 w-3 mr-1" />{t("common.cancel", "Cancel")}</>
              : <><Plus className="h-3 w-3 mr-1" />{t("clinical.new_diagnosis", "New diagnosis")}</>}
          </Button>
        </div>
      )}

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("clinical.icd_code", "ICD Code (optional)")}</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. M54.5"
                  data-testid="input-diagnosis-code"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("clinical.diagnosis_date", "Date")} *</Label>
                <Input
                  type="date"
                  value={form.diagnosedAt}
                  onChange={(e) => setForm((f) => ({ ...f, diagnosedAt: e.target.value }))}
                  data-testid="input-diagnosis-date"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("clinical.diagnosis_title", "Diagnosis")} *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t("clinical.diagnosis_placeholder", "e.g. Lumbar disc herniation")}
                  data-testid="input-diagnosis-title"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("clinical.diagnosis_category", "Category")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as Diagnosis["category"] }))}>
                  <SelectTrigger data-testid="select-diagnosis-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">{t("clinical.cat_primary", "Primary")}</SelectItem>
                    <SelectItem value="secondary">{t("clinical.cat_secondary", "Secondary")}</SelectItem>
                    <SelectItem value="chronic">{t("clinical.cat_chronic", "Chronic")}</SelectItem>
                    <SelectItem value="resolved">{t("clinical.cat_resolved", "Resolved")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("clinical.diagnosis_status", "Status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Diagnosis["status"] }))}>
                  <SelectTrigger data-testid="select-diagnosis-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("clinical.status_active", "Active")}</SelectItem>
                    <SelectItem value="monitoring">{t("clinical.status_monitoring", "Monitoring")}</SelectItem>
                    <SelectItem value="resolved">{t("clinical.status_resolved", "Resolved")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("clinical.diagnosis_description", "Notes (optional)")}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  data-testid="textarea-diagnosis-description"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!form.title.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  if (editingId) updateMutation.mutate({ id: editingId, data: form });
                  else createMutation.mutate(form);
                }}
                data-testid="button-submit-diagnosis"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {editingId ? t("common.save", "Save") : t("clinical.add_diagnosis", "Add diagnosis")}
              </Button>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setShowForm(false); setForm(EMPTY_FORM); }}>
                  {t("common.cancel", "Cancel")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : !diagnoses?.length ? (
        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-diagnoses">
          {t("clinical.no_diagnoses", "No diagnoses on record.")}
        </div>
      ) : (
        <div className="space-y-2">
          {diagnoses.map((d) => (
            <div key={d.id} className="rounded-lg border p-3" data-testid={`diagnosis-item-${d.id}`}>
              <div className="flex items-start gap-2">
                <Stethoscope className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium">{d.title}</p>
                    {d.code && <span className="text-xs text-muted-foreground font-mono">({d.code})</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[d.category] ?? ""}`}>
                      {d.category}
                    </span>
                    <Badge variant={STATUS_COLORS[d.status] as "default" | "secondary" | "outline"} className="text-[10px] py-0">
                      {d.status}
                    </Badge>
                  </div>
                  {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(d.diagnosed_at)}</p>
                </div>
                {canWrite && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(d)} data-testid={`button-edit-diagnosis-${d.id}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(d.id)}
                      data-testid={`button-delete-diagnosis-${d.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
