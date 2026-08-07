import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { Loader2, Stethoscope, Eye, EyeOff, ShieldCheck, ArrowLeft, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AccountStatusModal, type AccountStatusKind } from "@/components/account-status-modal";

export default function Login() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const redirectUrl = params.get("redirect") || "/";

  const { login, resendOtp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedModal, setUnverifiedModal] = useState<{
    open: boolean;
    email: string;
    userId?: string;
  }>({ open: false, email: "" });
  const [resending, setResending] = useState(false);
  const [statusModal, setStatusModal] = useState<{
    open: boolean;
    kind: AccountStatusKind;
    reason?: string | null;
    email?: string;
  }>({ open: false, kind: "ACCOUNT_SUSPENDED" });

  // ── MFA challenge state ───────────────────────────────────────────────────
  const [mfaState, setMfaState] = useState<{
    required: boolean;
    mfaToken: string;
    code: string;
    isRecovery: boolean;
    submitting: boolean;
    error: string | null;
  }>({ required: false, mfaToken: "", code: "", isRecovery: false, submitting: false, error: null });

  const loginSchema = z.object({
    email: z.string().email(t("validation.invalid_email")),
    password: z.string().min(6, t("validation.password_min")),
  });

  type LoginFormData = z.infer<typeof loginSchema>;

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleResendCode = async () => {
    if (!unverifiedModal.userId) return;
    setResending(true);
    try {
      await resendOtp(unverifiedModal.userId);
      toast({
        title: t("auth.code_sent", "Verification code sent"),
        description: t("auth.check_email", "Check your inbox for the 6-digit code."),
      });
      navigate(`/verify-email?userId=${unverifiedModal.userId}`);
      setUnverifiedModal({ open: false, email: "" });
    } catch (e: any) {
      toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await login(data.email, data.password);

      // MFA required — show challenge screen
      if (result?.mfaRequired) {
        setMfaState((s) => ({ ...s, required: true, mfaToken: result.mfaToken, error: null }));
        return;
      }

      toast({ title: t("common.welcome_back"), description: t("auth.login_success") });
      navigate(redirectUrl);
    } catch (error: any) {
      const code: string | undefined = error?.code;
      const blockedCodes = new Set([
        "ACCOUNT_SUSPENDED", "PROVIDER_PENDING_APPROVAL",
        "PROVIDER_SUSPENDED", "PROVIDER_REJECTED",
      ]);
      if (code && blockedCodes.has(code)) {
        setStatusModal({ open: true, kind: code as AccountStatusKind, reason: error?.reason ?? null, email: data.email });
      } else if (error.message?.includes("verify your email") || error.details?.isEmailVerified === false) {
        setUnverifiedModal({ open: true, email: data.email, userId: error.details?.userId });
      } else {
        showErrorModal({
          title: t("auth.login_failed"),
          description: error.message || t("auth.invalid_credentials"),
          context: "login.invalidCredentials",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── MFA challenge submit ──────────────────────────────────────────────────
  const handleMfaSubmit = async () => {
    if (!mfaState.code.trim()) return;
    setMfaState((s) => ({ ...s, submitting: true, error: null }));
    try {
      const endpoint = mfaState.isRecovery ? "/api/auth/mfa/recovery" : "/api/auth/mfa/challenge";
      const body = mfaState.isRecovery
        ? { mfa_token: mfaState.mfaToken, recovery_code: mfaState.code.trim() }
        : { mfa_token: mfaState.mfaToken, code: mfaState.code.trim() };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMfaState((s) => ({ ...s, submitting: false, error: data.error || "Invalid code. Try again." }));
        return;
      }

      toast({ title: "Signed in", description: "Welcome back!" });
      navigate(redirectUrl);
    } catch {
      setMfaState((s) => ({ ...s, submitting: false, error: "Network error. Please try again." }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[480px] h-[480px] bg-violet-900/10 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-[560px] h-[560px] bg-violet-900/8 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-[320px] h-[320px] bg-indigo-900/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <AnimatePresence mode="wait">
            {mfaState.required ? (
              // ── MFA Challenge Screen ────────────────────────────────────────────
              <motion.div
                key="mfa"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-8 shadow-2xl">
                  <div className="flex flex-col items-center mb-8">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
                      <ShieldCheck className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="text-2xl tracking-tight font-bold text-zinc-100">
                      Two-Factor Auth
                    </h1>
                    <p className="mt-1.5 text-sm text-zinc-400 text-center">
                      {mfaState.isRecovery
                        ? "Enter one of your backup recovery codes"
                        : "Enter the 6-digit code from your authenticator app"}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-zinc-300 text-sm font-medium block mb-1.5">
                        {mfaState.isRecovery ? "Recovery Code" : "Authentication Code"}
                      </label>
                      <Input
                        autoFocus
                        data-testid="input-mfa-code"
                        value={mfaState.code}
                        onChange={(e) => setMfaState((s) => ({ ...s, code: e.target.value, error: null }))}
                        onKeyDown={(e) => e.key === "Enter" && handleMfaSubmit()}
                        placeholder={mfaState.isRecovery ? "XXXXX-XXXXX" : "000000"}
                        maxLength={mfaState.isRecovery ? 11 : 6}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-violet-500/40 focus-visible:border-violet-500 rounded-lg h-12 text-center text-lg tracking-widest font-mono transition-all duration-200"
                      />
                      {mfaState.error && (
                        <p className="mt-1.5 text-xs text-red-400">{mfaState.error}</p>
                      )}
                    </div>

                    <Button
                      data-testid="button-mfa-verify"
                      onClick={handleMfaSubmit}
                      disabled={mfaState.submitting || !mfaState.code.trim()}
                      className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg h-10 transition-all duration-200 border-0"
                    >
                      {mfaState.submitting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</>
                      ) : "Verify"}
                    </Button>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        data-testid="button-mfa-back"
                        onClick={() => setMfaState((s) => ({ ...s, required: false, code: "", error: null }))}
                        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to login
                      </button>
                      <button
                        type="button"
                        data-testid="button-mfa-use-recovery"
                        onClick={() => setMfaState((s) => ({ ...s, isRecovery: !s.isRecovery, code: "", error: null }))}
                        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {mfaState.isRecovery ? "Use authenticator code" : "Use recovery code"}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              // ── Standard Login Form ─────────────────────────────────────────────
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-8 shadow-2xl transition-all duration-300">
                  <div className="flex flex-col items-center mb-8">
                    <motion.div
                      className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.15, type: "spring", stiffness: 220 }}
                    >
                      <Stethoscope className="h-7 w-7 text-white" />
                    </motion.div>
                    <h1 className="text-2xl tracking-tight font-bold text-zinc-100">
                      {t("common.welcome_back")}
                    </h1>
                    <p className="mt-1.5 text-sm text-zinc-400">
                      {t("auth.signin_description")}
                    </p>
                  </div>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-300 text-sm font-medium">
                              {t("common.email")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="your@email.com"
                                autoComplete="email"
                                autoFocus
                                {...field}
                                data-testid="input-email"
                                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-violet-500/40 focus-visible:border-violet-500 rounded-lg h-10 transition-all duration-200"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-300 text-sm font-medium">
                              {t("common.password")}
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder={t("auth.enter_password")}
                                  autoComplete="current-password"
                                  {...field}
                                  data-testid="input-password"
                                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-violet-500/40 focus-visible:border-violet-500 rounded-lg h-10 pr-10 transition-all duration-200"
                                />
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  aria-label={showPassword ? "Hide password" : "Show password"}
                                  className="absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-8 w-8 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
                                  onClick={() => setShowPassword(!showPassword)}
                                  data-testid="button-toggle-password"
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage className="text-red-400 text-xs" />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end">
                        <Link
                          href="/forgot-password"
                          title={t("common.forgot_password")}
                          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-200"
                          data-testid="link-forgot-password"
                        >
                          {t("common.forgot_password")}
                        </Link>
                      </div>

                      <Button
                        type="submit"
                        disabled={isLoading}
                        data-testid="button-login-submit"
                        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.98] transition-all duration-200 border-0 h-10"
                      >
                        {isLoading ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("common.signing_in")}</>
                        ) : t("common.sign_in")}
                      </Button>
                    </form>
                  </Form>

                  <p className="mt-6 text-center text-sm text-zinc-400">
                    {t("common.no_account")}{" "}
                    <Link
                      href="/register"
                      className="text-zinc-300 hover:text-zinc-100 font-medium underline underline-offset-2 decoration-zinc-600 hover:decoration-zinc-400 transition-colors duration-200"
                      data-testid="link-register"
                    >
                      {t("common.sign_up")}
                    </Link>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      <Footer />

      {/* Unverified email modal */}
      <Dialog open={unverifiedModal.open} onOpenChange={(open) => setUnverifiedModal((s) => ({ ...s, open }))}>
        <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <Mail className="h-5 w-5 text-amber-400" />
              Verify Your Email
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Your account isn't verified yet. Please check your email for a verification code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => setUnverifiedModal({ open: false, email: "" })}
              className="flex-1 border-zinc-700 text-zinc-300"
              data-testid="button-cancel-unverified"
            >
              Cancel
            </Button>
            <Button
              onClick={handleResendCode}
              disabled={resending}
              className="flex-1 bg-violet-600 hover:bg-violet-500"
              data-testid="button-resend-verification"
            >
              {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resend Code"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AccountStatusModal
        open={statusModal.open}
        kind={statusModal.kind}
        reason={statusModal.reason}
        email={statusModal.email}
        onClose={() => setStatusModal((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
