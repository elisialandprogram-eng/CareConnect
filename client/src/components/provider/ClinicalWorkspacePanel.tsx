import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Plus, Pencil, Trash2, ClipboardList, Pill, History,
  CalendarDays, MessageSquare, CheckCircle2, AlertCircle, Loader2,
  User, Clock, ChevronRight, Stethoscope, FlaskConical, Syringe,
  ShieldAlert, BookOpen, X, AlertTriangle, Power, PowerOff,
  Download, Target, Paperclip,
} from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { SoapNotesPanel } from "./SoapNotesPanel";
import { DiagnosesPanel } from "./DiagnosesPanel";
import { TreatmentPlansPanel } from "./TreatmentPlansPanel";
import { ClinicalAttachmentsPanel } from "./ClinicalAttachmentsPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatientNote {
  id: string;
  provider_id: string;
  patient_id: string;
  appointment_id?: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface Prescription {
  id: string;
  appointment_id: string;
  patient_id: string;
  provider_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
  issued_at: string;
  expires_at?: string;
  is_active: boolean;
}

interface MedicalHistoryEntry {
  id: string;
  patient_id: string;
  provider_id?: string;
  type: "diagnosis" | "procedure" | "lab_result" | "vaccination" | "allergy";
  title: string;
  description?: string;
  date: string;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  type: "appointment" | "note" | "prescription" | "medical_history";
  date: string;
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

interface IntakeFieldOption {
  value: string;
  label: string;
}

interface IntakeField {
  id: string;
  label: string;
  type: "text" | "textarea" | "checkbox" | "radio" | "select";
  options?: string[] | IntakeFieldOption[];
}

function resolveIntakeLabel(value: string, options?: IntakeField["options"]): string {
  if (!options) return value;
  const match = options.find((o) => {
    if (typeof o === "string") return o === value;
    return o.value === value;
  });
  if (!match) return value;
  return typeof match === "string" ? match : match.label;
}

// ─── Intake Responses Panel (Section A) ──────────────────────────────────────

export function IntakeResponsesCard({ intakeResponses, intakeSchema }: {
  intakeResponses?: Record<string, unknown> | null;
  intakeSchema?: IntakeField[];
}) {
  const { t } = useTranslation();

  if (!intakeResponses || Object.keys(intakeResponses).length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-intake">
        {t("clinical.no_intake_responses", "No intake form responses for this appointment.")}
      </div>
    );
  }

  const entries = Object.entries(intakeResponses);

  return (
    <div className="space-y-3" data-testid="section-intake-responses">
      {entries.map(([key, value]) => {
        const field = intakeSchema?.find((f) => f.id === key);
        const label = field?.label ?? key.replace(/_/g, " ");
        const displayValue = Array.isArray(value)
          ? value.map((v) => resolveIntakeLabel(String(v), field?.options)).join(", ")
          : typeof value === "boolean"
          ? value ? t("common.yes", "Yes") : t("common.no", "No")
          : resolveIntakeLabel(String(value ?? ""), field?.options) || "—";
        return (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
            <span className="text-sm" data-testid={`intake-value-${key}`}>{displayValue || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Patient Notes Panel (Section C) ─────────────────────────────────────────

export function PatientNotesPanel({ patientId, appointmentId, onDirtyChange }: {
  patientId: string;
  appointmentId?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [filterByAppt, setFilterByAppt] = useState(false);

  const QK_NOTES = ["/api/provider/patient-notes", patientId];

  const { data: notes, isLoading } = useQuery<PatientNote[]>({
    queryKey: QK_NOTES,
    queryFn: () => apiRequest("GET", `/api/provider/patient-notes/${patientId}`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/provider/patient-notes", {
        patientId,
        content,
        appointmentId: appointmentId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK_NOTES });
      setNewContent("");
      onDirtyChange?.(false);
      toast({ title: t("clinical.note_saved", "Note saved") });
    },
    onError: () => toast({ title: t("clinical.note_save_failed", "Failed to save note"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await apiRequest("PATCH", `/api/provider/patient-notes/${id}`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK_NOTES });
      setEditingId(null);
      toast({ title: t("clinical.note_updated", "Note updated") });
    },
    onError: () => toast({ title: t("clinical.note_update_failed", "Failed to update note"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/patient-notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK_NOTES });
      toast({ title: t("clinical.note_deleted", "Note deleted") });
    },
    onError: () => toast({ title: t("clinical.note_delete_failed", "Failed to delete note"), variant: "destructive" }),
  });

  const displayedNotes = filterByAppt && appointmentId
    ? (notes ?? []).filter((n) => n.appointment_id === appointmentId)
    : (notes ?? []);

  return (
    <div className="space-y-4" data-testid="section-patient-notes">
      {/* New note form */}
      <div className="space-y-2">
        <Textarea
          value={newContent}
          onChange={(e) => { setNewContent(e.target.value); onDirtyChange?.(e.target.value.trim() !== ""); }}
          placeholder={t("clinical.note_placeholder", "Write a clinical note about this patient...")}
          rows={3}
          data-testid="textarea-new-note"
        />
        <div className="flex items-center justify-between gap-2">
          {appointmentId && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={filterByAppt}
                onCheckedChange={(v) => setFilterByAppt(!!v)}
                data-testid="checkbox-filter-appt"
              />
              {t("clinical.filter_this_appt", "Show only this appointment's notes")}
            </label>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={!newContent.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(newContent.trim())}
            data-testid="button-add-note"
          >
            {createMutation.isPending
              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              : <Plus className="h-3 w-3 mr-1" />}
            {t("clinical.add_note_btn", "Add note")}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : displayedNotes.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-notes">
          {t("clinical.no_notes", "No clinical notes yet.")}
        </div>
      ) : (
        <div className="space-y-3">
          {displayedNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border bg-muted/30 p-3 space-y-2"
              data-testid={`note-item-${note.id}`}
            >
              {editingId === note.id ? (
                <>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    data-testid={`textarea-edit-note-${note.id}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: note.id, content: editContent })}
                      data-testid={`button-save-edit-note-${note.id}`}
                    >
                      {updateMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {t("common.save", "Save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      data-testid={`button-cancel-edit-note-${note.id}`}
                    >
                      {t("common.cancel", "Cancel")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap" data-testid={`text-note-content-${note.id}`}>
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(note.created_at)}
                      {note.appointment_id && (
                        <span className="ml-2 inline-flex items-center gap-1 text-primary">
                          <CalendarDays className="h-3 w-3" />
                          {t("clinical.linked_appt", "Linked to appointment")}
                        </span>
                      )}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                        data-testid={`button-edit-note-${note.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(note.id)}
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Prescriptions Panel (Section D) ─────────────────────────────────────────

export function PrescriptionsPanel({ patientId, appointmentId, appointmentStatus }: {
  patientId: string;
  appointmentId: string;
  appointmentStatus: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    medicationName: "",
    dosage: "",
    frequency: "",
    duration: "",
    instructions: "",
  });

  const QK_RX = ["/api/provider/patients", patientId, "prescriptions"];

  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: QK_RX,
    queryFn: () =>
      apiRequest("GET", `/api/provider/patients/${patientId}/prescriptions`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const [allergyWarnings, setAllergyWarnings] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/provider/prescriptions", {
        ...data,
        patientId,
        appointmentId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: QK_RX });
      setShowForm(false);
      setForm({ medicationName: "", dosage: "", frequency: "", duration: "", instructions: "" });
      // Surface any allergy warnings from the server response
      const warnings: string[] = data?.allergyWarnings ?? [];
      setAllergyWarnings(warnings);
      if (warnings.length > 0) {
        toast({
          title: t("clinical.allergy_warning_title", "⚠ Allergy Warning"),
          description: warnings.join("; "),
          variant: "destructive",
        });
      } else {
        toast({ title: t("clinical.prescription_created", "Prescription created") });
      }
    },
    onError: (err: any) => toast({
      title: t("clinical.prescription_failed", "Failed to create prescription"),
      description: err?.message,
      variant: "destructive",
    }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/provider/prescriptions/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK_RX });
    },
    onError: () => toast({
      title: t("clinical.prescription_toggle_failed", "Failed to update prescription status"),
      variant: "destructive",
    }),
  });

  const canWrite = ["in_progress", "completed"].includes(appointmentStatus);

  return (
    <div className="space-y-4" data-testid="section-prescriptions">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => setShowForm(!showForm)}
            data-testid="button-toggle-rx-form"
          >
            {showForm ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            {showForm
              ? t("clinical.cancel_prescription", "Cancel")
              : t("clinical.new_prescription", "New prescription")}
          </Button>
        </div>
      )}

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>{t("clinical.medication_name", "Medication name")} *</Label>
                <Input
                  value={form.medicationName}
                  onChange={(e) => setForm((f) => ({ ...f, medicationName: e.target.value }))}
                  placeholder="e.g. Ibuprofen 400mg"
                  data-testid="input-rx-medication"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("clinical.dosage", "Dosage")} *</Label>
                <Input
                  value={form.dosage}
                  onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))}
                  placeholder="e.g. 400mg"
                  data-testid="input-rx-dosage"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("clinical.frequency", "Frequency")} *</Label>
                <Input
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                  placeholder="e.g. 3× daily"
                  data-testid="input-rx-frequency"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("clinical.duration", "Duration")} *</Label>
                <Input
                  value={form.duration}
                  onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                  placeholder="e.g. 5 days"
                  data-testid="input-rx-duration"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>{t("clinical.instructions", "Instructions (optional)")}</Label>
                <Textarea
                  value={form.instructions}
                  onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                  placeholder="e.g. Take with food"
                  rows={2}
                  data-testid="textarea-rx-instructions"
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={
                !form.medicationName.trim() ||
                !form.dosage.trim() ||
                !form.frequency.trim() ||
                !form.duration.trim() ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate(form)}
              data-testid="button-submit-rx"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t("clinical.save_prescription", "Save prescription")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Allergy warning banner — shown after prescription is created with warnings */}
      {allergyWarnings.length > 0 && (
        <div
          className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm text-amber-900 dark:text-amber-300"
          data-testid="banner-allergy-warning"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              {t("clinical.allergy_warning_title", "Allergy Warning")}
            </p>
            {allergyWarnings.map((w, i) => (
              <p key={i} className="text-xs mt-0.5">{w}</p>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 w-6 p-0 text-amber-700 hover:text-amber-900"
            onClick={() => setAllergyWarnings([])}
            data-testid="button-dismiss-allergy-warning"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : !prescriptions?.length ? (
        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-prescriptions">
          {t("clinical.no_prescriptions", "No prescriptions issued for this patient.")}
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="rounded-lg border p-3 space-y-1" data-testid={`rx-item-${rx.id}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm flex items-center gap-1.5 min-w-0">
                  <Pill className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{rx.medication_name}</span>
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant={rx.is_active ? "default" : "secondary"}
                    className="text-xs"
                    data-testid={`badge-rx-status-${rx.id}`}
                  >
                    {rx.is_active
                      ? t("clinical.active", "Active")
                      : t("clinical.inactive", "Inactive")}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => window.open(`/api/provider/prescriptions/${rx.id}/pdf`, "_blank")}
                    title={t("clinical.download_pdf", "Download PDF")}
                    data-testid={`button-rx-pdf-${rx.id}`}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: rx.id, isActive: !rx.is_active })}
                      data-testid={`button-rx-toggle-${rx.id}`}
                      title={rx.is_active
                        ? t("clinical.deactivate_rx", "Deactivate")
                        : t("clinical.activate_rx", "Reactivate")}
                    >
                      {toggleMutation.isPending
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : rx.is_active
                        ? <PowerOff className="h-3 w-3" />
                        : <Power className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {rx.dosage} · {rx.frequency} · {rx.duration}
              </p>
              {rx.instructions && (
                <p className="text-xs text-muted-foreground italic">{rx.instructions}</p>
              )}
              <p className="text-xs text-muted-foreground">{formatDate(rx.issued_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Medical History Panel (Section G) ───────────────────────────────────────

const HISTORY_TYPE_ICONS: Record<string, JSX.Element> = {
  diagnosis: <Stethoscope className="h-3.5 w-3.5" />,
  procedure: <ClipboardList className="h-3.5 w-3.5" />,
  lab_result: <FlaskConical className="h-3.5 w-3.5" />,
  vaccination: <Syringe className="h-3.5 w-3.5" />,
  allergy: <ShieldAlert className="h-3.5 w-3.5" />,
};

export function MedicalHistoryPanel({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "diagnosis" as MedicalHistoryEntry["type"],
    title: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const QK_HIST = ["/api/provider/patients", patientId, "medical-history"];

  const { data: history, isLoading } = useQuery<MedicalHistoryEntry[]>({
    queryKey: QK_HIST,
    queryFn: () =>
      apiRequest("GET", `/api/provider/patients/${patientId}/medical-history`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/provider/medical-history", {
        ...data,
        patientId,
        date: new Date(data.date).toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK_HIST });
      setShowForm(false);
      setForm({ type: "diagnosis", title: "", description: "", date: new Date().toISOString().slice(0, 10) });
      toast({ title: t("clinical.history_added", "Medical history entry added") });
    },
    onError: (err: any) => toast({
      title: t("clinical.history_failed", "Failed to add entry"),
      description: err?.message,
      variant: "destructive",
    }),
  });

  return (
    <div className="space-y-4" data-testid="section-medical-history">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant={showForm ? "secondary" : "default"}
          onClick={() => setShowForm(!showForm)}
          data-testid="button-toggle-history-form"
        >
          {showForm ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
          {showForm
            ? t("clinical.cancel_history", "Cancel")
            : t("clinical.add_history", "Add entry")}
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <Label>{t("clinical.history_type", "Type")} *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as MedicalHistoryEntry["type"] }))}
              >
                <SelectTrigger data-testid="select-history-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diagnosis">{t("clinical.type_diagnosis", "Diagnosis")}</SelectItem>
                  <SelectItem value="procedure">{t("clinical.type_procedure", "Procedure")}</SelectItem>
                  <SelectItem value="lab_result">{t("clinical.type_lab_result", "Lab Result")}</SelectItem>
                  <SelectItem value="vaccination">{t("clinical.type_vaccination", "Vaccination")}</SelectItem>
                  <SelectItem value="allergy">{t("clinical.type_allergy", "Allergy")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("clinical.history_title", "Title")} *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("clinical.history_title_placeholder", "e.g. Type 2 Diabetes")}
                data-testid="input-history-title"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("clinical.history_date", "Date")} *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                data-testid="input-history-date"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("clinical.history_description", "Description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("clinical.history_description_placeholder", "Additional details...")}
                rows={2}
                data-testid="textarea-history-description"
              />
            </div>
            <Button
              size="sm"
              disabled={!form.title.trim() || !form.date || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
              data-testid="button-submit-history"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t("clinical.save_history", "Save entry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : !history?.length ? (
        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-history">
          {t("clinical.no_history", "No medical history on record.")}
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3" data-testid={`history-item-${entry.id}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-muted-foreground">
                  {HISTORY_TYPE_ICONS[entry.type] ?? <BookOpen className="h-3.5 w-3.5" />}
                </span>
                <Badge variant="outline" className="text-xs capitalize">
                  {entry.type.replace("_", " ")}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">{formatDate(entry.date)}</span>
              </div>
              <p className="text-sm font-medium">{entry.title}</p>
              {entry.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Outcome Panel (Section E + B) ───────────────────────────────────────────

export function OutcomePanel({ appointmentId, appointmentStatus, patientId, initialOutcomeNote, initialFollowUpRecommended, initialReferralNeeded, initialFollowUpRecommendedAt, onDirtyChange }: {
  appointmentId: string;
  appointmentStatus: string;
  patientId: string;
  initialOutcomeNote?: string | null;
  initialFollowUpRecommended?: boolean;
  initialReferralNeeded?: boolean;
  initialFollowUpRecommendedAt?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [outcomeNote, setOutcomeNote] = useState(initialOutcomeNote ?? "");
  const [followUp, setFollowUp] = useState(initialFollowUpRecommended ?? false);
  const [referral, setReferral] = useState(initialReferralNeeded ?? false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpSent, setFollowUpSent] = useState(!!initialFollowUpRecommendedAt);
  const [followUpTime, setFollowUpTime] = useState(initialFollowUpRecommendedAt ?? null);

  const isCompleted = appointmentStatus === "completed";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/appointments/${appointmentId}/outcome`, {
        outcomeNote,
        followUpRecommended: followUp,
        referralNeeded: referral,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId] });
      toast({ title: t("clinical.outcome_saved", "Outcome saved") });
    },
    onError: () => toast({ title: t("clinical.outcome_failed", "Failed to save outcome"), variant: "destructive" }),
  });

  const followUpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/appointments/${appointmentId}/recommend-followup`, {
        note: followUpNote.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setFollowUpSent(true);
      setFollowUpTime(data.followUpRecommendedAt ?? new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: t("clinical.followup_sent", "Follow-up recommendation sent to patient") });
    },
    onError: () => toast({ title: t("clinical.followup_failed", "Failed to send follow-up"), variant: "destructive" }),
  });

  return (
    <div className="space-y-5" data-testid="section-outcome">
      {/* Outcome Note */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {t("clinical.outcome_note_label", "Session Outcome / Summary")}
        </Label>
        <Textarea
          value={outcomeNote}
          onChange={(e) => {
            setOutcomeNote(e.target.value);
            onDirtyChange?.(e.target.value !== (initialOutcomeNote ?? ""));
          }}
          placeholder={t("clinical.outcome_note_placeholder", "Summarise what was discussed, assessed, or treated...")}
          rows={4}
          disabled={!isCompleted}
          data-testid="textarea-outcome-note"
        />
        {!isCompleted && (
          <p className="text-xs text-muted-foreground" data-testid="text-outcome-disabled">
            {t("clinical.outcome_only_completed", "Outcome can only be recorded after the appointment is completed.")}
          </p>
        )}
      </div>

      {/* Flags */}
      <div className="space-y-2">
        <label className="flex items-start gap-2.5 cursor-pointer" data-testid="label-followup-recommended">
          <Checkbox
            checked={followUp}
            onCheckedChange={(v) => setFollowUp(!!v)}
            disabled={!isCompleted}
            data-testid="checkbox-followup-recommended"
          />
          <div>
            <p className="text-sm font-medium">{t("clinical.follow_up_recommended", "Follow-up appointment recommended")}</p>
            <p className="text-xs text-muted-foreground">{t("clinical.follow_up_recommended_desc", "Check this if the patient should return for another visit")}</p>
          </div>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer" data-testid="label-referral-needed">
          <Checkbox
            checked={referral}
            onCheckedChange={(v) => setReferral(!!v)}
            disabled={!isCompleted}
            data-testid="checkbox-referral-needed"
          />
          <div>
            <p className="text-sm font-medium">{t("clinical.referral_needed", "Referral to specialist needed")}</p>
            <p className="text-xs text-muted-foreground">{t("clinical.referral_needed_desc", "Check this if the patient needs a referral to another provider")}</p>
          </div>
        </label>
      </div>

      {isCompleted && (
        <Button
          size="sm"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          data-testid="button-save-outcome"
        >
          {saveMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {t("clinical.save_outcome_btn", "Save outcome")}
        </Button>
      )}

      <Separator />

      {/* Follow-up notification */}
      <div className="space-y-2">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-primary" />
          {t("clinical.send_followup_title", "Notify Patient — Book Follow-Up")}
        </p>
        {followUpSent ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-300" data-testid="banner-followup-sent">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {t("clinical.followup_already_sent", "Follow-up recommendation sent")}
              {followUpTime && ` · ${formatDate(followUpTime)}`}
            </span>
          </div>
        ) : (
          <>
            <Textarea
              value={followUpNote}
              onChange={(e) => setFollowUpNote(e.target.value)}
              placeholder={t("clinical.followup_note_placeholder", "Optional message to patient (e.g. 'Please book in 2 weeks for reassessment')")}
              rows={2}
              disabled={!isCompleted}
              data-testid="textarea-followup-note"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!isCompleted || followUpMutation.isPending}
              onClick={() => followUpMutation.mutate()}
              data-testid="button-send-followup"
            >
              {followUpMutation.isPending
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <CalendarDays className="h-3 w-3 mr-1" />}
              {t("clinical.send_followup_btn", "Send follow-up notification")}
            </Button>
            {!isCompleted && (
              <p className="text-xs text-muted-foreground">
                {t("clinical.followup_only_completed", "Available once the appointment is marked completed.")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Timeline Panel (Section F) ───────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  appointment: "bg-blue-500",
  note: "bg-amber-500",
  prescription: "bg-green-500",
  medical_history: "bg-purple-500",
};

const TYPE_ICONS: Record<string, JSX.Element> = {
  appointment: <CalendarDays className="h-3.5 w-3.5" />,
  note: <MessageSquare className="h-3.5 w-3.5" />,
  prescription: <Pill className="h-3.5 w-3.5" />,
  medical_history: <BookOpen className="h-3.5 w-3.5" />,
};

export function PatientTimelinePanel({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading, error } = useQuery<{
    patient: Record<string, unknown> | null;
    events: TimelineEvent[];
    stats: Record<string, number>;
  }>({
    queryKey: ["/api/provider/patients", patientId, "timeline"],
    queryFn: () =>
      apiRequest("GET", `/api/provider/patients/${patientId}/timeline`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const events = typeFilter === "all"
    ? (data?.events ?? [])
    : (data?.events ?? []).filter((e) => e.type === typeFilter);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6 flex flex-col items-center gap-2" data-testid="text-timeline-error">
        <AlertCircle className="h-5 w-5" />
        {t("clinical.timeline_error", "Could not load patient timeline.")}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-timeline">
      {/* Stats row */}
      {data.stats && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: t("clinical.stat_appts", "Appts"), value: data.stats.totalAppointments },
            { label: t("clinical.stat_notes", "Notes"), value: data.stats.totalNotes },
            { label: t("clinical.stat_rx", "Rx"), value: data.stats.totalPrescriptions },
            { label: t("clinical.stat_history", "History"), value: data.stats.totalMedicalHistory },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/50 p-2" data-testid={`stat-${s.label.toLowerCase()}`}>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-1 flex-wrap">
        {["all", "appointment", "note", "prescription", "medical_history"].map((type) => (
          <Button
            key={type}
            size="sm"
            variant={typeFilter === type ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setTypeFilter(type)}
            data-testid={`button-filter-${type}`}
          >
            {type === "all"
              ? t("clinical.filter_all", "All")
              : type === "appointment"
              ? t("clinical.filter_appointments", "Appointments")
              : type === "note"
              ? t("clinical.filter_notes", "Notes")
              : type === "prescription"
              ? t("clinical.filter_rx", "Prescriptions")
              : t("clinical.filter_history", "History")}
          </Button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-events">
          {t("clinical.no_timeline_events", "No events for this filter.")}
        </div>
      ) : (
        <ol className="relative border-l border-muted ml-3 space-y-4" data-testid="list-timeline">
          {events.map((ev) => (
            <li key={ev.id} className="ml-4" data-testid={`timeline-event-${ev.id}`}>
              <span className={`absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full ${TYPE_COLORS[ev.type] ?? "bg-muted-foreground"}`}>
                <span className="text-white scale-75">
                  {TYPE_ICONS[ev.type]}
                </span>
              </span>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{ev.title}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDate(ev.date)}</span>
                </div>
                {ev.summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.summary}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Full Clinical Workspace (Section H) ─────────────────────────────────────

interface ClinicalWorkspacePanelProps {
  open: boolean;
  onClose: () => void;
  appointment: {
    id: string;
    status: string;
    patientId: string;
    providerId?: string;
    date: string;
    startTime?: string | null;
    notes?: string | null;
    privateNote?: string | null;
    serviceId?: string | null;
    outcomeNote?: string | null;
    followUpRecommended?: boolean;
    referralNeeded?: boolean;
    followUpRecommendedAt?: string | null;
    intakeResponses?: Record<string, unknown> | null;
    appointmentNumber?: string | null;
    service?: { name?: string } | null;
    patient?: { firstName?: string; lastName?: string } | null;
  };
}

export function ClinicalWorkspacePanel({ open, onClose, appointment }: ClinicalWorkspacePanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("intake");
  const [isDirty, setIsDirty] = useState(false);

  const patientName = `${appointment.patient?.firstName ?? ""} ${appointment.patient?.lastName ?? ""}`.trim() || t("clinical.patient", "Patient");

  // ── Intake schema for label resolution (Section B) ──────────────────────────
  const { data: intakeSchemaData } = useQuery<{ schema: IntakeField[] }>({
    queryKey: ["/api/services", appointment.serviceId, "intake-schema"],
    queryFn: () =>
      apiRequest("GET", `/api/services/${appointment.serviceId}/intake-schema`).then((r) => r.json()),
    enabled: !!appointment.serviceId,
    staleTime: 60_000,
  });
  const intakeSchema = intakeSchemaData?.schema ?? [];

  // ── Notes count for tab badge (Section H) ────────────────────────────────────
  const { data: notesData } = useQuery<{ id: string }[]>({
    queryKey: ["/api/provider/patient-notes", appointment.patientId],
    queryFn: () =>
      apiRequest("GET", `/api/provider/patient-notes/${appointment.patientId}`).then((r) => r.json()),
    enabled: !!appointment.patientId,
    staleTime: 30_000,
  });
  const notesCount = notesData?.length ?? 0;

  // ── Unsaved-changes guard on close ───────────────────────────────────────────
  function handleClose() {
    if (isDirty && !window.confirm(t("clinical.unsaved_changes_prompt", "You have unsaved changes. Close anyway?"))) {
      return;
    }
    setIsDirty(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-clinical-workspace">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            {t("clinical.workspace_title", "Clinical Workspace")}
            <span className="text-muted-foreground font-normal text-sm">— {patientName}</span>
          </DialogTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{appointment.date}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{appointment.startTime}</span>
            {appointment.service?.name && <span>{appointment.service.name}</span>}
            {appointment.appointmentNumber && (
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">{appointment.appointmentNumber}</span>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="shrink-0 grid grid-cols-7 w-full" data-testid="tabs-clinical">
            <TabsTrigger value="intake" data-testid="tab-intake">
              <ClipboardList className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("clinical.tab_intake", "Intake")}</span>
            </TabsTrigger>
            <TabsTrigger value="soap" data-testid="tab-soap">
              <FileText className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("clinical.tab_soap", "SOAP")}</span>
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <MessageSquare className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("clinical.tab_notes", "Notes")}</span>
              {notesCount > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-px leading-none" data-testid="badge-notes-count">
                  {notesCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="outcome" data-testid="tab-outcome">
              <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("clinical.tab_outcome", "Outcome")}</span>
            </TabsTrigger>
            <TabsTrigger value="clinical" data-testid="tab-clinical">
              <Stethoscope className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("clinical.tab_clinical", "Clinical")}</span>
            </TabsTrigger>
            <TabsTrigger value="prescriptions" data-testid="tab-prescriptions">
              <Pill className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("clinical.tab_rx", "Rx")}</span>
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("clinical.tab_history", "History")}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-3">
            <TabsContent value="intake" className="mt-0 px-1">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    {t("clinical.intake_card_title", "Patient Intake Form Responses")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <IntakeResponsesCard
                    intakeResponses={appointment.intakeResponses}
                    intakeSchema={intakeSchema.length > 0 ? intakeSchema : undefined}
                  />
                </CardContent>
              </Card>
              {appointment.notes && (
                <Card className="mt-3">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm">{t("clinical.patient_booking_notes", "Booking notes from patient")}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground">{appointment.notes}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── SOAP Notes ─────────────────────────────────────── */}
            <TabsContent value="soap" className="mt-0 px-1">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    {t("clinical.soap_card_title", "SOAP Notes")}
                    <Badge variant="secondary" className="text-xs font-normal ml-1">
                      {t("clinical.provider_only", "Provider only")}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <SoapNotesPanel
                    patientId={appointment.patientId}
                    appointmentId={appointment.id}
                    appointmentStatus={appointment.status}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="mt-0 px-1">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    {t("clinical.running_notes_title", "Clinical Notes")}
                    <Badge variant="secondary" className="text-xs font-normal ml-1">
                      {t("clinical.provider_only", "Provider only")}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <PatientNotesPanel
                    patientId={appointment.patientId}
                    appointmentId={appointment.id}
                    onDirtyChange={setIsDirty}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="outcome" className="mt-0 px-1">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {t("clinical.outcome_card_title", "Appointment Outcome")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <OutcomePanel
                    appointmentId={appointment.id}
                    appointmentStatus={appointment.status}
                    patientId={appointment.patientId}
                    initialOutcomeNote={appointment.outcomeNote}
                    initialFollowUpRecommended={appointment.followUpRecommended}
                    initialReferralNeeded={appointment.referralNeeded}
                    initialFollowUpRecommendedAt={appointment.followUpRecommendedAt}
                    onDirtyChange={setIsDirty}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Clinical Records: Diagnoses + Treatment Plans ───── */}
            <TabsContent value="clinical" className="mt-0 px-1 space-y-3">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Stethoscope className="h-4 w-4 text-primary" />
                    {t("clinical.diagnoses_card_title", "Diagnoses")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <DiagnosesPanel
                    patientId={appointment.patientId}
                    appointmentId={appointment.id}
                    appointmentStatus={appointment.status}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-primary" />
                    {t("clinical.treatment_plans_card_title", "Treatment Plans")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <TreatmentPlansPanel
                    patientId={appointment.patientId}
                    appointmentId={appointment.id}
                    appointmentStatus={appointment.status}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Prescriptions + Medical History ─────────────────── */}
            <TabsContent value="prescriptions" className="mt-0 px-1 space-y-3">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Pill className="h-4 w-4 text-primary" />
                    {t("clinical.prescriptions_title", "Prescriptions")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <PrescriptionsPanel
                    patientId={appointment.patientId}
                    appointmentId={appointment.id}
                    appointmentStatus={appointment.status}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-primary" />
                    {t("clinical.history_card_title", "Medical History")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <MedicalHistoryPanel patientId={appointment.patientId} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── History: Timeline + Attachments ─────────────────── */}
            <TabsContent value="history" className="mt-0 px-1 space-y-3">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" />
                    {t("clinical.timeline_title", "Patient Timeline")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <PatientTimelinePanel patientId={appointment.patientId} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4 text-primary" />
                    {t("clinical.attachments_card_title", "Clinical Attachments")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ClinicalAttachmentsPanel
                    patientId={appointment.patientId}
                    appointmentId={appointment.id}
                    appointmentStatus={appointment.status}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="shrink-0 pt-2">
          <Button variant="ghost" onClick={handleClose} data-testid="button-close-clinical">
            {t("clinical.close_btn", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
