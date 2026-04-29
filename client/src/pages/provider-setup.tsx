import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  CheckCircle2,
  User,
  Shield,
  MapPin,
  FileCheck,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Clock,
  UserRound,
  Building2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { id: 1, label: "Profile", icon: User, description: "Professional information" },
  { id: 2, label: "Credentials", icon: Shield, description: "Licensing details" },
  { id: 3, label: "Location", icon: MapPin, description: "Where you work" },
  { id: 4, label: "Agreements", icon: FileCheck, description: "Review & finish" },
];

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hungarian", label: "Magyar" },
  { value: "german", label: "German" },
  { value: "french", label: "French" },
  { value: "spanish", label: "Spanish" },
  { value: "arabic", label: "Arabic" },
  { value: "farsi", label: "Farsi" },
  { value: "chinese", label: "Chinese" },
  { value: "hindi", label: "Hindi" },
];

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional(),
);

const providerSetupSchema = z.object({
  accountType: z.enum(["individual", "clinic"]).optional().default("individual"),
  // Clinic / organization fields (only required when accountType === "clinic")
  clinicName: z.string().optional(),
  clinicRegistrationNumber: z.string().optional(),
  contactPersonName: z.string().optional(),
  businessAddress: z.string().optional(),
  supportEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  supportPhone: z.string().optional(),
  type: z.enum(["physiotherapist", "doctor", "nurse"]).optional().default("physiotherapist"),
  professionalTitle: z.string().optional(),
  specialization: z.string().optional(),
  bio: z.string().optional(),
  yearsExperience: optionalNumber,
  education: z.string().optional(),
  languages: z.array(z.string()).optional(),
  affiliatedHospital: z.string().optional(),
  licenseNumber: z.string().optional(),
  licensingAuthority: z.string().optional(),
  licenseExpiryDate: z.string().optional(),
  nationalProviderId: z.string().optional(),
  malpracticeCoverage: z.string().optional(),
  primaryServiceLocation: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  workingHoursStart: z.string().optional().default("09:00"),
  workingHoursEnd: z.string().optional().default("18:00"),
  preferredContactMethod: z.enum(["email", "phone", "both"]).optional().default("email"),
  emergencyContact: z.string().optional(),
  providerAgreementAccepted: z.boolean().optional().default(false),
  dataProcessingAgreementAccepted: z.boolean().optional().default(false),
  telemedicineAgreementAccepted: z.boolean().optional().default(false),
  codeOfConductAccepted: z.boolean().optional().default(false),
});

type ProviderSetupFormData = z.infer<typeof providerSetupSchema>;

function CheckboxGroup({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (val: string[]) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {options.map((opt) => {
        const checked = value?.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              const next = checked
                ? value.filter((v) => v !== opt.value)
                : [...(value || []), opt.value];
              onChange(next);
            }}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 text-left ${
              checked
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 transition-colors ${
                checked ? "bg-primary border-primary" : "border-muted-foreground/40"
              }`}
            >
              {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ProviderSetup() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { toast } = useToast();

  const initialStep = (() => {
    try {
      const params = new URLSearchParams(searchStr);
      const s = parseInt(params.get("step") || "1", 10);
      return s >= 1 && s <= 4 ? s : 1;
    } catch {
      return 1;
    }
  })();

  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);

  const form = useForm<ProviderSetupFormData>({
    resolver: zodResolver(providerSetupSchema),
    defaultValues: {
      accountType: "individual",
      clinicName: "",
      clinicRegistrationNumber: "",
      contactPersonName: "",
      businessAddress: "",
      supportEmail: "",
      supportPhone: "",
      type: "physiotherapist",
      professionalTitle: "",
      specialization: "",
      bio: "",
      yearsExperience: undefined,
      education: "",
      languages: ["english"],
      affiliatedHospital: "",
      licenseNumber: "",
      licensingAuthority: "",
      licenseExpiryDate: "",
      nationalProviderId: "",
      malpracticeCoverage: "",
      primaryServiceLocation: "",
      city: "",
      state: "",
      country: "Hungary",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      preferredContactMethod: "email",
      emergencyContact: "",
      providerAgreementAccepted: false,
      dataProcessingAgreementAccepted: false,
      telemedicineAgreementAccepted: false,
      codeOfConductAccepted: false,
    },
  });

  const { data: existingProvider } = useQuery<any>({
    queryKey: ["/api/provider/me"],
    retry: false,
  });

  useEffect(() => {
    if (existingProvider) {
      const toStr = (v: any) => (v == null ? "" : String(v));
      const toArr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
      const toNum = (v: any) => (v == null || v === "" ? undefined : Number(v));

      let expiryStr = "";
      if (existingProvider.licenseExpiryDate) {
        try {
          expiryStr = new Date(existingProvider.licenseExpiryDate).toISOString().slice(0, 10);
        } catch {
          expiryStr = "";
        }
      }

      form.reset({
        accountType: (existingProvider.accountType === "clinic" ? "clinic" : "individual"),
        clinicName: toStr(existingProvider.clinicName),
        clinicRegistrationNumber: toStr(existingProvider.clinicRegistrationNumber),
        contactPersonName: toStr(existingProvider.contactPersonName),
        businessAddress: toStr(existingProvider.businessAddress),
        supportEmail: toStr(existingProvider.supportEmail),
        supportPhone: toStr(existingProvider.supportPhone),
        type: existingProvider.type || "physiotherapist",
        professionalTitle: toStr(existingProvider.professionalTitle),
        specialization: toStr(existingProvider.specialization),
        bio: toStr(existingProvider.bio),
        yearsExperience: toNum(existingProvider.yearsExperience),
        education: toStr(existingProvider.education),
        languages: toArr(existingProvider.languages).length
          ? toArr(existingProvider.languages)
          : ["english"],
        affiliatedHospital: toStr(existingProvider.affiliatedHospital),
        licenseNumber: toStr(existingProvider.licenseNumber),
        licensingAuthority: toStr(existingProvider.licensingAuthority),
        licenseExpiryDate: expiryStr,
        nationalProviderId: toStr(existingProvider.nationalProviderId),
        malpracticeCoverage: toStr(existingProvider.malpracticeCoverage),
        primaryServiceLocation: toStr(existingProvider.primaryServiceLocation),
        city: toStr(existingProvider.city),
        state: toStr(existingProvider.state),
        country: toStr(existingProvider.country) || "Hungary",
        timezone:
          toStr(existingProvider.timezone) ||
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        workingHoursStart: toStr(existingProvider.workingHoursStart) || "09:00",
        workingHoursEnd: toStr(existingProvider.workingHoursEnd) || "18:00",
        preferredContactMethod: existingProvider.preferredContactMethod || "email",
        emergencyContact: toStr(existingProvider.emergencyContact),
        providerAgreementAccepted: !!existingProvider.providerAgreementAccepted,
        dataProcessingAgreementAccepted: !!existingProvider.dataProcessingAgreementAccepted,
        telemedicineAgreementAccepted: !!existingProvider.telemedicineAgreementAccepted,
        codeOfConductAccepted: !!existingProvider.codeOfConductAccepted,
      });
    }
  }, [existingProvider]);

  const setupMutation = useMutation({
    mutationFn: async (data: ProviderSetupFormData) => {
      const response = await apiRequest("POST", "/api/provider/setup", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Setup failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: existingProvider ? "Profile updated!" : "Profile submitted for review!",
        description: existingProvider
          ? "Your provider profile has been updated."
          : "Your profile is pending admin approval. You'll be notified once approved.",
      });
      navigate("/provider/dashboard");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Setup failed",
        description: error.message,
      });
    },
  });

  const goNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, 4));
  };

  const goPrev = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  };

  const onSubmit = (data: ProviderSetupFormData) => {
    setupMutation.mutate(data);
  };

  const currentStepInfo = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 dark:from-slate-950 dark:via-blue-950/20 dark:to-indigo-950/10 flex flex-col">
      <Header />

      <main className="flex-1 py-8 px-4">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              {existingProvider ? "Update your profile" : "Provider Onboarding"}
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {existingProvider ? "Edit Provider Profile" : "Set Up Your Provider Profile"}
            </h1>
            <p className="text-muted-foreground text-sm">
              All fields are optional — fill in what you have and update later anytime.
            </p>
          </div>

          {/* Step Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between relative">
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-border z-0">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${((step - 1) / 3) * 100}%` }}
                />
              </div>
              {STEPS.map((s) => {
                const Icon = s.icon;
                const isDone = s.id < step;
                const isCurrent = s.id === step;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setDirection(s.id > step ? 1 : -1);
                      setStep(s.id);
                    }}
                    className="flex flex-col items-center gap-1 z-10 group"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${
                        isDone
                          ? "bg-primary border-primary text-primary-foreground"
                          : isCurrent
                          ? "bg-background border-primary text-primary shadow-md shadow-primary/20"
                          : "bg-background border-border text-muted-foreground group-hover:border-primary/50"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:block ${
                        isCurrent
                          ? "text-primary"
                          : isDone
                          ? "text-primary/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step Card */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: direction * 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -40 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border shadow-sm overflow-hidden">
                    {/* Card Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <currentStepInfo.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">
                            {currentStepInfo.label}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            {currentStepInfo.description}
                          </p>
                        </div>
                        <Badge variant="outline" className="ml-auto text-xs text-muted-foreground">
                          Step {step} of 4
                        </Badge>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-6 space-y-5">

                      {/* ── STEP 1: Professional Profile ── */}
                      {step === 1 && (
                        <>
                          {/* Account Type chooser — Individual vs Clinic */}
                          <FormField
                            control={form.control}
                            name="accountType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Account Type</FormLabel>
                                <FormDescription className="text-xs">
                                  Choose how you want to register. Clinics can host multiple practitioners; services for clinics are assigned by the GoldenLife admin team.
                                </FormDescription>
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                  {[
                                    { value: "individual", label: "Individual practitioner", desc: "I'm a single practitioner offering my own services.", Icon: UserRound },
                                    { value: "clinic", label: "Clinic / organization", desc: "We're a clinic with multiple practitioners.", Icon: Building2 },
                                  ].map((opt) => {
                                    const active = field.value === opt.value;
                                    const Icon = opt.Icon;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => field.onChange(opt.value)}
                                        data-testid={`button-account-type-${opt.value}`}
                                        className={`text-left rounded-xl border p-4 transition-all ${
                                          active
                                            ? "border-primary bg-primary/10 shadow-sm"
                                            : "border-border bg-background hover:border-primary/40"
                                        }`}
                                      >
                                        <div className="flex items-start gap-3">
                                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                            <Icon className="w-4 h-4" />
                                          </div>
                                          <div className="min-w-0">
                                            <p className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </FormItem>
                            )}
                          />

                          {/* Clinic-specific identity fields */}
                          {form.watch("accountType") === "clinic" && (
                            <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                                <Building2 className="w-4 h-4" />
                                Clinic information
                              </div>
                              <FormField
                                control={form.control}
                                name="clinicName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-sm font-medium">Clinic Name</FormLabel>
                                    <FormControl>
                                      <Input placeholder="e.g. Budapest Wellness Clinic" {...field} className="rounded-xl" data-testid="input-clinic-name" />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="clinicRegistrationNumber"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-medium">Registration Number</FormLabel>
                                      <FormControl>
                                        <Input placeholder="Business / clinic reg. no." {...field} className="rounded-xl" data-testid="input-clinic-registration" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="contactPersonName"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-medium">Contact Person</FormLabel>
                                      <FormControl>
                                        <Input placeholder="Primary contact at the clinic" {...field} className="rounded-xl" data-testid="input-contact-person" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                              <FormField
                                control={form.control}
                                name="businessAddress"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-sm font-medium">Business Address</FormLabel>
                                    <FormControl>
                                      <Input placeholder="Street, city, country" {...field} className="rounded-xl" data-testid="input-business-address" />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="supportEmail"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-medium">Support Email</FormLabel>
                                      <FormControl>
                                        <Input type="email" placeholder="info@clinic.com" {...field} className="rounded-xl" data-testid="input-support-email" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="supportPhone"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-medium">Support Phone</FormLabel>
                                      <FormControl>
                                        <Input placeholder="+36 …" {...field} className="rounded-xl" data-testid="input-support-phone" />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                After approval, you'll be able to add practitioners on your dashboard. Services available to your clinic are assigned by the GoldenLife admin team — you'll then assign your practitioners to those services.
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="professionalTitle"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Professional Title</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Dr., RN, PT…" {...field} className="rounded-xl" data-testid="input-professional-title" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="type"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Provider Type</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger className="rounded-xl" data-testid="select-provider-type">
                                        <SelectValue placeholder="Select type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="physiotherapist">Physiotherapist</SelectItem>
                                      <SelectItem value="doctor">Doctor</SelectItem>
                                      <SelectItem value="nurse">Home Nurse</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="specialization"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Specialization</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. Cardiology, Sports Therapy…"
                                    {...field}
                                    className="rounded-xl"
                                    data-testid="input-specialization"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="yearsExperience"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Years of Experience</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={60}
                                      placeholder="e.g. 5"
                                      {...field}
                                      value={field.value ?? ""}
                                      className="rounded-xl"
                                      data-testid="input-experience"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="education"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Education</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g. MD Budapest"
                                      {...field}
                                      className="rounded-xl"
                                      data-testid="input-education"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="bio"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">About You</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Tell patients about your background and approach…"
                                    className="min-h-28 rounded-xl resize-none"
                                    {...field}
                                    data-testid="input-bio"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="affiliatedHospital"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Affiliated Hospital / Clinic</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. Budapest General Hospital"
                                    {...field}
                                    className="rounded-xl"
                                    data-testid="input-affiliated-hospital"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="languages"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Languages Spoken</FormLabel>
                                <CheckboxGroup
                                  options={LANGUAGE_OPTIONS}
                                  value={field.value || []}
                                  onChange={field.onChange}
                                  columns={3}
                                />
                                <FormDescription className="text-xs">
                                  Select all languages you can consult in.
                                </FormDescription>
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {/* ── STEP 2: Credentials ── */}
                      {step === 2 && (
                        <>
                          <FormField
                            control={form.control}
                            name="licenseNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">License Number</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. HU-MED-12345"
                                    {...field}
                                    className="rounded-xl"
                                    data-testid="input-license-number"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="licensingAuthority"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Licensing Authority</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. Hungarian Medical Chamber"
                                    {...field}
                                    className="rounded-xl"
                                    data-testid="input-licensing-authority"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="licenseExpiryDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">License Expiry Date</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} className="rounded-xl" data-testid="input-license-expiry" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="nationalProviderId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">National Provider ID</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="NPI / PESEL…"
                                      {...field}
                                      className="rounded-xl"
                                      data-testid="input-national-provider-id"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={form.control}
                            name="malpracticeCoverage"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Malpractice Coverage</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Insurance provider / policy number"
                                    {...field}
                                    className="rounded-xl"
                                    data-testid="input-malpractice"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {/* ── STEP 3: Location & Hours ── */}
                      {step === 3 && (
                        <>
                          <FormField
                            control={form.control}
                            name="primaryServiceLocation"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Work Address / Primary Location</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Street address or clinic name"
                                    {...field}
                                    className="rounded-xl"
                                    data-testid="input-location"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-3 gap-3">
                            <FormField
                              control={form.control}
                              name="city"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">City</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Budapest"
                                      {...field}
                                      value={typeof field.value === "string" ? field.value : ""}
                                      className="rounded-xl"
                                      data-testid="input-city"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="state"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">State / Province</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Pest" {...field} className="rounded-xl" data-testid="input-state" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="country"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Country</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Hungary" {...field} className="rounded-xl" data-testid="input-country" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="timezone"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Timezone</FormLabel>
                                  <FormControl>
                                    <Input {...field} className="rounded-xl" data-testid="input-timezone" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="preferredContactMethod"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Preferred Contact</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger className="rounded-xl" data-testid="select-contact-method">
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="email">Email</SelectItem>
                                      <SelectItem value="phone">Phone</SelectItem>
                                      <SelectItem value="both">Both</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="workingHoursStart"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" /> Working Hours Start
                                  </FormLabel>
                                  <FormControl>
                                    <Input type="time" {...field} className="rounded-xl" data-testid="input-hours-start" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="workingHoursEnd"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" /> Working Hours End
                                  </FormLabel>
                                  <FormControl>
                                    <Input type="time" {...field} className="rounded-xl" data-testid="input-hours-end" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="emergencyContact"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Emergency Contact Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="+36 …" {...field} className="rounded-xl" data-testid="input-emergency-contact" />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {/* ── STEP 4: Agreements ── */}
                      {step === 4 && (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Review and accept the agreements below. These are optional — you can update them later from your settings.
                          </p>
                          {[
                            {
                              name: "providerAgreementAccepted" as const,
                              title: "Provider Service Agreement",
                              desc: "I agree to the terms and conditions of the GoldenLife Provider Agreement.",
                            },
                            {
                              name: "dataProcessingAgreementAccepted" as const,
                              title: "Data Processing Agreement (GDPR)",
                              desc: "I consent to the processing of patient and personal data in accordance with applicable privacy laws.",
                            },
                            {
                              name: "telemedicineAgreementAccepted" as const,
                              title: "Telemedicine Services Agreement",
                              desc: "I agree to the rules and clinical standards governing telemedicine consultations.",
                            },
                            {
                              name: "codeOfConductAccepted" as const,
                              title: "Code of Professional Conduct",
                              desc: "I commit to maintaining the highest standards of professional conduct and patient care.",
                            },
                          ].map(({ name, title, desc }) => (
                            <FormField
                              key={name}
                              control={form.control}
                              name={name}
                              render={({ field }) => (
                                <FormItem>
                                  <label
                                    htmlFor={`agreement-${name}`}
                                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                                      field.value
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-primary/30"
                                    }`}
                                  >
                                    <Checkbox
                                      id={`agreement-${name}`}
                                      checked={!!field.value}
                                      onCheckedChange={(checked) => field.onChange(checked === true)}
                                      className="mt-0.5"
                                      data-testid={`checkbox-${name}`}
                                    />
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">{title}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                                    </div>
                                  </label>
                                </FormItem>
                              )}
                            />
                          ))}

                          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
                            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                              Your profile will be reviewed by our team before going live. You'll be notified once approved. While pending, you can continue to set up services and availability in your dashboard.
                            </p>
                          </div>
                        </>
                      )}

                      {/* Navigation Buttons */}
                      <div className="flex gap-3 pt-2">
                        {step > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 rounded-xl gap-2"
                            onClick={goPrev}
                            data-testid="button-back"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                          </Button>
                        )}

                        {step < 4 ? (
                          <Button
                            type="button"
                            className="flex-1 rounded-xl gap-2"
                            onClick={goNext}
                            data-testid={`button-next-${step}`}
                          >
                            Continue
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            className="flex-1 rounded-xl gap-2 bg-gradient-to-r from-primary to-primary/80"
                            disabled={setupMutation.isPending}
                            data-testid="button-submit-setup"
                          >
                            {setupMutation.isPending ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {existingProvider ? "Updating…" : "Submitting…"}
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                {existingProvider ? "Update Profile" : "Submit for Review"}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </form>
          </Form>
        </div>
      </main>
    </div>
  );
}
