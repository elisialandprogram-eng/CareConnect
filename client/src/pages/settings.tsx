import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { subscribeToPush, unsubscribeFromPush, getPushCapability } from "@/lib/push";
import { Bell, Lock, Shield, Eye, EyeOff, Smartphone, MessageSquare, Mail, Monitor } from "lucide-react";

export default function Settings() {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [pushCap, setPushCap] = useState<{ supported: boolean; configured: boolean }>({ supported: false, configured: false });
  const [pushSubscribed, setPushSubscribed] = useState(false);

  const { data: prefs } = useQuery<any>({ queryKey: ["/api/notification-preferences"], enabled: isAuthenticated });
  const { data: caps } = useQuery<any>({ queryKey: ["/api/comms/capabilities"] });

  useEffect(() => {
    getPushCapability().then((c) => setPushCap({ supported: c.supported, configured: c.configured }));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setPushSubscribed(!!sub);
      });
    }
  }, []);

  const updatePrefs = useMutation({
    mutationFn: async (patch: Record<string, any>) => apiRequest("PATCH", "/api/notification-preferences", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] }),
    onError: () => showErrorModal({ title: "Failed to save preference", context: "settings.updatePrefs" }),
  });

  const togglePush = async (on: boolean) => {
    try {
      if (on) {
        const r = await subscribeToPush();
        if (!r.ok) {
          showErrorModal({ title: "Push not enabled", description: r.reason, context: "settings.subscribePush" });
          return;
        }
        setPushSubscribed(true);
        updatePrefs.mutate({ pushEnabled: true });
        toast({ title: "Push notifications enabled" });
      } else {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        updatePrefs.mutate({ pushEnabled: false });
        toast({ title: "Push notifications disabled" });
      }
    } catch (e: any) {
      showErrorModal({ title: "Push toggle failed", description: e?.message, context: "settings.togglePush" });
    }
  };

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const changePasswordMutation = useMutation({
    mutationFn: async (data: typeof passwordForm) => {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to change password");
      }
      return response.json();
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      showErrorModal({
        title: "Couldn't change password",
        description: error.message,
        context: "settings.changePassword",
      });
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showErrorModal({
        title: "Passwords don't match",
        description: "New passwords do not match.",
        context: "settings.passwordMismatch",
      });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showErrorModal({
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
        context: "settings.passwordTooShort",
      });
      return;
    }
    changePasswordMutation.mutate(passwordForm);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-96 w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-8">{t("settings_page.title")}</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{t("settings_page.notifications_title")}</CardTitle>
              </div>
              <CardDescription>{t("settings_page.notifications_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{t("settings_page.email")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("settings_page.email_desc")} {caps?.email === false && t("settings_page.email_not_configured")}
                    </p>
                  </div>
                </div>
                <Switch
                  data-testid="switch-email"
                  checked={prefs?.emailEnabled !== false}
                  disabled={caps?.email === false}
                  onCheckedChange={(c) => updatePrefs.mutate({ emailEnabled: c })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{t("settings_page.sms")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("settings_page.sms_desc")} {caps?.sms === false && t("settings_page.sms_not_configured")}
                    </p>
                  </div>
                </div>
                <Switch
                  data-testid="switch-sms"
                  checked={!!prefs?.smsEnabled}
                  disabled={caps?.sms === false}
                  onCheckedChange={(c) => updatePrefs.mutate({ smsEnabled: c })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{t("settings_page.whatsapp")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("settings_page.whatsapp_desc")} {caps?.whatsapp === false && t("settings_page.whatsapp_not_configured")}
                    </p>
                  </div>
                </div>
                <Switch
                  data-testid="switch-whatsapp"
                  checked={!!prefs?.whatsappEnabled}
                  disabled={caps?.whatsapp === false}
                  onCheckedChange={(c) => updatePrefs.mutate({ whatsappEnabled: c })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <Smartphone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{t("settings_page.push")}</p>
                    <p className="text-sm text-muted-foreground">
                      {pushCap.supported
                        ? pushCap.configured
                          ? t("settings_page.push_desc")
                          : t("settings_page.push_not_configured")
                        : t("settings_page.push_not_supported")}
                    </p>
                  </div>
                </div>
                <Switch
                  data-testid="switch-push"
                  checked={pushSubscribed}
                  disabled={!pushCap.supported || !pushCap.configured}
                  onCheckedChange={togglePush}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <Monitor className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{t("settings_page.in_app")}</p>
                    <p className="text-sm text-muted-foreground">{t("settings_page.in_app_desc")}</p>
                  </div>
                </div>
                <Switch
                  data-testid="switch-inapp"
                  checked={prefs?.inAppEnabled !== false}
                  onCheckedChange={(c) => updatePrefs.mutate({ inAppEnabled: c })}
                />
              </div>
              <Separator />
              <div>
                <p className="font-medium mb-2">{t("settings_page.quiet_hours")}</p>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("settings_page.quiet_hours_desc")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="qhStart" className="text-xs">{t("settings_page.from")}</Label>
                    <Input
                      id="qhStart"
                      type="time"
                      data-testid="input-quiet-start"
                      defaultValue={prefs?.quietHoursStart || ""}
                      onBlur={(e) => updatePrefs.mutate({ quietHoursStart: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="qhEnd" className="text-xs">{t("settings_page.to")}</Label>
                    <Input
                      id="qhEnd"
                      type="time"
                      data-testid="input-quiet-end"
                      defaultValue={prefs?.quietHoursEnd || ""}
                      onBlur={(e) => updatePrefs.mutate({ quietHoursEnd: e.target.value || null })}
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <p className="font-medium mb-2">{t("settings_page.language")}</p>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("settings_page.language_desc")}
                </p>
                <select
                  data-testid="select-language"
                  className="w-full border border-input rounded-md h-10 px-3 bg-background"
                  defaultValue={prefs?.language || "en"}
                  onChange={(e) => updatePrefs.mutate({ language: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="hu">Magyar (Hungarian)</option>
                  <option value="fa">فارسی (Persian)</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{t("settings_page.change_password_title")}</CardTitle>
              </div>
              <CardDescription>{t("settings_page.change_password_desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t("settings_page.current_password")}</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPasswords.current ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                      }
                      placeholder={t("settings_page.current_password_placeholder")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, current: !showPasswords.current })
                      }
                    >
                      {showPasswords.current ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t("settings_page.new_password")}</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      }
                      placeholder={t("settings_page.new_password_placeholder")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, new: !showPasswords.new })
                      }
                    >
                      {showPasswords.new ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("settings_page.confirm_password")}</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      }
                      placeholder={t("settings_page.confirm_password_placeholder")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })
                      }
                    >
                      {showPasswords.confirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? t("settings_page.updating") : t("settings_page.update_password")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{t("settings_page.privacy_title")}</CardTitle>
              </div>
              <CardDescription>{t("settings_page.privacy_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("settings_page.privacy_paragraph_1_before")}{" "}
                <a href="/privacy" className="text-primary hover:underline">
                  {t("settings_page.privacy_policy_link")}
                </a>
                {t("settings_page.privacy_paragraph_1_after")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("settings_page.privacy_contact_intro")}{" "}
                <a href="mailto:Info@GoldenLife.Health" className="text-primary hover:underline">
                  Info@GoldenLife.Health
                </a>
                {" "}{t("settings_page.or")}{" "}
                <a href="mailto:Admin@GoldenLife.Health" className="text-primary hover:underline">
                  Admin@GoldenLife.Health
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
