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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Droplet,
  HeartPulse,
  Plus,
  Scale,
  Thermometer,
  Trash2,
  Wind,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { HealthMetric } from "@shared/schema";

type FormState = {
  measuredAt: string;
  weightKg: string;
  systolic: string;
  diastolic: string;
  heartRate: string;
  bloodGlucose: string;
  temperatureC: string;
  oxygenSaturation: string;
  notes: string;
};

const emptyForm = (): FormState => {
  const now = new Date();
  const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return {
    measuredAt: iso,
    weightKg: "",
    systolic: "",
    diastolic: "",
    heartRate: "",
    bloodGlucose: "",
    temperatureC: "",
    oxygenSaturation: "",
    notes: "",
  };
};

const num = (v: string | null | undefined) => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function HealthMetricsTab() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [open, setOpen] = useState(false);
  const [chartMetric, setChartMetric] = useState<
    "weight" | "blood_pressure" | "heart_rate" | "blood_glucose" | "temperature" | "oxygen"
  >("blood_pressure");

  const { data: metrics, isLoading } = useQuery<HealthMetric[]>({
    queryKey: ["/api/health-metrics"],
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/health-metrics", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/health-metrics"] });
      toast({
        title: t("health_metrics.saved_title", "Reading saved"),
        description: t("health_metrics.saved_desc", "Your health reading was logged."),
      });
      setForm(emptyForm());
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: t("health_metrics.save_failed", "Could not save reading"),
        description: err?.message || "",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/health-metrics/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/health-metrics"] });
      toast({ title: t("health_metrics.deleted", "Reading removed") });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      measuredAt: new Date(form.measuredAt).toISOString(),
      weightKg: form.weightKg ? Number(form.weightKg) : undefined,
      systolic: num(form.systolic),
      diastolic: num(form.diastolic),
      heartRate: num(form.heartRate),
      bloodGlucose: form.bloodGlucose ? Number(form.bloodGlucose) : undefined,
      temperatureC: form.temperatureC ? Number(form.temperatureC) : undefined,
      oxygenSaturation: num(form.oxygenSaturation),
      notes: form.notes || undefined,
    };
    const hasAny = Object.entries(payload)
      .filter(([k]) => !["measuredAt", "notes"].includes(k))
      .some(([, v]) => v !== undefined && v !== null && v !== "");
    if (!hasAny) {
      toast({
        title: t("health_metrics.empty_form", "Please add at least one measurement"),
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(payload);
  };

  const latest = metrics?.[0];

  const chartData = useMemo(() => {
    if (!metrics) return [] as any[];
    return [...metrics]
      .reverse()
      .map((m) => ({
        date: new Date(m.measuredAt).toLocaleDateString(i18n.language, {
          month: "short",
          day: "numeric",
        }),
        weight: m.weightKg != null ? Number(m.weightKg) : null,
        systolic: m.systolic ?? null,
        diastolic: m.diastolic ?? null,
        heartRate: m.heartRate ?? null,
        bloodGlucose: m.bloodGlucose != null ? Number(m.bloodGlucose) : null,
        temperature: m.temperatureC != null ? Number(m.temperatureC) : null,
        oxygen: m.oxygenSaturation ?? null,
      }))
      .filter((row) => {
        switch (chartMetric) {
          case "weight":
            return row.weight != null;
          case "blood_pressure":
            return row.systolic != null || row.diastolic != null;
          case "heart_rate":
            return row.heartRate != null;
          case "blood_glucose":
            return row.bloodGlucose != null;
          case "temperature":
            return row.temperature != null;
          case "oxygen":
            return row.oxygen != null;
        }
      });
  }, [metrics, chartMetric, i18n.language]);

  const StatCard = ({
    icon: Icon,
    label,
    value,
    unit,
    tone,
  }: {
    icon: any;
    label: string;
    value: string | number | null | undefined;
    unit?: string;
    tone: string;
  }) => (
    <div className={`rounded-xl border p-4 bg-gradient-to-br ${tone}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {value != null && value !== "" ? value : "—"}
        {value != null && value !== "" && unit ? (
          <span className="text-base font-normal text-muted-foreground ml-1">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Latest snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-rose-500" />
                {t("health_metrics.title", "Health metrics")}
              </CardTitle>
              <CardDescription>
                {t(
                  "health_metrics.subtitle",
                  "Track your vitals over time to share with your providers."
                )}
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setOpen((v) => !v)}
              data-testid="button-log-reading"
            >
              <Plus className="h-4 w-4 mr-1" />
              {open
                ? t("health_metrics.close_form", "Close")
                : t("health_metrics.log_reading", "Log reading")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              icon={Scale}
              label={t("health_metrics.weight", "Weight")}
              value={latest?.weightKg != null ? Number(latest.weightKg) : null}
              unit="kg"
              tone="from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/20"
            />
            <StatCard
              icon={Activity}
              label={t("health_metrics.blood_pressure", "Blood pressure")}
              value={
                latest?.systolic && latest?.diastolic
                  ? `${latest.systolic}/${latest.diastolic}`
                  : null
              }
              unit="mmHg"
              tone="from-rose-50 to-rose-100 dark:from-rose-950/40 dark:to-rose-900/20"
            />
            <StatCard
              icon={HeartPulse}
              label={t("health_metrics.heart_rate", "Heart rate")}
              value={latest?.heartRate ?? null}
              unit="bpm"
              tone="from-pink-50 to-pink-100 dark:from-pink-950/40 dark:to-pink-900/20"
            />
            <StatCard
              icon={Droplet}
              label={t("health_metrics.blood_glucose", "Blood glucose")}
              value={
                latest?.bloodGlucose != null ? Number(latest.bloodGlucose) : null
              }
              unit="mmol/L"
              tone="from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/20"
            />
            <StatCard
              icon={Thermometer}
              label={t("health_metrics.temperature", "Temperature")}
              value={
                latest?.temperatureC != null ? Number(latest.temperatureC) : null
              }
              unit="°C"
              tone="from-orange-50 to-orange-100 dark:from-orange-950/40 dark:to-orange-900/20"
            />
            <StatCard
              icon={Wind}
              label={t("health_metrics.oxygen", "SpO₂")}
              value={latest?.oxygenSaturation ?? null}
              unit="%"
              tone="from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/20"
            />
          </div>

          {open && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="hm-when">
                    {t("health_metrics.measured_at", "Measured at")}
                  </Label>
                  <Input
                    id="hm-when"
                    type="datetime-local"
                    value={form.measuredAt}
                    onChange={(e) =>
                      setForm({ ...form, measuredAt: e.target.value })
                    }
                    data-testid="input-measured-at"
                  />
                </div>
                <div>
                  <Label htmlFor="hm-weight">
                    {t("health_metrics.weight", "Weight")} (kg)
                  </Label>
                  <Input
                    id="hm-weight"
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.weightKg}
                    onChange={(e) =>
                      setForm({ ...form, weightKg: e.target.value })
                    }
                    data-testid="input-weight"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="hm-sys">
                      {t("health_metrics.systolic", "Systolic")}
                    </Label>
                    <Input
                      id="hm-sys"
                      type="number"
                      min="0"
                      value={form.systolic}
                      onChange={(e) =>
                        setForm({ ...form, systolic: e.target.value })
                      }
                      data-testid="input-systolic"
                    />
                  </div>
                  <div>
                    <Label htmlFor="hm-dia">
                      {t("health_metrics.diastolic", "Diastolic")}
                    </Label>
                    <Input
                      id="hm-dia"
                      type="number"
                      min="0"
                      value={form.diastolic}
                      onChange={(e) =>
                        setForm({ ...form, diastolic: e.target.value })
                      }
                      data-testid="input-diastolic"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="hm-hr">
                    {t("health_metrics.heart_rate", "Heart rate")} (bpm)
                  </Label>
                  <Input
                    id="hm-hr"
                    type="number"
                    min="0"
                    value={form.heartRate}
                    onChange={(e) =>
                      setForm({ ...form, heartRate: e.target.value })
                    }
                    data-testid="input-heart-rate"
                  />
                </div>
                <div>
                  <Label htmlFor="hm-bg">
                    {t("health_metrics.blood_glucose", "Blood glucose")} (mmol/L)
                  </Label>
                  <Input
                    id="hm-bg"
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.bloodGlucose}
                    onChange={(e) =>
                      setForm({ ...form, bloodGlucose: e.target.value })
                    }
                    data-testid="input-blood-glucose"
                  />
                </div>
                <div>
                  <Label htmlFor="hm-temp">
                    {t("health_metrics.temperature", "Temperature")} (°C)
                  </Label>
                  <Input
                    id="hm-temp"
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.temperatureC}
                    onChange={(e) =>
                      setForm({ ...form, temperatureC: e.target.value })
                    }
                    data-testid="input-temperature"
                  />
                </div>
                <div>
                  <Label htmlFor="hm-o2">
                    {t("health_metrics.oxygen", "SpO₂")} (%)
                  </Label>
                  <Input
                    id="hm-o2"
                    type="number"
                    min="0"
                    max="100"
                    value={form.oxygenSaturation}
                    onChange={(e) =>
                      setForm({ ...form, oxygenSaturation: e.target.value })
                    }
                    data-testid="input-oxygen"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <Label htmlFor="hm-notes">
                    {t("health_metrics.notes", "Notes")}
                  </Label>
                  <Input
                    id="hm-notes"
                    type="text"
                    placeholder={t(
                      "health_metrics.notes_placeholder",
                      "Anything to remember about this reading…"
                    )}
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    data-testid="input-notes"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForm(emptyForm())}
                  data-testid="button-reset-reading"
                >
                  {t("common.reset", "Reset")}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-save-reading"
                >
                  {createMutation.isPending
                    ? t("health_metrics.saving", "Saving…")
                    : t("health_metrics.save", "Save reading")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Trends chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("health_metrics.trends", "Trends")}</CardTitle>
          <CardDescription>
            {t(
              "health_metrics.trends_desc",
              "Pick a metric to see how it changes over time."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={chartMetric}
            onValueChange={(v) => setChartMetric(v as any)}
          >
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="blood_pressure" data-testid="tab-bp">
                {t("health_metrics.blood_pressure", "Blood pressure")}
              </TabsTrigger>
              <TabsTrigger value="weight" data-testid="tab-weight">
                {t("health_metrics.weight", "Weight")}
              </TabsTrigger>
              <TabsTrigger value="heart_rate" data-testid="tab-hr">
                {t("health_metrics.heart_rate", "Heart rate")}
              </TabsTrigger>
              <TabsTrigger value="blood_glucose" data-testid="tab-bg">
                {t("health_metrics.blood_glucose", "Blood glucose")}
              </TabsTrigger>
              <TabsTrigger value="temperature" data-testid="tab-temp">
                {t("health_metrics.temperature", "Temperature")}
              </TabsTrigger>
              <TabsTrigger value="oxygen" data-testid="tab-o2">
                {t("health_metrics.oxygen", "SpO₂")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value={chartMetric} className="mt-4">
              {chartData.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12">
                  {t(
                    "health_metrics.no_chart_data",
                    "No data yet. Log a reading above to start tracking."
                  )}
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="hmA" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="hmB" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      {chartMetric === "blood_pressure" && (
                        <>
                          <Area
                            type="monotone"
                            dataKey="systolic"
                            name={t("health_metrics.systolic", "Systolic")}
                            stroke="#f43f5e"
                            fill="url(#hmB)"
                          />
                          <Area
                            type="monotone"
                            dataKey="diastolic"
                            name={t("health_metrics.diastolic", "Diastolic")}
                            stroke="#3b82f6"
                            fill="url(#hmA)"
                          />
                        </>
                      )}
                      {chartMetric === "weight" && (
                        <Area
                          type="monotone"
                          dataKey="weight"
                          name={t("health_metrics.weight", "Weight")}
                          stroke="#3b82f6"
                          fill="url(#hmA)"
                        />
                      )}
                      {chartMetric === "heart_rate" && (
                        <Area
                          type="monotone"
                          dataKey="heartRate"
                          name={t("health_metrics.heart_rate", "Heart rate")}
                          stroke="#f43f5e"
                          fill="url(#hmB)"
                        />
                      )}
                      {chartMetric === "blood_glucose" && (
                        <Area
                          type="monotone"
                          dataKey="bloodGlucose"
                          name={t("health_metrics.blood_glucose", "Blood glucose")}
                          stroke="#f59e0b"
                          fill="url(#hmA)"
                        />
                      )}
                      {chartMetric === "temperature" && (
                        <Area
                          type="monotone"
                          dataKey="temperature"
                          name={t("health_metrics.temperature", "Temperature")}
                          stroke="#fb923c"
                          fill="url(#hmA)"
                        />
                      )}
                      {chartMetric === "oxygen" && (
                        <Area
                          type="monotone"
                          dataKey="oxygen"
                          name={t("health_metrics.oxygen", "SpO₂")}
                          stroke="#10b981"
                          fill="url(#hmA)"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Reading history */}
      <Card>
        <CardHeader>
          <CardTitle>{t("health_metrics.history", "Reading history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!metrics || metrics.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {t(
                "health_metrics.empty_history",
                "No readings recorded yet."
              )}
            </div>
          ) : (
            <div className="divide-y">
              {metrics.map((m) => (
                <div
                  key={m.id}
                  className="py-3 flex items-start gap-3"
                  data-testid={`row-reading-${m.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {new Date(m.measuredAt).toLocaleString(i18n.language)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {m.weightKg != null && (
                        <span>
                          {t("health_metrics.weight", "Weight")}:{" "}
                          {Number(m.weightKg)} kg
                        </span>
                      )}
                      {m.systolic && m.diastolic && (
                        <span>
                          {t("health_metrics.bp_short", "BP")}: {m.systolic}/
                          {m.diastolic} mmHg
                        </span>
                      )}
                      {m.heartRate && (
                        <span>
                          {t("health_metrics.hr_short", "HR")}: {m.heartRate}{" "}
                          bpm
                        </span>
                      )}
                      {m.bloodGlucose != null && (
                        <span>
                          {t("health_metrics.bg_short", "Glucose")}:{" "}
                          {Number(m.bloodGlucose)} mmol/L
                        </span>
                      )}
                      {m.temperatureC != null && (
                        <span>
                          {t("health_metrics.temp_short", "Temp")}:{" "}
                          {Number(m.temperatureC)}°C
                        </span>
                      )}
                      {m.oxygenSaturation != null && (
                        <span>SpO₂: {m.oxygenSaturation}%</span>
                      )}
                    </div>
                    {m.notes && (
                      <div className="mt-1 text-xs italic text-muted-foreground">
                        {m.notes}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(m.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-reading-${m.id}`}
                    aria-label={t("common.delete", "Delete")}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
