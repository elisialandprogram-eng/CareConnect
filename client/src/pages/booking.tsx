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
import type { ProviderWithServices, Service } from "@shared/schema";

export default function Booking() {
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const providerId = params.get("providerId");
  const serviceId = params.get("serviceId");
  const date = params.get("date");
  const time = params.get("time");
  const visitType = params.get("visitType") as "online" | "home";

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

  const selectedService = provider?.services?.find(s => s.id === serviceId);

  const bookingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/appointments", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to book appointment");
      }
      const appointment = await response.json();
      return appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      const methodLabel = paymentMethods.find(m => m.id === paymentMethod)?.label || paymentMethod;
      toast({
        title: "Success",
        description: `Your appointment has been booked successfully! Payment method: ${methodLabel}`,
      });
      navigate("/appointments");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to book appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleConfirmBooking = () => {
    if (!provider || !date || !time) return;

    const endTime = new Date(`2024-01-01T${time}`);
    endTime.setMinutes(endTime.getMinutes() + (selectedService?.duration || 60));
    const endTimeStr = endTime.toTimeString().slice(0, 5);

    const fee = visitType === "home" && provider.homeVisitFee
      ? provider.homeVisitFee
      : provider.consultationFee;

    bookingMutation.mutate({
      providerId: provider.id,
      serviceId: serviceId || null,
      date,
      startTime: time,
      endTime: endTimeStr,
      visitType,
      paymentMethod,
      notes,
      patientAddress: visitType === "home" ? address : null,
      totalAmount: fee,
    });
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

  if (!provider || !date || !time) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">Invalid Booking</h1>
            <p className="text-muted-foreground mb-4">Missing booking information.</p>
            <Button onClick={() => navigate("/providers")}>Browse Providers</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const fee = visitType === "home" && provider.homeVisitFee
    ? Number(provider.homeVisitFee)
    : Number(provider.consultationFee);

  if (step === "confirmed") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-lg text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 mx-auto mb-6 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-semibold mb-2">Booking Confirmed!</h1>
            <p className="text-muted-foreground mb-8">
              Your appointment has been successfully booked. You will receive a confirmation email shortly.
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
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDate(date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{time}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {visitType === "online" ? (
                    <Video className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Home className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{visitType === "online" ? "Online Consultation" : "Home Visit"}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button onClick={() => navigate("/patient/dashboard")} data-testid="button-go-to-dashboard">
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => navigate("/providers")} data-testid="button-browse-more">
                Book Another Appointment
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
            Back to Provider
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Appointment Details</CardTitle>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Calendar className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Date</p>
                        <p className="font-medium">{formatDate(date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Clock className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Time</p>
                        <p className="font-medium">{time}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      {visitType === "online" ? (
                        <Video className="h-5 w-5 text-primary" />
                      ) : (
                        <Home className="h-5 w-5 text-primary" />
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Visit Type</p>
                        <p className="font-medium">
                          {visitType === "online" ? "Online Consultation" : "Home Visit"}
                        </p>
                      </div>
                    </div>
                    {selectedService && (
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                        <CreditCard className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">Service</p>
                          <p className="font-medium">{selectedService.name}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {visitType === "home" && (
                    <div className="space-y-2">
                      <Label htmlFor="address">Your Address (for home visit)</Label>
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
                  )}

                  <div className="space-y-3">
                    <Label>Payment Method</Label>
                    <RadioGroup value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                      <div className="grid grid-cols-2 gap-3">
                        <Label
                          htmlFor="card"
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            paymentMethod === "card" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <RadioGroupItem value="card" id="card" />
                          <CreditCard className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">Card</p>
                            <p className="text-xs text-muted-foreground">Credit/Debit</p>
                          </div>
                        </Label>

                        <Label
                          htmlFor="crypto"
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            paymentMethod === "crypto" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <RadioGroupItem value="crypto" id="crypto" />
                          <div className="flex items-center gap-1 text-primary">
                            <Bitcoin className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">Crypto</p>
                            <p className="text-xs text-muted-foreground">BTC, ETH, USDT</p>
                          </div>
                        </Label>

                        <Label
                          htmlFor="bank_transfer"
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            paymentMethod === "bank_transfer" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <RadioGroupItem value="bank_transfer" id="bank_transfer" />
                          <Building2 className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">Bank Transfer</p>
                            <p className="text-xs text-muted-foreground">Direct</p>
                          </div>
                        </Label>

                        <Label
                          htmlFor="cash"
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            paymentMethod === "cash" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <RadioGroupItem value="cash" id="cash" />
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
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any specific concerns or information the provider should know..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-24"
                      data-testid="input-notes"
                    />
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
                      <span>${fee.toFixed(2)}</span>
                    </div>
                    {visitType === "home" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Home Visit</span>
                        <Badge variant="secondary">Included</Badge>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>${fee.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleConfirmBooking}
                    disabled={bookingMutation.isPending || (visitType === "home" && !address)}
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