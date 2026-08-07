import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText, Plus, Pencil, History, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatDate } from "@/lib/datetime";

interface SoapNote {
  id: string;
  provider_id: string;
  patient_id: string;
  appointment_id?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface SoapNoteVersion {
  id: string;
  soap_note_id: string;
  version: number;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  edited_by: string;
  edited_at: string;
  editor_name?: string;
}

const EMPTY_FORM = { subjective: "", objective: "", assessment: "", plan: "" };

export function SoapNotesPanel({
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
  const [editing, setEditing] = useState<SoapNote | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyNote, setHistoryNote] = useState<string | null>(null);

  const QK = ["/api/provider/patients", patientId, "soap-notes"];

  const { data: notes, isLoading } = useQuery<SoapNote[]>({
    queryKey: QK,
    queryFn: () => apiRequest("GET", `/api/provider/patients/${patientId}/soap-notes`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const { data: versions } = useQuery<SoapNoteVersion[]>({
    queryKey: ["/api/provider/soap-notes", historyNote, "versions"],
    queryFn: () => apiRequest("GET", `/api/provider/soap-notes/${historyNote}/versions`).then((r) => r.json()),
    enabled: !!historyNote,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      if (editing) {
        const res = await apiRequest("PATCH", `/api/provider/soap-notes/${editing.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/provider/soap-notes", { ...data, patientId, appointmentId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      toast({ title: t("clinical.soap_saved", "SOAP note saved") });
    },
    onError: () => toast({ title: t("clinical.soap_failed", "Failed to save SOAP note"), variant: "destructive" }),
  });

  const canWrite = !appointmentStatus || ["in_progress", "completed"].includes(appointmentStatus);

  function startEdit(note: SoapNote) {
    setEditing(note);
    setForm({ subjective: note.subjective ?? "", objective: note.objective ?? "", assessment: note.assessment ?? "", plan: note.plan ?? "" });
    setShowForm(true);
  }

  const soapFields: Array<{ key: keyof typeof EMPTY_FORM; label: string; placeholder: string }> = [
    { key: "subjective",  label: t("clinical.soap_s", "Subjective"),  placeholder: t("clinical.soap_s_hint", "Patient's complaints, symptoms, history as reported...") },
    { key: "objective",   label: t("clinical.soap_o", "Objective"),   placeholder: t("clinical.soap_o_hint", "Examination findings, vitals, observations...") },
    { key: "assessment",  label: t("clinical.soap_a", "Assessment"),  placeholder: t("clinical.soap_a_hint", "Diagnosis, differential diagnoses, clinical impression...") },
    { key: "plan",        label: t("clinical.soap_p", "Plan"),        placeholder: t("clinical.soap_p_hint", "Treatment plan, medications, follow-up, referrals...") },
  ];

  return (
    <div className="space-y-4" data-testid="section-soap-notes">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => { if (showForm) { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); } else setShowForm(true); }}
            data-testid="button-toggle-soap-form"
          >
            {showForm ? t("common.cancel", "Cancel") : <><Plus className="h-3 w-3 mr-1" />{t("clinical.new_soap", "New SOAP note")}</>}
          </Button>
        </div>
      )}

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            {soapFields.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
                <Textarea
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  rows={3}
                  data-testid={`textarea-soap-${key}`}
                />
              </div>
            ))}
            <Button
              size="sm"
              disabled={saveMutation.isPending || (!form.subjective && !form.objective && !form.assessment && !form.plan)}
              onClick={() => saveMutation.mutate(form)}
              data-testid="button-save-soap"
            >
              {saveMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {editing ? t("clinical.update_soap", "Update note") : t("clinical.save_soap", "Save SOAP note")}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : !notes?.length ? (
        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-soap">
          {t("clinical.no_soap", "No SOAP notes yet.")}
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border p-3 space-y-2" data-testid={`soap-item-${note.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">{formatDate(note.updated_at)}</span>
                  {note.version > 1 && (
                    <Badge variant="outline" className="text-[10px] py-0">v{note.version}</Badge>
                  )}
                  {note.appointment_id && (
                    <Badge variant="secondary" className="text-[10px] py-0">{t("clinical.linked_appt", "Linked")}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(note)} data-testid={`button-edit-soap-${note.id}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  {note.version > 1 && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setHistoryNote(note.id === historyNote ? null : note.id)} data-testid={`button-history-soap-${note.id}`}>
                      <History className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpandedId(note.id === expandedId ? null : note.id)} data-testid={`button-expand-soap-${note.id}`}>
                    {expandedId === note.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              {expandedId === note.id && (
                <div className="space-y-2 pt-1">
                  {soapFields.map(({ key, label }) => {
                    const val = note[key as keyof SoapNote] as string | undefined;
                    if (!val) return null;
                    return (
                      <div key={key}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="text-sm whitespace-pre-wrap">{val}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {expandedId !== note.id && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {note.subjective || note.objective || note.assessment || note.plan || "—"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Version history dialog */}
      <Dialog open={!!historyNote} onOpenChange={(o) => { if (!o) setHistoryNote(null); }}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              {t("clinical.soap_history_title", "Edit History")}
            </DialogTitle>
          </DialogHeader>
          {!versions ? (
            <Skeleton className="h-20 rounded" />
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("clinical.no_history", "No previous versions.")}</p>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => (
                <div key={v.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">v{v.version}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(v.edited_at)} · {v.editor_name ?? "—"}</span>
                  </div>
                  <Separator />
                  {[
                    { key: "subjective", label: "S" }, { key: "objective", label: "O" },
                    { key: "assessment", label: "A" }, { key: "plan", label: "P" },
                  ].map(({ key, label }) => {
                    const val = v[key as keyof SoapNoteVersion] as string | undefined;
                    if (!val) return null;
                    return (
                      <div key={key}>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{label}: </span>
                        <span className="text-xs">{val}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
