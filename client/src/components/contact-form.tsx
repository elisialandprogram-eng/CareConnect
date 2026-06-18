import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupportTicketSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorModal } from "@/components/error-modal";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin, CheckCircle2, Loader2, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ContactForm() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm({
    resolver: zodResolver(insertSupportTicketSchema),
    defaultValues: {
      name: "",
      mobileNumber: "",
      location: "",
      subject: "",
      description: "",
      priority: "medium",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await apiRequest("POST", "/api/support/tickets", values);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: t("contact.unknown_error") }));
        throw new Error(errorData.message || t("contact.send_failed"));
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      form.reset();
    },
    onError: (error: Error) => {
      showErrorModal({
        title: t("contact.error"),
        description: error.message,
        context: "contact-form.submit",
      });
    },
  });

  return (
    <section className="py-20 bg-background" id="contact">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 dark:from-violet-300 dark:via-purple-300 dark:to-fuchsia-300 bg-clip-text text-transparent">
              {t("contact.title")}
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">{t("contact.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* ── Contact info ── */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              {[
                {
                  icon: Mail,
                  title: t("contact.email_us"),
                  lines: ["Info@GoldenLife.Health", "Admin@GoldenLife.Health"],
                },
                {
                  icon: Phone,
                  title: t("contact.call_us"),
                  lines: ["+36702370103"],
                },
                {
                  icon: MapPin,
                  title: t("contact.visit_us"),
                  lines: ["Hungary, 3060 Pásztó, Semmelweis utca 10"],
                },
              ].map(({ icon: Icon, title, lines }) => (
                <div key={title} className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm mb-0.5">{title}</h4>
                    {lines.map(line => (
                      <p key={line} className="text-muted-foreground text-sm">{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* ── Form / Success ── */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              {submitted ? (
                <Card className="h-full">
                  <CardContent className="pt-6 h-full flex flex-col items-center justify-center text-center gap-4 py-16">
                    <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
                      <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">{t("contact.message_sent")}</h3>
                      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                        {t("contact.message_sent_desc")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubmitted(false)}
                      className="mt-2"
                      data-testid="button-contact-send-another"
                    >
                      {t("contact.send_another", "Send another message")}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("contact.full_name")}</FormLabel>
                                <FormControl>
                                  <Input placeholder={t("contact.full_name_placeholder")} {...field} data-testid="input-contact-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="mobileNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("contact.mobile_number")}</FormLabel>
                                <FormControl>
                                  <Input placeholder={t("contact.mobile_placeholder")} {...field} data-testid="input-contact-mobile" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("contact.location")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("contact.location_placeholder")} {...field} data-testid="input-contact-location" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="subject"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("contact.subject")}</FormLabel>
                              <FormControl>
                                <Input placeholder={t("contact.subject_placeholder")} {...field} data-testid="input-contact-subject" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("contact.message")}</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder={t("contact.message_placeholder")}
                                  className="min-h-[120px] resize-none"
                                  {...field}
                                  data-testid="input-contact-description"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="submit"
                          className="w-full gap-2"
                          disabled={mutation.isPending}
                          data-testid="button-contact-submit"
                        >
                          {mutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {t("contact.sending")}
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4" />
                              {t("contact.send_message")}
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
