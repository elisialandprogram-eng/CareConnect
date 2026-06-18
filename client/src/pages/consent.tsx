import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPatientConsentSchema } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Download, Globe } from "lucide-react";

const consentText = {
  en: {
    title: "Patient Consent & Authorization",
    subtitle: "By registering with Golden Life Health Care, I voluntarily provide my consent and authorization.",
    treatmentTitle: "1. Consent to Medical Treatment",
    treatmentBody: "I consent to receive medical care and treatment from licensed healthcare professionals affiliated with Golden Life Health Care. This may include medical examinations, diagnostic procedures, consultations, and treatments deemed necessary based on professional medical judgment. I understand that the nature and purpose of treatments will be explained, no guarantees are made, and I have the right to withdraw consent.",
    treatmentLabel: "I consent to receive medical treatment.",
    privacyTitle: "2. Privacy & Data Protection Consent",
    privacyBody: "I acknowledge and agree that Golden Life Health Care may collect, store, process, and use my personal and medical information for healthcare delivery, administrative purposes, and legal compliance. My data will be handled securely and confidentially, and not shared without consent except as required by law.",
    privacyLabel: "I consent to the collection and processing of my personal and medical data.",
    telemedicineTitle: "3. Telemedicine Consent",
    telemedicineBody: "I consent to participate in telemedicine services, including virtual consultations. I understand telemedicine involves digital technologies, has limitations, and does not replace in-person care when physical examination is required.",
    telemedicineLabel: "I consent to receive telemedicine services.",
    termsTitle: "4. Terms & Conditions Acceptance",
    termsBody: "I confirm that I have read, understood, and agree to comply with the Terms & Conditions of Golden Life Health Care. I am responsible for providing accurate information.",
    termsLabel: "I agree to the Terms & Conditions.",
    declarationTitle: "5. Patient Declaration & Confirmation",
    declarationBody: "By submitting this form, I confirm all information is accurate, I am authorized to give consent, and my consent is voluntary.",
    declarationLabel: "I confirm and submit my consent.",
    submit: "Submit Consent",
    download: "Download Consent",
    history: "Consent History",
    language: "Language",
  },
  hu: {
    title: "Betegbeleegyezés és felhatalmazás",
    subtitle: "A Golden Life Health Care-nél történő regisztrációval önkéntesen adom beleegyezésemet és felhatalmazásomat.",
    treatmentTitle: "1. Beleegyezés az orvosi kezelésbe",
    treatmentBody: "Hozzájárulok ahhoz, hogy a Golden Life Health Care-hez kapcsolódó engedéllyel rendelkező egészségügyi szakemberektől orvosi ellátást és kezelést kapjak...",
    treatmentLabel: "Beleegyezem az orvosi kezelésbe.",
    privacyTitle: "2. Adatvédelmi nyilatkozat",
    privacyBody: "Tudomásul veszem és elfogadom, hogy a Golden Life Health Care gyűjtheti, tárolhatja és feldolgozhatja személyes és orvosi adataimat...",
    privacyLabel: "Hozzájárulok személyes és orvosi adataim gyűjtéséhez és feldolgozásához.",
    telemedicineTitle: "3. Telemedicina beleegyezés",
    telemedicineBody: "Hozzájárulok a Golden Life Health Care által kínált telemedicina szolgáltatások igénybevételéhez...",
    telemedicineLabel: "Beleegyezem a telemedicina szolgáltatások igénybevételébe.",
    termsTitle: "4. Általános Szerződési Feltételek elfogadása",
    termsBody: "Megerősítem, hogy elolvastam, megértettem és elfogadom a Golden Life Health Care Általános Szerződési Feltételeit.",
    termsLabel: "Elfogadom az Általános Szerződési Feltételeket.",
    declarationTitle: "5. Betegnyilatkozat és megerősítés",
    declarationBody: "Az űrlap elküldésével megerősítem, hogy minden megadott információ pontos...",
    declarationLabel: "Megerősítem és elküldöm a beleegyezésemet.",
    submit: "Beleegyezés beküldése",
    download: "Beleegyezés letöltése",
    history: "Beleegyezési előzmények",
    language: "Nyelv",
  },
  fa: {
    title: "رضایت و مجوز بیمار",
    subtitle: "با ثبت نام در Golden Life Health Care، من داوطلبانه رضایت و مجوز خود را به شرح زیر ارائه می دهم.",
    treatmentTitle: "۱. رضایت برای درمان پزشکی",
    treatmentBody: "من با دریافت مراقبت‌های پزشکی و درمان از متخصصان دارای مجوز وابسته به Golden Life Health Care موافقت می‌کنم...",
    treatmentLabel: "من با دریافت درمان پزشکی موافقت می‌کنم.",
    privacyTitle: "۲. رضایت حریم خصوصی و حفاظت از داده‌ها",
    privacyBody: "من تأیید و موافقت می‌کنم که Golden Life Health Care ممکن است اطلاعات شخصی و پزشکی من را جمع‌آوری، ذخیره و پردازش کند...",
    privacyLabel: "من با جمع‌آوری و پردازش داده‌های شخصی و پزشکی خود موافقت می‌کنم.",
    telemedicineTitle: "۳. رضایت پزشکی از راه دور",
    telemedicineBody: "من با شرکت در خدمات پزشکی از راه دور ارائه شده توسط Golden Life Health Care موافقت می‌کنم...",
    telemedicineLabel: "من با دریافت خدمات پزشکی از راه دور موافقت می‌کنم.",
    termsTitle: "۴. پذیرش شرایط و ضوابط",
    termsBody: "من تأیید می‌کنم که شرایط و ضوابط Golden Life Health Care را خوانده، درک کرده و با آن‌ها موافقت می‌کنم.",
    termsLabel: "من با شرایط و ضوابط موافقت می‌کنم.",
    declarationTitle: "۵. اظهارنامه و تأیید بیمار",
    declarationBody: "با ارسال این فرم، من تأیید می‌کنم که تمام اطلاعات ارائه شده دقیق است...",
    declarationLabel: "من رضایت خود را تأیید و ارسال می‌کنم.",
    submit: "ارسال رضایت",
    download: "دانلود رضایت‌نامه",
    history: "تاریخچه رضایت‌ها",
    language: "زبان",
  }
};

type SupportedLang = "en" | "hu" | "fa";
const SUPPORTED_LANGS: SupportedLang[] = ["en", "hu", "fa"];

function resolveConsentLang(lng: string): SupportedLang {
  const base = (lng || "en").split("-")[0] as SupportedLang;
  return SUPPORTED_LANGS.includes(base) ? base : "en";
}

export default function ConsentPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  // Part 5: Initialize from global i18n language (single source of truth).
  // This keeps the consent page in sync with the language the user chose in
  // the header or profile settings — no separate language drift.
  const [lang, setLang] = useState<SupportedLang>(() =>
    resolveConsentLang(i18n.resolvedLanguage || i18n.language)
  );
  const isRtl = lang === "fa";

  // Sync when global language changes externally (header switcher, profile save)
  useEffect(() => {
    const handler = (lng: string) => setLang(resolveConsentLang(lng));
    i18n.on("languageChanged", handler);
    return () => { i18n.off("languageChanged", handler); };
  }, [i18n]);

  const { data: consents, isLoading: isLoadingHistory } = useQuery<any[]>({
    queryKey: QK.consents(),
  });

  const form = useForm({
    resolver: zodResolver(insertPatientConsentSchema),
    defaultValues: {
      treatmentConsent: false,
      privacyConsent: false,
      telemedicineConsent: false,
      termsConsent: false,
      declarationConsent: false,
      language: "en",
      consentTextVersion: "1.0",
      userId: user?.id || ""
    },
  });

  useEffect(() => {
    form.setValue("language", lang);
  }, [lang, form]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/consents", data);
    },
    onSuccess: () => {
      toast({
        title: t("consent_page.toast_submitted_title"),
        description: t("consent_page.toast_submitted_desc"),
      });
      queryClient.invalidateQueries({ queryKey: QK.consents() });
    },
    onError: (error: Error) => {
      showErrorModal({
        title: t("consent_page.toast_error_title"),
        description: error.message,
        context: "consent.submit",
      });
    }
  });

  const onSubmit = (data: any) => {
    if (!data.treatmentConsent || !data.privacyConsent || !data.telemedicineConsent || !data.termsConsent || !data.declarationConsent) {
      toast({ title: t("consent_page.toast_required_title"), description: t("consent_page.toast_required_desc"), variant: "destructive" });
      return;
    }
    mutation.mutate(data);
  };

  const downloadConsent = (consent: any) => {
    const ct = consentText[lang as keyof typeof consentText];
    const text = `
    ${ct.title}
    Version: ${consent.consentTextVersion}
    Date: ${new Date(consent.consentedAt).toLocaleString()}
    IP: ${consent.ipAddress}
    
    1. Treatment: ${consent.treatmentConsent ? "CONSENTED" : "DECLINED"}
    2. Privacy: ${consent.privacyConsent ? "CONSENTED" : "DECLINED"}
    3. Telemedicine: ${consent.telemedicineConsent ? "CONSENTED" : "DECLINED"}
    4. Terms: ${consent.termsConsent ? "CONSENTED" : "DECLINED"}
    5. Declaration: ${consent.declarationConsent ? "CONSENTED" : "DECLINED"}
    `;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consent-${consent.id}.txt`;
    a.click();
  };

  // Auth guard — redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login?redirect=/consent");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const ct = consentText[lang];

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-[600px] w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
    <div className={`container mx-auto py-8 px-4 max-w-4xl ${isRtl ? "rtl" : "ltr"}`} dir={isRtl ? "rtl" : "ltr"}>
      <PageBreadcrumbs
        items={[
          { label: t("nav.home", "Home"), href: "/" },
          { label: t("nav.settings", "Settings"), href: "/settings" },
          { label: t("consent_page.breadcrumb", "Patient Consent") },
        ]}
        fallback="/settings"
      />
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-bold">{ct.title}</CardTitle>
            <CardDescription className="mt-2">{ct.subtitle}</CardDescription>
          </div>
          {/* Part 5: Language switcher also updates global i18n so all other pages stay in sync */}
          <Select value={lang} onValueChange={(v: any) => {
            setLang(v);
            void i18n.changeLanguage(v);
          }}>
            <SelectTrigger className="w-[140px]">
              <Globe className="me-2 h-4 w-4" />
              <SelectValue placeholder={ct.language} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="hu">Magyar</SelectItem>
              <SelectItem value="fa">فارسی</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <ScrollArea className="h-[500px] pr-4 rounded-md border p-4">
                <div className="space-y-6">
                  <section>
                    <h3 className="text-lg font-semibold mb-2">{ct.treatmentTitle}</h3>
                    <p className="text-muted-foreground mb-4">{ct.treatmentBody}</p>
                    <FormField
                      control={form.control}
                      name="treatmentConsent"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>{ct.treatmentLabel}</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </section>

                  <section>
                    <h3 className="text-lg font-semibold mb-2">{ct.privacyTitle}</h3>
                    <p className="text-muted-foreground mb-4">{ct.privacyBody}</p>
                    <FormField
                      control={form.control}
                      name="privacyConsent"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>{ct.privacyLabel}</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </section>

                  <section>
                    <h3 className="text-lg font-semibold mb-2">{ct.telemedicineTitle}</h3>
                    <p className="text-muted-foreground mb-4">{ct.telemedicineBody}</p>
                    <FormField
                      control={form.control}
                      name="telemedicineConsent"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>{ct.telemedicineLabel}</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </section>

                  <section>
                    <h3 className="text-lg font-semibold mb-2">{ct.termsTitle}</h3>
                    <p className="text-muted-foreground mb-4">{ct.termsBody}</p>
                    <FormField
                      control={form.control}
                      name="termsConsent"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>{ct.termsLabel}</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </section>

                  <section>
                    <h3 className="text-lg font-semibold mb-2">{ct.declarationTitle}</h3>
                    <p className="text-muted-foreground mb-4">{ct.declarationBody}</p>
                    <FormField
                      control={form.control}
                      name="declarationConsent"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>{ct.declarationLabel}</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </section>
                </div>
              </ScrollArea>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {ct.submit}
              </Button>
            </form>
          </Form>
        </CardContent>
        {consents && consents.length > 0 && (
          <CardFooter className="flex flex-col items-start gap-4 border-t pt-6">
            <h3 className="font-semibold">{ct.history}</h3>
            <div className="w-full space-y-2">
              {consents.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 border rounded-md">
                  <div className="text-sm">
                    <p className="font-medium">{new Date(c.consentedAt).toLocaleDateString()}</p>
                    <p className="text-muted-foreground text-xs">v{c.consentTextVersion} • {c.ipAddress}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => downloadConsent(c)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
      </main>
      <Footer />
    </div>
  );
}
