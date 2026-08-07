import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2, Eye, EyeOff, ShieldCheck, Stethoscope,
  BadgeCheck, Lock, Sparkles, CheckCircle2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";

function getPasswordStrength(pw: string): { level: 0 | 1 | 2 | 3; key: string } {
  if (pw.length < 6) return { level: 0, key: "strength_weak" };
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  if (pw.length >= 8 && hasUpper && hasDigit && hasSpecial) return { level: 3, key: "strength_strong" };
  if (hasUpper && hasDigit) return { level: 2, key: "strength_good" };
  return { level: 1, key: "strength_fair" };
}

export default function Register() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const roleParam = params.get("role") as "patient" | "provider" | null;
  const refParam = params.get("ref")?.trim() || "";

  const { register } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralCode] = useState(refParam);
  const [referrerName, setReferrerName] = useState<string | null>(null);

  useEffect(() => {
    if (!referralCode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/referrals/lookup/${encodeURIComponent(referralCode)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.valid) setReferrerName(data.referrerName || null);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [referralCode]);

  const registerSchema = z.object({
    firstName: z.string().min(2, t("validation.first_name_min")),
    lastName: z.string().min(2, t("validation.last_name_min")),
    email: z.string().email(t("validation.invalid_email")),
    password: z.string().min(6, t("validation.password_min")),
    confirmPassword: z.string().min(6, t("validation.confirm_password")),
    role: z.enum(["patient", "provider"]),
    countryCode: z.enum(["HU", "IR"]),
    treatmentConsent: z.boolean().default(false),
    privacyConsent: z.boolean().default(false),
    telemedicineConsent: z.boolean().default(false),
    termsConsent: z.boolean().default(false),
    declarationConsent: z.boolean().default(false),
  }).refine((d) => d.password === d.confirmPassword, {
    message: t("validation.passwords_match"),
    path: ["confirmPassword"],
  }).refine((d) => {
    if (d.role === "patient") {
      return d.treatmentConsent && d.privacyConsent && d.telemedicineConsent && d.termsConsent && d.declarationConsent;
    }
    return true;
  }, { message: "Required", path: ["declarationConsent"] });

  type RegisterFormData = z.infer<typeof registerSchema>;

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "", lastName: "", email: "",
      password: "", confirmPassword: "",
      role: roleParam || "patient",
      countryCode: "HU",
      treatmentConsent: false, privacyConsent: false,
      telemedicineConsent: false, termsConsent: false, declarationConsent: false,
    },
  });

  const selectedRole = form.watch("role");

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      const payload = referralCode ? { ...data, referralCode } : data;
      const result = (await register(payload as any)) as any;
      if (!result) throw new Error("Registration failed");

      if (result.verification_required) {
        toast({ title: t("auth.otp_resent"), description: t("auth.otp_resent_desc") });
        navigate(`/verify-email?userId=${result.userId}`);
        return;
      }

      const newUser = result.user;
      if (!newUser) throw new Error("Registration failed");

      if (data.role === "patient") {
        const consentTypes = [
          { type: "treatment", accepted: data.treatmentConsent },
          { type: "privacy", accepted: data.privacyConsent },
          { type: "telemedicine", accepted: data.telemedicineConsent },
          { type: "terms", accepted: data.termsConsent },
          { type: "declaration", accepted: data.declarationConsent },
        ];
        await Promise.all(consentTypes.map((c) =>
          apiRequest("POST", "/api/consents", {
            userId: newUser.id, consentType: c.type,
            isAccepted: c.accepted, language: "en", consentTextVersion: "1.0",
          })
        ));
      }

      toast({ title: t("common.account_created"), description: t("common.check_email_verify") });
      navigate(`/verify-email?userId=${newUser.id}`);
    } catch (error: any) {
      showErrorModal({
        title: t("auth.login_failed"),
        description: error.message || t("auth.invalid_credentials"),
        context: "register.submit",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4 relative overflow-hidden">
        <div className="absolute inset-0 animated-gradient -z-10" />
        <motion.div
          className="absolute top-10 left-10 w-80 h-80 bg-primary/20 rounded-full blur-3xl -z-10"
          animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-72 h-72 bg-primary/15 rounded-full blur-3xl -z-10"
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.2, 0.35, 0.2] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="backdrop-blur-sm bg-card/95 shadow-xl border-2">
            <CardHeader className="text-center pb-4">
              <motion.div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-lg"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                <Stethoscope className="h-7 w-7 text-primary-foreground" />
              </motion.div>
              <CardTitle className="text-2xl font-bold">{t("common.create_account")}</CardTitle>
              <CardDescription>{t("common.join_golden_life")}</CardDescription>
              {referrerName && (
                <div
                  className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  data-testid="badge-referred-by"
                >
                  <span>🎉</span>
                  <span>Referred by {referrerName} — wallet bonus on your first appointment</span>
                </div>
              )}
            </CardHeader>

            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                  {/* Role selector */}
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.i_am_a")}</FormLabel>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: "patient", label: "Patient", icon: "👤" },
                            { value: "provider", label: "Healthcare Provider", icon: "🩺" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => field.onChange(opt.value)}
                              data-testid={`button-role-${opt.value}`}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                field.value === opt.value
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              <span>{opt.icon}</span>
                              <span>{opt.label}</span>
                            </button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Full name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("common.first_name")}</FormLabel>
                          <FormControl>
                            <Input placeholder="Jane" autoFocus {...field} data-testid="input-first-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("common.last_name")}</FormLabel>
                          <FormControl>
                            <Input placeholder="Smith" {...field} data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Email */}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.email")}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="your@email.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Country */}
                  <FormField
                    control={form.control}
                    name="countryCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("country.label")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue placeholder={t("country.placeholder")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="HU">🇭🇺 {t("country.hungary")}</SelectItem>
                            <SelectItem value="IR">🇮🇷 {t("country.iran")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Password */}
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => {
                      const strength = getPasswordStrength(field.value || "");
                      const strengthColors = ["bg-destructive", "bg-yellow-500", "bg-blue-500", "bg-emerald-500"];
                      const strengthTextColors = ["text-destructive", "text-yellow-600", "text-blue-600", "text-emerald-600"];
                      const showStrength = (field.value || "").length > 0;
                      return (
                        <FormItem>
                          <FormLabel>{t("common.password")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder={t("auth.create_password_placeholder")}
                                autoComplete="new-password"
                                {...field}
                                data-testid="input-password"
                                className="pr-10"
                              />
                              <button
                                type="button" tabIndex={-1}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                onClick={() => setShowPassword(!showPassword)}
                                data-testid="button-toggle-password"
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          {showStrength && (
                            <div className="space-y-1 mt-1" data-testid="password-strength">
                              <div className="flex gap-1">
                                {[0, 1, 2, 3].map((i) => (
                                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.level ? strengthColors[strength.level] : "bg-muted"}`} />
                                ))}
                              </div>
                              <p className={`text-xs font-medium flex items-center gap-1 ${strengthTextColors[strength.level]}`}>
                                {strength.level === 3 && <ShieldCheck className="h-3 w-3" />}
                                {t("auth.password_strength")}: {t(`auth.${strength.key}`)}
                              </p>
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {/* Confirm Password */}
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.confirm_password")}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder={t("auth.confirm_password_placeholder")}
                              autoComplete="new-password"
                              {...field}
                              data-testid="input-confirm-password"
                              className="pr-10"
                            />
                            <button
                              type="button" tabIndex={-1}
                              aria-label={showConfirmPassword ? "Hide" : "Show"}
                              className="absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              data-testid="button-toggle-confirm-password"
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Provider: premium clinical workspace panel */}
                  {selectedRole === "provider" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-primary/5 to-indigo-500/5 p-5">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">Verify your email to unlock your clinical workspace</p>
                            <p className="text-xs text-muted-foreground mt-0.5">You'll complete your full professional profile after signing in</p>
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {[
                            { icon: BadgeCheck, text: "Set your professional credentials & license details" },
                            { icon: Lock, text: "Submit for compliance review — typically 1–3 business days" },
                            { icon: CheckCircle2, text: "Get approved and start accepting patient bookings" },
                          ].map(({ icon: Icon, text }, i) => (
                            <div key={i} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                              <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span>{text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Patient consents */}
                  {selectedRole === "patient" && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{t("auth.consents_authorizations")}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("auth.consents_intro")}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            form.setValue("treatmentConsent", true);
                            form.setValue("privacyConsent", true);
                            form.setValue("telemedicineConsent", true);
                            form.setValue("termsConsent", true);
                            form.setValue("declarationConsent", true);
                            form.clearErrors(["treatmentConsent","privacyConsent","telemedicineConsent","termsConsent","declarationConsent"]);
                          }}
                          className="shrink-0 text-xs font-semibold text-primary hover:text-primary/80 hover:underline transition-colors mt-0.5"
                          data-testid="button-accept-all-consents"
                        >
                          {t("auth.accept_all_consents")}
                        </button>
                      </div>
                      {form.formState.errors.declarationConsent && (
                        <p className="text-xs text-destructive font-medium" data-testid="consent-group-error">
                          {t("auth.consent_required_error")}
                        </p>
                      )}
                      {(["treatmentConsent","privacyConsent","telemedicineConsent","termsConsent","declarationConsent"] as const).map((name) => (
                        <FormField
                          key={name}
                          control={form.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid={`checkbox-${name}`} />
                              </FormControl>
                              <FormLabel className="text-xs font-normal leading-snug cursor-pointer">
                                {t(`auth.consent_${name.replace("Consent","")}`)}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  )}

                  <Button type="submit" className="w-full font-semibold" disabled={isLoading} data-testid="button-register">
                    {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating account…</> : t("common.create_account")}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    {t("common.already_have_account")}{" "}
                    <Link href="/login" className="font-medium text-primary hover:underline" data-testid="link-login">
                      {t("common.sign_in")}
                    </Link>
                  </p>
                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
