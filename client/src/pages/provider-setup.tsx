import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
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
  FormMessage,
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
  Stethoscope,
  CheckCircle2,
  User,
  Shield,
  MapPin,
  DollarSign,
  Calendar,
  FileCheck,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import type { SubService } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { id: 1, label: "Profile", icon: User, description: "Professional information" },
  { id: 2, label: "Credentials", icon: Shield, description: "Licensing details" },
  { id: 3, label: "Location", icon: MapPin, description: "Where you work" },
  { id: 4, label: "Pricing", icon: DollarSign, description: "Fees & contact" },
  { id: 5, label: "Availability", icon: Calendar, description: "Days & patients" },
  { id: 6, label: "Agreements", icon: FileCheck, description: "Review & finish" },
];

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional(),
);

const practitionerSchema = z.object({
  name: z.string().optional(),
  designation: z.string().optional(),
  dob: z.string().optional(),
  originCountry: z.string().optional(),
  registrationNumber: z.string().optional(),
  identityNumber: z.string().optional(),
  mobileNumber: z.string().optional(),
});

const providerSetupSchema = z.object({
  type: z.enum(["physiotherapist", "doctor", "nurse"]).optional().default("physiotherapist"),
  professionalTitle: z.string().optional(),
  specialization: z.string().optional(),
  subServices: z.array(z.string()).optional(),
  bio: z.string().optional(),
  yearsExperience: optionalNumber,
  education: z.string().optional(),
  languages: z.array(z.string()).optional(),
  licenseNumber: z.string().optional(),
  licensingAuthority: z.string().optional(),
  licenseExpiryDate: z.string().optional(),
  nationalProviderId: z.string().optional(),
  ageGroupsServed: z.array(z.string()).optional(),
  preferredContactMethod: z.enum(["email", "phone", "both"]).optional().default("email"),
  availableDays: z.array(z.string()).optional(),
  workingHoursStart: z.string().optional().default("09:00"),
  workingHoursEnd: z.string().optional().default("18:00"),
  maxPatientsPerDay: optionalNumber,
  timezone: z.string().optional(),
  primaryServiceLocation: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  serviceRadiusKm: optionalNumber,
  consultationFee: optionalNumber,
  homeVisitFee: optionalNumber,
  telemedicineFee: optionalNumber,
  emergencyCareFee: optionalNumber,
  currency: z.string().optional().default("HUF"),
  paymentMethods: z.array(z.string()).optional(),
  malpracticeCoverage: z.string().optional(),
  providerAgreementAccepted: z.boolean().optional().default(false),
  dataProcessingAgreementAccepted: z.boolean().optional().default(false),
  telemedicineAgreementAccepted: z.boolean().optional().default(false),
  codeOfConductAccepted: z.boolean().optional().default(false),
  affiliatedHospital: z.string().optional(),
  onCallAvailability: z.boolean().optional().default(false),
  emergencyContact: z.string().optional(),
  practitioners: z.array(practitionerSchema).optional(),
});

type ProviderSetupFormData = z.infer<typeof providerSetupSchema>;

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

const DAY_OPTIONS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const AGE_GROUPS = [
  { value: "infants", label: "Infants (0–2)" },
  { value: "children", label: "Children (3–12)" },
  { value: "teens", label: "Teens (13–17)" },
  { value: "adults", label: "Adults (18–64)" },
  { value: "seniors", label: "Seniors (65+)" },
];

const PAYMENT_METHODS = [
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "insurance", label: "Insurance" },
];

function CheckboxGroup({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (val: string[]) => void;
  columns?: number;
}) {
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
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
      return s >= 1 && s <= 6 ? s : 1;
    } catch { return 1; }
  })();
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);

  const form = useForm<ProviderSetupFormData>({
    resolver: zodResolver(providerSetupSchema),
    defaultValues: {
      type: "physiotherapist",
      professionalTitle: "",
      specialization: "",
      subServices: [],
      bio: "",
      yearsExperience: undefined,
      education: "",
      languages: ["english"],
      licenseNumber: "",
      licensingAuthority: "",
      licenseExpiryDate: "",
      nationalProviderId: "",
      ageGroupsServed: ["adults"],
      availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      maxPatientsPerDay: undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      primaryServiceLocation: "",
      city: "",
      state: "",
      country: "Hungary",
      serviceRadiusKm: undefined,
      consultationFee: undefined,
      homeVisitFee: undefined,
      telemedicineFee: undefined,
      emergencyCareFee: undefined,
      currency: "HUF",
      paymentMethods: ["card"],
      malpracticeCoverage: "",
      preferredContactMethod: "email",
      providerAgreementAccepted: false,
      dataProcessingAgreementAccepted: false,
      telemedicineAgreementAccepted: false,
      codeOfConductAccepted: false,
      affiliatedHospital: "",
      onCallAvailability: false,
      emergencyContact: "",
      practitioners: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "practitioners",
  });

  const selectedType = form.watch("type");

  const subServicesUrl = selectedType ? `/api/sub-services?category=${selectedType}` : null;
  const { data: subServicesData = [] } = useQuery<SubService[]>({
    queryKey: ["/api/sub-services", selectedType],
    queryFn: () => fetch(subServicesUrl!, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedType && !!subServicesUrl,
    staleTime: 0,
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
        type: existingProvider.type || "physiotherapist",
        professionalTitle: toStr(existingProvider.professionalTitle),
        specialization: toStr(existingProvider.specialization),
        subServices: toArr(existingProvider.subServices),
        bio: toStr(existingProvider.bio),
        yearsExperience: toNum(existingProvider.yearsExperience),
        education: toStr(existingProvider.education),
        languages: toArr(existingProvider.languages).length ? toArr(existingProvider.languages) : ["english"],
        licenseNumber: toStr(existingProvider.licenseNumber),
        licensingAuthority: toStr(existingProvider.licensingAuthority),
        licenseExpiryDate: expiryStr,
        nationalProviderId: toStr(existingProvider.nationalProviderId),
        ageGroupsServed: toArr(existingProvider.ageGroupsServed).length ? toArr(existingProvider.ageGroupsServed) : ["adults"],
        preferredContactMethod: existingProvider.preferredContactMethod || "email",
        availableDays: toArr(existingProvider.availableDays).length ? toArr(existingProvider.availableDays) : ["monday", "tuesday", "wednesday", "thursday", "friday"],
        workingHoursStart: toStr(existingProvider.workingHoursStart) || "09:00",
        workingHoursEnd: toStr(existingProvider.workingHoursEnd) || "18:00",
        maxPatientsPerDay: toNum(existingProvider.maxPatientsPerDay),
        timezone: toStr(existingProvider.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone,
        primaryServiceLocation: toStr(existingProvider.primaryServiceLocation),
        city: toStr(existingProvider.city),
        state: toStr(existingProvider.state),
        country: toStr(existingProvider.country) || "Hungary",
        serviceRadiusKm: toNum(existingProvider.serviceRadiusKm),
        consultationFee: toNum(existingProvider.consultationFee),
        homeVisitFee: toNum(existingProvider.homeVisitFee),
        telemedicineFee: toNum(existingProvider.telemedicineFee),
        emergencyCareFee: toNum(existingProvider.emergencyCareFee),
        currency: toStr(existingProvider.currency) || "HUF",
        paymentMethods: toArr(existingProvider.paymentMethods).length ? toArr(existingProvider.paymentMethods) : ["card"],
        malpracticeCoverage: toStr(existingProvider.malpracticeCoverage),
        providerAgreementAccepted: !!existingProvider.providerAgreementAccepted,
        dataProcessingAgreementAccepted: !!existingProvider.dataProcessingAgreementAccepted,
        telemedicineAgreementAccepted: !!existingProvider.telemedicineAgreementAccepted,
        codeOfConductAccepted: !!existingProvider.codeOfConductAccepted,
        affiliatedHospital: toStr(existingProvider.affiliatedHospital),
        onCallAvailability: !!existingProvider.onCallAvailability,
        emergencyContact: toStr(existingProvider.emergencyContact),
        practitioners: [],
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
        title: existingProvider ? "Profile updated!" : "Profile created!",
        description: "Your provider profile is now live.",
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
    setStep((s) => Math.min(s + 1, 6));
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
                  style={{ width: `${((step - 1) / 5) * 100}%` }}
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
                        isCurrent ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground"
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
                          Step {step} of 6
                        </Badge>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-6 space-y-5">

                      {/* ── STEP 1: Professional Profile ── */}
                      {step === 1 && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="professionalTitle"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Professional Title</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Dr., RN, PT…" {...field} className="rounded-xl" />
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
                                  <Input placeholder="e.g. Cardiology, Sports Therapy…" {...field} className="rounded-xl" data-testid="input-specialization" />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          {subServicesData.length > 0 && (
                            <FormField
                              control={form.control}
                              name="subServices"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Sub-services</FormLabel>
                                  <CheckboxGroup
                                    options={subServicesData.map((s) => ({ value: s.name, label: s.name }))}
                                    value={field.value || []}
                                    onChange={field.onChange}
                                    columns={2}
                                  />
                                  <FormDescription className="text-xs">Select services you offer.</FormDescription>
                                </FormItem>
                              )}
                            />
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="yearsExperience"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Years of Experience</FormLabel>
                                  <FormControl>
                                    <Input type="number" min={0} max={60} placeholder="e.g. 5" {...field} value={field.value ?? ""} className="rounded-xl" data-testid="input-experience" />
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
                                    <Input placeholder="e.g. MD Budapest" {...field} className="rounded-xl" data-testid="input-education" />
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
                                  <Input placeholder="e.g. Budapest General Hospital" {...field} className="rounded-xl" />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          {/* Practitioners */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Team Members</p>
                                <p className="text-xs text-muted-foreground">For clinics — add practitioners in your team.</p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl gap-1.5"
                                onClick={() => append({ name: "", designation: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" })}
                              >
                                <Plus className="h-3.5 w-3.5" /> Add
                              </Button>
                            </div>
                            {fields.map((field, index) => (
                              <div key={field.id} className="p-4 border border-border rounded-xl bg-muted/20 space-y-3 relative">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => remove(index)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                <div className="grid grid-cols-2 gap-3">
                                  <FormField control={form.control} name={`practitioners.${index}.name`} render={({ field }) => (
                                    <FormItem><FormLabel className="text-xs">Name</FormLabel><FormControl><Input {...field} className="rounded-lg h-8 text-sm" /></FormControl></FormItem>
                                  )} />
                                  <FormField control={form.control} name={`practitioners.${index}.designation`} render={({ field }) => (
                                    <FormItem><FormLabel className="text-xs">Designation</FormLabel><FormControl><Input placeholder="e.g. RN" {...field} className="rounded-lg h-8 text-sm" /></FormControl></FormItem>
                                  )} />
                                  <FormField control={form.control} name={`practitioners.${index}.registrationNumber`} render={({ field }) => (
                                    <FormItem><FormLabel className="text-xs">Registration No.</FormLabel><FormControl><Input {...field} className="rounded-lg h-8 text-sm" /></FormControl></FormItem>
                                  )} />
                                  <FormField control={form.control} name={`practitioners.${index}.mobileNumber`} render={({ field }) => (
                                    <FormItem><FormLabel className="text-xs">Mobile</FormLabel><FormControl><Input {...field} className="rounded-lg h-8 text-sm" /></FormControl></FormItem>
                                  )} />
                                </div>
                              </div>
                            ))}
                          </div>
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
                                  <Input placeholder="e.g. HU-MED-12345" {...field} className="rounded-xl" />
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
                                  <Input placeholder="e.g. Hungarian Medical Chamber" {...field} className="rounded-xl" />
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
                                    <Input type="date" {...field} className="rounded-xl" />
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
                                    <Input placeholder="NPI / PESEL…" {...field} className="rounded-xl" />
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
                                  <Input placeholder="Insurance provider / policy number" {...field} className="rounded-xl" />
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
                                  <Input placeholder="Street address or clinic name" {...field} className="rounded-xl" />
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
                                    <Input placeholder="Budapest" {...field} value={typeof field.value === "string" ? field.value : ""} className="rounded-xl" data-testid="input-city" />
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
                                    <Input placeholder="Pest" {...field} className="rounded-xl" />
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
                                    <Input placeholder="Hungary" {...field} className="rounded-xl" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="serviceRadiusKm"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Service Radius (km)</FormLabel>
                                  <FormControl>
                                    <Input type="number" min={0} placeholder="e.g. 20" {...field} value={field.value ?? ""} className="rounded-xl" />
                                  </FormControl>
                                  <FormDescription className="text-xs">For home visits</FormDescription>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="timezone"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Timezone</FormLabel>
                                  <FormControl>
                                    <Input {...field} className="rounded-xl" />
                                  </FormControl>
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
                                  <FormLabel className="text-sm font-medium">Working Hours Start</FormLabel>
                                  <FormControl>
                                    <Input type="time" {...field} className="rounded-xl" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="workingHoursEnd"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-medium">Working Hours End</FormLabel>
                                  <FormControl>
                                    <Input type="time" {...field} className="rounded-xl" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      )}

                      {/* ── STEP 4: Pricing & Contact ── */}
                      {step === 4 && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            {[
                              { name: "consultationFee" as const, label: "Consultation Fee", testId: "input-consultation-fee" },
                              { name: "homeVisitFee" as const, label: "Home Visit Fee", testId: "input-home-visit-fee" },
                              { name: "telemedicineFee" as const, label: "Telemedicine Fee", testId: "" },
                              { name: "emergencyCareFee" as const, label: "Emergency Care Fee", testId: "" },
                            ].map(({ name, label, testId }) => (
                              <FormField
                                key={name}
                                control={form.control}
                                name={name}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-sm font-medium">{label}</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min={0}
                                        placeholder="0"
                                        {...field}
                                        value={field.value ?? ""}
                                        className="rounded-xl"
                                        {...(testId ? { "data-testid": testId } : {})}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>

                          <FormField
                            control={form.control}
                            name="currency"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Currency</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="HUF">HUF — Hungarian Forint</SelectItem>
                                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                                    <SelectItem value="GBP">GBP — British Pound</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="preferredContactMethod"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Preferred Contact Method</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl">
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

                          <FormField
                            control={form.control}
                            name="emergencyContact"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Emergency Contact Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="+36 …" {...field} className="rounded-xl" />
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
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {/* ── STEP 5: Availability ── */}
                      {step === 5 && (
                        <>
                          <FormField
                            control={form.control}
                            name="availableDays"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Available Days</FormLabel>
                                <CheckboxGroup
                                  options={DAY_OPTIONS}
                                  value={field.value || []}
                                  onChange={field.onChange}
                                  columns={2}
                                />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="maxPatientsPerDay"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Max Patients Per Day</FormLabel>
                                <FormControl>
                                  <Input type="number" min={1} max={100} placeholder="e.g. 10" {...field} value={field.value ?? ""} className="rounded-xl" />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="ageGroupsServed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Age Groups Served</FormLabel>
                                <CheckboxGroup
                                  options={AGE_GROUPS}
                                  value={field.value || []}
                                  onChange={field.onChange}
                                  columns={2}
                                />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="paymentMethods"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">Payment Methods Accepted</FormLabel>
                                <CheckboxGroup
                                  options={PAYMENT_METHODS}
                                  value={field.value || []}
                                  onChange={field.onChange}
                                  columns={2}
                                />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="onCallAvailability"
                            render={({ field }) => (
                              <FormItem>
                                <div
                                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                                    field.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                                  }`}
                                  onClick={() => field.onChange(!field.value)}
                                >
                                  <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                                  <div>
                                    <p className="text-sm font-medium">On-call Availability</p>
                                    <p className="text-xs text-muted-foreground">Available for emergency or after-hours calls</p>
                                  </div>
                                </div>
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {/* ── STEP 6: Agreements ── */}
                      {step === 6 && (
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
                                  <div
                                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                                      field.value
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-primary/30"
                                    }`}
                                    onClick={() => field.onChange(!field.value)}
                                  >
                                    <Checkbox
                                      checked={!!field.value}
                                      onCheckedChange={field.onChange}
                                      className="mt-0.5"
                                    />
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">{title}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                                    </div>
                                  </div>
                                </FormItem>
                              )}
                            />
                          ))}

                          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
                            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                              Your profile will be reviewed by our team before going live. You'll be notified once approved.
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
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                          </Button>
                        )}

                        {step < 6 ? (
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
                                {existingProvider ? "Updating…" : "Creating…"}
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                {existingProvider ? "Update Profile" : "Complete Setup"}
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
