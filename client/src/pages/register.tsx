import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Stethoscope, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";

export default function Register() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const roleParam = params.get("role") as "patient" | "provider" | null;
  
  const { register } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const registerSchema = z.object({
    firstName: z.string().min(2, t("validation.first_name_min")),
    lastName: z.string().min(2, t("validation.last_name_min")),
    email: z.string().email(t("validation.invalid_email")),
    phone: z.string().optional(),
    password: z.string().min(6, t("validation.password_min")),
    confirmPassword: z.string().min(6, t("validation.confirm_password")),
    role: z.enum(["patient", "provider"]),
    treatmentConsent: z.boolean().refine(v => v === true, { message: "Required" }),
    privacyConsent: z.boolean().refine(v => v === true, { message: "Required" }),
    telemedicineConsent: z.boolean().refine(v => v === true, { message: "Required" }),
    termsConsent: z.boolean().refine(v => v === true, { message: "Required" }),
    declarationConsent: z.boolean().refine(v => v === true, { message: "Required" }),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t("validation.passwords_match"),
    path: ["confirmPassword"],
  });

  type RegisterFormData = z.infer<typeof registerSchema>;

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: roleParam || "patient",
      treatmentConsent: false,
      privacyConsent: false,
      telemedicineConsent: false,
      termsConsent: false,
      declarationConsent: false,
    },
  });

  const selectedRole = form.watch("role");

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      const result = (await register(data)) as any;
      if (!result) throw new Error("Registration failed");
      
      // Submit consent after successful registration
      if (data.role === "patient") {
        const consentTypes = [
          { type: "treatment", accepted: data.treatmentConsent },
          { type: "privacy", accepted: data.privacyConsent },
          { type: "telemedicine", accepted: data.telemedicineConsent },
          { type: "terms", accepted: data.termsConsent },
          { type: "declaration", accepted: data.declarationConsent },
        ];

        await Promise.all(
          consentTypes.map((c) =>
            apiRequest("POST", "/api/consents", {
              userId: result.id,
              consentType: c.type,
              isAccepted: c.accepted,
              language: "en",
              consentTextVersion: "1.0",
            })
          )
        );
      }

      toast({
        title: t("common.account_created"),
        description: t("common.check_email_verify"),
      });
      // Correctly use navigate with the route to the verification page
      navigate(`/verify-email?userId=${result.id}`);
    } catch (error: any) {
      toast({
        title: t("auth.login_failed"),
        description: error.message || t("auth.invalid_credentials"),
        variant: "destructive",
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
        >
          <Card className={`w-full backdrop-blur-sm bg-card/95 shadow-xl border-2 transition-all duration-300 ${selectedRole === "provider" ? "max-w-2xl" : "max-w-md"}`}>
            <CardHeader className="text-center">
              <motion.div 
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-lg"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                <Stethoscope className="h-7 w-7 text-primary-foreground" />
              </motion.div>
              <CardTitle className="text-2xl font-bold">{t("common.create_account")}</CardTitle>
              <CardDescription>
                {t("common.join_golden_life")}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("common.first_name")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="John"
                              {...field}
                              data-testid="input-first-name"
                            />
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
                            <Input
                              placeholder="Doe"
                              {...field}
                              data-testid="input-last-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {selectedRole === "patient" && (
                    <div className="space-y-4 border-t pt-4">
                      <p className="text-sm font-semibold">Consents & Authorizations</p>
                      <FormField
                        control={form.control}
                        name="treatmentConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-xs">I consent to receive medical treatment.</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="privacyConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-xs">I consent to the collection and processing of my data.</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="telemedicineConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-xs">I consent to receive telemedicine services.</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="termsConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-xs">I agree to the Terms & Conditions.</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="declarationConsent"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-xs">I confirm and submit my consent.</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.email")}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            {...field}
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.phone_optional")}</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="+36 70 123 4567"
                            {...field}
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.i_am_a")}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-role">
                              <SelectValue placeholder="Select your role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="patient">{t("common.patient_looking")}</SelectItem>
                            <SelectItem value="provider">{t("common.healthcare_provider")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedRole === "provider" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-4 pt-4 border-t"
                    >
                      <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                        <p className="text-sm text-primary font-medium flex items-center">
                          <Stethoscope className="h-4 w-4 mr-2" />
                          {t("common.professional_info")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("common.provider_onboarding_desc")}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  <div className={`grid gap-4 ${selectedRole === "provider" ? "md:grid-cols-2" : "grid-cols-1"}`}>
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("common.password")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Create a password"
                                {...field}
                                data-testid="input-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

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
                                placeholder="Confirm your password"
                                {...field}
                                data-testid="input-confirm-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              >
                                {showConfirmPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                    data-testid="button-register-submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("auth.creating_account")}
                      </>
                    ) : (
                      t("common.create_account")
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                {t("common.already_account")}{" "}
                <Link href="/login" className="text-primary hover:underline font-medium" data-testid="link-login">
                  {t("common.sign_in")}
                </Link>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
