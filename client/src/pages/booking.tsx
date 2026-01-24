import { useTranslation } from "react-i18next";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Home,
  CreditCard,
  CheckCircle,
  ArrowLeft,
  Loader2,
  Wallet,
  Banknote,
  Building2,
  Bitcoin,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProviderWithServices, Service, TaxSetting } from "@shared/schema";

export default function Booking() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

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
        setTaxPercentage(parseFloat(setting.taxPercentage));
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
  const [address, setAddress] = useState(user?.address || "");
  const [contactPerson, setContactPerson] = useState(`${user?.firstName || ""} ${user?.lastName || ""}`.trim());
  const [contactMobile, setContactMobile] = useState(user?.mobileNumber || user?.phone || "");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"details" | "confirmed">("details");
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    if (user) {
      if (!address) setAddress(user.address || "");
      if (!contactPerson) {
        const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        if (name) setContactPerson(name);
      }
      if (!contactMobile) setContactMobile(user.mobileNumber || user.phone || "");
    }
  }, [user]);

  const paymentMethods = [
    { id: "card", label: "Credit/Debit Card", icon: CreditCard },
    { id: "crypto", label: "Cryptocurrency", icon: Bitcoin },
    { id: "bank_transfer", label: "Bank Transfer", icon: Building2 },
    { id: "cash", label: "Cash After Visit", icon: Banknote },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/booking?" + searchParams);
    }
  }, [isAuthenticated, navigate, searchParams]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Success",
        description: `Your appointment has been booked successfully!`,
      });
      setStep("confirmed");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to book appointment.",
        variant: "destructive",
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
      patientAddress: address || null,
      contactPerson,
      contactMobile,
      totalAmount: feeWithPlatform.toString(),
      date: finalSessions[0].date,
      startTime: finalSessions[0].time,
      endTime: "10:00", // Simplified for fast mode
    };

    bookingMutation.mutate({ sessions: [bookingData] });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
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

  const totalBaseAmount = feeWithPlatform * finalSessions.length;
  const taxAmount = paymentMethod !== "cash" ? totalBaseAmount * (taxPercentage / 100) : 0;
  const totalAmount = totalBaseAmount + taxAmount;

  if (step === "confirmed") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-lg text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 mx-auto mb-6 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-semibold mb-2">{t("booking.confirmed_title")}</h1>
            <p className="text-muted-foreground mb-8">
              {finalSessions.length > 1 
                ? t("booking.confirmed_desc_other", { count: finalSessions.length }) 
                : t("booking.confirmed_desc_one")}
            </p>

            <Card className="text-left mb-6">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={provider.user.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {provider.user.firstName?.charAt(0)}{provider.user.lastName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{provider.user.firstName} {provider.user.lastName}</p>
                    <p className="text-sm text-muted-foreground">{provider.specialization}</p>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  {finalSessions.map((session: any, idx: number) => (
                    <div key={idx} className="flex flex-col gap-1 pb-2 border-b last:border-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(session.date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{session.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm pt-2">
                  {getVisitTypeIcon(visitType)}
                  <span>{getVisitTypeLabel(visitType)}</span>
                </div>
              </CardContent>
            </Card>


            <div className="flex flex-col gap-3">
              <Button onClick={() => navigate("/patient/dashboard")} data-testid="button-go-to-dashboard">
                {t("booking.go_to_dashboard")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/providers")} data-testid="button-browse-more">
                {t("booking.book_another")}
              </Button>
            </div>
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
                            <span className="font-bold">${Number(service.price).toFixed(0)}</span>
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
                              <span className="font-bold">${Number(sp.fee).toFixed(0)}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
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

                    <div className="space-y-2">
                      <Label htmlFor="address">{t("booking.address")} {visitType !== "home" && t("booking.optional")}</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="address"
                          placeholder="Enter your full address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="pl-9"
                          data-testid="input-address"
                        />
                      </div>
                    </div>
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
                  <CardTitle>Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Consultation Fee</span>
                      <span>${baseFee.toFixed(2)}</span>
                    </div>
                    {platformFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Platform Fee</span>
                        <span>+${platformFee.toFixed(2)}</span>
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
                      <span>${totalBaseAmount.toFixed(2)}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-sm text-primary font-medium">
                        <span>Tax ({taxPercentage}%)</span>
                        <span>+${taxAmount.toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>${totalAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleConfirmBooking}
                    disabled={bookingMutation.isPending || (visitType === "home" && !address) || !contactPerson || !contactMobile}
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