import { useState } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Stethoscope, CheckCircle, Plus, Trash2 } from "lucide-react";
import type { SubService } from "@shared/schema";
import { useTranslation } from "react-i18next";

export default function ProviderSetup() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const practitionerSchema = z.object({
    name: z.string().min(2, t("validation.field_required")),
    designation: z.string().min(2, t("validation.field_required")),
    dob: z.string().min(1, t("validation.field_required")),
    originCountry: z.string().min(2, t("validation.field_required")),
    registrationNumber: z.string().min(2, t("validation.field_required")),
    identityNumber: z.string().min(2, t("validation.field_required")),
    mobileNumber: z.string().min(2, t("validation.field_required")),
  });

  const providerSetupSchema = z.object({
    type: z.enum(["physiotherapist", "doctor", "nurse"]),
    professionalTitle: z.string().min(1, t("validation.field_required")),
    specialization: z.string().min(3, t("validation.specialization_required")),
    secondarySpecialties: z.array(z.string()).optional(),
    subServices: z.array(z.string()).min(1, t("validation.sub_service_select")),
    bio: z.string().min(50, t("validation.bio_min")),
    yearsExperience: z.coerce.number().min(0).max(50),
    education: z.string().min(3, t("validation.field_required")),
    languages: z.array(z.string()).min(1, t("validation.lang_select")),
    
    // Credentials
    licenseNumber: z.string().min(2, t("validation.field_required")),
    licensingAuthority: z.string().min(2, t("validation.field_required")),
    licenseExpiryDate: z.string().min(1, t("validation.field_required")),
    nationalProviderId: z.string().optional(),

    // Services
    ageGroupsServed: z.array(z.string()).min(1, t("validation.field_required")),
    
    // Availability
    availableDays: z.array(z.string()).min(1, t("validation.day_select")),
    workingHoursStart: z.string().default("09:00"),
    workingHoursEnd: z.string().default("18:00"),
    maxPatientsPerDay: z.coerce.number().min(1).optional(),
    timezone: z.string().min(1, t("validation.field_required")),

    // Service Area
    primaryServiceLocation: z.string().min(2, t("validation.field_required")),
    city: z.string().min(2, t("validation.field_required")),
    serviceRadiusKm: z.coerce.number().min(1).optional(),

    // Pricing
    consultationFee: z.coerce.number().min(1, t("validation.cons_fee_required")),
    homeVisitFee: z.coerce.number().optional(),
    telemedicineFee: z.coerce.number().optional(),
    insuranceAccepted: z.array(z.string()).optional(),
    currency: z.string().default("USD"),
    paymentMethods: z.array(z.string()).min(1, t("validation.field_required")),

    // Compliance
    malpracticeCoverage: z.string().optional(),
    
    // Consents
    providerAgreementAccepted: z.boolean().refine(v => v === true, t("validation.field_required")),
    dataProcessingAgreementAccepted: z.boolean().refine(v => v === true, t("validation.field_required")),
    telemedicineAgreementAccepted: z.boolean().refine(v => v === true, t("validation.field_required")),
    codeOfConductAccepted: z.boolean().refine(v => v === true, t("validation.field_required")),

    // Custom
    affiliatedHospital: z.string().optional(),
    onCallAvailability: z.boolean().default(false),
    emergencyContact: z.string().optional(),
    practitioners: z.array(practitionerSchema).optional(),
  });

  const languageOptions = [
    { value: "english", label: "English" },
    { value: "spanish", label: "Spanish" },
    { value: "french", label: "French" },
    { value: "german", label: "German" },
    { value: "chinese", label: "Chinese" },
    { value: "hindi", label: "Hindi" },
    { value: "arabic", label: "Arabic" },
    { value: "farsi", label: "Farsi" },
    { value: "hungarian", label: "Magyar" },
  ];

  const dayOptions = [
    { value: "monday", label: t("setup.mon") },
    { value: "tuesday", label: t("setup.tue") },
    { value: "wednesday", label: t("setup.wed") },
    { value: "thursday", label: t("setup.thu") },
    { value: "friday", label: t("setup.fri") },
    { value: "saturday", label: t("setup.sat") },
    { value: "sunday", label: t("setup.sun") },
  ];

  const form = useForm<z.infer<typeof providerSetupSchema>>({
    resolver: zodResolver(providerSetupSchema),
    defaultValues: {
      type: "physiotherapist",
      professionalTitle: "",
      specialization: "",
      secondarySpecialties: [],
      subServices: [],
      bio: "",
      yearsExperience: 0,
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
      maxPatientsPerDay: 10,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      primaryServiceLocation: "",
      city: "",
      serviceRadiusKm: 20,
      consultationFee: 50,
      homeVisitFee: undefined,
      telemedicineFee: undefined,
      insuranceAccepted: [],
      currency: "USD",
      paymentMethods: ["card"],
      malpracticeCoverage: "",
      providerAgreementAccepted: false,
      dataProcessingAgreementAccepted: false,
      telemedicineAgreementAccepted: false,
      codeOfConductAccepted: false,
      affiliatedHospital: "",
      onCallAvailability: false,
      emergencyContact: "",
      practitioners: [{ name: "", designation: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "practitioners",
  });

  const setupMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/provider/setup", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t("setup.setup_failed"));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("setup.profile_created"),
        description: t("setup.profile_live"),
      });
      navigate("/provider/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: t("setup.setup_failed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectedType = form.watch("type");

  const { data: subServicesData = [] } = useQuery<SubService[]>({
    queryKey: ["/api/sub-services", selectedType],
    enabled: !!selectedType,
  });

  const onSubmit = (data: any) => {
    setupMutation.mutate(data);
  };

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
              <Stethoscope className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-semibold mb-2">{t("setup.title")}</h1>
            <p className="text-muted-foreground">
              {t("setup.description")}
            </p>
          </div>

          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <div key={s} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      s < step
                        ? "bg-primary text-primary-foreground"
                        : s === step
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s < step ? <CheckCircle className="h-4 w-4" /> : s}
                  </div>
                  {s < 6 && (
                    <div
                      className={`w-4 h-0.5 ${
                        s < step ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {step === 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("setup.prof_info")}</CardTitle>
                    <CardDescription>
                      {t("setup.prof_desc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="professionalTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Professional Title (Dr., RN, PT, etc.)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Dr." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.provider_type")}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-provider-type">
                                <SelectValue placeholder={t("setup.select_profession")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="physiotherapist">{t("common.physiotherapists")}</SelectItem>
                              <SelectItem value="doctor">{t("common.doctors")}</SelectItem>
                              <SelectItem value="nurse">{t("common.nurses")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.specialization")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("setup.spec_placeholder")}
                              {...field}
                              data-testid="input-specialization"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="subServices"
                      render={() => (
                        <FormItem>
                          <FormLabel>{t("setup.sub_services")}</FormLabel>
                          <div className="grid grid-cols-2 gap-2 border rounded-md p-4 bg-background">
                            {subServicesData.length === 0 ? (
                              <p className="text-sm text-muted-foreground col-span-2">{t("setup.no_sub_services")}</p>
                            ) : (
                              subServicesData.map((service) => (
                                <FormField
                                  key={service.id}
                                  control={form.control}
                                  name="subServices"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(service.name)}
                                          onCheckedChange={(checked) => {
                                            const updated = checked
                                              ? [...(field.value || []), service.name]
                                              : field.value?.filter((v) => v !== service.name) || [];
                                            field.onChange(updated);
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal cursor-pointer text-sm">
                                        {service.name}
                                      </FormLabel>
                                    </FormItem>
                                  )}
                                />
                              ))
                            )}
                          </div>
                          <FormDescription>{t("setup.sub_services_desc")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="yearsExperience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.years_experience")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={50}
                              {...field}
                              data-testid="input-experience"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="education"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.education")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("setup.edu_placeholder")}
                              {...field}
                              data-testid="input-education"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.about_you")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("setup.bio_placeholder")}
                              className="min-h-32"
                              {...field}
                              data-testid="input-bio"
                            />
                          </FormControl>
                          <FormDescription>{t("setup.min_chars")}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <Label>{t("setup.practitioners")}</Label>
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ name: "", designation: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" })}>
                          <Plus className="h-4 w-4 mr-2" /> {t("setup.add_practitioner")}
                        </Button>
                      </div>
                      <FormDescription>{t("setup.clinics_desc")}</FormDescription>
                      {fields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-md space-y-4 relative">
                          <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name={`practitioners.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("setup.name")}</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`practitioners.${index}.designation`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("setup.designation")}</FormLabel>
                                  <FormControl><Input placeholder={t("setup.designation_placeholder")} {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name={`practitioners.${index}.dob`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("setup.dob")}</FormLabel>
                                  <FormControl><Input type="date" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`practitioners.${index}.originCountry`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("setup.origin_country")}</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name={`practitioners.${index}.registrationNumber`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("setup.reg_number")}</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`practitioners.${index}.identityNumber`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{t("setup.id_number")}</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={form.control}
                            name={`practitioners.${index}.mobileNumber`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("setup.mobile_number")}</FormLabel>
                                <FormControl><Input {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      ))}
                    </div>

                    <Button type="button" className="w-full" onClick={nextStep} data-testid="button-next-1">
                      {t("setup.continue")}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Professional Credentials</CardTitle>
                    <CardDescription>
                      Critical licensing and identification information.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="licenseNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>License Number</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="licensingAuthority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Licensing Authority</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="licenseExpiryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>License Expiry Date</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalProviderId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>National Provider ID (NPI)</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-4">
                      <Button type="button" variant="outline" className="flex-1" onClick={prevStep}>
                        {t("setup.back")}
                      </Button>
                      <Button type="button" className="flex-1" onClick={nextStep}>
                        {t("setup.continue")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 3 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Availability & Location</CardTitle>
                    <CardDescription>
                      Where and when you are available to provide services.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="primaryServiceLocation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Work Address / Primary Location</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serviceRadiusKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Radius (km)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormDescription>For home visits</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Zone</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="workingHoursStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time</FormLabel>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="workingHoursEnd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time</FormLabel>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex gap-4">
                      <Button type="button" variant="outline" className="flex-1" onClick={prevStep}>
                        {t("setup.back")}
                      </Button>
                      <Button type="button" className="flex-1" onClick={nextStep}>
                        {t("setup.continue")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 4 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("setup.pricing_location")}</CardTitle>
                    <CardDescription>
                      {t("setup.pricing_desc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="consultationFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.cons_fee")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              {...field}
                              data-testid="input-consultation-fee"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="homeVisitFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.home_fee")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              placeholder={t("setup.home_fee_desc")}
                              {...field}
                              value={field.value || ""}
                              data-testid="input-home-visit-fee"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("setup.city")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("setup.city_placeholder")}
                              {...field}
                              value={typeof field.value === 'string' ? field.value : ""}
                              data-testid="input-city"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="languages"
                      render={() => (
                        <FormItem>
                          <FormLabel>{t("setup.languages_spoken")}</FormLabel>
                          <div className="grid grid-cols-2 gap-2">
                            {languageOptions.map((lang) => (
                              <FormField
                                key={lang.value}
                                control={form.control}
                                name="languages"
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(lang.value)}
                                        onCheckedChange={(checked) => {
                                          const updated = checked
                                            ? [...(field.value || []), lang.value]
                                            : field.value?.filter((v) => v !== lang.value) || [];
                                          field.onChange(updated);
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-sm">
                                      {lang.label}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-4">
                      <Button type="button" variant="outline" className="flex-1" onClick={prevStep}>
                        Back
                      </Button>
                      <Button type="button" className="flex-1" onClick={nextStep} data-testid="button-next-2">
                        {t("setup.continue")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 3 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("setup.availability")}</CardTitle>
                    <CardDescription>
                      {t("setup.availability_desc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="availableDays"
                      render={() => (
                        <FormItem>
                          <div className="grid grid-cols-1 gap-2">
                            {dayOptions.map((day) => (
                              <FormField
                                key={day.value}
                                control={form.control}
                                name="availableDays"
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2 space-y-0 p-2 border rounded-md hover:bg-muted/50 transition-colors">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(day.value)}
                                        onCheckedChange={(checked) => {
                                          const updated = checked
                                            ? [...(field.value || []), day.value]
                                            : field.value?.filter((v) => v !== day.value) || [];
                                          field.onChange(updated);
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-medium cursor-pointer flex-1">
                                      {day.label}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-4">
                      <Button type="button" variant="outline" className="flex-1" onClick={prevStep}>
                        Back
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={setupMutation.isPending}
                        data-testid="button-setup-submit"
                      >
                        {setupMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("setup.completing")}
                          </>
                        ) : (
                          t("setup.complete_setup")
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </form>
          </Form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
