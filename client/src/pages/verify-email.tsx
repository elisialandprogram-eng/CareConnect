import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, RefreshCw } from "lucide-react";
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

  // Get userId from URL or user object
  const searchParams = new URLSearchParams(window.location.search);
  const userId = searchParams.get("userId") || user?.id;

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
      toast({
        variant: "destructive",
        title: t("auth.verify_failed"),
        description: error.message,
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
      toast({
        variant: "destructive",
        title: t("auth.otp_resend_failed"),
        description: error.message,
      });
    } finally {
      setIsResending(false);
    }
  };

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("auth.invalid_link")}</CardTitle>
            <CardDescription>{t("auth.invalid_link_desc")}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => setLocation("/login")}>{t("auth.go_to_login")}</Button>
          </CardFooter>
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
          <CardTitle>{t("auth.verify_email_title")}</CardTitle>
          <CardDescription>
            {t("auth.verify_email_desc")}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleVerify}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">{t("auth.verification_code")}</Label>
              <Input
                id="otp"
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={otp.length !== 6 || isVerifying}
            >
              {isVerifying ? t("auth.verifying") : t("auth.verify_account")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={cooldown > 0 || isResending}
              onClick={handleResend}
            >
              {isResending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {cooldown > 0 ? t("auth.resend_cooldown", { seconds: cooldown }) : t("auth.resend_code")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
