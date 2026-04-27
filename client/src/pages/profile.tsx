import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  User as UserIcon, Mail, Phone, MapPin, Save, Lock, Eye, EyeOff, Loader2,
  Activity, Settings, Heart, Shield, Camera, Briefcase, X, CheckCircle2, Calendar,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import i18n from "@/lib/i18n";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  mobileNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  gender: string;
  dateOfBirth: string;
  preferredPronouns: string;
  occupation: string;
  maritalStatus: string;
  socialNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  bloodGroup: string;
  heightCm: string;
  weightKg: string;
  knownAllergies: string;
  medicalConditions: string;
  currentMedications: string;
  pastSurgeries: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  primaryCarePhysician: string;
  avatarUrl: string;
  // Preferences
  languagePreference: string;
  preferredCurrency: string;
  // Provider fields
  professionalTitle: string;
  specialization: string;
  bio: string;
  yearsExperience: number;
  licenseNumber: string;
  consultationFee: string;
};

const emptyForm: FormState = {
  firstName: "", lastName: "", phone: "", mobileNumber: "",
  address: "", city: "", state: "", zipCode: "",
  gender: "", dateOfBirth: "", preferredPronouns: "", occupation: "", maritalStatus: "",
  socialNumber: "",
  emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelation: "",
  bloodGroup: "", heightCm: "", weightKg: "",
  knownAllergies: "", medicalConditions: "", currentMedications: "", pastSurgeries: "",
  insuranceProvider: "", insurancePolicyNumber: "", primaryCarePhysician: "",
  avatarUrl: "",
  languagePreference: "en", preferredCurrency: "",
  professionalTitle: "", specialization: "", bio: "",
  yearsExperience: 0, licenseNumber: "", consultationFee: "0",
};

export default function Profile() {
  const { t } = useTranslation();
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: providerData } = useQuery<any>({
    queryKey: ["/api/provider/me"],
    enabled: user?.role === "provider",
  });

  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "", newPassword: "", confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false, new: false, confirm: false,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      const u = user as any;
      setFormData({
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        phone: u.phone || "",
        mobileNumber: u.mobileNumber || "",
        address: u.address || "",
        city: u.city || "",
        state: u.state || "",
        zipCode: u.zipCode || "",
        gender: u.gender || "",
        dateOfBirth: u.dateOfBirth ? new Date(u.dateOfBirth).toISOString().slice(0, 10) : "",
        preferredPronouns: u.preferredPronouns || "",
        occupation: u.occupation || "",
        maritalStatus: u.maritalStatus || "",
        socialNumber: u.socialNumber || "",
        emergencyContactName: u.emergencyContactName || "",
        emergencyContactPhone: u.emergencyContactPhone || "",
        emergencyContactRelation: u.emergencyContactRelation || "",
        bloodGroup: u.bloodGroup || "",
        heightCm: u.heightCm != null ? String(u.heightCm) : "",
        weightKg: u.weightKg != null ? String(u.weightKg) : "",
        knownAllergies: u.knownAllergies || "",
        medicalConditions: u.medicalConditions || "",
        currentMedications: u.currentMedications || "",
        pastSurgeries: u.pastSurgeries || "",
        insuranceProvider: u.insuranceProvider || "",
        insurancePolicyNumber: u.insurancePolicyNumber || "",
        primaryCarePhysician: u.primaryCarePhysician || "",
        avatarUrl: u.avatarUrl || "",
        languagePreference: u.languagePreference || "en",
        preferredCurrency: u.preferredCurrency || "",
        professionalTitle: providerData?.professionalTitle || "",
        specialization: providerData?.specialization || "",
        bio: providerData?.bio || "",
        yearsExperience: providerData?.yearsExperience || 0,
        licenseNumber: providerData?.licenseNumber || "",
        consultationFee: providerData?.consultationFee || "0",
      });
    }
  }, [user, providerData]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = reader.result as string;
          const res = await apiRequest("POST", "/api/upload", { image: base64 });
          const data = await res.json();
          await apiRequest("PATCH", "/api/auth/profile", { avatarUrl: data.url });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          setFormData(prev => ({ ...prev, avatarUrl: data.url }));
          toast({
            title: t("profile_page.toast_image_uploaded", "Photo updated"),
            description: t("profile_page.toast_image_uploaded_desc", "Your profile photo has been updated."),
          });
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast({ title: t("profile_page.toast_upload_failed", "Upload failed"), variant: "destructive" });
      setIsUploading(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsGalleryUploading(true);
    try {
      const uploadPromises = Array.from(files).map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            const res = await apiRequest("POST", "/api/upload", { image: base64 });
            const data = await res.json();
            resolve(data.url);
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }));
      const urls = await Promise.all(uploadPromises);
      const currentGallery = (user as any)?.gallery || [];
      const updatedGallery = [...currentGallery, ...urls];
      await apiRequest("PATCH", "/api/auth/profile", { gallery: updatedGallery });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: t("profile_page.toast_gallery_updated", "Gallery updated"),
        description: t("profile_page.toast_gallery_updated_desc", "{{count}} image(s) uploaded successfully.", { count: urls.length }),
      });
    } catch (error) {
      toast({ title: t("profile_page.toast_upload_failed", "Upload failed"), variant: "destructive" });
    } finally {
      setIsGalleryUploading(false);
    }
  };

  const handleRemoveGalleryImage = async (index: number) => {
    try {
      const currentGallery = (user as any)?.gallery || [];
      const updatedGallery = currentGallery.filter((_: any, i: number) => i !== index);
      await apiRequest("PATCH", "/api/auth/profile", { gallery: updatedGallery });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: t("profile_page.toast_image_removed", "Image removed") });
    } catch (error) {
      toast({ title: t("profile_page.toast_failed_remove", "Failed to remove image"), variant: "destructive" });
    }
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: FormState) => {
      // Send only the user-profile fields (not provider-specific ones — those are
      // managed in the provider dashboard).
      const payload: any = {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        mobileNumber: data.mobileNumber,
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth || null,
        preferredPronouns: data.preferredPronouns || null,
        occupation: data.occupation || null,
        maritalStatus: data.maritalStatus || null,
        socialNumber: data.socialNumber,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        emergencyContactRelation: data.emergencyContactRelation || null,
        bloodGroup: data.bloodGroup,
        heightCm: data.heightCm === "" ? null : data.heightCm,
        weightKg: data.weightKg === "" ? null : data.weightKg,
        knownAllergies: data.knownAllergies,
        medicalConditions: data.medicalConditions,
        currentMedications: data.currentMedications,
        pastSurgeries: data.pastSurgeries,
        insuranceProvider: data.insuranceProvider || null,
        insurancePolicyNumber: data.insurancePolicyNumber || null,
        primaryCarePhysician: data.primaryCarePhysician || null,
        languagePreference: data.languagePreference || null,
        preferredCurrency: data.preferredCurrency || null,
      };
      const response = await apiRequest("PATCH", "/api/auth/profile", payload);
      if (!response.ok) throw new Error("Failed to update profile");
      return response.json();
    },
    onSuccess: (_data, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      // Apply the new preferred language right away so the UI reflects it
      // without forcing a refresh.
      if (variables?.languagePreference && variables.languagePreference !== i18n.language) {
        void i18n.changeLanguage(variables.languagePreference);
      }
      toast({
        title: t("profile_page.toast_profile_updated", "Profile updated"),
        description: t("profile_page.toast_profile_updated_desc", "Your profile has been updated successfully."),
      });
    },
    onError: () => {
      toast({
        title: t("dashboard.error", "Error"),
        description: t("profile_page.toast_profile_failed", "Failed to update profile. Please try again."),
        variant: "destructive",
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: typeof passwordData) => {
      if (data.newPassword !== data.confirmPassword) {
        throw new Error(t("profile_page.toast_passwords_no_match", "New passwords do not match"));
      }
      const response = await apiRequest("POST", "/api/auth/reset-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset password");
      }
      return response.json();
    },
    onSuccess: () => {
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({
        title: t("profile_page.toast_password_reset", "Password reset"),
        description: t("profile_page.toast_password_reset_desc", "Your password has been reset successfully."),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("dashboard.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const getInitials = (firstName?: string, lastName?: string) =>
    `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase() || "U";

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setFormData((p) => ({ ...p, [k]: v }));

  const completion = useMemo(() => {
    if (!user) return 0;
    const fields = [
      formData.firstName, formData.lastName, formData.phone, formData.address,
      formData.city, formData.gender, formData.dateOfBirth,
      formData.emergencyContactName, formData.emergencyContactPhone,
    ];
    if (user.role === "patient") {
      fields.push(formData.bloodGroup, formData.knownAllergies, formData.medicalConditions);
    }
    const filled = fields.filter((f) => f && String(f).trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [formData, user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-96 w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const isPatient = user.role === "patient";
  const isProvider = user.role === "provider";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-profile-title">
            {t("common.profile_label", "Profile")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("profile_page.subtitle", "Manage your personal information, medical details, and account settings.")}
          </p>
        </div>

        {/* Profile header card */}
        <Card className="mb-6 overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
          <CardContent className="pt-0 pb-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end -mt-12">
              <div className="relative group shrink-0">
                <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
                  <AvatarImage src={formData.avatarUrl || user.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                    {getInitials(user.firstName, user.lastName)}
                  </AvatarFallback>
                </Avatar>
                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-md hover:bg-primary/90 transition-colors"
                  data-testid="label-avatar-upload"
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  <input
                    id="avatar-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                    data-testid="input-avatar-upload"
                  />
                </label>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-semibold truncate" data-testid="text-user-name">
                  {user.firstName} {user.lastName}
                </h2>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate" data-testid="text-user-email">{user.email}</span>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Badge variant="secondary" className="capitalize" data-testid="badge-user-role">
                    {user.role === "patient" ? t("profile_page.patient", "Patient") :
                     user.role === "provider" ? t("profile_page.healthcare_provider", "Healthcare Provider") :
                     user.role}
                  </Badge>
                  {isProvider && providerData?.isVerified && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t("profile_page.verified", "Verified")}
                    </Badge>
                  )}
                  {(user as any).isEmailVerified && (
                    <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-400 dark:border-green-800">
                      <Mail className="h-3 w-3 mr-1" />
                      {t("profile_page.email_verified", "Email Verified")}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <div className="text-xs text-muted-foreground">
                  {t("profile_page.profile_completion", "Profile completion")}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${completion}%` }}
                      data-testid="bar-completion"
                    />
                  </div>
                  <span className="text-sm font-semibold tabular-nums" data-testid="text-completion-pct">{completion}%</span>
                </div>
                {isProvider && (
                  <Button variant="outline" size="sm" asChild className="mt-2">
                    <Link href="/provider/dashboard" data-testid="link-provider-dashboard">
                      <Settings className="h-4 w-4 mr-2" />
                      {t("profile_page.go_to_provider_dashboard", "Provider Dashboard")}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Provider summary (read-only) */}
        {isProvider && providerData && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                {t("profile_page.professional_information", "Professional Information")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("profile_page.specialization", "Specialization")}</p>
                  <p className="font-medium mt-0.5">{providerData.specialization || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("profile_page.experience", "Experience")}</p>
                  <p className="font-medium mt-0.5">{providerData.yearsExperience || 0} {t("profile_page.years", "yrs")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("profile_page.license_number", "License")}</p>
                  <p className="font-medium mt-0.5 truncate">{providerData.licenseNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">{t("profile_page.consultation_fee", "Fee")}</p>
                  <p className="font-medium mt-0.5">{providerData.currency} {providerData.consultationFee || "0"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start h-auto p-1 flex-wrap bg-card border" data-testid="tabs-profile">
              <TabsTrigger value="personal" data-testid="tab-personal">
                <UserIcon className="h-4 w-4 mr-2" />
                {t("profile_page.tab_personal", "Personal")}
              </TabsTrigger>
              <TabsTrigger value="address" data-testid="tab-address">
                <MapPin className="h-4 w-4 mr-2" />
                {t("profile_page.tab_address", "Address")}
              </TabsTrigger>
              {isPatient && (
                <TabsTrigger value="medical" data-testid="tab-medical">
                  <Heart className="h-4 w-4 mr-2" />
                  {t("profile_page.tab_medical", "Medical")}
                </TabsTrigger>
              )}
              {isPatient && (
                <TabsTrigger value="insurance" data-testid="tab-insurance">
                  <Shield className="h-4 w-4 mr-2" />
                  {t("profile_page.tab_insurance", "Insurance")}
                </TabsTrigger>
              )}
              <TabsTrigger value="emergency" data-testid="tab-emergency">
                <Phone className="h-4 w-4 mr-2" />
                {t("profile_page.tab_emergency", "Emergency")}
              </TabsTrigger>
              {isProvider && (
                <TabsTrigger value="provider" data-testid="tab-provider">
                  <Briefcase className="h-4 w-4 mr-2" />
                  {t("profile_page.tab_provider", "Professional")}
                </TabsTrigger>
              )}
              {isProvider && (
                <TabsTrigger value="gallery" data-testid="tab-gallery">
                  <Camera className="h-4 w-4 mr-2" />
                  {t("profile_page.tab_gallery", "Gallery")}
                </TabsTrigger>
              )}
              <TabsTrigger value="preferences" data-testid="tab-preferences">
                <Settings className="h-4 w-4 mr-2" />
                {t("profile_page.tab_preferences", "Preferences")}
              </TabsTrigger>
              <TabsTrigger value="security" data-testid="tab-security">
                <Lock className="h-4 w-4 mr-2" />
                {t("profile_page.tab_security", "Security")}
              </TabsTrigger>
            </TabsList>

            {/* PERSONAL */}
            <TabsContent value="personal" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("profile_page.personal_info", "Personal Information")}</CardTitle>
                  <CardDescription>{t("profile_page.personal_info_desc", "Basic details about you used across appointments and communications.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">{t("common.first_name")}</Label>
                      <Input id="firstName" value={formData.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                        data-testid="input-first-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">{t("common.last_name")}</Label>
                      <Input id="lastName" value={formData.lastName}
                        onChange={(e) => set("lastName", e.target.value)}
                        data-testid="input-last-name" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">{t("profile_page.dob", "Date of Birth")}</Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input id="dateOfBirth" type="date" className="pl-10" value={formData.dateOfBirth}
                          onChange={(e) => set("dateOfBirth", e.target.value)}
                          data-testid="input-dob" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">{t("profile_page.gender", "Gender")}</Label>
                      <Select value={formData.gender} onValueChange={(v) => set("gender", v)}>
                        <SelectTrigger id="gender" data-testid="select-gender">
                          <SelectValue placeholder={t("profile_page.select_gender", "Select gender")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">{t("profile_page.male", "Male")}</SelectItem>
                          <SelectItem value="female">{t("profile_page.female", "Female")}</SelectItem>
                          <SelectItem value="other">{t("profile_page.other", "Other")}</SelectItem>
                          <SelectItem value="prefer_not_to_say">{t("profile_page.prefer_not_to_say", "Prefer not to say")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="preferredPronouns">{t("profile_page.pronouns", "Preferred Pronouns")}</Label>
                      <Select value={formData.preferredPronouns} onValueChange={(v) => set("preferredPronouns", v)}>
                        <SelectTrigger id="preferredPronouns" data-testid="select-pronouns">
                          <SelectValue placeholder={t("profile_page.select_pronouns", "Select pronouns")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="he/him">he/him</SelectItem>
                          <SelectItem value="she/her">she/her</SelectItem>
                          <SelectItem value="they/them">they/them</SelectItem>
                          <SelectItem value="other">{t("profile_page.other", "Other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maritalStatus">{t("profile_page.marital_status", "Marital Status")}</Label>
                      <Select value={formData.maritalStatus} onValueChange={(v) => set("maritalStatus", v)}>
                        <SelectTrigger id="maritalStatus" data-testid="select-marital">
                          <SelectValue placeholder={t("profile_page.select_marital", "Select status")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">{t("profile_page.single", "Single")}</SelectItem>
                          <SelectItem value="married">{t("profile_page.married", "Married")}</SelectItem>
                          <SelectItem value="divorced">{t("profile_page.divorced", "Divorced")}</SelectItem>
                          <SelectItem value="widowed">{t("profile_page.widowed", "Widowed")}</SelectItem>
                          <SelectItem value="prefer_not_to_say">{t("profile_page.prefer_not_to_say", "Prefer not to say")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="occupation">{t("profile_page.occupation", "Occupation")}</Label>
                      <Input id="occupation" value={formData.occupation}
                        onChange={(e) => set("occupation", e.target.value)}
                        placeholder={t("profile_page.occupation_placeholder", "e.g. Teacher")}
                        data-testid="input-occupation" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="socialNumber">{t("profile_page.social_id", "Social Security / ID Number")}</Label>
                      <Input id="socialNumber" value={formData.socialNumber}
                        onChange={(e) => set("socialNumber", e.target.value)}
                        placeholder={t("profile_page.id_placeholder", "ID Number")}
                        data-testid="input-social" />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t("profile_page.phone_number", "Phone Number")}</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input id="phone" type="tel" className="pl-10" value={formData.phone}
                          onChange={(e) => set("phone", e.target.value)}
                          placeholder={t("profile_page.phone_placeholder", "Phone number")}
                          data-testid="input-phone" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mobileNumber">{t("profile_page.mobile_number", "Mobile Number")}</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input id="mobileNumber" type="tel" className="pl-10" value={formData.mobileNumber}
                          onChange={(e) => set("mobileNumber", e.target.value)}
                          placeholder={t("profile_page.mobile_placeholder", "Mobile number")}
                          data-testid="input-mobile" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ADDRESS */}
            <TabsContent value="address" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("profile_page.address_info", "Address")}</CardTitle>
                  <CardDescription>{t("profile_page.address_info_desc", "Where we can reach you for in-person visits and correspondence.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="address">{t("profile_page.address", "Street Address")}</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input id="address" className="pl-10" value={formData.address}
                        onChange={(e) => set("address", e.target.value)}
                        placeholder={t("profile_page.address_placeholder", "Your address")}
                        data-testid="input-address" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("profile_page.city", "City")}</Label>
                      <Input id="city" value={formData.city}
                        onChange={(e) => set("city", e.target.value)}
                        data-testid="input-city" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">{t("profile_page.state", "State / Province")}</Label>
                      <Input id="state" value={formData.state}
                        onChange={(e) => set("state", e.target.value)}
                        data-testid="input-state" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zipCode">{t("profile_page.zip_code", "Zip / Postal Code")}</Label>
                      <Input id="zipCode" value={formData.zipCode}
                        onChange={(e) => set("zipCode", e.target.value)}
                        data-testid="input-zip" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* MEDICAL (patient) */}
            {isPatient && (
              <TabsContent value="medical" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="h-5 w-5 text-rose-500" />
                      {t("profile_page.medical_information", "Medical Information")}
                    </CardTitle>
                    <CardDescription>
                      {t("profile_page.medical_information_desc", "This information helps our healthcare professionals provide safe and personalized care.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bloodGroup">{t("profile_page.blood_group", "Blood Group")}</Label>
                        <Select value={formData.bloodGroup} onValueChange={(v) => set("bloodGroup", v)}>
                          <SelectTrigger id="bloodGroup" data-testid="select-blood-group">
                            <SelectValue placeholder={t("profile_page.select_blood_group", "Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"].map(g => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="heightCm">{t("profile_page.height_cm", "Height (cm)")}</Label>
                        <Input id="heightCm" type="number" min={0} value={formData.heightCm}
                          onChange={(e) => set("heightCm", e.target.value)}
                          placeholder="170"
                          data-testid="input-height" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="weightKg">{t("profile_page.weight_kg", "Weight (kg)")}</Label>
                        <Input id="weightKg" type="number" min={0} step="0.1" value={formData.weightKg}
                          onChange={(e) => set("weightKg", e.target.value)}
                          placeholder="70"
                          data-testid="input-weight" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="knownAllergies">{t("profile_page.known_allergies", "Known Allergies")}</Label>
                      <Textarea id="knownAllergies" value={formData.knownAllergies}
                        onChange={(e) => set("knownAllergies", e.target.value)}
                        placeholder={t("profile_page.allergies_placeholder", "List any allergies (medications, food, substances). Write \u201CNone\u201D if not applicable.")}
                        className="min-h-[80px]"
                        data-testid="input-allergies" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="medicalConditions">{t("profile_page.existing_conditions", "Existing Medical Conditions")}</Label>
                      <Textarea id="medicalConditions" value={formData.medicalConditions}
                        onChange={(e) => set("medicalConditions", e.target.value)}
                        placeholder={t("profile_page.conditions_placeholder", "Chronic conditions like diabetes, hypertension, asthma, etc.")}
                        className="min-h-[80px]"
                        data-testid="input-conditions" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="currentMedications">{t("profile_page.current_medications", "Current Medications")}</Label>
                      <Textarea id="currentMedications" value={formData.currentMedications}
                        onChange={(e) => set("currentMedications", e.target.value)}
                        placeholder={t("profile_page.medications_placeholder", "Medications you take regularly (with dosage if known).")}
                        className="min-h-[80px]"
                        data-testid="input-medications" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pastSurgeries">{t("profile_page.past_surgeries", "Past Surgeries / Hospitalizations")}</Label>
                      <Textarea id="pastSurgeries" value={formData.pastSurgeries}
                        onChange={(e) => set("pastSurgeries", e.target.value)}
                        placeholder={t("profile_page.surgeries_placeholder", "Major surgeries or hospital stays with approximate dates.")}
                        className="min-h-[80px]"
                        data-testid="input-surgeries" />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* INSURANCE (patient) */}
            {isPatient && (
              <TabsContent value="insurance" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-blue-500" />
                      {t("profile_page.insurance_info", "Insurance & Care Provider")}
                    </CardTitle>
                    <CardDescription>{t("profile_page.insurance_info_desc", "Optional information that may be useful during visits.")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="insuranceProvider">{t("profile_page.insurance_provider", "Insurance Provider")}</Label>
                        <Input id="insuranceProvider" value={formData.insuranceProvider}
                          onChange={(e) => set("insuranceProvider", e.target.value)}
                          placeholder={t("profile_page.insurance_provider_placeholder", "e.g. Blue Cross")}
                          data-testid="input-insurance-provider" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="insurancePolicyNumber">{t("profile_page.policy_number", "Policy Number")}</Label>
                        <Input id="insurancePolicyNumber" value={formData.insurancePolicyNumber}
                          onChange={(e) => set("insurancePolicyNumber", e.target.value)}
                          data-testid="input-policy-number" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryCarePhysician">{t("profile_page.pcp", "Primary Care Physician")}</Label>
                      <Input id="primaryCarePhysician" value={formData.primaryCarePhysician}
                        onChange={(e) => set("primaryCarePhysician", e.target.value)}
                        placeholder={t("profile_page.pcp_placeholder", "Name of your usual doctor")}
                        data-testid="input-pcp" />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* EMERGENCY */}
            <TabsContent value="emergency" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("profile_page.emergency_contact", "Emergency Contact")}</CardTitle>
                  <CardDescription>{t("profile_page.emergency_contact_desc", "Who to call if there's an emergency during a visit.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactName">{t("profile_page.contact_name", "Contact Name")}</Label>
                      <Input id="emergencyContactName" value={formData.emergencyContactName}
                        onChange={(e) => set("emergencyContactName", e.target.value)}
                        placeholder={t("profile_page.contact_name_placeholder", "Full name")}
                        data-testid="input-emergency-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactPhone">{t("profile_page.contact_phone", "Contact Phone")}</Label>
                      <Input id="emergencyContactPhone" type="tel" value={formData.emergencyContactPhone}
                        onChange={(e) => set("emergencyContactPhone", e.target.value)}
                        placeholder={t("profile_page.contact_phone_placeholder", "Phone number")}
                        data-testid="input-emergency-phone" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactRelation">{t("profile_page.contact_relation", "Relationship")}</Label>
                    <Select value={formData.emergencyContactRelation} onValueChange={(v) => set("emergencyContactRelation", v)}>
                      <SelectTrigger id="emergencyContactRelation" data-testid="select-emergency-relation">
                        <SelectValue placeholder={t("profile_page.select_relation", "Select relationship")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spouse">{t("profile_page.spouse", "Spouse / Partner")}</SelectItem>
                        <SelectItem value="parent">{t("profile_page.parent", "Parent")}</SelectItem>
                        <SelectItem value="sibling">{t("profile_page.sibling", "Sibling")}</SelectItem>
                        <SelectItem value="child">{t("profile_page.child", "Child")}</SelectItem>
                        <SelectItem value="friend">{t("profile_page.friend", "Friend")}</SelectItem>
                        <SelectItem value="other">{t("profile_page.other", "Other")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* PROVIDER */}
            {isProvider && (
              <TabsContent value="provider" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("profile_page.professional_information", "Professional Information")}</CardTitle>
                    <CardDescription>
                      {t("profile_page.professional_info_edit_desc", "These details are managed in the Provider Dashboard. View-only here.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("profile_page.professional_title_label", "Professional Title")}</Label>
                        <Input value={formData.professionalTitle} disabled data-testid="readonly-pro-title" />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("profile_page.specialization", "Specialization")}</Label>
                        <Input value={formData.specialization} disabled data-testid="readonly-specialization" />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("profile_page.years_experience", "Years of Experience")}</Label>
                        <Input value={formData.yearsExperience} disabled data-testid="readonly-experience" />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("profile_page.consultation_fee", "Consultation Fee")}</Label>
                        <Input value={formData.consultationFee} disabled data-testid="readonly-fee" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("profile_page.license_label", "License Number")}</Label>
                      <Input value={formData.licenseNumber} disabled data-testid="readonly-license" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("profile_page.bio_label", "Professional Bio")}</Label>
                      <Textarea value={formData.bio} disabled className="min-h-[100px]" data-testid="readonly-bio" />
                    </div>
                    <Button type="button" variant="outline" asChild>
                      <Link href="/provider/dashboard" data-testid="link-edit-provider">
                        <Settings className="h-4 w-4 mr-2" />
                        {t("profile_page.edit_in_dashboard", "Edit in Provider Dashboard")}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* GALLERY */}
            {isProvider && (
              <TabsContent value="gallery" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Camera className="h-5 w-5" />
                        {t("profile_page.gallery_certificates", "Gallery & Certificates")}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {t("profile_page.gallery_desc", "Upload clinic photos, certificates, and other documents")}
                      </CardDescription>
                    </div>
                    <div className="relative shrink-0">
                      <Button type="button" size="sm" disabled={isGalleryUploading} className="relative overflow-hidden" data-testid="button-upload-gallery">
                        {isGalleryUploading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4 mr-2" />
                        )}
                        {t("profile_page.upload", "Upload")}
                        <input
                          type="file"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          multiple accept="image/*"
                          onChange={handleGalleryUpload}
                          disabled={isGalleryUploading}
                        />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {((user as any).gallery || []).map((img: string, idx: number) => (
                        <div key={idx} className="group relative aspect-square rounded-lg overflow-hidden border" data-testid={`gallery-item-${idx}`}>
                          <img src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleRemoveGalleryImage(idx)}
                              data-testid={`button-remove-gallery-${idx}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(!(user as any).gallery || (user as any).gallery.length === 0) && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg text-muted-foreground">
                          <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>{t("profile_page.empty_gallery", "No images uploaded yet. Upload clinic pics or certificates here.")}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* SECURITY */}
            <TabsContent value="preferences" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("profile_page.preferences_title", "Language & Currency")}</CardTitle>
                  <CardDescription>
                    {t(
                      "profile_page.preferences_desc",
                      "Choose how the app should appear when you sign in. Currency is shown across the app while prices stay stored in HUF.",
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("profile_page.preferred_language", "Preferred language")}</Label>
                    <Select
                      value={formData.languagePreference || "en"}
                      onValueChange={(v) => set("languagePreference", v)}
                    >
                      <SelectTrigger data-testid="select-preferred-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="hu">Magyar</SelectItem>
                        <SelectItem value="fa">فارسی</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "profile_page.preferred_language_hint",
                        "Auto-applied next time you sign in.",
                      )}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("profile_page.preferred_currency", "Preferred currency")}</Label>
                    <Select
                      value={formData.preferredCurrency || "auto"}
                      onValueChange={(v) => set("preferredCurrency", v === "auto" ? "" : v)}
                    >
                      <SelectTrigger data-testid="select-preferred-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          {t("profile_page.currency_auto", "Auto (match language)")}
                        </SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="HUF">HUF (Ft)</SelectItem>
                        <SelectItem value="IRR">IRR (﷼)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "profile_page.preferred_currency_hint",
                        "Override the auto-selected currency. Saved on this device until you change it.",
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <div className="mt-4 flex justify-end">
                <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-preferences">
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {t("profile_page.save", "Save changes")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="security" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    {t("profile_page.reset_password_title", "Reset Password")}
                  </CardTitle>
                  <CardDescription>{t("profile_page.reset_password_desc", "Change your login password")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-w-md">
                    {(["current", "new", "confirm"] as const).map((field) => (
                      <div key={field} className="space-y-2">
                        <Label htmlFor={`${field}Password`}>
                          {field === "current" ? t("profile_page.current_password", "Current Password")
                            : field === "new" ? t("profile_page.new_password", "New Password")
                            : t("profile_page.confirm_password", "Confirm New Password")}
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input
                            id={`${field}Password`}
                            type={showPasswords[field] ? "text" : "password"}
                            value={field === "current" ? passwordData.currentPassword
                              : field === "new" ? passwordData.newPassword
                              : passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({
                              ...passwordData,
                              [`${field}Password`]: e.target.value,
                            } as any)}
                            className="pl-10 pr-10"
                            data-testid={`input-${field}-password`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPasswords({ ...showPasswords, [field]: !showPasswords[field] })}
                            data-testid={`button-toggle-${field}-password`}
                          >
                            {showPasswords[field] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      onClick={() => updatePasswordMutation.mutate(passwordData)}
                      disabled={updatePasswordMutation.isPending}
                      data-testid="button-reset-password"
                    >
                      {updatePasswordMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("profile_page.resetting", "Resetting...")}</>
                      ) : (
                        t("profile_page.reset_password_btn", "Reset Password")
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Sticky save bar (hidden on Security tab) */}
          {activeTab !== "security" && activeTab !== "gallery" && activeTab !== "provider" && (
            <div className="sticky bottom-4 mt-6 z-10">
              <Card className="shadow-lg border-primary/20">
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground hidden sm:block">
                    {t("profile_page.save_hint", "Don't forget to save your changes.")}
                  </p>
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                    className="ml-auto"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateProfileMutation.isPending
                      ? t("profile_page.saving", "Saving...")
                      : t("profile_page.save_changes", "Save Changes")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </form>
      </main>
      <Footer />
    </div>
  );
}
