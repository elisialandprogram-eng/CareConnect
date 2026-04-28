import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupportTicketSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ContactForm() {
  const { toast } = useToast();
  const { t } = useTranslation();
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
      toast({
        title: t("contact.message_sent"),
        description: t("contact.message_sent_desc"),
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: t("contact.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <section className="py-20 bg-background" id="contact">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 dark:from-violet-300 dark:via-purple-300 dark:to-fuchsia-300 bg-clip-text text-transparent">{t("contact.title")}</h2>
            <p className="text-muted-foreground">{t("contact.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{t("contact.email_us")}</h4>
                  <div className="flex flex-col">
                    <p className="text-muted-foreground">Info@GoldenLife.Health</p>
                    <p className="text-muted-foreground">Admin@GoldenLife.Health</p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{t("contact.call_us")}</h4>
                  <p className="text-muted-foreground">+36702370103</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{t("contact.visit_us")}</h4>
                  <p className="text-muted-foreground">Hungary, 3060 Pásztó, Semmelweis utca 10</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
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
                                className="min-h-[120px]"
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
                        className="w-full"
                        disabled={mutation.isPending}
                        data-testid="button-contact-submit"
                      >
                        {mutation.isPending ? t("contact.sending") : t("contact.send_message")}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
