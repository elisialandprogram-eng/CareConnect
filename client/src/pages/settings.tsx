import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { subscribeToPush, unsubscribeFromPush, getPushCapability } from "@/lib/push";
import { Bell, Lock, Shield, Eye, EyeOff, Smartphone, MessageSquare, Mail, Monitor } from "lucide-react";

export default function Settings() {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
    onError: () => toast({ title: "Failed to save preference", variant: "destructive" }),
  });

  const togglePush = async (on: boolean) => {
    try {
      if (on) {
        const r = await subscribeToPush();
        if (!r.ok) {
          toast({ title: "Push not enabled", description: r.reason, variant: "destructive" });
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
      toast({ title: "Push toggle failed", description: e?.message, variant: "destructive" });
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
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
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Notifications</CardTitle>
              </div>
              <CardDescription>Manage how you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">
                      Booking confirmations, reminders, receipts {caps?.email === false && "(server email not configured)"}
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
                    <p className="font-medium">SMS reminders</p>
                    <p className="text-sm text-muted-foreground">
                      Text-message reminders before appointments {caps?.sms === false && "(SMS not configured)"}
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
                    <p className="font-medium">WhatsApp</p>
                    <p className="text-sm text-muted-foreground">
                      Reminders via WhatsApp {caps?.whatsapp === false && "(WhatsApp not configured)"}
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
                    <p className="font-medium">Browser push notifications</p>
                    <p className="text-sm text-muted-foreground">
                      {pushCap.supported
                        ? pushCap.configured
                          ? "Get instant alerts even when this tab is closed"
                          : "Server not configured for push (admin must set VAPID keys)"
                        : "Not supported in this browser"}
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
                    <p className="font-medium">In-app notifications</p>
                    <p className="text-sm text-muted-foreground">Show alerts in the bell icon while you're using GoldenLife</p>
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
                <p className="font-medium mb-2">Quiet hours</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Don't deliver SMS, WhatsApp or push during these hours (HH:MM, 24-hour). Email and in-app still work.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="qhStart" className="text-xs">From</Label>
                    <Input
                      id="qhStart"
                      type="time"
                      data-testid="input-quiet-start"
                      defaultValue={prefs?.quietHoursStart || ""}
                      onBlur={(e) => updatePrefs.mutate({ quietHoursStart: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="qhEnd" className="text-xs">To</Label>
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
                <p className="font-medium mb-2">Language</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Choose the language for emails, SMS and notifications.
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
                <CardTitle className="text-lg">Change Password</CardTitle>
              </div>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPasswords.current ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                      }
                      placeholder="Enter current password"
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
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      }
                      placeholder="Enter new password"
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
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      }
                      placeholder="Confirm new password"
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
                  {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Privacy & Security</CardTitle>
              </div>
              <CardDescription>Manage your privacy settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your data is protected in accordance with our{" "}
                <a href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </a>
                . We use encryption and secure storage to protect your personal information.
              </p>
              <p className="text-sm text-muted-foreground">
                For data access, correction, or deletion requests, please contact us at{" "}
                <a href="mailto:Info@GoldenLife.Health" className="text-primary hover:underline">
                  Info@GoldenLife.Health
                </a>
                {" "}or{" "}
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
