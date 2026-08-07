import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Bell,
  BellOff,
  Check,
  Clock,
  Pill,
  Pencil,
  Plus,
  Trash2,
  User2,
  Users,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FamilyMember, Medication, MedicationLog } from "@shared/schema";

type FormState = {
  name: string;
  dosage: string;
  frequency: string;
  timesOfDay: string[];
  startDate: string;
  endDate: string;
  instructions: string;
  familyMemberId: string;
  reminderEnabled: boolean;
  color: string;
};

const FREQUENCIES = [
  "once_daily",
  "twice_daily",
  "three_times_daily",
  "four_times_daily",
  "as_needed",
  "weekly",
];

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const emptyForm = (): FormState => ({
  name: "",
  dosage: "",
  frequency: "once_daily",
  timesOfDay: ["08:00"],
  startDate: "",
  endDate: "",
  instructions: "",
  familyMemberId: "",
  reminderEnabled: true,
  color: COLORS[0],
});

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActiveToday(m: Medication, today: string): boolean {
  if (!m.isActive) return false;
  if (m.startDate && today < m.startDate) return false;
  if (m.endDate && today > m.endDate) return false;
  return true;
}

export function MedicationsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterMemberId, setFilterMemberId] = useState<string>("all");
  const today = todayISO();

  const { data: medications, isLoading } = useQuery<Medication[]>({
    queryKey: ["/api/medications"],
  });

  const { data: familyMembers } = useQuery<FamilyMember[]>({
    queryKey: ["/api/family-members"],
  });

  const { data: todaysLogs } = useQuery<MedicationLog[]>({
    queryKey: ["/api/medication-logs", { from: today, to: today }],
    queryFn: async () => {
      const res = await fetch(
        `/api/medication-logs?from=${today}&to=${today}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/medications/${editingId}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/medications", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medications"] });
      toast({
        title: editingId
          ? t("medications.updated", "Medication updated")
          : t("medications.added", "Medication added"),
      });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: (err: any) => {
      toast({
        title: t("medications.save_failed", "Could not save medication"),
        description: err?.message || "",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/medications/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medication-logs"] });
      toast({ title: t("medications.removed", "Medication removed") });
      setConfirmDeleteId(null);
    },
    onError: (err: any) => {
      toast({
        title: t("medications.remove_failed", "Could not remove medication"),
        description: err?.message || "",
        variant: "destructive",
      });
    },
  });

  const logMutation = useMutation({
    mutationFn: async (payload: { medicationId: string; scheduledTime: string; status: string }) => {
      const res = await apiRequest("POST", "/api/medication-logs", {
        medicationId: payload.medicationId,
        scheduledDate: today,
        scheduledTime: payload.scheduledTime,
        status: payload.status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medication-logs"] });
    },
    onError: (err: any) => {
      toast({
        title: t("medications.log_failed", "Could not log dose"),
        description: err?.message || "",
        variant: "destructive",
      });
    },
  });

  const undoLogMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/medication-logs/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medication-logs"] });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (m: Medication) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      dosage: m.dosage || "",
      frequency: m.frequency || "once_daily",
      timesOfDay: (m.timesOfDay as string[] | null) || ["08:00"],
      startDate: m.startDate || "",
      endDate: m.endDate || "",
      instructions: m.instructions || "",
      familyMemberId: m.familyMemberId || "",
      reminderEnabled: m.reminderEnabled,
      color: m.color || COLORS[0],
    });
    setDialogOpen(true);
  };

  const updateTime = (idx: number, value: string) => {
    const next = [...form.timesOfDay];
    next[idx] = value;
    setForm({ ...form, timesOfDay: next });
  };
  const addTime = () => setForm({ ...form, timesOfDay: [...form.timesOfDay, "12:00"] });
  const removeTime = (idx: number) => {
    if (form.timesOfDay.length <= 1) return;
    setForm({ ...form, timesOfDay: form.timesOfDay.filter((_, i) => i !== idx) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({
        title: t("medications.name_required", "Medication name is required"),
        variant: "destructive",
      });
      return;
    }
    const payload: any = {
      name: form.name.trim(),
      dosage: form.dosage.trim() || undefined,
      frequency: form.frequency || undefined,
      timesOfDay: form.timesOfDay.filter((t) => t.trim()).length
        ? form.timesOfDay.filter((t) => t.trim())
        : undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      instructions: form.instructions.trim() || undefined,
      familyMemberId: form.familyMemberId || undefined,
      reminderEnabled: form.reminderEnabled,
      color: form.color,
    };
    saveMutation.mutate(payload);
  };

  const visibleMeds = useMemo(() => {
    if (!medications) return [];
    if (filterMemberId === "all") return medications;
    if (filterMemberId === "self") return medications.filter((m) => !m.familyMemberId);
    return medications.filter((m) => m.familyMemberId === filterMemberId);
  }, [medications, filterMemberId]);

  // Build today's schedule: { medication, time, log? }
  const todaysSchedule = useMemo(() => {
    if (!medications) return [];
    const items: { med: Medication; time: string; log?: MedicationLog }[] = [];
    for (const m of medications) {
      if (!isActiveToday(m, today)) continue;
      if (filterMemberId !== "all") {
        if (filterMemberId === "self" && m.familyMemberId) continue;
        if (filterMemberId !== "self" && m.familyMemberId !== filterMemberId) continue;
      }
      const times = (m.timesOfDay as string[] | null) || [];
      for (const time of times) {
        const log = todaysLogs?.find(
          (l) => l.medicationId === m.id && l.scheduledTime === time
        );
        items.push({ med: m, time, log });
      }
    }
    return items.sort((a, b) => a.time.localeCompare(b.time));
  }, [medications, todaysLogs, today, filterMemberId]);

  const adherence = useMemo(() => {
    const total = todaysSchedule.length;
    const taken = todaysSchedule.filter((s) => s.log?.status === "taken").length;
    return { total, taken, pct: total === 0 ? 0 : Math.round((taken / total) * 100) };
  }, [todaysSchedule]);

  const memberName = (id: string | null | undefined) => {
    if (!id) return null;
    const m = familyMembers?.find((f) => f.id === id);
    return m ? `${m.firstName} ${m.lastName}` : null;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today's schedule */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                {t("medications.todays_schedule", "Today's schedule")}
              </CardTitle>
              <CardDescription>
                {t(
                  "medications.todays_subtitle",
                  "Mark each dose as you take it to track your adherence."
                )}
              </CardDescription>
            </div>
            {familyMembers && familyMembers.length > 0 && (
              <Select value={filterMemberId} onValueChange={setFilterMemberId}>
                <SelectTrigger className="w-[180px]" data-testid="select-medication-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("medications.filter_all", "Everyone")}
                  </SelectItem>
                  <SelectItem value="self">
                    {t("medications.filter_self", "Just me")}
                  </SelectItem>
                  {familyMembers.map((fm) => (
                    <SelectItem key={fm.id} value={fm.id}>
                      {fm.firstName} {fm.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {adherence.total > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">
                  {t("medications.adherence", "Today's adherence")}
                </span>
                <span className="font-medium">
                  {adherence.taken} / {adherence.total} ({adherence.pct}%)
                </span>
              </div>
              <Progress value={adherence.pct} className="h-2" data-testid="progress-adherence" />
            </div>
          )}

          {todaysSchedule.length === 0 ? (
            <div className="text-center py-8">
              <Pill className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {t("medications.no_doses_today", "No doses scheduled for today.")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {todaysSchedule.map((item, idx) => {
                const taken = item.log?.status === "taken";
                const skipped = item.log?.status === "skipped";
                const forName = memberName(item.med.familyMemberId);
                return (
                  <div
                    key={`${item.med.id}-${item.time}-${idx}`}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      taken ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900" : ""
                    } ${skipped ? "bg-muted/40" : ""}`}
                    data-testid={`row-dose-${item.med.id}-${item.time}`}
                  >
                    <div
                      className="w-1 self-stretch rounded-full"
                      style={{ background: item.med.color || "#0ea5e9" }}
                    />
                    <div className="flex-shrink-0 w-14 text-center">
                      <p className="text-sm font-semibold tabular-nums">{item.time}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{item.med.name}</p>
                        {item.med.dosage && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                            {item.med.dosage}
                          </Badge>
                        )}
                        {forName && (
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                            <User2 className="h-2.5 w-2.5 mr-1" />
                            {forName}
                          </Badge>
                        )}
                      </div>
                      {item.med.instructions && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {item.med.instructions}
                        </p>
                      )}
                    </div>
                    {item.log ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={taken ? "default" : "outline"}
                          className={taken ? "bg-green-600 hover:bg-green-600" : ""}
                        >
                          {taken
                            ? t("medications.taken", "Taken")
                            : t("medications.skipped", "Skipped")}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => undoLogMutation.mutate(item.log!.id)}
                          aria-label={t("medications.undo", "Undo")}
                          data-testid={`button-undo-${item.med.id}-${item.time}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            logMutation.mutate({
                              medicationId: item.med.id,
                              scheduledTime: item.time,
                              status: "skipped",
                            })
                          }
                          data-testid={`button-skip-${item.med.id}-${item.time}`}
                        >
                          {t("medications.skip", "Skip")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            logMutation.mutate({
                              medicationId: item.med.id,
                              scheduledTime: item.time,
                              status: "taken",
                            })
                          }
                          data-testid={`button-take-${item.med.id}-${item.time}`}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {t("medications.mark_taken", "Take")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Medications list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-primary" />
                {t("medications.title", "My medications")}
              </CardTitle>
              <CardDescription>
                {t(
                  "medications.subtitle",
                  "Keep an organized list of medications for you and your family."
                )}
              </CardDescription>
            </div>
            <Button onClick={openAdd} size="sm" data-testid="button-add-medication">
              <Plus className="h-4 w-4 mr-1" />
              {t("medications.add", "Add medication")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!visibleMeds || visibleMeds.length === 0 ? (
            <div className="text-center py-12">
              <Pill className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground mb-4">
                {t("medications.empty", "You haven't added any medications yet.")}
              </p>
              <Button onClick={openAdd} data-testid="button-add-first-medication">
                <Plus className="h-4 w-4 mr-1" />
                {t("medications.add_first", "Add your first medication")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleMeds.map((m) => {
                const forName = memberName(m.familyMemberId);
                const times = (m.timesOfDay as string[] | null) || [];
                return (
                  <div
                    key={m.id}
                    className="rounded-xl border bg-card p-4 hover-elevate transition-all"
                    data-testid={`card-medication-${m.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: `${m.color || "#0ea5e9"}20` }}
                      >
                        <Pill className="h-5 w-5" style={{ color: m.color || "#0ea5e9" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{m.name}</p>
                            {m.dosage && (
                              <p className="text-xs text-muted-foreground">{m.dosage}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(m)}
                              data-testid={`button-edit-medication-${m.id}`}
                              aria-label={t("common.edit", "Edit")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setConfirmDeleteId(m.id)}
                              data-testid={`button-delete-medication-${m.id}`}
                              aria-label={t("common.delete", "Delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {m.frequency && (
                            <Badge variant="outline" className="px-1.5 h-5">
                              {t(`medications.freq.${m.frequency}`, m.frequency)}
                            </Badge>
                          )}
                          {forName && (
                            <Badge variant="secondary" className="px-1.5 h-5">
                              <User2 className="h-2.5 w-2.5 mr-1" />
                              {forName}
                            </Badge>
                          )}
                          {m.reminderEnabled ? (
                            <Bell className="h-3 w-3 text-primary" />
                          ) : (
                            <BellOff className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>

                        {times.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {times.map((time) => (
                              <span
                                key={time}
                                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums"
                              >
                                <Clock className="h-2.5 w-2.5 mr-0.5" />
                                {time}
                              </span>
                            ))}
                          </div>
                        )}

                        {m.instructions && (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                            {m.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDialogOpen(false);
            setEditingId(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("medications.edit_title", "Edit medication")
                : t("medications.add_title", "Add medication")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "medications.dialog_desc",
                "Set up the dosing schedule so we can remind you when it's time."
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="med-name">{t("medications.name_label", "Medication name")}*</Label>
                <Input
                  id="med-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder={t("medications.name_placeholder", "e.g., Ibuprofen")}
                  data-testid="input-medication-name"
                />
              </div>
              <div>
                <Label htmlFor="med-dosage">{t("medications.dosage_label", "Dosage")}</Label>
                <Input
                  id="med-dosage"
                  value={form.dosage}
                  onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                  placeholder={t("medications.dosage_placeholder", "e.g., 200mg, 1 tablet")}
                  data-testid="input-medication-dosage"
                />
              </div>
              <div>
                <Label htmlFor="med-freq">{t("medications.frequency_label", "Frequency")}</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => setForm({ ...form, frequency: v })}
                >
                  <SelectTrigger id="med-freq" data-testid="select-medication-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {t(`medications.freq.${f}`, f)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="med-start">{t("medications.start_date", "Start date")}</Label>
                <Input
                  id="med-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  data-testid="input-medication-start"
                />
              </div>
              <div>
                <Label htmlFor="med-end">{t("medications.end_date", "End date (optional)")}</Label>
                <Input
                  id="med-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  data-testid="input-medication-end"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("medications.times_label", "Times of day")}</Label>
                <div className="space-y-2 mt-1">
                  {form.timesOfDay.map((time, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => updateTime(idx, e.target.value)}
                        className="max-w-[160px]"
                        data-testid={`input-medication-time-${idx}`}
                      />
                      {form.timesOfDay.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => removeTime(idx)}
                          aria-label={t("medications.remove_time", "Remove time")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addTime}
                    data-testid="button-add-time"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {t("medications.add_time", "Add another time")}
                  </Button>
                </div>
              </div>
              {familyMembers && familyMembers.length > 0 && (
                <div className="sm:col-span-2">
                  <Label htmlFor="med-for" className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {t("medications.for_label", "Who is this medication for?")}
                  </Label>
                  <Select
                    value={form.familyMemberId || "self"}
                    onValueChange={(v) =>
                      setForm({ ...form, familyMemberId: v === "self" ? "" : v })
                    }
                  >
                    <SelectTrigger id="med-for" data-testid="select-medication-for">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">
                        {t("medications.for_self", "Myself")}
                      </SelectItem>
                      {familyMembers.map((fm) => (
                        <SelectItem key={fm.id} value={fm.id}>
                          {fm.firstName} {fm.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>{t("medications.color_label", "Color tag")}</Label>
                <div className="flex gap-2 mt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${
                        form.color === c ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ background: c }}
                      aria-label={c}
                      data-testid={`button-color-${c}`}
                    />
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="med-instr">
                  {t("medications.instructions_label", "Instructions")}
                </Label>
                <Textarea
                  id="med-instr"
                  rows={2}
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder={t(
                    "medications.instructions_placeholder",
                    "e.g., take with food, avoid alcohol…"
                  )}
                  data-testid="input-medication-instructions"
                />
              </div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">
                      {t("medications.reminders", "Reminders")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "medications.reminders_desc",
                        "Show this medication on your daily schedule."
                      )}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={form.reminderEnabled}
                  onCheckedChange={(v) => setForm({ ...form, reminderEnabled: v })}
                  data-testid="switch-medication-reminder"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingId(null);
                  setForm(emptyForm());
                }}
                data-testid="button-cancel-medication"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-medication"
              >
                {saveMutation.isPending
                  ? t("medications.saving", "Saving…")
                  : editingId
                    ? t("medications.save_changes", "Save changes")
                    : t("medications.save", "Add medication")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("medications.confirm_delete_title", "Remove this medication?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "medications.confirm_delete_desc",
                "This will also delete all of its dose history."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-medication">
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              data-testid="button-confirm-delete-medication"
            >
              {t("common.remove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
