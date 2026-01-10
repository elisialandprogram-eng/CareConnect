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

const practitionerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  designation: z.string().min(2, "Designation is required"),
  dob: z.string().min(1, "Date of birth is required"),
  originCountry: z.string().min(2, "Origin country is required"),
  registrationNumber: z.string().min(2, "Registration number is required"),
  identityNumber: z.string().min(2, "Identity number is required"),
  mobileNumber: z.string().min(2, "Mobile number is required"),
});

const providerSetupSchema = z.object({
  type: z.enum(["physiotherapist", "doctor", "nurse"]),
  specialization: z.string().min(3, "Specialization is required"),
  subServices: z.array(z.string()).min(1, "Select at least one sub-service"),
  bio: z.string().min(50, "Please write at least 50 characters about yourself"),
  yearsExperience: z.coerce.number().min(0).max(50),
  education: z.string().min(3, "Education is required"),
  consultationFee: z.coerce.number().min(1, "Consultation fee is required"),
  homeVisitFee: z.coerce.number().optional(),
  city: z.string().min(2, "City is required"),
  languages: z.array(z.string()).min(1, "Select at least one language"),
  availableDays: z.array(z.string()).min(1, "Select at least one day"),
  practitioners: z.array(practitionerSchema).optional(),
});

type ProviderSetupData = z.infer<typeof providerSetupSchema>;

const languageOptions = [
  { value: "english", label: "English" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "chinese", label: "Chinese" },
  { value: "hindi", label: "Hindi" },
  { value: "arabic", label: "Arabic" },
];

const dayOptions = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

export default function ProviderSetup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const form = useForm<ProviderSetupData>({
    resolver: zodResolver(providerSetupSchema),
    defaultValues: {
      type: "physiotherapist",
      specialization: "",
      subServices: [],
      bio: "",
      yearsExperience: 0,
      education: "",
      consultationFee: 50,
      homeVisitFee: undefined,
      city: "",
      languages: ["english"],
      availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      practitioners: [{ name: "", designation: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "practitioners",
  });

  const setupMutation = useMutation({
    mutationFn: async (data: ProviderSetupData) => {
      const response = await apiRequest("POST", "/api/provider/setup", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to set up profile");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile created!",
        description: "Your provider profile is now live. Patients can start booking with you.",
      });
      navigate("/provider/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Setup failed",
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

  const onSubmit = (data: ProviderSetupData) => {
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
            <h1 className="text-3xl font-semibold mb-2">Set Up Your Provider Profile</h1>
            <p className="text-muted-foreground">
              Complete your profile to start accepting appointments from patients
            </p>
          </div>

          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((s) => (
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
                  {s < 3 && (
                    <div
                      className={`w-12 h-0.5 ${
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
                    <CardTitle>Professional Information</CardTitle>
                    <CardDescription>
                      Tell us about your professional background
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-provider-type">
                                <SelectValue placeholder="Select your profession" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="physiotherapist">Physiotherapist</SelectItem>
                              <SelectItem value="doctor">Doctor</SelectItem>
                              <SelectItem value="nurse">Home Nurse</SelectItem>
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
                          <FormLabel>Specialization</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Sports Rehabilitation, Geriatric Care"
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
                          <FormLabel>Sub Services</FormLabel>
                          <div className="grid grid-cols-2 gap-2 border rounded-md p-4 bg-background">
                            {subServicesData.length === 0 ? (
                              <p className="text-sm text-muted-foreground col-span-2">No sub-services available for this category</p>
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
                          <FormDescription>Select the specific treatments or services you provide</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="yearsExperience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Years of Experience</FormLabel>
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
                          <FormLabel>Education & Qualifications</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., MD from Johns Hopkins, Physical Therapy License"
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
                          <FormLabel>About You</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Tell patients about your experience, approach, and what makes you unique..."
                              className="min-h-32"
                              {...field}
                              data-testid="input-bio"
                            />
                          </FormControl>
                          <FormDescription>Minimum 50 characters</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <Label>Medical Practitioners</Label>
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ name: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" })}>
                          <Plus className="h-4 w-4 mr-2" /> Add Practitioner
                        </Button>
                      </div>
                      <FormDescription>For clinics or groups, list the individual practitioners.</FormDescription>
                      {fields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-md space-y-4 relative">
                          <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <div className="grid grid-cols-1 gap-4">
                            <FormField
                              control={form.control}
                              name={`practitioners.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Name</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name={`practitioners.${index}.dob`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>DOB</FormLabel>
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
                                    <FormLabel>Origin Country</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name={`practitioners.${index}.registrationNumber`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Registration #</FormLabel>
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
                                    <FormLabel>Identity #</FormLabel>
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
                                  <FormLabel>Mobile #</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button type="button" className="w-full" onClick={nextStep} data-testid="button-next-1">
                      Continue
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Pricing & Location</CardTitle>
                    <CardDescription>
                      Set your fees and service area
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="consultationFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consultation Fee ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              {...field}
                              data-testid="input-consultation-fee"
                            />
                          </FormControl>
                          <FormDescription>
                            Your standard rate for online consultations
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="homeVisitFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Home Visit Fee ($) - Optional</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              placeholder="Leave empty if you don't offer home visits"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-home-visit-fee"
                            />
                          </FormControl>
                          <FormDescription>
                            Additional fee for home visits (if offered)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., New York, Los Angeles"
                              {...field}
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
                          <FormLabel>Languages Spoken</FormLabel>
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
                                    <FormLabel className="font-normal cursor-pointer">
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

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" className="flex-1" onClick={prevStep}>
                        Back
                      </Button>
                      <Button type="button" className="flex-1" onClick={nextStep} data-testid="button-next-2">
                        Continue
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 3 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Availability</CardTitle>
                    <CardDescription>
                      Set your working days
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="availableDays"
                      render={() => (
                        <FormItem>
                          <FormLabel>Available Days</FormLabel>
                          <div className="grid grid-cols-2 gap-2">
                            {dayOptions.map((day) => (
                              <FormField
                                key={day.value}
                                control={form.control}
                                name="availableDays"
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2 space-y-0">
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
                                    <FormLabel className="font-normal cursor-pointer">
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

                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        You can set specific time slots after completing the setup from your dashboard.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" className="flex-1" onClick={prevStep}>
                        Back
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={setupMutation.isPending}
                        data-testid="button-submit-setup"
                      >
                        {setupMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Setting up...
                          </>
                        ) : (
                          "Complete Setup"
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
