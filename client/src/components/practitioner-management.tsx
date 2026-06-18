import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarMD } from "@/components/ui/provider-image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  UserCog,
  Link2,
  CalendarDays,
  ShieldCheck,
  BarChart2,
} from "lucide-react";
import { WeeklyScheduleGrid } from "@/components/weekly-schedule-grid";
import type { WeeklySchedule } from "@/components/weekly-schedule-grid";
import type { Practitioner, Service } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServicePractitionerEntry {
  id: string;
  serviceId: string;
  practitionerId: string;
  fee: string;
  isActive: boolean;
  service?: { id: string; name: string; price: string };
}

interface PractitionerWithAssignments extends Practitioner {
  assignments?: ServicePractitionerEntry[];
}

interface PractitionerFormData {
  name: string;
  title: string;
  specialization: string;
  yearsExperience: number;
  bio: string;
  languages: string;
}

const emptyForm = (): PractitionerFormData => ({
  name: "",
  title: "",
  specialization: "",
  yearsExperience: 0,
  bio: "",
  languages: "",
});

function practitionerToForm(p: Practitioner): PractitionerFormData {
  return {
    name: p.name,
    title: p.title ?? "",
    specialization: p.specialization ?? "",
    yearsExperience: (p as any).yearsExperience ?? 0,
    bio: p.bio ?? "",
    languages: (p.languages ?? []).join(", "),
  };
}

// ─── Practitioner Form Dialog ─────────────────────────────────────────────────

function PractitionerFormDialog({
  open,
  onOpenChange,
  initial,
  providerId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Practitioner | null;
  providerId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState<PractitionerFormData>(
    initial ? practitionerToForm(initial) : emptyForm()
  );

  const isEdit = !!initial;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        specialization: form.specialization.trim() || null,
        yearsExperience: Number(form.yearsExperience) || 0,
        bio: form.bio.trim() || null,
        languages: form.languages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        providerId,
      };
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/practitioners/${initial!.id}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/practitioners", payload);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({
        title: isEdit
          ? t("practitioner.updated", "Practitioner updated")
          : t("practitioner.added", "Practitioner added"),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/providers/${providerId}/practitioners`] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/practitioners"] });
      onSaved();
      onOpenChange(false);
    },
    onError: () =>
      toast({
        title: t("practitioner.failed_save", "Failed to save"),
        variant: "destructive",
      }),
  });

  const f = (field: keyof PractitionerFormData, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-practitioner-form">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("practitioner.edit_title", "Edit practitioner")
              : t("practitioner.add_title", "Add practitioner")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">{t("practitioner.name", "Name")} *</Label>
              <Input
                id="pf-name"
                value={form.name}
                onChange={(e) => f("name", e.target.value)}
                placeholder="Dr. Kovács Béla"
                data-testid="input-practitioner-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-title">{t("practitioner.title", "Title / Degree")}</Label>
              <Input
                id="pf-title"
                value={form.title}
                onChange={(e) => f("title", e.target.value)}
                placeholder="MD, PhD, PT..."
                data-testid="input-practitioner-title"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-spec">{t("practitioner.specialization", "Specialization")}</Label>
              <Input
                id="pf-spec"
                value={form.specialization}
                onChange={(e) => f("specialization", e.target.value)}
                placeholder="Sports physiotherapy"
                data-testid="input-practitioner-spec"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-exp">{t("practitioner.experience", "Years of experience")}</Label>
              <Input
                id="pf-exp"
                type="number"
                min={0}
                max={60}
                value={form.yearsExperience}
                onChange={(e) => f("yearsExperience", e.target.value)}
                data-testid="input-practitioner-experience"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-langs">{t("practitioner.languages", "Languages (comma-separated)")}</Label>
            <Input
              id="pf-langs"
              value={form.languages}
              onChange={(e) => f("languages", e.target.value)}
              placeholder="Hungarian, English"
              data-testid="input-practitioner-languages"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-bio">{t("practitioner.bio", "Short bio")}</Label>
            <Textarea
              id="pf-bio"
              rows={3}
              value={form.bio}
              onChange={(e) => f("bio", e.target.value)}
              placeholder={t("practitioner.bio_placeholder", "A few sentences about this practitioner...")}
              data-testid="input-practitioner-bio"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
            data-testid="button-save-practitioner"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? t("common.save_changes", "Save changes") : t("practitioner.add_btn", "Add practitioner")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Practitioner Schedule Dialog ─────────────────────────────────────────────

function PractitionerScheduleDialog({
  open,
  onOpenChange,
  practitioner,
  providerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  practitioner: Practitioner;
  providerId: string;
}) {
  const { toast } = useToast();

  const { data: scheduleData, isLoading: loadingSchedule } = useQuery<{ schedule: any }>({
    queryKey: [`/api/practitioners/${practitioner.id}/schedule`],
    enabled: open,
    queryFn: () => fetch(`/api/practitioners/${practitioner.id}/schedule`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: utilData } = useQuery<{ utilization: any[] }>({
    queryKey: [`/api/providers/${providerId}/practitioner-utilization`, practitioner.id],
    enabled: open,
    queryFn: () =>
      fetch(`/api/providers/${providerId}/practitioner-utilization?practitionerId=${practitioner.id}`, { credentials: "include" })
        .then(r => r.json()),
  });

  const saveMut = useMutation({
    mutationFn: (schedule: WeeklySchedule) =>
      apiRequest("PUT", `/api/practitioners/${practitioner.id}/schedule`, { schedule }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/practitioners/${practitioner.id}/schedule`] });
      toast({ title: "Schedule saved" });
    },
    onError: () => toast({ title: "Failed to save schedule", variant: "destructive" }),
  });

  const displayName = practitioner.name ?? "";
  const totalAppts = (utilData?.utilization ?? []).reduce((sum: number, u: any) => sum + (u.appointmentCount ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid={`dialog-schedule-${practitioner.id}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Schedule — {displayName}
          </DialogTitle>
        </DialogHeader>

        {/* Utilization summary */}
        {utilData && (utilData.utilization ?? []).length > 0 && (
          <div className="rounded-xl bg-muted/50 border p-3 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" />
              Upcoming bookings
            </p>
            <div className="flex flex-wrap gap-3">
              {(utilData.utilization ?? []).slice(0, 7).map((u: any) => (
                <div key={u.date} className="text-xs text-center min-w-[52px]" data-testid={`util-day-${u.date}`}>
                  <p className="font-medium">{new Date(u.date + "T12:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</p>
                  <p className="text-muted-foreground">{u.appointmentCount} appt{u.appointmentCount !== 1 ? "s" : ""}</p>
                </div>
              ))}
              <div className="text-xs text-center min-w-[52px] ml-auto self-center">
                <p className="font-semibold text-primary">{totalAppts}</p>
                <p className="text-muted-foreground">total</p>
              </div>
            </div>
          </div>
        )}

        {loadingSchedule ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <WeeklyScheduleGrid
            schedule={scheduleData?.schedule}
            isPendingSave={saveMut.isPending}
            isPendingPublish={false}
            onSave={(sched) => saveMut.mutate(sched)}
            onPublish={() => {}}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Service Assignment Row ───────────────────────────────────────────────────

function AssignmentRow({
  assignment,
  onRemove,
  onToggle,
  onFeeChange,
}: {
  assignment: ServicePractitionerEntry;
  onRemove: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onFeeChange: (id: string, fee: string) => void;
}) {
  const { format: fmtMoney } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(assignment.fee);

  return (
    <div
      className="flex items-center gap-2 text-sm p-2 rounded-lg border bg-background"
      data-testid={`row-assignment-${assignment.id}`}
    >
      <span className="flex-1 font-medium truncate">{assignment.service?.name ?? assignment.serviceId}</span>

      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step="0.01"
            className="h-7 w-24 text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            data-testid={`input-assignment-fee-${assignment.id}`}
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => { onFeeChange(assignment.id, draft); setEditing(false); }}
          >
            OK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => { setDraft(assignment.fee); setEditing(false); }}
          >
            ✕
          </Button>
        </div>
      ) : (
        <button
          className="text-primary hover:underline text-xs font-mono cursor-pointer"
          onClick={() => setEditing(true)}
          title="Click to edit fee"
          data-testid={`button-edit-fee-${assignment.id}`}
        >
          {fmtMoney(assignment.fee)}
        </button>
      )}

      <Switch
        checked={assignment.isActive}
        onCheckedChange={(v) => onToggle(assignment.id, v)}
        className="scale-75"
        data-testid={`switch-assignment-active-${assignment.id}`}
      />

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={() => onRemove(assignment.id)}
        data-testid={`button-remove-assignment-${assignment.id}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── Practitioner Card ────────────────────────────────────────────────────────

function PractitionerCard({
  practitioner,
  providerId,
  services,
  onEdit,
  onDelete,
}: {
  practitioner: Practitioner;
  providerId: string;
  services: Service[];
  onEdit: (p: Practitioner) => void;
  onDelete: (p: Practitioner) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();
  const [expanded, setExpanded] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [addingService, setAddingService] = useState(false);
  const [addForm, setAddForm] = useState({ serviceId: "", fee: "" });

  const { data: assignments, isLoading: loadingAssign } = useQuery<ServicePractitionerEntry[]>({
    queryKey: [`/api/practitioners/${practitioner.id}/services`],
    enabled: expanded,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/service-practitioners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/practitioners/${practitioner.id}/services`] });
      queryClient.invalidateQueries({ queryKey: [/api\/services\/.*\/practitioners/] });
      toast({ title: t("practitioner.assignment_removed", "Assignment removed") });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/service-practitioners/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/practitioners/${practitioner.id}/services`] });
      queryClient.invalidateQueries({ queryKey: [/api\/services\/.*\/practitioners/] });
    },
  });

  const feeUpdateMutation = useMutation({
    mutationFn: ({ id, fee }: { id: string; fee: string }) =>
      apiRequest("PATCH", `/api/service-practitioners/${id}`, { fee }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/practitioners/${practitioner.id}/services`] });
      queryClient.invalidateQueries({ queryKey: [/api\/services\/.*\/practitioners/] });
      toast({ title: t("practitioner.fee_updated", "Fee updated") });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ serviceId, fee }: { serviceId: string; fee: string }) =>
      apiRequest("POST", "/api/service-practitioners", {
        serviceId,
        practitionerId: practitioner.id,
        fee,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/practitioners/${practitioner.id}/services`] });
      queryClient.invalidateQueries({ queryKey: [/api\/services\/.*\/practitioners/] });
      toast({ title: t("practitioner.assigned", "Assigned to service") });
      setAddingService(false);
      setAddForm({ serviceId: "", fee: "" });
    },
    onError: () =>
      toast({
        title: t("practitioner.assign_failed", "Failed to assign"),
        variant: "destructive",
      }),
  });

  const initials = practitioner.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const yrsExp = (practitioner as any).yearsExperience;
  const langs = practitioner.languages ?? [];

  const assignedServiceIds = new Set((assignments ?? []).map((a) => a.serviceId));
  const unassignedServices = services.filter((s) => !assignedServiceIds.has(s.id));

  return (
    <div className="rounded-xl border bg-card shadow-sm" data-testid={`card-practitioner-${practitioner.id}`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <AvatarMD
          src={null}
          name={practitioner.name}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm" data-testid={`text-practitioner-name-${practitioner.id}`}>
              {practitioner.name}
            </p>
            {practitioner.title && (
              <Badge variant="secondary" className="text-xs h-5">
                {practitioner.title}
              </Badge>
            )}
            {(() => {
              const status = (practitioner as any).status ?? "pending";
              if (status === "approved") return <Badge className="text-xs h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 hover:bg-emerald-100" data-testid={`badge-practitioner-status-${practitioner.id}`}>Approved</Badge>;
              if (status === "rejected") return <Badge className="text-xs h-5 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 hover:bg-rose-100" data-testid={`badge-practitioner-status-${practitioner.id}`}>Rejected</Badge>;
              return <Badge className="text-xs h-5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 hover:bg-amber-100" data-testid={`badge-practitioner-status-${practitioner.id}`}>Pending Approval</Badge>;
            })()}
          </div>
          {practitioner.specialization && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Stethoscope className="h-3 w-3" />
              {practitioner.specialization}
              {yrsExp > 0 && <span>· {yrsExp} yr{yrsExp !== 1 ? "s" : ""}</span>}
            </p>
          )}
          {langs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{langs.join(", ")}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onEdit(practitioner)}
            data-testid={`button-edit-practitioner-${practitioner.id}`}
            title="Edit practitioner"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(practitioner)}
            data-testid={`button-delete-practitioner-${practitioner.id}`}
            title="Delete practitioner"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs rounded-lg"
            onClick={() => setScheduleOpen(true)}
            data-testid={`button-schedule-${practitioner.id}`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Schedule
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs"
            onClick={() => setExpanded((v) => !v)}
            data-testid={`button-expand-practitioner-${practitioner.id}`}
          >
            <Link2 className="h-3.5 w-3.5" />
            {t("practitioner.services", "Services")}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {practitioner.bio && (
        <p className="text-xs text-muted-foreground px-4 pb-3 -mt-1 line-clamp-2">{practitioner.bio}</p>
      )}

      {/* Schedule dialog (portal) */}
      <PractitionerScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        practitioner={practitioner}
        providerId={providerId}
      />

      {/* Service assignments section */}
      {expanded && (
        <div className="border-t bg-muted/20 rounded-b-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t("practitioner.assigned_services", "Assigned services")}
          </p>

          {loadingAssign && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingAssign && assignments?.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-2">
              {t("practitioner.no_services", "No services assigned yet.")}
            </p>
          )}

          {!loadingAssign &&
            assignments?.map((a) => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                onRemove={(id) => removeMutation.mutate(id)}
                onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
                onFeeChange={(id, fee) => feeUpdateMutation.mutate({ id, fee })}
              />
            ))}

          {/* Add service to practitioner */}
          {!addingService ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 rounded-lg"
              disabled={unassignedServices.length === 0}
              onClick={() => setAddingService(true)}
              data-testid={`button-add-service-to-${practitioner.id}`}
            >
              <Plus className="h-3 w-3" />
              {unassignedServices.length === 0
                ? t("practitioner.all_assigned", "All services assigned")
                : t("practitioner.add_service", "Add service")}
            </Button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={addForm.serviceId}
                onValueChange={(v) => {
                  const svc = services.find((s) => s.id === v);
                  setAddForm({ serviceId: v, fee: svc ? String(svc.price) : "" });
                }}
              >
                <SelectTrigger className="h-8 text-xs w-40" data-testid="select-service-for-practitioner">
                  <SelectValue placeholder={t("practitioner.select_service", "Service")} />
                </SelectTrigger>
                <SelectContent>
                  {unassignedServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.01"
                className="h-8 w-24 text-xs"
                value={addForm.fee}
                onChange={(e) => setAddForm({ ...addForm, fee: e.target.value })}
                placeholder={t("practitioner.fee_placeholder", "Fee")}
                data-testid="input-assignment-new-fee"
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!addForm.serviceId || !addForm.fee || assignMutation.isPending}
                onClick={() => assignMutation.mutate(addForm)}
                data-testid="button-confirm-assign-service"
              >
                {assignMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  t("practitioner.assign_btn", "Assign")
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setAddingService(false); setAddForm({ serviceId: "", fee: "" }); }}
              >
                {t("common.cancel", "Cancel")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Practitioner Management Card ───────────────────────────────────────

export function PractitionerManagementCard({
  providerId,
  services,
}: {
  providerId: string;
  services: Service[];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Practitioner | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Practitioner | null>(null);

  const { data: practitioners, isLoading } = useQuery<Practitioner[]>({
    queryKey: [`/api/providers/${providerId}/practitioners`],
    enabled: !!providerId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/practitioners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/providers/${providerId}/practitioners`] });
      toast({ title: t("practitioner.deleted", "Practitioner deleted") });
      setDeleteTarget(null);
    },
    onError: () =>
      toast({ title: t("practitioner.delete_failed", "Failed to delete"), variant: "destructive" }),
  });

  return (
    <>
      <Card data-testid="card-practitioner-management">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              {t("practitioner.team_title", "Team members")}
            </CardTitle>
            <CardDescription>
              {t(
                "practitioner.team_desc",
                "Add practitioners to your practice and assign them to services with custom fees."
              )}
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="gap-1 rounded-xl"
            onClick={() => setAddOpen(true)}
            data-testid="button-add-practitioner"
          >
            <Plus className="h-4 w-4" />
            {t("practitioner.add_btn_short", "Add")}
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && practitioners?.length === 0 && (
            <div className="text-center py-8 space-y-2" data-testid="empty-practitioners">
              <UserCog className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                {t("practitioner.empty_desc", "No team members yet. Add your first practitioner.")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 rounded-xl"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4" />
                {t("practitioner.add_first", "Add practitioner")}
              </Button>
            </div>
          )}

          {practitioners?.map((p) => (
            <PractitionerCard
              key={p.id}
              practitioner={p}
              providerId={providerId}
              services={services}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}

          {practitioners && practitioners.length > 0 && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">
                {t(
                  "practitioner.pricing_hint",
                  "Clients see all assigned practitioners when booking. If a practitioner has a custom fee for a service, that fee overrides the service base price."
                )}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <PractitionerFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={null}
        providerId={providerId}
        onSaved={() => {}}
      />

      {/* Edit dialog */}
      {editTarget && (
        <PractitionerFormDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          initial={editTarget}
          providerId={providerId}
          onSaved={() => setEditTarget(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent data-testid="dialog-delete-practitioner">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("practitioner.delete_title", "Remove practitioner?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "practitioner.delete_desc",
                "This will permanently delete {{name}} and remove all their service assignments. Existing appointments are not affected.",
                { name: deleteTarget?.name }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-practitioner"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("practitioner.delete_btn", "Delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
