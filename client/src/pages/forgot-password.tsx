import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Stethoscope, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

type ForgotPasswordFormData = { email: string };

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const forgotPasswordSchema = z.object({
    email: z.string().email(t("public_pages.forgot_email_invalid")),
  });

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/forgot-password", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t("public_pages.forgot_send_failed"));
      }
      setIsSent(true);
      toast({
        title: t("public_pages.forgot_code_sent_toast"),
        description: t("public_pages.forgot_code_sent_desc"),
      });
    } catch (error: any) {
      showErrorModal({
        title: t("public_pages.forgot_send_error"),
        description: error.message || t("public_pages.forgot_send_failed"),
        context: "forgot-password.sendCode",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteReset = async () => {
    if (!resetCode || !newPassword) {
      toast({ title: t("public_pages.forgot_error"), description: t("public_pages.forgot_fill_fields"), variant: "destructive" });
      return;
    }

    setIsResetting(true);
    try {
      const response = await apiRequest("POST", "/api/auth/complete-reset-password", {
        email: form.getValues("email"),
        code: resetCode,
        newPassword
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t("public_pages.forgot_reset_failed"));
      }

      toast({
        title: t("public_pages.forgot_success"),
        description: t("public_pages.forgot_success_desc"),
      });
      navigate("/login");
    } catch (error: any) {
      showErrorModal({
        title: t("public_pages.forgot_reset_error"),
        description: error.message || t("public_pages.forgot_reset_failed"),
        context: "forgot-password.completeReset",
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (isSent) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-12 px-4 relative overflow-hidden">
          <div className="absolute inset-0 animated-gradient -z-10" />
          <Card className="w-full max-w-md backdrop-blur-sm bg-card/95 shadow-xl border-2">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900 shadow-lg">
                <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl font-bold">{t("public_pages.forgot_check_email")}</CardTitle>
              <CardDescription>
                {t("public_pages.forgot_code_sent", { email: form.getValues("email") })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("public_pages.forgot_reset_code")}</Label>
                <Input 
                  placeholder={t("public_pages.forgot_code_placeholder")}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  maxLength={6}
                  data-testid="input-reset-code"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("public_pages.forgot_new_password")}</Label>
                <Input 
                  type="password"
                  placeholder={t("public_pages.forgot_password_placeholder")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
              </div>
              <Button 
                onClick={handleCompleteReset} 
                className="w-full"
                disabled={isResetting}
                data-testid="button-complete-reset"
              >
                {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isResetting ? t("public_pages.forgot_resetting") : t("public_pages.forgot_reset")}
              </Button>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button variant="ghost" onClick={() => setIsSent(false)} className="w-full">
                {t("public_pages.forgot_back")}
              </Button>
            </CardFooter>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center py-12 px-4 relative overflow-hidden">
        <div className="absolute inset-0 animated-gradient -z-10" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="w-full max-w-md backdrop-blur-sm bg-card/95 shadow-xl border-2">
            <CardHeader className="text-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute left-4 top-4" 
                onClick={() => navigate("/login")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("public_pages.forgot_back_login")}
              </Button>
              <motion.div 
                className="mx-auto mb-4 mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-lg"
              >
                <Stethoscope className="h-7 w-7 text-primary-foreground" />
              </motion.div>
              <CardTitle className="text-2xl font-bold">{t("public_pages.forgot_title")}</CardTitle>
              <CardDescription>
                {t("public_pages.forgot_description")}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("public_pages.forgot_email")}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="email"
                              placeholder="your@email.com"
                              className="pl-10"
                              {...field}
                              data-testid="input-email"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                    data-testid="button-forgot-password-submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending Link...
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
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
