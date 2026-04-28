import { useTranslation } from "react-i18next";
import { formatPersianDate } from "@/lib/persian-calendar";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationPicker, type PickedLocation } from "@/components/location-picker";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Home,
  CreditCard,
  CheckCircle,
  Check,
  CalendarPlus,
  PlusCircle,
  CalendarCheck,
  ArrowLeft,
  Loader2,
  Wallet,
  Banknote,
  Building2,
  Bitcoin,
  Tag,
  X,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProviderWithServices, Service, TaxSetting, Wallet as WalletType, FamilyMember } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";

export default function Booking() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();

  const [taxPercentage, setTaxPercentage] = useState<number>(0);

  // Fetch tax settings
  const { data: taxSettings } = useQuery<TaxSetting[]>({
    queryKey: ["/api/admin/tax-settings"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (taxSettings && user?.city) {
      // In a real app we might use country, but let's try to match something
      // The user asked for country-based, so let's look for a match
      const setting = taxSettings.find(s => s.isActive);
      if (setting) {
        setTaxPercentage(parseFloat(setting.taxRate));
      }
    }
  }, [taxSettings, user]);

  const sessionsParam = params.get("sessions");
  const sessions = sessionsParam ? JSON.parse(sessionsParam) : [];
  
  // For backwards compatibility or single session flow
  const initialDate = params.get("date");
  const initialTime = params.get("time");
  const finalSessions = sessions.length > 0 ? sessions : (initialDate && initialTime ? [{ date: initialDate, time: initialTime }] : []);

  const providerId = params.get("providerId");
  const serviceId = params.get("serviceId");
  const visitType = (params.get("visitType") || "online") as "online" | "home" | "clinic";

  const [paymentMethod, setPaymentMethod] = useState("card");
  const initialFamilyMemberId = params.get("for") || params.get("familyMemberId") || "";
  const [familyMemberId, setFamilyMemberId] = useState<string>(initialFamilyMemberId);

  const { data: familyMembers } = useQuery<FamilyMember[]>({
    queryKey: ["/api/family-members"],
    enabled: isAuthenticated,
  });
  const [location, setLocation] = useState<PickedLocation>({
    address: user?.address || "",
    latitude: (user as any)?.savedLatitude ?? null,
    longitude: (user as any)?.savedLongitude ?? null,
  });
  const [contactPerson, setContactPerson] = useState(`${user?.firstName || ""} ${user?.lastName || ""}`.trim());
  const [contactMobile, setContactMobile] = useState(user?.mobileNumber || user?.phone || "");
  const [notes, setNotes] = useState(params.get("notes") || "");
  const [saveAddressToProfile, setSaveAddressToProfile] = useState(false);
  const [step, setStep] = useState<"details" | "confirmed">("details");
  const [bookedAppointments, setBookedAppointments] = useState<any[]>([]);
  const [consentChecked, setConsentChecked] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  useEffect(() => {
    if (user) {
      if (!location.address) {
        setLocation((prev) => ({
          ...prev,
          address: user.address || "",
          latitude: (user as any).savedLatitude ?? prev.latitude,
          longitude: (user as any).savedLongitude ?? prev.longitude,
        }));
      }
      if (!contactPerson) {
        const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        if (name) setContactPerson(name);
      }
      if (!contactMobile) setContactMobile(user.mobileNumber || user.phone || "");
    }
  }, [user]);

  const paymentMethods = [
    { id: "card", label: "Credit/Debit Card", icon: CreditCard },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "crypto", label: "Cryptocurrency", icon: Bitcoin },
    { id: "bank_transfer", label: "Bank Transfer", icon: Building2 },
    { id: "cash", label: "Cash After Visit", icon: Banknote },
  ];

  const { data: walletData } = useQuery<WalletType>({
    queryKey: ["/api/wallet"],
    enabled: isAuthenticated,
  });
  const walletBalance = Number(walletData?.balance ?? 0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login?redirect=" + encodeURIComponent("/booking?" + searchParams));
    }
  }, [authLoading, isAuthenticated, navigate, searchParams]);

  // Handle return from Stripe Checkout
  useEffect(() => {
    const stripeStatus = params.get("stripe");
    if (stripeStatus === "success") {
      toast({
        title: "Payment successful",
        description: "Your booking is confirmed. Thank you!",
      });
      setStep("confirmed");
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    } else if (stripeStatus === "cancelled") {
      showErrorModal({
        title: "Payment cancelled",
        description:
          "Your booking is on hold. You can pay later from your dashboard or contact us if you need help.",
        context: "booking.stripeCancelled",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: provider, isLoading } = useQuery<ProviderWithServices>({
    queryKey: ["/api/providers", providerId],
    enabled: !!providerId,
  });

  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string | null>(params.get("practitionerId"));

  const { data: practitioners } = useQuery<any[]>({
    queryKey: [`/api/services/${serviceId}/practitioners`],
    enabled: !!serviceId,
  });

  const activePractitioners = practitioners?.filter(p => p.isActive) || [];

  const selectedService = provider?.services?.find(s => s.id === serviceId);
  const selectedPractitioner = practitioners?.find(p => p.practitionerId === selectedPractitionerId);

  const baseFee = selectedPractitioner 
    ? Number(selectedPractitioner.fee)
    : (provider ? (visitType === "home" && provider.homeVisitFee
      ? Number(provider.homeVisitFee)
      : Number(provider.consultationFee)) : 0);
    
  const feeWithPlatform = baseFee;

  const bookingMutation = useMutation({
    mutationFn: async (data: any) => {
      const results = [];
      for (const session of data.sessions) {
        const response = await apiRequest("POST", "/api/appointments", session);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to book appointment");
        }
        results.push(await response.json());
      }
      return results;
    },
    onSuccess: (results: any[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      // If the server returned a Stripe Checkout URL, redirect there for payment.
      const checkoutUrl = results?.find((r) => r?.checkoutUrl)?.checkoutUrl;
      if (checkoutUrl) {
        toast({
          title: "Redirecting to payment",
          description: "Taking you to Stripe to complete your payment...",
        });
        window.location.href = checkoutUrl;
        return;
      }
      toast({
        title: "Success",
        description: `Your appointment has been booked successfully!`,
      });
      setBookedAppointments(results || []);
      setStep("confirmed");
    },
    onError: (error: Error) => {
      showErrorModal({
        title: "Couldn't book appointment",
        description: error.message || "Failed to book appointment.",
        context: "booking.create",
      });
    },
  });

  const handleConfirmBooking = () => {
    if (!provider || finalSessions.length === 0 || !consentChecked) {
      if (!consentChecked) {
        toast({
          title: "Consent Required",
          description: "Please agree to the Patient Consent & Authorization to proceed.",
          variant: "destructive"
        });
      }
      return;
    }

    const bookingData = {
      providerId: provider.id,
      serviceId: serviceId || null,
      practitionerId: selectedPractitionerId || null,
      visitType,
      paymentMethod,
      notes,
      patientAddress: location.address || null,
      patientLatitude: location.latitude,
      patientLongitude: location.longitude,
      contactPerson,
      contactMobile,
      totalAmount: feeWithPlatform.toString(),
      date: finalSessions[0].date,
      startTime: finalSessions[0].time,
      endTime: "10:00", // Simplified for fast mode
      saveAddressToProfile,
      promoCode: appliedPromo?.code || null,
      familyMemberId: familyMemberId || null,
    };

    bookingMutation.mutate({ sessions: [bookingData] });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (i18n.language === "fa") {
      const weekdayFa = d.toLocaleDateString("fa-IR", { weekday: "long" });
      return `${weekdayFa}، ${formatPersianDate(d, "fa")}`;
    }
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getVisitTypeIcon = (type: string) => {
    switch (type) {
      case "online": return <Video className="h-4 w-4 text-muted-foreground" />;
      case "clinic": return <Building2 className="h-4 w-4 text-muted-foreground" />;
      case "home": return <Home className="h-4 w-4 text-muted-foreground" />;
      default: return null;
    }
  };

  const getVisitTypeLabel = (type: string) => {
    switch (type) {
      case "online": return t("booking.visit_online");
      case "clinic": return t("booking.visit_clinic");
      case "home": return t("booking.visit_home");
      default: return t("booking.in_person");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-8">
          <div className="container mx-auto px-4 max-w-4xl">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!provider || finalSessions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">{t("booking.invalid_booking")}</h1>
            <p className="text-muted-foreground mb-4">{t("booking.missing_info")}</p>
            <Button onClick={() => navigate("/providers")}>{t("booking.browse_providers")}</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const subServiceFee = Number((selectedService as any)?.subService?.platformFee ?? 0);
  const platformFeeAmount = subServiceFee * finalSessions.length;
  const totalBaseAmount = feeWithPlatform * finalSessions.length;
  const promoDiscount = appliedPromo?.discount || 0;
  const subTotal = totalBaseAmount + platformFeeAmount;
  const taxableAmount = Math.max(0, subTotal - promoDiscount);
  const taxAmount = paymentMethod !== "cash" ? taxableAmount * (taxPercentage / 100) : 0;
  const totalAmount = Math.max(0, taxableAmount + taxAmount);

  const handleApplyPromo = async () => {
    setPromoError(null);
    if (!promoInput.trim()) return;
    setValidatingPromo(true);
    try {
      const res = await apiRequest("POST", "/api/promo-codes/validate", {
        code: promoInput.trim().toUpperCase(),
        amount: subTotal,
        providerId: provider?.id,
      });
      const data = await res.json();
      setAppliedPromo({ code: data.code, discount: Number(data.discount) });
      toast({ title: "Promo applied", description: `Discount: $${Number(data.discount).toFixed(2)}` });
    } catch (e: any) {
      const msg = (e?.message || "Invalid promo code").replace(/^\d+:\s*\{.*"message":"([^"]+)".*\}$/, "$1");
      setPromoError(msg);
      setAppliedPromo(null);
    } finally {
      setValidatingPromo(false);
    }
  };

  if (step === "confirmed") {
    const providerName = `${provider.user.firstName} ${provider.user.lastName}`.trim();
    const serviceTitle = selectedService?.name || provider.specialization || "Appointment";
    const durationMin = selectedService?.duration ?? 30;
    const locationText =
      visitType === "online"
        ? "Online consultation"
        : visitType === "home"
        ? "Home visit"
        : provider.primaryServiceLocation || provider.city || "Clinic";

    const seed = bookedAppointments[0]?.id || `${providerId}-${finalSessions[0]?.date}-${finalSessions[0]?.time}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = ((h << 5) - h) + seed.charCodeAt(i);
      h |= 0;
    }
    const confirmationNumber = String(Math.abs(h) % 100000).padStart(5, "0");

    const toFloatingStamp = (date: string, time: string, addMin = 0) => {
      const [y, m, d] = date.split("-").map(Number);
      const [hh, mm] = time.split(":").map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
      dt.setMinutes(dt.getMinutes() + addMin);
      const pad = (n: number) => String(n).padStart(2, "0");
      return (
        `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}` +
        `T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
      );
    };

    const first = finalSessions[0];
    const googleStart = first ? toFloatingStamp(first.date, first.time) : "";
    const googleEnd = first ? toFloatingStamp(first.date, first.time, durationMin) : "";
    const googleTitle = `${serviceTitle} with ${providerName}`;
    const googleDetails = `Confirmation #${confirmationNumber}\nVisit type: ${getVisitTypeLabel(visitType)}\nProvider: ${providerName}`;
    const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      googleTitle
    )}&dates=${googleStart}/${googleEnd}&details=${encodeURIComponent(googleDetails)}&location=${encodeURIComponent(locationText)}`;

    const downloadIcs = () => {
      const dtstamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Golden Life//Booking//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
      ];
      finalSessions.forEach((s: any, idx: number) => {
        const start = toFloatingStamp(s.date, s.time);
        const end = toFloatingStamp(s.date, s.time, durationMin);
        const uid = `${bookedAppointments[idx]?.id || `${confirmationNumber}-${idx}`}@goldenlife.health`;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          `SUMMARY:${googleTitle}`,
          `DESCRIPTION:${googleDetails.replace(/\n/g, "\\n")}`,
          `LOCATION:${locationText}`,
          "END:VEVENT"
        );
      });
      lines.push("END:VCALENDAR");
      const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `golden-life-appointment-${confirmationNumber}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-12 bg-muted/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <Card className="border shadow-sm">
              <CardContent className="py-16 px-6 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border-2 border-green-500 mx-auto mb-6">
                  <Check className="h-10 w-10 text-green-500" strokeWidth={2.5} />
                </div>
                <h1
                  className="text-2xl md:text-3xl font-semibold text-green-500 mb-8"
                  data-testid="heading-thank-you"
                >
                  {t("booking.thank_you", "Thank you for your request!")}
                </h1>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("booking.confirmation_number_label", "Your confirmation number:")}
                </p>
                <p
                  className="text-4xl md:text-5xl font-light tracking-[0.4em] mb-12 ml-[0.4em] text-foreground"
                  data-testid="text-confirmation-number"
                >
                  {confirmationNumber}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    asChild
                    className="text-xs uppercase tracking-wider text-muted-foreground hover-elevate"
                    data-testid="button-add-google-calendar"
                  >
                    <a href={googleCalendarUrl} target="_blank" rel="noreferrer">
                      <CalendarPlus className="h-4 w-4 mr-2" />
                      {t("booking.add_to_google", "Add to Google Calendar")}
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={downloadIcs}
                    className="text-xs uppercase tracking-wider text-muted-foreground hover-elevate"
                    data-testid="button-add-ical"
                  >
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    {t("booking.add_to_ical", "Add to iCal Calendar")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/providers")}
                    className="text-xs uppercase tracking-wider text-muted-foreground hover-elevate"
                    data-testid="button-start-new-booking"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    {t("booking.start_new_booking", "Start New Booking")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/patient/dashboard")}
                    className="text-xs uppercase tracking-wider text-muted-foreground hover-elevate"
                    data-testid="button-finish-booking"
                  >
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    {t("booking.finish_booking", "Finish Booking")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => navigate(`/provider/${providerId}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("booking.back_to_provider")}
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("booking.details_title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={provider.user.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                        {provider.user.firstName?.charAt(0)}{provider.user.lastName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-lg">
                        {provider.user.firstName} {provider.user.lastName}
                      </h3>
                      <p className="text-muted-foreground">{provider.specialization}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-4">
                      <Label>{t("booking.available_services", "Available Services")}</Label>
                      <div className="grid gap-3">
                        {provider.services?.filter(s => s.isActive).map((service) => (
                          <Button
                            key={service.id}
                            variant={serviceId === service.id ? "default" : "outline"}
                            className="justify-between h-auto py-4"
                            onClick={() => {
                              params.set("serviceId", service.id);
                              navigate(`/booking?${params.toString()}`);
                            }}
                          >
                            <div className="text-left">
                              <p className="font-semibold">{service.name}</p>
                              <p className="text-sm opacity-80">{service.description}</p>
                            </div>
                            <span className="font-bold">{fmtMoney(service.price)}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    {serviceId && (
                      <div className="space-y-4">
                        <Label>{t("booking.select_practitioner", "Select Practitioner")}</Label>
                        <div className="grid gap-3">
                          {activePractitioners.map((sp) => (
                            <Button
                              key={sp.practitionerId}
                              variant={selectedPractitionerId === sp.practitionerId ? "default" : "outline"}
                              className="justify-between h-auto py-4"
                              onClick={() => setSelectedPractitionerId(sp.practitionerId)}
                            >
                              <div className="text-left">
                                <p className="font-semibold">{sp.practitioner.name}</p>
                                <p className="text-sm opacity-80">{sp.practitioner.title} - {sp.practitioner.specialization}</p>
                              </div>
                              <span className="font-bold">{fmtMoney(sp.fee)}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {familyMembers && familyMembers.length > 0 && (
                      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                        <Label htmlFor="bookingFor" className="flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-primary" />
                          {t("booking.booking_for", "This appointment is for")}
                        </Label>
                        <Select
                          value={familyMemberId || "self"}
                          onValueChange={(v) => {
                            const id = v === "self" ? "" : v;
                            setFamilyMemberId(id);
                            const m = id ? familyMembers.find((fm) => fm.id === id) : null;
                            if (m) {
                              setContactPerson(`${m.firstName} ${m.lastName}`.trim());
                              if (m.phone) setContactMobile(m.phone);
                            } else if (user) {
                              setContactPerson(`${user.firstName || ""} ${user.lastName || ""}`.trim());
                              setContactMobile(user.mobileNumber || user.phone || "");
                            }
                          }}
                        >
                          <SelectTrigger id="bookingFor" data-testid="select-booking-for">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="self">
                              {t("booking.book_for_self", "Myself")}
                            </SelectItem>
                            {familyMembers.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.firstName} {m.lastName}
                                {" — "}
                                {t(`family.rel.${m.relationship}`, m.relationship)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {familyMemberId && (
                          <p className="text-xs text-muted-foreground">
                            {t(
                              "booking.booking_for_note",
                              "The appointment will be booked under your account on behalf of this family member."
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contactPerson">{t("booking.contact_person")}</Label>
                        <Input
                          id="contactPerson"
                          placeholder="Full Name"
                          value={contactPerson}
                          onChange={(e) => setContactPerson(e.target.value)}
                          data-testid="input-contact-person"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contactMobile">{t("booking.mobile_number")}</Label>
                        <Input
                          id="contactMobile"
                          placeholder="Mobile Number"
                          value={contactMobile}
                          onChange={(e) => setContactMobile(e.target.value)}
                          data-testid="input-contact-mobile"
                        />
                      </div>
                    </div>

                    <LocationPicker
                      value={location}
                      onChange={setLocation}
                      required={visitType === "home"}
                      label={`${t("booking.address")}${visitType !== "home" ? ` ${t("booking.optional")}` : ""}`}
                    />

                    {location.address && location.address !== user?.address && (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="save-address"
                          checked={saveAddressToProfile}
                          onCheckedChange={(v) => setSaveAddressToProfile(v === true)}
                          data-testid="checkbox-save-address"
                        />
                        <Label htmlFor="save-address" className="text-sm font-normal cursor-pointer">
                          {t("booking.save_address_to_profile", "Save this address to my profile for next time")}
                        </Label>
                      </div>
                    )}

                  </div>

                  <div className="space-y-3">
                    <Label>{t("booking.payment_method")}</Label>
                    <RadioGroup 
                      value={paymentMethod} 
                      onValueChange={(value: any) => setPaymentMethod(value)}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="relative">
                        <RadioGroupItem value="card" id="card" className="peer sr-only" />
                        <Label
                          htmlFor="card"
                          className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all w-full peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 border-border hover:border-primary/50"
                        >
                          <CreditCard className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">Card</p>
                            <p className="text-xs text-muted-foreground">Credit/Debit</p>
                          </div>
                        </Label>
                      </div>

                      <div className="relative">
                        <RadioGroupItem
                          value="wallet"
                          id="wallet"
                          className="peer sr-only"
                          disabled={walletBalance < totalAmount}
                        />
                        <Label
                          htmlFor="wallet"
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all w-full peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 border-border hover:border-primary/50 ${walletBalance < totalAmount ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <Wallet className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">{t("booking.pay_wallet", "Wallet")}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("booking.wallet_balance_short", "Balance")}: {fmtMoney(walletBalance)}
                            </p>
                          </div>
                        </Label>
                      </div>

                      <div className="relative">
                        <RadioGroupItem value="crypto" id="crypto" className="peer sr-only" />
                        <Label
                          htmlFor="crypto"
                          className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all w-full peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 border-border hover:border-primary/50"
                        >
                          <Bitcoin className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">Crypto</p>
                            <p className="text-xs text-muted-foreground">BTC, ETH, USDT</p>
                          </div>
                        </Label>
                      </div>

                      <div className="relative">
                        <RadioGroupItem value="bank_transfer" id="bank_transfer" className="peer sr-only" />
                        <Label
                          htmlFor="bank_transfer"
                          className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all w-full peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 border-border hover:border-primary/50"
                        >
                          <Building2 className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">Bank Transfer</p>
                            <p className="text-xs text-muted-foreground">Direct</p>
                          </div>
                        </Label>
                      </div>

                      <div className="relative">
                        <RadioGroupItem value="cash" id="cash" className="peer sr-only" />
                        <Label
                          htmlFor="cash"
                          className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all w-full peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 border-border hover:border-primary/50"
                        >
                          <Banknote className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">Cash</p>
                            <p className="text-xs text-muted-foreground">Pay later</p>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">{t("booking.additional_notes")} {t("booking.optional")}</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any specific concerns or information the provider should know..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-24"
                      data-testid="input-notes"
                    />
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-start space-x-3">
                      <Checkbox 
                        id="booking-consent" 
                        checked={consentChecked} 
                        onCheckedChange={(checked: boolean) => setConsentChecked(checked)}
                      />
                      <div className="space-y-1 leading-none">
                        <Label htmlFor="booking-consent" className="text-sm font-medium">
                          {t("booking.consent_label", "I confirm that I have read and agree to the Patient Consent & Authorization.")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("booking.consent_desc", "All healthcare services provided by Golden Life Health Care require your voluntary consent.")}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>{t("booking.summary_title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Consultation Fee</span>
                      <span>{fmtMoney(baseFee)}</span>
                    </div>
                    {platformFeeAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Platform Fee</span>
                        <span>+{fmtMoney(platformFeeAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sessions</span>
                      <span>x {finalSessions.length}</span>
                    </div>
                    {visitType === "home" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Home Visit</span>
                        <Badge variant="secondary">Included</Badge>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Subtotal</span>
                      <span>{fmtMoney(totalBaseAmount)}</span>
                    </div>
                    {appliedPromo && (
                      <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-medium">
                        <span>Promo ({appliedPromo.code})</span>
                        <span>-{fmtMoney(appliedPromo.discount)}</span>
                      </div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-sm text-primary font-medium">
                        <span>Tax ({taxPercentage}%)</span>
                        <span>+{fmtMoney(taxAmount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      Promo Code
                    </Label>
                    {appliedPromo ? (
                      <div className="flex items-center justify-between p-2 rounded-md border border-green-500/40 bg-green-500/5">
                        <span className="text-sm font-medium" data-testid="text-applied-promo">{appliedPromo.code}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setAppliedPromo(null); setPromoInput(""); setPromoError(null); }}
                          data-testid="button-remove-promo"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter code"
                          value={promoInput}
                          onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(null); }}
                          className="h-9"
                          data-testid="input-promo-code"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleApplyPromo}
                          disabled={validatingPromo || !promoInput.trim()}
                          data-testid="button-apply-promo"
                        >
                          {validatingPromo ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                        </Button>
                      </div>
                    )}
                    {promoError && (
                      <p className="text-xs text-destructive" data-testid="text-promo-error">{promoError}</p>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span data-testid="text-total-amount">{fmtMoney(totalAmount)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleConfirmBooking}
                    disabled={bookingMutation.isPending || (visitType === "home" && !location.address) || !contactPerson || !contactMobile}
                    data-testid="button-confirm-booking"
                  >
                    {bookingMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Confirm Booking
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Payment will be collected after the appointment
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}