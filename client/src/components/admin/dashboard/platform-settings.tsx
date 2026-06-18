import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export function PlatformSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: settings, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/settings"],
  });

  const settingsForm = useForm({
    defaultValues: {
      key: "",
      value: "",
      category: "general",
      description: "",
    },
  });

  const createSettingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/settings", data);
      const resData = await response.json();
      if (!response.ok)
        throw new Error(
          resData.message || t("admin_dashboard.setting_save_failed"),
        );
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.setting_saved") });
      settingsForm.reset();
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: t("admin_dashboard.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("POST", "/api/admin/settings", {
        key,
        value,
      });
      const resData = await response.json();
      if (!response.ok)
        throw new Error(
          resData.message || t("admin_dashboard.setting_update_failed"),
        );
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.setting_updated") });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: t("admin_dashboard.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const groupedSettings =
    settings?.reduce((acc: any, setting: any) => {
      const category = setting.category || "general";
      if (!acc[category]) acc[category] = [];
      acc[category].push(setting);
      return acc;
    }, {}) || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin_dashboard.add_new_setting")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...settingsForm}>
            <form
              onSubmit={settingsForm.handleSubmit((data) =>
                createSettingMutation.mutate(data),
              )}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={settingsForm.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin_dashboard.setting_key")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t(
                            "admin_dashboard.setting_key_placeholder",
                          )}
                          data-testid="input-setting-key"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={settingsForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin_dashboard.category")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-setting-category">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="general">
                            {t("admin_dashboard.cat_general")}
                          </SelectItem>
                          <SelectItem value="booking">
                            {t("admin_dashboard.cat_booking")}
                          </SelectItem>
                          <SelectItem value="payment">
                            {t("admin_dashboard.cat_payment")}
                          </SelectItem>
                          <SelectItem value="notification">
                            {t("admin_dashboard.cat_notification")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={settingsForm.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin_dashboard.value")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        data-testid="input-setting-value"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={settingsForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin_dashboard.description")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t(
                          "admin_dashboard.setting_description_placeholder",
                        )}
                        data-testid="input-setting-description"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={createSettingMutation.isPending}
                data-testid="button-create-setting"
              >
                {createSettingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {t("admin_dashboard.add_setting")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {Object.entries(groupedSettings).map(
        ([category, catSettings]: [string, any]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="capitalize">
                {t("admin_dashboard.settings_suffix", { category })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {catSettings.map((setting: any) => (
                  <div
                    key={setting.id}
                    className="flex items-center gap-4 p-3 border rounded-lg"
                    data-testid={`row-setting-${setting.key}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium font-mono text-sm">
                        {setting.key}
                      </p>
                      {setting.description && (
                        <p className="text-xs text-muted-foreground">
                          {setting.description}
                        </p>
                      )}
                    </div>
                    <Input
                      defaultValue={setting.value}
                      className="w-64"
                      onBlur={(e) => {
                        if (e.target.value !== setting.value) {
                          updateSettingMutation.mutate({
                            key: setting.key,
                            value: e.target.value,
                          });
                        }
                      }}
                      data-testid={`input-setting-value-${setting.key}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}

export function StripeSettingsPanel() {
  const { t } = useTranslation();
  const { data: status, isLoading } = useQuery<{
    configured: boolean;
    mode: "live" | "test" | "unknown";
    webhookSecretConfigured: boolean;
    publishableKeyConfigured: boolean;
  }>({
    queryKey: ["/api/admin/stripe/status"],
  });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("admin_dashboard.loading_payment_status")}
      </div>
    );
  }

  const StatusRow = ({
    label,
    ok,
    detail,
  }: {
    label: string;
    ok: boolean;
    detail?: string;
  }) => (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <div className="font-medium text-sm">{label}</div>
        {detail && (
          <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
        )}
      </div>
      {ok ? (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="h-3 w-3 mr-1" />{" "}
          {t("admin_dashboard.configured")}
        </Badge>
      ) : (
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-800 hover:bg-amber-100"
        >
          <XCircle className="h-3 w-3 mr-1" /> {t("admin_dashboard.not_set")}
        </Badge>
      )}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="stripe-settings-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">
            {t("admin_dashboard.stripe_payments")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("admin_dashboard.stripe_intro")}
          </p>
        </div>
        {status?.configured ? (
          <Badge
            className={
              status.mode === "live"
                ? "bg-green-600 text-white hover:bg-green-600"
                : "bg-blue-100 text-blue-800 hover:bg-blue-100"
            }
            data-testid="badge-stripe-mode"
          >
            {status.mode === "live"
              ? t("admin_dashboard.live_mode")
              : status.mode === "test"
              ? t("admin_dashboard.test_mode")
              : t("admin_dashboard.active_mode")}
          </Badge>
        ) : (
          <Badge variant="destructive" data-testid="badge-stripe-disabled">
            {t("admin_dashboard.disabled_mode")}
          </Badge>
        )}
      </div>

      <div className="grid gap-2">
        <StatusRow
          label={t("admin_dashboard.stripe_secret_key")}
          ok={!!status?.configured}
          detail={t("admin_dashboard.stripe_secret_detail")}
        />
        <StatusRow
          label={t("admin_dashboard.stripe_publishable_key")}
          ok={!!status?.publishableKeyConfigured}
          detail={t("admin_dashboard.stripe_publishable_detail")}
        />
        <StatusRow
          label={t("admin_dashboard.webhook_signing_secret")}
          ok={!!status?.webhookSecretConfigured}
          detail={t("admin_dashboard.webhook_secret_detail")}
        />
      </div>

      <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
        <div className="font-medium">{t("admin_dashboard.setup_steps")}</div>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>
            Add <code>STRIPE_SECRET_KEY</code>,{" "}
            <code>VITE_STRIPE_PUBLISHABLE_KEY</code>, and{" "}
            <code>STRIPE_WEBHOOK_SECRET</code> to your environment secrets.
          </li>
          <li>
            In your Stripe dashboard, point a webhook endpoint at:{" "}
            <code className="break-all">
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/stripe/webhook`
                : "/api/stripe/webhook"}
            </code>
          </li>
          <li>
            Subscribe the webhook to: <code>checkout.session.completed</code>,{" "}
            <code>checkout.session.expired</code>,{" "}
            <code>checkout.session.async_payment_succeeded</code>,{" "}
            <code>checkout.session.async_payment_failed</code>.
          </li>
          <li>
            Restart the workflow so the server picks up the new secrets.
          </li>
        </ol>
      </div>

      {!status?.configured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t("admin_dashboard.stripe_warning")}
        </div>
      )}
    </div>
  );
}
