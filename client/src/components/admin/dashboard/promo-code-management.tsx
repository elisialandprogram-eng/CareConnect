import { formatDate } from "@/lib/datetime";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAdminCurrency } from "@/lib/currency";
import { useForm } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tag,
  TrendingUp,
  CheckCircle2,
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  CalendarDays,
  Briefcase,
  Sparkles,
  Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PromoCode, ProviderWithUser } from "@shared/schema";

export function PromoCodeManagement({
  providers,
}: {
  providers: ProviderWithUser[];
}) {
  const { format: fmtMoney } = useAdminCurrency();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive" | "expired" | "scheduled"
  >("all");

  const {
    data: promoCodes,
    refetch,
    isLoading,
  } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  type FormShape = {
    code: string;
    description: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    maxUses: string;
    validFrom: string;
    validUntil: string;
    minAmount: string;
    isActive: boolean;
    applicableProviders: string[];
  };

  const todayStr = () => new Date().toISOString().split("T")[0];
  const thirtyDaysOut = () =>
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

  const promoForm = useForm<FormShape>({
    defaultValues: {
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 10,
      maxUses: "",
      validFrom: todayStr(),
      validUntil: thirtyDaysOut(),
      minAmount: "",
      isActive: true,
      applicableProviders: [],
    },
  });

  const watchDiscountType = promoForm.watch("discountType");
  const watchDiscountValue = promoForm.watch("discountValue");

  const openCreate = () => {
    setEditing(null);
    promoForm.reset({
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 10,
      maxUses: "",
      validFrom: todayStr(),
      validUntil: thirtyDaysOut(),
      minAmount: "",
      isActive: true,
      applicableProviders: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (promo: PromoCode) => {
    setEditing(promo);
    promoForm.reset({
      code: promo.code,
      description: promo.description || "",
      discountType: promo.discountType as "percentage" | "fixed",
      discountValue: Number(promo.discountValue),
      maxUses: promo.maxUses != null ? String(promo.maxUses) : "",
      validFrom: new Date(promo.validFrom).toISOString().split("T")[0],
      validUntil: new Date(promo.validUntil).toISOString().split("T")[0],
      minAmount: promo.minAmount != null ? String(promo.minAmount) : "",
      isActive: promo.isActive ?? true,
      applicableProviders: promo.applicableProviders || [],
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormShape) => {
      const payload: any = {
        code: data.code.trim().toUpperCase(),
        description: data.description?.trim() || null,
        discountType: data.discountType,
        discountValue: Number(data.discountValue),
        maxUses: data.maxUses ? parseInt(data.maxUses, 10) : null,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        minAmount: data.minAmount ? parseFloat(data.minAmount) : null,
        isActive: data.isActive,
        applicableProviders:
          data.applicableProviders.length > 0
            ? data.applicableProviders
            : null,
      };
      const response = await apiRequest(
        editing ? "PATCH" : "POST",
        editing
          ? `/api/admin/promo-codes/${editing.id}`
          : "/api/admin/promo-codes",
        payload,
      );
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Save failed");
      return resData;
    },
    onSuccess: () => {
      toast({
        title: editing
          ? t("admin_dashboard.promo_updated", "Promo code updated")
          : t("admin_dashboard.promo_created", "Promo code created"),
      });
      setDialogOpen(false);
      setEditing(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
    },
    onError: (error: Error) => {
      toast({
        title: t("admin_dashboard.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({
      id,
      isActive,
    }: {
      id: string;
      isActive: boolean;
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/promo-codes/${id}`,
        { isActive },
      );
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Update failed");
      return resData;
    },
    onSuccess: () => refetch(),
    onError: (err: Error) => {
      toast({
        title: t("admin_dashboard.error", "Error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deletePromoMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/admin/promo-codes/${id}`,
      );
      if (!response.ok) {
        const resData = await response.json().catch(() => ({}));
        throw new Error((resData as any).message || "Delete failed");
      }
      return null;
    },
    onSuccess: () => {
      toast({
        title: t("admin_dashboard.promo_deleted", "Promo code deleted"),
      });
      setConfirmDeleteId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
    },
    onError: (err: Error) => {
      toast({
        title: t("admin_dashboard.error", "Error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const copyCode = (code: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        toast({
          title: t("admin_dashboard.promo_copied", "Code copied"),
          description: code,
        });
      });
    }
  };

  const promoStatus = (
    p: PromoCode,
  ): "active" | "inactive" | "expired" | "scheduled" | "exhausted" => {
    const now = Date.now();
    if (!p.isActive) return "inactive";
    if (now < new Date(p.validFrom).getTime()) return "scheduled";
    if (now > new Date(p.validUntil).getTime()) return "expired";
    if (p.maxUses != null && (p.usedCount ?? 0) >= p.maxUses)
      return "exhausted";
    return "active";
  };

  const filtered = useMemo(() => {
    if (!promoCodes) return [];
    const q = search.trim().toLowerCase();
    return promoCodes.filter((p) => {
      const status = promoStatus(p);
      if (statusFilter === "active" && status !== "active") return false;
      if (statusFilter === "inactive" && status !== "inactive") return false;
      if (
        statusFilter === "expired" &&
        status !== "expired" &&
        status !== "exhausted"
      )
        return false;
      if (statusFilter === "scheduled" && status !== "scheduled") return false;
      if (
        q &&
        !p.code.toLowerCase().includes(q) &&
        !(p.description || "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [promoCodes, search, statusFilter]);

  const stats = useMemo(() => {
    if (!promoCodes) return { total: 0, active: 0, redemptions: 0 };
    let active = 0;
    let redemptions = 0;
    for (const p of promoCodes) {
      if (promoStatus(p) === "active") active++;
      redemptions += p.usedCount || 0;
    }
    return { total: promoCodes.length, active, redemptions };
  }, [promoCodes]);

  const previewSavings = (() => {
    const sample = 100;
    if (!watchDiscountValue || isNaN(Number(watchDiscountValue))) return null;
    const v = Number(watchDiscountValue);
    if (watchDiscountType === "percentage") return (sample * v) / 100;
    return v;
  })();

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      active: {
        label: t("admin_dashboard.promo_status_active", "Active"),
        className: "bg-green-600 hover:bg-green-600",
      },
      inactive: {
        label: t("admin_dashboard.promo_status_inactive", "Inactive"),
        className: "bg-muted text-foreground hover:bg-muted",
      },
      expired: {
        label: t("admin_dashboard.promo_status_expired", "Expired"),
        className: "bg-destructive hover:bg-destructive",
      },
      scheduled: {
        label: t("admin_dashboard.promo_status_scheduled", "Scheduled"),
        className: "bg-amber-500 hover:bg-amber-500",
      },
      exhausted: {
        label: t("admin_dashboard.promo_status_exhausted", "Limit reached"),
        className: "bg-amber-600 hover:bg-amber-600",
      },
    };
    const m = map[status] || map.inactive;
    return <Badge className={m.className}>{m.label}</Badge>;
  };

  const formatDateRange = (from: string | Date, until: string | Date) => {
    const f = new Date(from);
    const u = new Date(until);
    return `${formatDate(f)} → ${formatDate(u)}`;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p
                  className="text-2xl font-bold tabular-nums"
                  data-testid="stat-promo-total"
                >
                  {stats.total}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin_dashboard.promo_stat_total",
                    "Total promo codes",
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p
                  className="text-2xl font-bold tabular-nums"
                  data-testid="stat-promo-active"
                >
                  {stats.active}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin_dashboard.promo_stat_active",
                    "Currently active",
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p
                  className="text-2xl font-bold tabular-nums"
                  data-testid="stat-promo-redemptions"
                >
                  {stats.redemptions}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin_dashboard.promo_stat_redemptions",
                    "Total redemptions",
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t(
                  "admin_dashboard.promo_search_placeholder",
                  "Search by code or description…",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-promo-search"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as any)}
            >
              <SelectTrigger
                className="w-full md:w-[180px]"
                data-testid="select-promo-status-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin_dashboard.promo_filter_all", "All statuses")}
                </SelectItem>
                <SelectItem value="active">
                  {t("admin_dashboard.promo_status_active", "Active")}
                </SelectItem>
                <SelectItem value="scheduled">
                  {t(
                    "admin_dashboard.promo_status_scheduled",
                    "Scheduled",
                  )}
                </SelectItem>
                <SelectItem value="inactive">
                  {t("admin_dashboard.promo_status_inactive", "Inactive")}
                </SelectItem>
                <SelectItem value="expired">
                  {t(
                    "admin_dashboard.promo_filter_expired",
                    "Expired or limit reached",
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate} data-testid="button-create-promo">
              <Plus className="h-4 w-4 mr-1" />
              {t(
                "admin_dashboard.create_promo_btn",
                "Create promo code",
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("admin_dashboard.loading", "Loading…")}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground mb-4">
              {promoCodes && promoCodes.length === 0
                ? t(
                    "admin_dashboard.promo_empty",
                    "No promo codes yet. Create your first one to start running campaigns.",
                  )
                : t(
                    "admin_dashboard.promo_no_match",
                    "No promo codes match your filters.",
                  )}
            </p>
            {promoCodes && promoCodes.length === 0 && (
              <Button
                onClick={openCreate}
                data-testid="button-create-first-promo"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t(
                  "admin_dashboard.create_first_promo",
                  "Create your first promo code",
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((promo) => {
            const status = promoStatus(promo);
            const usagePct =
              promo.maxUses && promo.maxUses > 0
                ? Math.min(
                    100,
                    Math.round(
                      ((promo.usedCount ?? 0) / promo.maxUses) * 100,
                    ),
                  )
                : null;
            return (
              <div
                key={promo.id}
                className="rounded-xl border bg-card p-4 hover-elevate transition-all"
                data-testid={`row-promo-${promo.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-base font-bold tracking-wider px-2 py-0.5 rounded bg-muted">
                        {promo.code}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copyCode(promo.code)}
                        aria-label={t("admin_dashboard.copy", "Copy")}
                        data-testid={`button-copy-promo-${promo.id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {statusBadge(status)}
                    </div>
                    {promo.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {promo.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary leading-none">
                      {promo.discountType === "percentage"
                        ? `${Number(promo.discountValue)}%`
                        : fmtMoney(promo.discountValue)}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                      {promo.discountType === "percentage"
                        ? t(
                            "admin_dashboard.promo_type_percentage",
                            "Percentage",
                          )
                        : t("admin_dashboard.promo_type_fixed", "Fixed")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                  <div className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {formatDateRange(promo.validFrom, promo.validUntil)}
                  </div>
                  {promo.minAmount && (
                    <div className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {t("admin_dashboard.promo_min", "Min")}{" "}
                      {fmtMoney(promo.minAmount)}
                    </div>
                  )}
                  {promo.applicableProviders &&
                    promo.applicableProviders.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {promo.applicableProviders.length}{" "}
                        {t(
                          "admin_dashboard.promo_providers",
                          "providers",
                        )}
                      </div>
                    )}
                </div>

                {usagePct != null ? (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground">
                        {t("admin_dashboard.promo_usage", "Usage")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {promo.usedCount ?? 0} / {promo.maxUses}
                      </span>
                    </div>
                    <Progress value={usagePct} className="h-1.5" />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground mb-3">
                    {promo.usedCount ?? 0}{" "}
                    {t(
                      "admin_dashboard.promo_redemptions_short",
                      "redemptions",
                    )}{" "}
                    ·{" "}
                    {t("admin_dashboard.promo_unlimited", "unlimited uses")}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!promo.isActive}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({
                          id: promo.id,
                          isActive: checked,
                        })
                      }
                      disabled={toggleActiveMutation.isPending}
                      data-testid={`switch-promo-active-${promo.id}`}
                      aria-label={t(
                        "admin_dashboard.promo_toggle_active",
                        "Toggle active",
                      )}
                    />
                    <span className="text-xs text-muted-foreground">
                      {promo.isActive
                        ? t(
                            "admin_dashboard.promo_status_active",
                            "Active",
                          )
                        : t(
                            "admin_dashboard.promo_status_inactive",
                            "Inactive",
                          )}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(promo)}
                      data-testid={`button-edit-promo-${promo.id}`}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      {t("admin_dashboard.edit", "Edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDeleteId(promo.id)}
                      data-testid={`button-delete-promo-${promo.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDialogOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("admin_dashboard.edit_promo_title", "Edit promo code")
                : t(
                    "admin_dashboard.create_promo_title",
                    "Create promo code",
                  )}
            </DialogTitle>
            <DialogDescription>
              {t(
                "admin_dashboard.promo_dialog_desc",
                "Configure a discount, validity window, and any usage limits.",
              )}
            </DialogDescription>
          </DialogHeader>

          <Form {...promoForm}>
            <form
              onSubmit={promoForm.handleSubmit((data) =>
                saveMutation.mutate(data),
              )}
              className="space-y-5"
            >
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("admin_dashboard.promo_section_identity", "Identity")}
                </h4>
                <FormField
                  control={promoForm.control}
                  name="code"
                  rules={{
                    required: t(
                      "admin_dashboard.promo_code_required",
                      "Code is required",
                    ) as string,
                    minLength: {
                      value: 2,
                      message: t(
                        "admin_dashboard.promo_code_too_short",
                        "Code must be at least 2 characters",
                      ) as string,
                    },
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t(
                          "admin_dashboard.promo_code_label",
                          "Promo code",
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="SUMMER2026"
                          className="font-mono uppercase tracking-wider"
                          onChange={(e) =>
                            field.onChange(e.target.value.toUpperCase())
                          }
                          data-testid="input-promo-code"
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          "admin_dashboard.promo_code_uppercase_hint",
                          "Codes are stored uppercase. Clients enter this exact code at checkout.",
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={promoForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t(
                          "admin_dashboard.promo_description_label",
                          "Description (internal)",
                        )}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder={
                            t(
                              "admin_dashboard.promo_description_placeholder",
                              "e.g., Summer launch promotion for new users",
                            ) as string
                          }
                          data-testid="input-promo-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(
                    "admin_dashboard.promo_section_discount",
                    "Discount",
                  )}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={promoForm.control}
                    name="discountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t(
                            "admin_dashboard.discount_type_label",
                            "Type",
                          )}
                        </FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-promo-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="percentage">
                              {t(
                                "admin_dashboard.promo_type_percentage",
                                "Percentage",
                              )}{" "}
                              (%)
                            </SelectItem>
                            <SelectItem value="fixed">
                              {t(
                                "admin_dashboard.promo_type_fixed",
                                "Fixed amount",
                              )}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={promoForm.control}
                    name="discountValue"
                    rules={{
                      required: t(
                        "admin_dashboard.promo_value_required",
                        "Discount value is required",
                      ) as string,
                      min: {
                        value: 0.01,
                        message: t(
                          "admin_dashboard.promo_value_positive",
                          "Must be greater than 0",
                        ) as string,
                      },
                      validate: (v) => {
                        if (
                          watchDiscountType === "percentage" &&
                          Number(v) > 100
                        ) {
                          return t(
                            "admin_dashboard.promo_value_max_100",
                            "Percentage cannot exceed 100",
                          ) as string;
                        }
                        return true;
                      },
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {watchDiscountType === "percentage"
                            ? t(
                                "admin_dashboard.discount_value_pct_label",
                                "Discount (%)",
                              )
                            : t(
                                "admin_dashboard.discount_value_amount_label",
                                "Discount amount",
                              )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            data-testid="input-promo-value"
                          />
                        </FormControl>
                        <FormDescription>
                          {watchDiscountType === "percentage"
                            ? t(
                                "admin_dashboard.discount_value_pct_hint",
                                "Percentage off the appointment subtotal",
                              )
                            : t(
                                "admin_dashboard.discount_value_dollar_hint",
                                "Flat amount deducted",
                              )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {previewSavings != null && previewSavings > 0 && (
                  <div className="rounded-lg border bg-primary/5 px-3 py-2 text-xs text-foreground/80 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>
                      {t(
                        "admin_dashboard.promo_preview",
                        "On a {{base}} order, a customer saves {{savings}}.",
                        {
                          base: fmtMoney(100),
                          savings: fmtMoney(previewSavings),
                        },
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(
                    "admin_dashboard.promo_section_validity",
                    "Validity",
                  )}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={promoForm.control}
                    name="validFrom"
                    rules={{
                      required: t(
                        "admin_dashboard.promo_valid_from_required",
                        "Start date is required",
                      ) as string,
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t(
                            "admin_dashboard.valid_from_label",
                            "Valid from",
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-promo-valid-from"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={promoForm.control}
                    name="validUntil"
                    rules={{
                      required: t(
                        "admin_dashboard.promo_valid_until_required",
                        "End date is required",
                      ) as string,
                      validate: (v) => {
                        const from = promoForm.getValues("validFrom");
                        if (from && v && new Date(v) < new Date(from)) {
                          return t(
                            "admin_dashboard.promo_valid_until_after",
                            "End date must be on or after the start date",
                          ) as string;
                        }
                        return true;
                      },
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t(
                            "admin_dashboard.valid_until_label",
                            "Valid until",
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-promo-valid-until"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(
                    "admin_dashboard.promo_section_limits",
                    "Limits & scope",
                  )}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={promoForm.control}
                    name="maxUses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t(
                            "admin_dashboard.max_uses_label",
                            "Max total uses",
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            placeholder={
                              t(
                                "admin_dashboard.max_uses_unlimited",
                                "Unlimited",
                              ) as string
                            }
                            {...field}
                            data-testid="input-promo-max-uses"
                          />
                        </FormControl>
                        <FormDescription>
                          {t(
                            "admin_dashboard.max_uses_hint",
                            "Leave empty for unlimited.",
                          )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={promoForm.control}
                    name="minAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t(
                            "admin_dashboard.min_amount_label",
                            "Minimum order",
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={
                              t(
                                "admin_dashboard.min_amount_none",
                                "No minimum",
                              ) as string
                            }
                            {...field}
                            data-testid="input-promo-min-amount"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {providers && providers.length > 0 && (
                  <FormField
                    control={promoForm.control}
                    name="applicableProviders"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t(
                            "admin_dashboard.promo_providers_label",
                            "Limit to specific providers",
                          )}
                        </FormLabel>
                        <FormDescription>
                          {t(
                            "admin_dashboard.promo_providers_hint",
                            "Leave empty to apply to all providers.",
                          )}
                        </FormDescription>
                        <div className="rounded-md border max-h-44 overflow-y-auto p-2 space-y-1">
                          {providers.map((p) => {
                            const checked = field.value?.includes(p.id);
                            return (
                              <label
                                key={p.id}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={!!checked}
                                  onChange={(e) => {
                                    const next = new Set(field.value || []);
                                    if (e.target.checked) next.add(p.id);
                                    else next.delete(p.id);
                                    field.onChange(Array.from(next));
                                  }}
                                  data-testid={`checkbox-provider-${p.id}`}
                                />
                                <span className="truncate">
                                  {p.user?.firstName} {p.user?.lastName}
                                  {p.specialization && (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · {p.specialization}
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={promoForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel className="text-sm">
                          {t("admin_dashboard.promo_active_label", "Active")}
                        </FormLabel>
                        <FormDescription className="text-xs">
                          {t(
                            "admin_dashboard.promo_active_hint",
                            "Inactive codes can't be used at checkout, even within their date window.",
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-promo-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDialogOpen(false);
                    setEditing(null);
                  }}
                  data-testid="button-cancel-promo"
                >
                  {t("admin_dashboard.cancel", "Cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="button-save-promo"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  {saveMutation.isPending
                    ? t("admin_dashboard.saving", "Saving…")
                    : editing
                      ? t(
                          "admin_dashboard.update_promo",
                          "Update promo code",
                        )
                      : t(
                          "admin_dashboard.create_promo",
                          "Create promo code",
                        )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                "admin_dashboard.promo_confirm_delete_title",
                "Delete this promo code?",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "admin_dashboard.promo_confirm_delete_desc",
                "Existing appointments that already used this code aren't affected, but the code can no longer be redeemed.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-promo">
              {t("admin_dashboard.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmDeleteId &&
                deletePromoMutation.mutate(confirmDeleteId)
              }
              data-testid="button-confirm-delete-promo"
            >
              {t("admin_dashboard.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
