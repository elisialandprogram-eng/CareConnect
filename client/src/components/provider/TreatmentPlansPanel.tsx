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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Loader2, X, ChevronDown, ChevronUp, CheckCircle2,
  Circle, Pencil, Target, ListTodo,
} from "lucide-react";
import { formatDate } from "@/lib/datetime";

interface TreatmentTask {
  id: string;
  plan_id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  due_date?: string;
  completed_at?: string;
  created_at: string;
}

interface TreatmentPlan {
  id: string;
  patient_id: string;
  provider_id: string;
  appointment_id?: string;
  title: string;
  description?: string;
  goals?: string;
  recommendations?: string;
  status: "active" | "completed" | "on_hold" | "cancelled";
  start_date?: string;
  end_date?: string;
  created_at: string;
  tasks: TreatmentTask[];
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default", completed: "secondary", on_hold: "outline", cancelled: "destructive",
};

const TASK_STATUS_ICON: Record<string, JSX.Element> = {
  pending:     <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
  in_progress: <Circle className="h-3.5 w-3.5 text-blue-500" />,
  completed:   <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  skipped:     <Circle className="h-3.5 w-3.5 text-muted-foreground opacity-40" />,
};

const EMPTY_PLAN = { title: "", description: "", goals: "", recommendations: "", startDate: "", endDate: "" };
const EMPTY_TASK = { title: "", description: "", dueDate: "" };

export function TreatmentPlansPanel({
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
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [taskForms, setTaskForms] = useState<typeof EMPTY_TASK[]>([]);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [newTaskForm, setNewTaskForm] = useState(EMPTY_TASK);
  const [editingPlan, setEditingPlan] = useState<TreatmentPlan | null>(null);

  const QK = ["/api/provider/patients", patientId, "treatment-plans"];

  const { data: plans, isLoading } = useQuery<TreatmentPlan[]>({
    queryKey: QK,
    queryFn: () => apiRequest("GET", `/api/provider/patients/${patientId}/treatment-plans`).then((r) => r.json()),
    enabled: !!patientId,
  });

  const createPlanMutation = useMutation({
    mutationFn: async (data: { plan: typeof EMPTY_PLAN; tasks: typeof EMPTY_TASK[] }) => {
      const res = await apiRequest("POST", "/api/provider/treatment-plans", {
        ...data.plan,
        patientId,
        appointmentId,
        tasks: data.tasks.filter((t) => t.title.trim()),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      setShowNewPlan(false);
      setPlanForm(EMPTY_PLAN);
      setTaskForms([]);
      toast({ title: t("clinical.plan_saved", "Treatment plan saved") });
    },
    onError: () => toast({ title: t("clinical.plan_failed", "Failed to save treatment plan"), variant: "destructive" }),
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof EMPTY_PLAN & { status: string }> }) => {
      const res = await apiRequest("PATCH", `/api/provider/treatment-plans/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      setEditingPlan(null);
      toast({ title: t("clinical.plan_updated", "Plan updated") });
    },
    onError: () => toast({ title: t("clinical.plan_update_failed", "Failed to update"), variant: "destructive" }),
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ planId, data }: { planId: string; data: typeof EMPTY_TASK }) => {
      const res = await apiRequest("POST", `/api/provider/treatment-plans/${planId}/tasks`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      setAddingTaskFor(null);
      setNewTaskForm(EMPTY_TASK);
      toast({ title: t("clinical.task_added", "Task added") });
    },
    onError: () => toast({ title: t("clinical.task_failed", "Failed to add task"), variant: "destructive" }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TreatmentTask["status"] }) => {
      const res = await apiRequest("PATCH", `/api/provider/treatment-tasks/${taskId}`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK }),
    onError: () => toast({ title: t("clinical.task_update_failed", "Failed to update task"), variant: "destructive" }),
  });

  const canWrite = !appointmentStatus || ["in_progress", "completed"].includes(appointmentStatus);

  const TASK_STATUSES: TreatmentTask["status"][] = ["pending", "in_progress", "completed", "skipped"];

  function cycleTaskStatus(task: TreatmentTask) {
    const idx = TASK_STATUSES.indexOf(task.status);
    const next = TASK_STATUSES[(idx + 1) % TASK_STATUSES.length];
    updateTaskMutation.mutate({ taskId: task.id, status: next });
  }

  return (
    <div className="space-y-4" data-testid="section-treatment-plans">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant={showNewPlan ? "secondary" : "default"}
            onClick={() => { setShowNewPlan(!showNewPlan); setPlanForm(EMPTY_PLAN); setTaskForms([]); }}
            data-testid="button-toggle-plan-form"
          >
            {showNewPlan
              ? <><X className="h-3 w-3 mr-1" />{t("common.cancel", "Cancel")}</>
              : <><Plus className="h-3 w-3 mr-1" />{t("clinical.new_plan", "New treatment plan")}</>}
          </Button>
        </div>
      )}

      {showNewPlan && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <Label>{t("clinical.plan_title", "Title")} *</Label>
              <Input
                value={planForm.title}
                onChange={(e) => setPlanForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("clinical.plan_title_placeholder", "e.g. Physiotherapy rehabilitation programme")}
                data-testid="input-plan-title"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("clinical.plan_goals", "Goals")}</Label>
              <Textarea
                value={planForm.goals}
                onChange={(e) => setPlanForm((f) => ({ ...f, goals: e.target.value }))}
                rows={2}
                placeholder={t("clinical.plan_goals_placeholder", "What outcomes are we aiming for?")}
                data-testid="textarea-plan-goals"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("clinical.plan_recommendations", "Recommendations")}</Label>
              <Textarea
                value={planForm.recommendations}
                onChange={(e) => setPlanForm((f) => ({ ...f, recommendations: e.target.value }))}
                rows={2}
                data-testid="textarea-plan-recommendations"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("clinical.plan_start", "Start date")}</Label>
                <Input type="date" value={planForm.startDate} onChange={(e) => setPlanForm((f) => ({ ...f, startDate: e.target.value }))} data-testid="input-plan-start" />
              </div>
              <div className="space-y-1">
                <Label>{t("clinical.plan_end", "End date")}</Label>
                <Input type="date" value={planForm.endDate} onChange={(e) => setPlanForm((f) => ({ ...f, endDate: e.target.value }))} data-testid="input-plan-end" />
              </div>
            </div>

            {/* Inline tasks */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">{t("clinical.plan_tasks", "Tasks")}</Label>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setTaskForms((f) => [...f, { ...EMPTY_TASK }])}>
                  <Plus className="h-3 w-3 mr-1" />{t("clinical.add_task", "Add task")}
                </Button>
              </div>
              {taskForms.map((task, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Input
                    value={task.title}
                    onChange={(e) => setTaskForms((f) => f.map((t, j) => j === i ? { ...t, title: e.target.value } : t))}
                    placeholder={t("clinical.task_title_placeholder", "Task title...")}
                    className="flex-1"
                    data-testid={`input-task-title-${i}`}
                  />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => setTaskForms((f) => f.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              size="sm"
              disabled={!planForm.title.trim() || createPlanMutation.isPending}
              onClick={() => createPlanMutation.mutate({ plan: planForm, tasks: taskForms })}
              data-testid="button-save-plan"
            >
              {createPlanMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t("clinical.save_plan", "Save treatment plan")}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : !plans?.length ? (
        <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-plans">
          {t("clinical.no_plans", "No treatment plans on record.")}
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const completedTasks = plan.tasks.filter((t) => t.status === "completed").length;
            const totalTasks = plan.tasks.length;
            const isExpanded = expandedPlanId === plan.id;

            return (
              <Card key={plan.id} data-testid={`plan-item-${plan.id}`}>
                <CardHeader className="pb-2 pt-3 px-3">
                  <div className="flex items-start gap-2">
                    <Target className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CardTitle className="text-sm">{plan.title}</CardTitle>
                        <Badge variant={STATUS_VARIANTS[plan.status] ?? "secondary"} className="text-[10px] py-0">
                          {plan.status.replace("_", " ")}
                        </Badge>
                        {totalTasks > 0 && (
                          <span className="text-xs text-muted-foreground">{completedTasks}/{totalTasks} tasks</span>
                        )}
                      </div>
                      {plan.start_date && (
                        <p className="text-xs text-muted-foreground">{formatDate(plan.start_date)}{plan.end_date ? ` → ${formatDate(plan.end_date)}` : ""}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {canWrite && (
                        <>
                          <Select
                            value={plan.status}
                            onValueChange={(v) => updatePlanMutation.mutate({ id: plan.id, data: { status: v } })}
                          >
                            <SelectTrigger className="h-7 text-xs w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="on_hold">On Hold</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="px-3 pb-3 space-y-3">
                    {plan.goals && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{t("clinical.goals_label", "Goals")}</p>
                        <p className="text-sm">{plan.goals}</p>
                      </div>
                    )}
                    {plan.recommendations && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{t("clinical.recommendations_label", "Recommendations")}</p>
                        <p className="text-sm">{plan.recommendations}</p>
                      </div>
                    )}

                    {/* Tasks */}
                    {totalTasks > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                          <ListTodo className="h-3 w-3" />{t("clinical.tasks_label", "Tasks")}
                        </p>
                        <div className="space-y-1.5">
                          {plan.tasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-2 rounded p-1.5 hover:bg-muted/50" data-testid={`task-item-${task.id}`}>
                              <button
                                onClick={() => canWrite && cycleTaskStatus(task)}
                                className={canWrite ? "cursor-pointer" : "cursor-default"}
                                disabled={updateTaskMutation.isPending}
                              >
                                {TASK_STATUS_ICON[task.status]}
                              </button>
                              <span className={`text-sm flex-1 ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                                {task.title}
                              </span>
                              {task.due_date && <span className="text-xs text-muted-foreground">{formatDate(task.due_date)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {canWrite && (
                      <>
                        <Separator />
                        {addingTaskFor === plan.id ? (
                          <div className="flex gap-2">
                            <Input
                              value={newTaskForm.title}
                              onChange={(e) => setNewTaskForm((f) => ({ ...f, title: e.target.value }))}
                              placeholder={t("clinical.task_title_placeholder", "New task...")}
                              className="flex-1 h-8 text-sm"
                              data-testid="input-new-task"
                            />
                            <Button
                              size="sm"
                              disabled={!newTaskForm.title.trim() || addTaskMutation.isPending}
                              onClick={() => addTaskMutation.mutate({ planId: plan.id, data: newTaskForm })}
                              data-testid="button-save-task"
                            >
                              {addTaskMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.add", "Add")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setAddingTaskFor(null); setNewTaskForm(EMPTY_TASK); }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingTaskFor(plan.id)} data-testid={`button-add-task-${plan.id}`}>
                            <Plus className="h-3 w-3 mr-1" />{t("clinical.add_task", "Add task")}
                          </Button>
                        )}
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
