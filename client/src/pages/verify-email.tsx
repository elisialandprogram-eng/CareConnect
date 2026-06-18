import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { Mail, RefreshCw, AlertTriangle, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function VerifyEmail() {
  const { t } = useTranslation();
  const { user, verifyEmail, resendOtp } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Email recovery state — shown when no userId is present in the URL
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [recoveredUserId, setRecoveredUserId] = useState<string | null>(null);

  // Get userId from URL, user object, or recovery
  const searchParams = new URLSearchParams(window.location.search);
  const urlUserId = searchParams.get("userId");
  const userId = urlUserId || recoveredUserId || user?.id || null;

  useEffect(() => {
    if (user?.isEmailVerified) {
      setLocation("/");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setIsVerifying(true);
    try {
      await verifyEmail(userId, otp);
      toast({
        title: t("common.success"),
        description: t("auth.verify_success"),
      });
      setLocation("/login");
    } catch (error: any) {
      showErrorModal({
        title: t("auth.verify_failed"),
        description: error.message,
        context: "verify-email.verify",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!userId || cooldown > 0) return;

    setIsResending(true);
    try {
      await resendOtp(userId);
      toast({
        title: t("auth.otp_resent"),
        description: t("auth.otp_resent_desc"),
      });
      setCooldown(60);
    } catch (error: any) {
      showErrorModal({
        title: t("auth.otp_resend_failed"),
        description: error.message,
        context: "verify-email.resendOtp",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleEmailLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) return;
    setIsLookingUp(true);
    try {
      const res = await fetch("/api/auth/lookup-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: t("common.error", "Error"),
          description: data.message || t("auth.account_not_found_pending"),
          variant: "destructive",
        });
        return;
      }
      setRecoveredUserId(data.userId);
      // Auto-resend so the user gets a fresh code
      await fetch("/api/auth/resend-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.userId }),
      });
      toast({
        title: t("auth.otp_resent"),
        description: t("auth.otp_resent_desc"),
      });
      setCooldown(60);
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("auth.account_not_found_pending"),
        variant: "destructive",
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  // No userId yet — show email recovery form
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle>{t("auth.email_recovery_title")}</CardTitle>
            <CardDescription>{t("auth.email_recovery_desc")}</CardDescription>
          </CardHeader>
          <form onSubmit={handleEmailLookup}>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                {t("auth.registration_incomplete")} {t("auth.verify_to_activate")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-email">{t("common.email")}</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  placeholder="your@email.com"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isLookingUp}>
                {isLookingUp ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("auth.email_recovery_submit")}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setLocation("/login")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("auth.back_to_login")}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t("auth.verify_email_title", "Verify Your Email")}</CardTitle>
          <CardDescription>
            {t("auth.verify_email_desc", "We've sent a 6-digit verification code to your email. Please enter it below to verify your account.")}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleVerify}>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium">{t("auth.registration_incomplete")}</p>
              <p className="mt-0.5">{t("auth.verify_to_activate")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="otp">{t("auth.verification_code", "Verification Code")}</Label>
              <Input
                id="otp"
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                autoFocus
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={otp.length !== 6 || isVerifying}
            >
              {isVerifying ? t("auth.verifying", "Verifying...") : t("auth.verify_account", "Verify Account")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={cooldown > 0 || isResending}
              onClick={handleResend}
            >
              {isResending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {cooldown > 0 ? t("auth.resend_cooldown", { seconds: cooldown }) : t("auth.resend_code", "Resend Code")}
            </Button>
            <div className="flex gap-2 w-full">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 text-sm"
                onClick={() => setLocation("/register")}
              >
                {t("auth.change_email")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex-1 text-sm"
                onClick={() => setLocation("/login")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {t("auth.back_to_login")}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
