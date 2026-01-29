import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Loader2, Shield, Users, Building, Trash2, Edit, Plus, Tag, DollarSign,
  Calendar, FileText, Settings, MessageSquare, Activity, BarChart3,
  Bell, HelpCircle, CheckCircle, XCircle, Clock, Eye, ListTree, Search, UserCheck
} from "lucide-react";
import type { User, ProviderWithUser, PromoCode, ProviderPricingOverride, SubService, Practitioner, ServicePractitioner } from "@shared/schema";
import { useLocation } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import type { TaxSetting, InsertTaxSetting } from "@shared/schema";

// Practitioner Management Component
function PractitionerManagement({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: practitioners, refetch: refetchPractitioners } = useQuery<Practitioner[]>({
    queryKey: [`/api/providers/${providerId}/practitioners`],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/providers/${providerId}/practitioners`, data);
    },
    onSuccess: () => {
      refetchPractitioners();
      toast({ title: t("admin.practitioner_added") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/practitioners/${id}`);
    },
    onSuccess: () => {
      refetchPractitioners();
      toast({ title: t("admin.practitioner_removed") });
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Input id="practitioner-name" placeholder={t("admin.name")} />
        <Input id="practitioner-title" placeholder={t("admin.title_label")} />
        <Input id="practitioner-spec" placeholder={t("admin.specialization_label")} className="col-span-2" />
        <Button 
          className="col-span-2"
          onClick={() => {
            const name = (document.getElementById('practitioner-name') as HTMLInputElement).value;
            const title = (document.getElementById('practitioner-title') as HTMLInputElement).value;
            const specialization = (document.getElementById('practitioner-spec') as HTMLInputElement).value;
            if (name) createMutation.mutate({ name, title, specialization });
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> {t("admin.add_new")} {t("admin.practitioners")}
        </Button>
      </div>
      <div className="space-y-2">
        {practitioners?.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border">
            <div>
              <p className="font-medium">{p.title} {p.name}</p>
              <p className="text-xs text-muted-foreground">{p.specialization}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Service Practitioner Linkage Component
function ServicePractitionerAssignment({ serviceId, providerId }: { serviceId: string, providerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedPId, setSelectedPId] = useState("");
  const [fee, setFee] = useState("");
  
  const { data: practitioners } = useQuery<Practitioner[]>({
    queryKey: [`/api/providers/${providerId}/practitioners`],
  });
  const { data: assigned, refetch } = useQuery<(ServicePractitioner & { practitioner: Practitioner })[]>({
    queryKey: [`/api/services/${serviceId}/practitioners`],
  });

  const assignMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/services/${serviceId}/practitioners`, data);
    },
    onSuccess: () => {
      refetch();
      toast({ title: t("admin.assigned_to_service") });
      setSelectedPId("");
      setFee("");
    },
  });

  return (
    <div className="space-y-4 mt-4 pt-4 border-t">
      <h4 className="text-sm font-semibold">{t("admin.assigned_practitioners")}</h4>
      <div className="grid grid-cols-3 gap-2">
        <Select value={selectedPId} onValueChange={setSelectedPId}>
          <SelectTrigger className="col-span-2">
            <SelectValue placeholder={t("admin.select_practitioner")} />
          </SelectTrigger>
          <SelectContent>
            {practitioners?.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input 
          type="number" 
          placeholder={t("admin.fee")} 
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <Button 
          className="col-span-3"
          onClick={() => {
            if (selectedPId && fee) assignMutation.mutate({ practitionerId: selectedPId, fee });
          }}
          disabled={assignMutation.isPending}
        >
          {assignMutation.isPending ? t("admin.assigning") : t("admin.assign")}
        </Button>
      </div>
      <div className="space-y-2">
        {assigned?.map(a => (
          <div key={a.id} className="flex items-center justify-between text-sm p-2 bg-accent/50 rounded">
            <span>{a.practitioner.name}</span>
            <span className="font-mono">${a.fee}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const adminProviderSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  city: z.string().min(2),
  type: z.enum(["physiotherapist", "doctor", "nurse"]),
  specialization: z.string().min(3),
  bio: z.string().min(50),
  yearsExperience: z.coerce.number().min(0).max(50),
  education: z.string().min(3),
  consultationFee: z.coerce.number().min(1),
  homeVisitFee: z.coerce.number().optional(),
  languages: z.array(z.string()).min(1),
  availableDays: z.array(z.string()).min(1),
});

type AdminProviderData = z.infer<typeof adminProviderSchema>;

const languageOptions = [
  { value: "english", label: "English" },
  { value: "hungarian", label: "Hungarian" },
  { value: "german", label: "German" },
  { value: "french", label: "French" },
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


// Provider Edit Dialog Component
function ProviderEditDialog({ provider }: { provider: any }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data: providerServices, refetch: refetchServices } = useQuery<any[]>({
    queryKey: [`/api/admin/providers/${provider.id}/services`],
    enabled: open,
  });

  const form = useForm({
    defaultValues: {
      specialization: provider.specialization,
      consultationFee: provider.consultationFee,
      homeVisitFee: provider.homeVisitFee || "",
      telemedicineFee: provider.telemedicineFee || "",
      emergencyCareFee: provider.emergencyCareFee || "",
      bio: provider.bio || "",
      professionalTitle: provider.professionalTitle || "",
      licenseNumber: provider.licenseNumber || "",
      licensingAuthority: provider.licensingAuthority || "",
      licenseExpiryDate: provider.licenseExpiryDate ? new Date(provider.licenseExpiryDate).toISOString().split('T')[0] : "",
      nationalProviderId: provider.nationalProviderId || "",
      yearsExperience: provider.yearsExperience || 0,
      education: provider.education || "",
      qualifications: provider.qualifications || "",
      city: provider.city || "",
      state: provider.state || "",
      country: provider.country || "",
      serviceRadiusKm: provider.serviceRadiusKm || "",
      primaryServiceLocation: provider.primaryServiceLocation || "",
      status: provider.status || "pending",
      languages: provider.languages || [],
      availableDays: provider.availableDays || [],
      insuranceAccepted: provider.insuranceAccepted || [],
      paymentMethods: provider.paymentMethods || [],
      affiliatedHospital: provider.affiliatedHospital || "",
      onCallAvailability: provider.onCallAvailability || false,
      emergencyContact: provider.emergencyContact || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/admin/providers/${provider.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      toast({ title: t("admin.provider_updated") });
      setOpen(false);
    },
  });

  const addServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/admin/providers/${provider.id}/services`, {
        ...data,
        duration: 60, // Default duration
      });
    },
    onSuccess: () => {
      refetchServices();
      toast({ title: t("admin.service_added") });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`button-edit-provider-${provider.id}`}>
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{t("admin.edit")} {t("admin.provider")}: {provider.user?.firstName} {provider.user?.lastName}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">{t("admin.details_fees")}</TabsTrigger>
              <TabsTrigger value="services">{t("admin.services")}</TabsTrigger>
              <TabsTrigger value="practitioners">{t("admin.practitioners")}</TabsTrigger>
            </TabsList>
            <TabsContent value="practitioners">
              <PractitionerManagement providerId={provider.id} />
            </TabsContent>
            <TabsContent value="details" className="space-y-4 py-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="professionalTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.title_label")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.specialization_label")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.verification_status")}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pending">{t("admin.pending")}</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="yearsExperience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.years_experience_label")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="licenseNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.license_number")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="licenseExpiryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.license_expiry")}</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="consultationFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.consultation_fee_label")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="homeVisitFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.home_visit_fee_label")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.city")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serviceRadiusKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.radius_km")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="affiliatedHospital"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.affiliated_hospital")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emergencyContact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.emergency_contact")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="onCallAvailability"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox 
                            checked={!!field.value} 
                            onCheckedChange={field.onChange} 
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>{t("admin.on_call_availability")}</FormLabel>
                          <FormDescription>{t("admin.available_emergency")}</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.bio")}</FormLabel>
                        <FormControl><Textarea {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={updateMutation.isPending} className="w-full">
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("admin.save_changes")}
                  </Button>
                </form>
              </Form>
            </TabsContent>
            <TabsContent value="services" className="space-y-4 py-4">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Input id="new-service-name" placeholder={t("admin.service_name")} />
                  <Input id="new-service-price" type="number" placeholder={t("admin.price")} />
                  <Button 
                    onClick={() => {
                      const name = (document.getElementById('new-service-name') as HTMLInputElement).value;
                      const price = (document.getElementById('new-service-price') as HTMLInputElement).value;
                      if (name && price) {
                        addServiceMutation.mutate({ name, price: parseFloat(price) });
                        (document.getElementById('new-service-name') as HTMLInputElement).value = '';
                        (document.getElementById('new-service-price') as HTMLInputElement).value = '';
                      }
                    }}
                    disabled={addServiceMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-2" /> {t("admin.add")}
                  </Button>
                </div>
                <div className="space-y-2">
                  {providerServices?.map((service: any) => (
                    <div key={service.id} className="p-3 bg-muted/50 rounded-md border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{service.name} - ${service.price}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive h-8 w-8"
                          onClick={async () => {
                            await apiRequest("DELETE", `/api/admin/services/${service.id}`);
                            refetchServices();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <ServicePractitionerAssignment serviceId={service.id} providerId={provider.id} />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Provider Details Dialog Component
function ProviderDetailsDialog({ provider }: { provider: any }) {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`button-view-provider-${provider.id}`}>
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{t("admin.provider_details")}</DialogTitle>
          <DialogDescription>{t("admin.full_profile_info", { name: `${provider.user?.firstName} ${provider.user?.lastName}` })}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">{t("admin.type")}</Label>
                <p className="font-medium capitalize">{provider.type}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.specialization_label")}</Label>
                <p className="font-medium">{provider.specialization}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("common.email")}</Label>
                <p className="font-medium">{provider.user?.email}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("common.phone")}</Label>
                <p className="font-medium">{provider.user?.phone || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.experience")}</Label>
                <p className="font-medium">{provider.yearsExperience} {t("admin.years")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("common.profile.education")}</Label>
                <p className="font-medium">{provider.education}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.consultation_fee_label")}</Label>
                <p className="font-medium">${Number(provider.consultationFee).toFixed(2)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.home_visit_fee_label")}</Label>
                <p className="font-medium">{provider.homeVisitFee ? `$${Number(provider.homeVisitFee).toFixed(2)}` : 'N/A'}</p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("admin.bio")}</Label>
              <p className="text-sm mt-1 whitespace-pre-wrap">{provider.bio}</p>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("common.profile.languages")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.languages?.map((lang: string) => (
                  <Badge key={lang} variant="secondary" className="capitalize">{lang}</Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">{t("admin.affiliated_hospital")}</Label>
                <p className="font-medium">{provider.affiliatedHospital || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.on_call")}</Label>
                <p className="font-medium">{provider.onCallAvailability ? t("admin.yes") : t("admin.no")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.emergency_contact")}</Label>
                <p className="font-medium">{provider.emergencyContact || 'N/A'}</p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("admin.insurance_accepted")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.insuranceAccepted?.length > 0 ? provider.insuranceAccepted.map((ins: string) => (
                  <Badge key={ins} variant="outline" className="capitalize">{ins}</Badge>
                )) : <p className="text-sm font-medium">{t("admin.none_listed")}</p>}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("admin.payment_methods")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.paymentMethods?.length > 0 ? provider.paymentMethods.map((pm: string) => (
                  <Badge key={pm} variant="outline" className="capitalize">{pm}</Badge>
                )) : <p className="text-sm font-medium">{t("admin.none_listed")}</p>}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("setup.availability")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.availableDays?.map((day: string) => (
                  <Badge key={day} variant="outline" className="capitalize">{day}</Badge>
                ))}
              </div>
            </div>

            {provider.practitionerData && (
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground">{t("admin.medical_practitioners")}</Label>
                <div className="mt-2 space-y-4">
                  {(() => {
                    try {
                      const practitioners = typeof provider.practitionerData === 'string' 
                        ? JSON.parse(provider.practitionerData) 
                        : provider.practitionerData;
                      return Array.isArray(practitioners) ? practitioners.map((practitioner: any, index: number) => (
                        <div key={index} className="p-3 rounded-md bg-muted/50 border space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-muted-foreground font-medium">{t("admin.name")}:</span> {practitioner.name}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.designation")}:</span> {practitioner.designation}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.dob")}:</span> {practitioner.dob}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.origin_country")}:</span> {practitioner.originCountry}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.reg_number")}:</span> {practitioner.registrationNumber}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.id_number")}:</span> {practitioner.identityNumber}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.mobile_number")}:</span> {practitioner.mobileNumber}</div>
                          </div>
                        </div>
                      )) : null;
                    } catch (e) {
                      return <p className="text-xs text-destructive">Error parsing practitioner data</p>;
                    }
                  })()}
                </div>
              </div>
            )}

            <div className="pt-4 border-t grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">{t("admin.rating")}</Label>
                <p className="font-medium">{provider.rating} / 5 ({provider.totalReviews} {t("common.profile.reviews_count", { count: provider.totalReviews })})</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.joined_on")}</Label>
                <p className="font-medium">{new Date(provider.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Analytics Overview Component
function AnalyticsOverview() {
  const { t } = useTranslation();
  const { data: analytics, isLoading } = useQuery<{
    totalUsers: number;
    totalProviders: number;
    totalBookings: number;
    totalRevenue: string;
    pendingBookings: number;
    completedBookings: number;
    recentPayments: any[];
  }>({
    queryKey: ["/api/admin/analytics"],
  });

  const mockChartData = [
    { name: 'Jan', bookings: 40, revenue: 2400 },
    { name: 'Feb', bookings: 30, revenue: 1398 },
    { name: 'Mar', bookings: 50, revenue: 3800 },
    { name: 'Apr', bookings: 47, revenue: 3908 },
    { name: 'May', bookings: 65, revenue: 4800 },
    { name: 'Jun', bookings: 59, revenue: 3800 },
  ];

  const pieData = [
    { name: 'Completed', value: analytics?.completedBookings || 0, color: '#22c55e' },
    { name: 'Pending', value: analytics?.pendingBookings || 0, color: '#f59e0b' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_users")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">{analytics?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">{t("admin.registered_users")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_providers")}</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-providers">{analytics?.totalProviders || 0}</div>
            <p className="text-xs text-muted-foreground">{t("admin.active_providers")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_bookings")}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-bookings">{analytics?.totalBookings || 0}</div>
            <p className="text-xs text-muted-foreground">{t("admin.all_time_bookings")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_revenue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">${Number(analytics?.totalRevenue || 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{t("admin.platform_earnings")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.booking_trends")}</CardTitle>
            <CardDescription>{t("admin.monthly_overview")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="bookings" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.appointment_status")}</CardTitle>
            <CardDescription>{t("admin.current_distribution")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-4">
              {pieData.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Bookings Management Component
function BookingsManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: bookings, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/bookings"],
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/bookings/${id}`, { status });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to update booking");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Booking updated successfully" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredBookings = bookings?.filter((b: any) => 
    statusFilter === "all" || b.status === statusFilter
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="select-booking-status-filter">
            <SelectValue placeholder={t("admin.filter_by_status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.all_bookings")}</SelectItem>
            <SelectItem value="pending">{t("admin.pending")}</SelectItem>
            <SelectItem value="confirmed">{t("admin.confirmed")}</SelectItem>
            <SelectItem value="completed">{t("admin.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("admin.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t("admin.showing_bookings", { count: filteredBookings.length })}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <div className="divide-y">
              {filteredBookings.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {t("admin.no_bookings")}
                </div>
              ) : (
                filteredBookings.map((booking: any) => (
                  <div key={booking.id} className="p-4 flex items-center justify-between gap-4" data-testid={`row-booking-${booking.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{t("admin.booking_number")} {String(booking.id).slice(0, 8)}</span>
                        <Badge variant={
                          booking.status === 'completed' ? 'default' :
                          booking.status === 'confirmed' ? 'secondary' :
                          booking.status === 'cancelled' ? 'destructive' : 'outline'
                        }>
                          {t(`admin.${booking.status}`)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(booking.appointmentDate).toLocaleDateString()} {t("admin.at")} {booking.startTime}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("admin.type")}: {booking.appointmentType} | {t("admin.amount")}: ${Number(booking.totalAmount || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={booking.status}
                        onValueChange={(status) => updateBookingMutation.mutate({ id: booking.id, status })}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-booking-status-${booking.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{t("admin.pending")}</SelectItem>
                          <SelectItem value="confirmed">{t("admin.confirmed")}</SelectItem>
                          <SelectItem value="completed">{t("admin.completed")}</SelectItem>
                          <SelectItem value="cancelled">{t("admin.cancelled")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// Financial Reports Component
function FinancialReports() {
  const { t } = useTranslation();
  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const payments = analytics?.recentPayments || [];
  const totalRevenue = parseFloat(analytics?.totalRevenue || "0");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_revenue_label")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-financial-total">${totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.completed")} {t("admin.bookings")}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-financial-completed">{analytics?.completedBookings || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_users_label")}</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-financial-users">{analytics?.totalUsers || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.recent_payments")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium">{t("admin.date")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin.amount")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin.status")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("booking.payment_method")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      {t("admin.no_payments")}
                    </td>
                  </tr>
                ) : (
                  payments.map((payment: any) => (
                    <tr key={payment.id} className="border-b last:border-0">
                      <td className="p-4">{new Date(payment.createdAt).toLocaleDateString()}</td>
                      <td className="p-4">${Number(payment.amount).toFixed(2)}</td>
                      <td className="p-4">
                        <Badge variant={payment.status === "completed" ? "default" : "secondary"}>
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="p-4 capitalize">{payment.paymentMethod}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Invoices Management Component
function InvoicesManagement() {
  const { t } = useTranslation();
  const { data: invoices, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/invoices"],
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{t("admin.invoices", "Invoices")}</h3>
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <div className="divide-y">
              {invoices?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {t("admin.no_invoices", "No invoices found")}
                </div>
              ) : (
                invoices?.map((invoice) => (
                  <div key={invoice.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{invoice.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(invoice.issueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${Number(invoice.totalAmount).toFixed(2)}</p>
                      <Badge variant={invoice.status === "paid" ? "default" : "outline"}>
                        {invoice.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// Provider Management Component
function ProvidersManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const form = useForm<AdminProviderData & { practitioners: any[] }>({
    resolver: zodResolver(adminProviderSchema.extend({
      practitioners: z.array(z.object({
        name: z.string().min(2),
        dob: z.string().min(10),
        originCountry: z.string().min(2),
        registrationNumber: z.string().min(2),
        identityNumber: z.string().min(2),
        mobileNumber: z.string().min(2),
      })).optional()
    })),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      type: "physiotherapist",
      specialization: "",
      bio: "",
      yearsExperience: 0,
      education: "",
      consultationFee: 0,
      homeVisitFee: undefined,
      languages: ["english"],
      availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      practitioners: [{ name: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "practitioners",
  });

  const createProviderMutation = useMutation({
    mutationFn: async (data: AdminProviderData) => {
      const response = await apiRequest("POST", "/api/admin/providers", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create provider");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Provider created successfully" });
      form.reset();
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating provider",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: providers, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
    refetchOnWindowFocus: true,
  });

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const { data: providerStats, isLoading: isLoadingStats } = useQuery<any>({
    queryKey: ["/api/admin/providers", selectedProviderId, "stats"],
    enabled: !!selectedProviderId,
  });

  const updateProviderMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await apiRequest("PATCH", `/api/admin/providers/${id}`, data);
      if (!response.ok) throw new Error("Failed to update provider");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Provider updated successfully" });
      refetch();
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/providers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Provider profile deleted" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.create_new_provider")}</CardTitle>
          <CardDescription>{t("admin.add_provider_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createProviderMutation.mutate(data))} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.email")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" data-testid="input-provider-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.password")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" data-testid="input-provider-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.first_name")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-provider-firstname" />
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
                      <FormLabel>{t("admin.last_name")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-provider-lastname" />
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
                      <FormLabel>{t("admin.phone")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-provider-phone" />
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
                      <FormLabel>{t("admin.city")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-provider-city" />
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
                      <FormLabel>{t("admin.provider_type")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-provider-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="physiotherapist">{t("common_service_type.physiotherapist")}</SelectItem>
                          <SelectItem value="doctor">{t("common_service_type.doctor")}</SelectItem>
                          <SelectItem value="nurse">{t("common_service_type.nurse")}</SelectItem>
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
                      <FormLabel>{t("admin.specialization")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-provider-specialization" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="yearsExperience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.years_experience")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-provider-experience" />
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
                      <FormLabel>{t("admin.education")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-provider-education" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="consultationFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.consultation_fee")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-provider-fee" />
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
                      <FormLabel>{t("admin.home_visit_fee")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-provider-homevisit-fee" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>{t("admin.medical_practitioners")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ name: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" })}>
                    <Plus className="h-4 w-4 mr-2" /> {t("admin.add_practitioner")}
                  </Button>
                </div>
                {fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-md space-y-4 relative">
                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`practitioners.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("admin.name")}</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`practitioners.${index}.dob`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("admin.dob_label")}</FormLabel>
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
                            <FormLabel>{t("admin.origin_country")}</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`practitioners.${index}.registrationNumber`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("admin.reg_number")}</FormLabel>
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
                            <FormLabel>{t("admin.identity_number")}</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`practitioners.${index}.mobileNumber`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("admin.mobile_number")}</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.bio")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={4} data-testid="input-provider-bio" />
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
                    <FormLabel>{t("admin.languages")}</FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {languageOptions.map((lang) => (
                        <FormField
                          key={lang.value}
                          control={form.control}
                          name="languages"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(lang.value)}
                                  onCheckedChange={(checked) => {
                                    const updated = checked
                                      ? [...(field.value || []), lang.value]
                                      : (field.value || []).filter((v) => v !== lang.value);
                                    field.onChange(updated);
                                  }}
                                  data-testid={`checkbox-lang-${lang.value}`}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">{lang.label}</FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="availableDays"
                render={() => (
                  <FormItem>
                    <FormLabel>{t("admin.available_days")}</FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {dayOptions.map((day) => (
                        <FormField
                          key={day.value}
                          control={form.control}
                          name="availableDays"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(day.value)}
                                  onCheckedChange={(checked) => {
                                    const updated = checked
                                      ? [...(field.value || []), day.value]
                                      : (field.value || []).filter((v) => v !== day.value);
                                    field.onChange(updated);
                                  }}
                                  data-testid={`checkbox-day-${day.value}`}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">{day.label}</FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" size="lg" disabled={createProviderMutation.isPending} className="w-full" data-testid="button-create-provider">
                {createProviderMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("admin.creating")}
                  </>
                ) : (
                  t("admin.create_provider")
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.manage_providers")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium">{t("admin.provider")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin.specialization")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin.dates")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin.status")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {providers?.map((provider: any) => (
                  <tr key={provider.id} className="border-b last:border-0">
                    <td className="p-4">
                      <div className="font-medium">{provider.user?.firstName} {provider.user?.lastName}</div>
                      <div className="text-sm text-muted-foreground">{provider.user?.email}</div>
                    </td>
                    <td className="p-4">{provider.specialization}</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="w-10 text-muted-foreground">Start:</span>
                          <Input 
                            type="date" 
                            className="h-7 py-0 px-1 w-28 text-[10px]" 
                            defaultValue={provider.startDate ? new Date(provider.startDate).toISOString().split('T')[0] : ""}
                            onBlur={(e) => {
                              if (e.target.value) {
                                updateProviderMutation.mutate({ id: provider.id, startDate: new Date(e.target.value) });
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="w-10 text-muted-foreground">End:</span>
                          <Input 
                            type="date" 
                            className="h-7 py-0 px-1 w-28 text-[10px]" 
                            defaultValue={provider.endDate ? new Date(provider.endDate).toISOString().split('T')[0] : ""}
                            onBlur={(e) => {
                              updateProviderMutation.mutate({ id: provider.id, endDate: e.target.value ? new Date(e.target.value) : null });
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={provider.status === 'active' ? 'default' : provider.status === 'suspended' ? 'destructive' : 'secondary'}>
                        {t(`admin.${provider.status}`)}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Select
                          value={provider.status}
                          onValueChange={(status) => updateProviderMutation.mutate({ 
                            id: provider.id, 
                            status,
                            isVerified: status === "active"
                          })}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">{t("admin.active")}</SelectItem>
                            <SelectItem value="suspended">{t("admin.suspended")}</SelectItem>
                            <SelectItem value="pending">{t("admin.pending")}</SelectItem>
                            <SelectItem value="approved">{t("admin.approved")}</SelectItem>
                            <SelectItem value="confirmed">{t("admin.confirmed")}</SelectItem>
                            <SelectItem value="completed">{t("admin.completed")}</SelectItem>
                            <SelectItem value="rejected">{t("admin.rejected")}</SelectItem>
                            <SelectItem value="cancelled">{t("admin.cancelled")}</SelectItem>
                            <SelectItem value="rescheduled">{t("admin.rescheduled")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <ProviderEditDialog provider={provider} />
                          <ProviderDetailsDialog provider={provider} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(t("admin.confirm_delete_provider"))) {
                                deleteProviderMutation.mutate(provider.id);
                              }
                            }}
                            data-testid={`button-delete-provider-${provider.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="h-9 px-3"
                            onClick={() => setSelectedProviderId(provider.id)}
                            title="View Stats"
                          >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Stats
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedProviderId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Booking Statistics</CardTitle>
              <CardDescription>Detailed overview for the selected provider</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProviderId(null)}>Close</Button>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <div className="text-sm font-medium text-muted-foreground">Total Bookings</div>
                    <div className="text-2xl font-bold">{providerStats?.total || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-orange-100 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/50">
                    <div className="text-sm font-medium text-orange-600 dark:text-orange-400">Pending</div>
                    <div className="text-2xl font-bold">{providerStats?.pending || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-100 border border-green-200 dark:bg-green-950/20 dark:border-green-900/50">
                    <div className="text-sm font-medium text-green-600 dark:text-green-400">Completed</div>
                    <div className="text-2xl font-bold">{providerStats?.completed || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-red-100 border border-red-200 dark:bg-red-950/20 dark:border-red-900/50">
                    <div className="text-sm font-medium text-red-600 dark:text-red-400">Cancelled</div>
                    <div className="text-2xl font-bold">{providerStats?.cancelled || 0}</div>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="h-10 px-4 text-left font-medium">Patient</th>
                        <th className="h-10 px-4 text-left font-medium">Date</th>
                        <th className="h-10 px-4 text-left font-medium">Amount</th>
                        <th className="h-10 px-4 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerStats?.bookings.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No bookings found</td></tr>
                      ) : (
                        providerStats?.bookings.map((booking: any) => (
                          <tr key={booking.id} className="border-b last:border-0">
                            <td className="p-4 font-medium">{booking.patientName}</td>
                            <td className="p-4">{new Date(booking.date).toLocaleDateString()} at {booking.startTime}</td>
                            <td className="p-4">${Number(booking.amount).toFixed(2)}</td>
                            <td className="p-4">
                              <Badge variant={
                                booking.status === 'completed' ? 'default' :
                                booking.status === 'pending' ? 'outline' :
                                booking.status === 'cancelled' ? 'destructive' : 'secondary'
                              }>
                                {booking.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Content Management Component
function ContentManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("faqs");

  // FAQs
  const { data: faqs, refetch: refetchFaqs } = useQuery<any[]>({
    queryKey: ["/api/admin/faqs"],
  });

  const faqForm = useForm({
    defaultValues: { question: "", answer: "", category: "", sortOrder: 0 },
  });

  const createFaqMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/faqs", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to create FAQ");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "FAQ created!" });
      faqForm.reset();
      refetchFaqs();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/faqs/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "FAQ deleted" });
      refetchFaqs();
    },
  });

  // Announcements
  const { data: announcements, refetch: refetchAnnouncements } = useQuery<any[]>({
    queryKey: ["/api/admin/announcements"],
  });

  const announcementForm = useForm({
    defaultValues: { 
      title: "", 
      content: "", 
      type: "info",
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/announcements", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to create announcement");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Announcement created!" });
      announcementForm.reset();
      refetchAnnouncements();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/announcements/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Announcement deleted" });
      refetchAnnouncements();
    },
  });

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="providers" data-testid="tab-content-providers">Providers</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-content-users">Users</TabsTrigger>
          <TabsTrigger value="sub-services" data-testid="tab-sub-services">Sub-Services</TabsTrigger>
          <TabsTrigger value="promo-codes" data-testid="tab-content-promo-codes">Promo Codes</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-content-tickets">Support</TabsTrigger>
          <TabsTrigger value="faqs" data-testid="tab-content-faqs">FAQs</TabsTrigger>
          <TabsTrigger value="announcements" data-testid="tab-content-announcements">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="sub-services">
          <SubServicesManagement />
        </TabsContent>

        <TabsContent value="faqs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create FAQ</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...faqForm}>
                <form onSubmit={faqForm.handleSubmit((data) => createFaqMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={faqForm.control}
                    name="question"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-faq-question" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={faqForm.control}
                    name="answer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Answer</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-faq-answer" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={faqForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Booking, Payment, General" data-testid="input-faq-category" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createFaqMutation.isPending} data-testid="button-create-faq">
                    {createFaqMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create FAQ
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All FAQs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {faqs?.map((faq: any) => (
                  <div key={faq.id} className="p-4 border rounded-lg" data-testid={`card-faq-${faq.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium">{faq.question}</p>
                        <p className="text-sm text-muted-foreground mt-1">{faq.answer}</p>
                        {faq.category && <Badge variant="outline" className="mt-2">{faq.category}</Badge>}
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => deleteFaqMutation.mutate(faq.id)}
                        data-testid={`button-delete-faq-${faq.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Announcement</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...announcementForm}>
                <form onSubmit={announcementForm.handleSubmit((data) => createAnnouncementMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={announcementForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-announcement-title" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={announcementForm.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Content</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-announcement-content" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={announcementForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-announcement-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="info">Info</SelectItem>
                              <SelectItem value="warning">Warning</SelectItem>
                              <SelectItem value="success">Success</SelectItem>
                              <SelectItem value="error">Error</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={announcementForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-announcement-start" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={announcementForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-announcement-end" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" disabled={createAnnouncementMutation.isPending} data-testid="button-create-announcement">
                    {createAnnouncementMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create Announcement
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements?.map((ann: any) => (
                  <div key={ann.id} className="p-4 border rounded-lg" data-testid={`card-announcement-${ann.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{ann.title}</p>
                          <Badge variant={
                            ann.type === 'warning' ? 'destructive' :
                            ann.type === 'success' ? 'default' : 'secondary'
                          }>{ann.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{ann.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(ann.startDate).toLocaleDateString()} - {new Date(ann.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => deleteAnnouncementMutation.mutate(ann.id)}
                        data-testid={`button-delete-announcement-${ann.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Platform Settings Component
function PlatformSettings() {
  const { toast } = useToast();

  const { data: settings, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/settings"],
  });

  const settingsForm = useForm({
    defaultValues: { key: "", value: "", category: "general", description: "" },
  });

  const createSettingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/settings", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to save setting");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Setting saved!" });
      settingsForm.reset();
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("POST", "/api/admin/settings", { key, value });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to update setting");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Setting updated!" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const groupedSettings = settings?.reduce((acc: any, setting: any) => {
    const category = setting.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(setting);
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add New Setting</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...settingsForm}>
            <form onSubmit={settingsForm.handleSubmit((data) => createSettingMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={settingsForm.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Setting Key</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., site_name" data-testid="input-setting-key" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={settingsForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-setting-category">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="booking">Booking</SelectItem>
                          <SelectItem value="payment">Payment</SelectItem>
                          <SelectItem value="notification">Notification</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={settingsForm.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-setting-value" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={settingsForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Description of this setting" data-testid="input-setting-description" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={createSettingMutation.isPending} data-testid="button-create-setting">
                {createSettingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Setting
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {Object.entries(groupedSettings).map(([category, catSettings]: [string, any]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="capitalize">{category} Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {catSettings.map((setting: any) => (
                <div key={setting.id} className="flex items-center gap-4 p-3 border rounded-lg" data-testid={`row-setting-${setting.key}`}>
                  <div className="flex-1">
                    <p className="font-medium font-mono text-sm">{setting.key}</p>
                    {setting.description && (
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    )}
                  </div>
                  <Input
                    defaultValue={setting.value}
                    className="w-64"
                    onBlur={(e) => {
                      if (e.target.value !== setting.value) {
                        updateSettingMutation.mutate({ key: setting.key, value: e.target.value });
                      }
                    }}
                    data-testid={`input-setting-value-${setting.key}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Audit Logs Component
function AuditLogs() {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logs</CardTitle>
        <CardDescription>Track all administrative actions</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <div className="divide-y">
            {logs?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No audit logs found
              </div>
            ) : (
              logs?.map((log: any) => (
                <div key={log.id} className="py-4 flex items-start gap-4" data-testid={`row-audit-${log.id}`}>
                  <div className="p-2 rounded-full bg-muted">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{log.action}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {log.entityType} - {log.entityId?.slice(0, 8)}
                      </span>
                    </div>
                    {log.details && (
                      <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.ipAddress && ` | IP: ${log.ipAddress}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Invoice Management Component
function InvoiceManagement() {
  const { toast } = useToast();
  const { data: invoices, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/invoices"],
  });

  const generatePendingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/invoices/generate-pending", {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Pending invoices generated" });
      refetch();
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Invoice Management</h3>
          <p className="text-sm text-muted-foreground">View and manage platform invoices</p>
        </div>
        <Button 
          onClick={() => generatePendingMutation.mutate()} 
          disabled={generatePendingMutation.isPending}
          data-testid="button-generate-pending-invoices"
        >
          {generatePendingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Generate Pending
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium">Invoice #</th>
                  <th className="h-10 px-4 text-left font-medium">Date</th>
                  <th className="h-10 px-4 text-left font-medium">Amount</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No invoices found
                    </td>
                  </tr>
                ) : (
                  invoices?.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0" data-testid={`row-invoice-${invoice.id}`}>
                      <td className="p-4 font-medium">{invoice.invoiceNumber}</td>
                      <td className="p-4">{new Date(invoice.issueDate).toLocaleDateString()}</td>
                      <td className="p-4">${Number(invoice.totalAmount).toFixed(2)}</td>
                      <td className="p-4">
                        <Badge variant={invoice.status === "paid" ? "default" : "secondary"}>
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          asChild
                        >
                          <a href={`/api/invoices/${invoice.id}/download`} target="_blank" rel="noreferrer">
                            <FileText className="h-4 w-4 mr-2" />
                            PDF
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Support Tickets Component
function SupportTickets() {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  const { data: tickets, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets"],
  });

  const { data: ticketMessages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets", selectedTicket?.id, "messages"],
    enabled: !!selectedTicket,
  });

  const messageForm = useForm({
    defaultValues: { message: "" },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, status, priority }: { id: string; status?: string; priority?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/support-tickets/${id}`, { status, priority });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to update ticket");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Ticket updated!" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      const response = await apiRequest("POST", `/api/admin/support-tickets/${ticketId}/messages`, { message });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to send message");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Message sent!" });
      messageForm.reset();
      refetchMessages();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Support Tickets</CardTitle>
          <CardDescription>Manage customer support requests</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {tickets?.map((ticket: any) => (
                <div
                  key={ticket.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTicket?.id === ticket.id ? 'border-primary bg-muted/50' : 'hover-elevate'
                  }`}
                  onClick={() => setSelectedTicket(ticket)}
                  data-testid={`card-ticket-${ticket.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ticket.subject}</p>
                      <p className="text-sm text-muted-foreground truncate">{ticket.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={
                        ticket.status === 'open' ? 'default' :
                        ticket.status === 'in_progress' ? 'secondary' :
                        ticket.status === 'resolved' ? 'outline' : 'destructive'
                      }>
                        {ticket.status?.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {ticket.priority}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedTicket ? `Ticket: ${selectedTicket.subject}` : 'Select a Ticket'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedTicket ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Select
                  value={selectedTicket.status}
                  onValueChange={(status) => {
                    updateTicketMutation.mutate({ id: selectedTicket.id, status });
                    setSelectedTicket({ ...selectedTicket, status });
                  }}
                >
                  <SelectTrigger className="w-36" data-testid="select-ticket-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={selectedTicket.priority}
                  onValueChange={(priority) => {
                    updateTicketMutation.mutate({ id: selectedTicket.id, priority });
                    setSelectedTicket({ ...selectedTicket, priority });
                  }}
                >
                  <SelectTrigger className="w-28" data-testid="select-ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">{selectedTicket.description}</p>
              </div>

              <ScrollArea className="h-[250px] border rounded-lg p-4">
                <div className="space-y-3">
                  {ticketMessages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${msg.isStaffReply ? 'bg-primary/10 ml-4' : 'bg-muted mr-4'}`}
                      data-testid={`message-${msg.id}`}
                    >
                      <p className="text-sm">{msg.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(msg.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Form {...messageForm}>
                <form onSubmit={messageForm.handleSubmit((data) => {
                  sendMessageMutation.mutate({ ticketId: selectedTicket.id, message: data.message });
                })} className="flex gap-2">
                  <FormField
                    control={messageForm.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} placeholder="Type your reply..." data-testid="input-ticket-reply" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={sendMessageMutation.isPending} data-testid="button-send-reply">
                    {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                  </Button>
                </form>
              </Form>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              Select a ticket to view details
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Pricing Management Component
function PricingManagement({ providers }: { providers: ProviderWithUser[] }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: pricingOverrides, refetch } = useQuery<ProviderPricingOverride[]>({
    queryKey: ["/api/admin/pricing-overrides"],
  });

  const pricingForm = useForm<{
    providerId: string;
    consultationFee?: number;
    homeVisitFee?: number;
    discountPercentage?: number;
    notes?: string;
  }>({
    defaultValues: {
      providerId: "",
      consultationFee: undefined,
      homeVisitFee: undefined,
      discountPercentage: undefined,
      notes: "",
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(editingId ? "PATCH" : "POST", 
        editingId ? `/api/admin/pricing-overrides/${editingId}` : "/api/admin/pricing-overrides", 
        data
      );
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || "Failed to save pricing override");
        return resData;
      } else {
        const text = await response.text();
        console.error("Non-JSON response:", text);
        throw new Error("Server returned an unexpected response format");
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Pricing updated!" : "Pricing override created!" });
      pricingForm.reset();
      setEditingId(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePricingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/pricing-overrides/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Pricing override deleted" });
      refetch();
    },
  });

  return (
    <div className="space-y-6">
      <Form {...pricingForm}>
        <form onSubmit={pricingForm.handleSubmit((data) => createPricingMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={pricingForm.control}
              name="providerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-pricing-provider">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.user.firstName} {p.user.lastName} - {p.specialization}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={pricingForm.control}
              name="consultationFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Consultation Fee ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-pricing-consultation" />
                  </FormControl>
                  <FormDescription>Leave empty to use provider's default</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={pricingForm.control}
              name="homeVisitFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Home Visit Fee ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-pricing-homevisit" />
                  </FormControl>
                  <FormDescription>Leave empty to use provider's default</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={pricingForm.control}
              name="discountPercentage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Percentage (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" max="100" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-pricing-discount" />
                  </FormControl>
                  <FormDescription>Applies to all provider's services</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={pricingForm.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} data-testid="input-pricing-notes" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={createPricingMutation.isPending} data-testid="button-save-pricing">
              {createPricingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">{editingId ? "Update" : "Create"} Override</span>
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={() => { setEditingId(null); pricingForm.reset(); }} data-testid="button-cancel-pricing">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Form>

      <div className="space-y-4">
        <h3 className="font-semibold">Active Pricing Overrides</h3>
        {pricingOverrides?.map((override) => {
          const provider = providers.find(p => p.id === override.providerId);
          return (
            <div key={override.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`row-pricing-${override.id}`}>
              <div>
                <p className="font-medium">{provider?.user.firstName} {provider?.user.lastName}</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  {override.consultationFee && <p>Consultation: ${Number(override.consultationFee).toFixed(2)}</p>}
                  {override.homeVisitFee && <p>Home Visit: ${Number(override.homeVisitFee).toFixed(2)}</p>}
                  {override.discountPercentage && <p>Discount: {Number(override.discountPercentage)}%</p>}
                  {override.notes && <p className="italic">{override.notes}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(override.id);
                    pricingForm.reset({
                      providerId: override.providerId,
                      consultationFee: override.consultationFee ? Number(override.consultationFee) : undefined,
                      homeVisitFee: override.homeVisitFee ? Number(override.homeVisitFee) : undefined,
                      discountPercentage: override.discountPercentage ? Number(override.discountPercentage) : undefined,
                      notes: override.notes || "",
                    });
                  }}
                  data-testid={`button-edit-pricing-${override.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deletePricingMutation.mutate(override.id)}
                  data-testid={`button-delete-pricing-${override.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Promo Code Management Component
function PromoCodeManagement({ providers }: { providers: ProviderWithUser[] }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: promoCodes, refetch } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const promoForm = useForm<{
    code: string;
    description: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    maxUses?: number;
    validFrom: string;
    validUntil: string;
    applicableProviders?: string[];
    minAmount?: number;
  }>({
    defaultValues: {
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 0,
      maxUses: undefined,
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      applicableProviders: [],
      minAmount: undefined,
    },
  });

  const createPromoMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(editingId ? "PATCH" : "POST",
        editingId ? `/api/admin/promo-codes/${editingId}` : "/api/admin/promo-codes",
        data
      );
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to save promo code");
      return resData;
    },
    onSuccess: () => {
      toast({ title: editingId ? "Promo code updated!" : "Promo code created!" });
      promoForm.reset();
      setEditingId(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePromoMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to delete");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Promo code deleted" });
      refetch();
    },
  });

  return (
    <div className="space-y-6">
      <Form {...promoForm}>
        <form onSubmit={promoForm.handleSubmit((data) => createPromoMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={promoForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Promo Code</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="SUMMER2024" onChange={e => field.onChange(e.target.value.toUpperCase())} data-testid="input-promo-code" />
                  </FormControl>
                  <FormDescription>Will be converted to uppercase</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="discountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-promo-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="discountValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount Value</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} data-testid="input-promo-value" />
                  </FormControl>
                  <FormDescription>
                    {promoForm.watch("discountType") === "percentage" ? "Percentage (0-100)" : "Dollar amount"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="maxUses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Uses (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} data-testid="input-promo-max-uses" />
                  </FormControl>
                  <FormDescription>Leave empty for unlimited</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="validFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valid From</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-promo-valid-from" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="validUntil"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valid Until</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-promo-valid-until" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={promoForm.control}
              name="minAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Amount ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} data-testid="input-promo-min-amount" />
                  </FormControl>
                  <FormDescription>Minimum booking amount required</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={promoForm.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} data-testid="input-promo-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={createPromoMutation.isPending} data-testid="button-save-promo">
              {createPromoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">{editingId ? "Update" : "Create"} Promo Code</span>
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={() => { setEditingId(null); promoForm.reset(); }} data-testid="button-cancel-promo">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Form>

      <div className="space-y-4">
        <h3 className="font-semibold">Active Promo Codes</h3>
        {promoCodes?.map((promo) => (
          <div key={promo.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`row-promo-${promo.id}`}>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono font-bold text-lg">{promo.code}</p>
                <Badge variant={promo.isActive ? 'default' : 'secondary'}>
                  {promo.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{promo.description}</p>
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                <p>
                  Discount: {promo.discountType === "percentage" 
                    ? `${Number(promo.discountValue)}%` 
                    : `$${Number(promo.discountValue)}`}
                </p>
                <p>Valid: {new Date(promo.validFrom).toLocaleDateString()} - {new Date(promo.validUntil).toLocaleDateString()}</p>
                {promo.maxUses && <p>Uses: {promo.usedCount || 0} / {promo.maxUses}</p>}
                {promo.minAmount && <p>Min Amount: ${Number(promo.minAmount)}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingId(promo.id);
                  promoForm.reset({
                    code: promo.code,
                    description: promo.description || "",
                    discountType: promo.discountType as "percentage" | "fixed",
                    discountValue: Number(promo.discountValue),
                    maxUses: promo.maxUses || undefined,
                    validFrom: new Date(promo.validFrom).toISOString().split('T')[0],
                    validUntil: new Date(promo.validUntil).toISOString().split('T')[0],
                    minAmount: promo.minAmount ? Number(promo.minAmount) : undefined,
                  });
                }}
                data-testid={`button-edit-promo-${promo.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deletePromoMutation.mutate(promo.id)}
                data-testid={`button-delete-promo-${promo.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Users Management Component
function UsersManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { data: users, isLoading, refetch } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, isSuspended, reason }: { id: string; isSuspended: boolean; reason?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${id}/suspend`, {
        isSuspended,
        suspensionReason: reason
      });
      if (!response.ok) throw new Error("Failed to update user status");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("admin.user_updated") });
      refetch();
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("admin.user_deleted") });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const filteredUsers = users?.filter((u: User) => {
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    const email = u.email.toLowerCase();
    const search = searchQuery.toLowerCase();
    const matchesSearch = fullName.includes(search) || email.includes(search);
    return matchesRole && matchesSearch;
  }) || [];

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-user-search"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40" data-testid="select-user-role-filter">
            <SelectValue placeholder={t("admin.filter_by_status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.all_bookings")}</SelectItem>
            <SelectItem value="patient">{t("common.patient_looking")}</SelectItem>
            <SelectItem value="provider">{t("common.healthcare_provider")}</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t("admin.showing_bookings", { count: filteredUsers.length })}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users")}</CardTitle>
          <CardDescription>{t("admin.bookings_management")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {filteredUsers.map((user) => (
              <div key={user.id} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{user.firstName} {user.lastName}</span>
                    {user.isSuspended && <Badge variant="destructive">{t("admin.cancelled")}</Badge>}
                    <Badge variant="outline">{user.role}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setSelectedUser(user)}
                    data-testid={`button-view-user-${user.id}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {t("admin.view")}
                  </Button>
                  {user.isSuspended ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => suspendMutation.mutate({ id: user.id, isSuspended: false })}
                    >
                      {t("admin.active")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        const reason = window.prompt(t("admin.bio"));
                        if (reason !== null) {
                          suspendMutation.mutate({ id: user.id, isSuspended: true, reason });
                        }
                      }}
                    >
                      {t("admin.cancelled")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(t("admin.delete"))) {
                        deleteUserMutation.mutate(user.id);
                      }
                    }}
                    data-testid={`button-delete-user-${user.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.provider_details")}</DialogTitle>
            <DialogDescription>{t("admin.full_profile_info", { name: `${selectedUser?.firstName} ${selectedUser?.lastName}` })}</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("admin.name")}</p>
                <p>{selectedUser.firstName} {selectedUser.lastName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("common.email")}</p>
                <p>{selectedUser.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("common.phone")}</p>
                <p>{selectedUser.phone || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("admin.type")}</p>
                <p className="capitalize">{selectedUser.role}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("setup.city")}</p>
                <p>{selectedUser.city || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("admin.joined_on")}</p>
                <p>{selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : 'N/A'}</p>
              </div>
              <div className="col-span-2 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("booking.address")}</p>
                <p>{selectedUser.address || 'Not provided'}</p>
              </div>
              {selectedUser.isSuspended && (
                <div className="col-span-2 p-3 bg-destructive/10 rounded-md border border-destructive/20 mt-2">
                  <p className="text-sm font-semibold text-destructive">{t("admin.cancelled")}</p>
                  <p className="text-sm text-destructive/80 mt-1">{t("admin.bio")}: {selectedUser.suspensionReason || 'No reason provided'}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Sub-services Management Component
function SubServicesManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const form = useForm({
    defaultValues: {
      name: "",
      category: "physiotherapist",
      description: "",
      platformFee: "0.00",
    }
  });

  const { data: subServices, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/sub-services"],
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingId ? `/api/admin/sub-services/${editingId}` : "/api/admin/sub-services";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiRequest(method, url, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingId ? "Sub-service updated" : "Sub-service created" });
      setIsAdding(false);
      setEditingId(null);
      form.reset();
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sub-services"] });
    }
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">{t("admin.sub_services_fees")}</h3>
        <Button onClick={() => setIsAdding(true)} size="sm" data-testid="button-add-subservice">
          <Plus className="h-4 w-4 mr-2" /> {t("admin.add_subservice")}
        </Button>
      </div>

      {(isAdding || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? t("admin.edit") : t("admin.add")} {t("setup.sub_services")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.name")}</FormLabel>
                        <FormControl><Input {...field} data-testid="input-subservice-name" /></FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("setup.provider_type")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger data-testid="select-subservice-category"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="physiotherapist">{t("common.physiotherapists")}</SelectItem>
                            <SelectItem value="doctor">{t("common.doctors")}</SelectItem>
                            <SelectItem value="nurse">{t("common.nurses")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="platformFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("booking.platform_fee")} ($)</FormLabel>
                      <FormControl><Input {...field} type="number" step="0.01" data-testid="input-platform-fee" /></FormControl>
                      <FormDescription>{t("admin.platform_fee_desc")}</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("setup.about_you")}</FormLabel>
                      <FormControl><Textarea {...field} data-testid="textarea-subservice-description" /></FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsAdding(false); setEditingId(null); }} data-testid="button-cancel-subservice">{t("admin.cancelled")}</Button>
                  <Button type="submit" disabled={mutation.isPending} data-testid="button-save-subservice">
                    {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save_changes")}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {subServices?.map((service) => (
          <Card key={service.id} data-testid={`card-subservice-${service.id}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <div>
                <CardTitle className="text-sm font-bold">{service.name}</CardTitle>
                <CardDescription className="capitalize">{service.category}</CardDescription>
              </div>
              <Badge variant="secondary">${service.platformFee || "0.00"}</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-4">{service.description}</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditingId(service.id);
                  form.reset({
                    name: service.name,
                    category: service.category,
                    description: service.description || "",
                    platformFee: service.platformFee || "0.00",
                  });
                }} data-testid={`button-edit-subservice-${service.id}`}><Edit className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
}
