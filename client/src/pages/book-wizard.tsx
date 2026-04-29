import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, ChevronLeft, ChevronRight, Check,
  Users, Layers, Calendar, Repeat, CreditCard, ClipboardList,
  Star, MapPin, Clock, DollarSign, Heart, Tag, Locate, Wallet,
  Plus, Minus,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────── */
/*  Types                                                             */
/* ────────────────────────────────────────────────────────────────── */
interface Provider {
  id: string; firstName?: string; lastName?: string; professionalTitle?: string;
  specialization?: string; city?: string; rating?: string; totalReviews?: number;
  consultationFee?: string; homeVisitFee?: string; yearsExperience?: number;
  avatarUrl?: string; isVerified?: boolean; providerType?: string;
}
interface SubServiceLite {
  id: string; name: string; description?: string | null;
  basePrice?: string; durationMinutes?: number;
}
interface ProviderService {
  id: string; providerId: string; subServiceId: string;
  price?: string; isActive?: boolean;
  subService?: SubServiceLite;
}
interface Practitioner {
  id: string; firstName?: string; lastName?: string; name?: string;
  title?: string; specialization?: string; experienceYears?: number; avatarUrl?: string;
}
interface TimeSlot {
  id: string; date: string; startTime: string; endTime: string;
  isBooked?: boolean; isBlocked?: boolean;
}

const STEPS = [
  { id: "provider", icon: Users,         label: "Provider" },
  { id: "service",  icon: Layers,        label: "Service"  },
  { id: "slot",     icon: Calendar,      label: "Slot"     },
  { id: "sessions", icon: Repeat,        label: "Sessions" },
  { id: "payment",  icon: CreditCard,    label: "Payment"  },
  { id: "booking",  icon: ClipboardList, label: "Booking"  },
] as const;

/* ────────────────────────────────────────────────────────────────── */
/*  Progress bar                                                      */
/* ────────────────────────────────────────────────────────────────── */
function ProgressBar({ current }: { current: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 text-primary border-2 border-primary" : "bg-muted text-muted-foreground"}`}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-medium hidden sm:block ${active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground"}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${(current / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Main wizard                                                       */
/* ────────────────────────────────────────────────────────────────── */
export default function BookWizard() {
  useTranslation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();
  const { user } = useAuth();

  /* ── Deep-link entry points ─────────────────────────────────────── */
  const initialProviderId = queryParams.get("providerId");
  const initialServiceId  = queryParams.get("serviceId");
  const initialVisitType  = (queryParams.get("visitType") || "clinic") as "clinic" | "home" | "online";

  /* ── State ──────────────────────────────────────────────────────── */
  const [step, setStep] = useState(0);

  // Step 0: provider
  const [providerSearch, setProviderSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  // Step 1: service
  const [selectedService, setSelectedService] = useState<ProviderService | null>(null);

  // Step 2: slot + visit type
  const [visitType,   setVisitType]   = useState<"clinic" | "home" | "online">(initialVisitType);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Step 3: sessions
  const [sessions, setSessions] = useState(1);

  // Step 4: payment
  const [payMethod, setPayMethod] = useState<"card" | "wallet" | "cash" | "bank_transfer">("card");
  const [promoCode, setPromoCode] = useState("");
  const [useWallet, setUseWallet] = useState(false);
  const [walletAmountInput, setWalletAmountInput] = useState("");

  // Step 5: booking (contact + address + notes + consent)
  const [contactName,  setContactName]  = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes,        setNotes]        = useState("");
  const [address,      setAddress]      = useState("");
  const [latitude,     setLatitude]     = useState<number | null>(null);
  const [longitude,    setLongitude]    = useState<number | null>(null);
  const [locating,     setLocating]     = useState(false);
  const [consent,      setConsent]      = useState(false);

  // Silent practitioner auto-assignment (no visible step)
  const [autoPractitioner, setAutoPractitioner] = useState<Practitioner | null>(null);

  /* ── Pre-fill contact from logged-in user ───────────────────────── */
  useEffect(() => {
    if (user) {
      setContactName(`${user.firstName || ""} ${user.lastName || ""}`.trim());
      setContactPhone(user.phone || user.mobileNumber || "");
    }
  }, [user]);

  /* ── Geolocation helper ─────────────────────────────────────────── */
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location unavailable", description: "Your browser doesn't support geolocation.", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocating(false);
        toast({ title: "Location captured", description: "Coordinates added to the booking." });
      },
      err => {
        setLocating(false);
        toast({ title: "Couldn't get your location", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  /* ── Queries ────────────────────────────────────────────────────── */

  // All providers (with optional name filter)
  const { data: providers = [], isLoading: loadingProviders } = useQuery<Provider[]>({
    queryKey: ["/api/providers", { q: providerSearch.trim() }],
    queryFn: () => {
      const u = providerSearch.trim()
        ? `/api/providers?q=${encodeURIComponent(providerSearch.trim())}`
        : "/api/providers";
      return fetch(u).then(r => r.json());
    },
  });

  // Provider details (with services joined to sub-services)
  const { data: providerDetails, isLoading: loadingProviderDetails } = useQuery<any>({
    queryKey: ["/api/providers", selectedProvider?.id],
    enabled: !!selectedProvider?.id,
  });

  const providerServices: ProviderService[] = providerDetails?.services?.filter((s: any) => s.isActive !== false) ?? [];

  // Available slots for the chosen date
  const { data: slots = [], isLoading: loadingSlots } = useQuery<TimeSlot[]>({
    queryKey: ["/api/providers", selectedProvider?.id, "slots", selectedDate],
    queryFn: () => fetch(`/api/providers/${selectedProvider!.id}/available-slots?date=${selectedDate}`).then(r => r.json()),
    enabled: !!selectedProvider && !!selectedDate && step >= 2,
  });

  // Wallet balance (loaded once we reach the payment step)
  const { data: walletData } = useQuery<{ balance: string | number; currency?: string; isFrozen?: boolean }>({
    queryKey: ["/api/wallet"],
    enabled: step >= 4,
  });
  const walletBalance = Number(walletData?.balance ?? 0) || 0;
  const walletFrozen  = !!walletData?.isFrozen;

  // Pricing quote (refreshes whenever inputs change)
  const { data: quote, isLoading: quotingPrice } = useQuery<any>({
    queryKey: ["/api/pricing/quote", selectedService?.id, visitType, sessions, promoCode],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/pricing/quote", {
        serviceId: selectedService?.id,
        practitionerId: autoPractitioner?.id,
        visitType,
        sessions,
        promoCode: promoCode.trim() || undefined,
      });
      return res.json();
    },
    enabled: !!selectedService && step >= 2,
  });

  /* ── Deep-link prefill ──────────────────────────────────────────── */
  // If providerId is in the URL, jump past the provider step.
  useEffect(() => {
    if (initialProviderId && providers.length > 0 && !selectedProvider) {
      const match = providers.find(p => p.id === initialProviderId);
      if (match) {
        setSelectedProvider(match);
        setStep(s => Math.max(s, 1));
      }
    }
  }, [initialProviderId, providers, selectedProvider]);

  // If serviceId is in the URL, jump past the service step too.
  useEffect(() => {
    if (initialServiceId && providerServices.length > 0 && !selectedService) {
      const match = providerServices.find(p => p.id === initialServiceId);
      if (match) {
        setSelectedService(match);
        setStep(s => Math.max(s, 2));
      }
    }
  }, [initialServiceId, providerServices, selectedService]);

  /* ── Silent practitioner auto-assign ───────────────────────────── */
  // Once a service is picked, quietly grab the best-available practitioner so
  // the appointment payload includes one. The user never sees this happen.
  useEffect(() => {
    if (!selectedService?.id || autoPractitioner) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/services/${selectedService.id}/auto-practitioner`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.practitioner) {
          setAutoPractitioner(data.practitioner);
        }
      } catch {
        /* silent — practitioner is optional */
      }
    })();
    return () => { cancelled = true; };
  }, [selectedService?.id, autoPractitioner]);

  /* ── Booking mutation ──────────────────────────────────────────── */
  const bookMut = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/appointments", payload),
    onSuccess: (data: any) => {
      toast({ title: "Booking submitted!", description: `Reference: ${data.appointmentNumber || "pending"}` });
      // If the backend returned a Stripe checkout URL, redirect there. Otherwise
      // the booking is already confirmed (full-wallet or cash) — go to dashboard.
      if (data?.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      } else {
        navigate("/patient-dashboard");
      }
    },
    onError: (e: any) => toast({ title: "Booking failed", description: e?.message || "Please try again", variant: "destructive" }),
  });

  /* ── Wallet maths ──────────────────────────────────────────────── */
  const totalDue = Number(quote?.total ?? 0) || 0;
  const requestedFromInput = Number(walletAmountInput);
  const intendedWallet = useWallet
    ? (Number.isFinite(requestedFromInput) && requestedFromInput > 0 ? requestedFromInput : walletBalance)
    : 0;
  const walletApplied = Math.min(intendedWallet, walletBalance, totalDue);
  const walletAppliedRounded = Math.round(walletApplied * 100) / 100;
  const remainderDue = Math.max(0, Math.round((totalDue - walletAppliedRounded) * 100) / 100);
  const fullyCoveredByWallet = useWallet && walletAppliedRounded > 0 && remainderDue === 0;

  /* ── Confirm booking ───────────────────────────────────────────── */
  const handleConfirm = () => {
    if (!selectedProvider || !selectedSlot || !selectedService) return;
    const idemKey = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const effectivePayMethod = fullyCoveredByWallet ? "wallet" : payMethod;
    bookMut.mutate({
      providerId: selectedProvider.id,
      serviceId: selectedService.id,
      practitionerId: autoPractitioner?.id || undefined,
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      visitType,
      sessions,
      paymentMethod: effectivePayMethod,
      walletAmountUsed: walletAppliedRounded > 0 ? walletAppliedRounded : undefined,
      notes,
      contactName,
      contactMobile: contactPhone,
      promoCode: promoCode.trim() || undefined,
      totalAmount: quote?.total?.toString(),
      patientAddress: visitType === "online" ? null : (address.trim() || null),
      patientLatitude: visitType === "online" ? null : latitude,
      patientLongitude: visitType === "online" ? null : longitude,
      idempotencyKey: idemKey,
    });
  };

  /* ── Navigation ────────────────────────────────────────────────── */
  const canGoNext = (): boolean => {
    switch (step) {
      case 0: return !!selectedProvider;
      case 1: return !!selectedService;
      case 2: return !!selectedSlot;
      case 3: return sessions >= 1 && sessions <= 10;
      case 4: return !!payMethod && (!useWallet || walletAppliedRounded > 0 || walletBalance === 0);
      case 5: {
        if (!consent || contactName.trim().length === 0 || contactPhone.trim().length === 0) return false;
        if (visitType === "home" && address.trim().length === 0) return false;
        return true;
      }
      default: return false;
    }
  };

  const goNext = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const goBack = () => setStep(s => Math.max(0, s - 1));

  /* ── Calendar (next 30 days) ───────────────────────────────────── */
  const calendarDays = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().split("T")[0];
  });
  const availableSlots = slots.filter(s => !s.isBooked && !s.isBlocked);

  const initials = (p: Provider) =>
    `${p.firstName?.[0] || ""}${p.lastName?.[0] || ""}`.toUpperCase() || "DR";

  /* ─────────────────────────────────────────────────────────────── */
  /*  Render                                                         */
  /* ─────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-wizard-home">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold">Book an Appointment</h1>
            {selectedProvider && step > 0 && (
              <Badge variant="outline" data-testid="badge-selected-provider">
                {selectedProvider.firstName} {selectedProvider.lastName}
              </Badge>
            )}
          </div>
          <ProgressBar current={step} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column: step content + navigation */}
          <div className="lg:col-span-2 min-w-0">

            {/* ── Step 0: Provider ── */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Choose your provider</h2>
                  <p className="text-muted-foreground text-sm mt-1">Pick a clinic or specialist to begin.</p>
                </div>
                <Input
                  placeholder="Search by name, specialty, or city…"
                  value={providerSearch}
                  onChange={e => setProviderSearch(e.target.value)}
                  data-testid="input-provider-search"
                />
                {loadingProviders ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : providers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No providers found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {providers.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProvider(p);
                          setSelectedService(null);
                          setSelectedSlot(null);
                          setAutoPractitioner(null);
                        }}
                        data-testid={`provider-card-${p.id}`}
                        className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${selectedProvider?.id === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${selectedProvider?.id === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {initials(p)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{p.firstName} {p.lastName}</p>
                                <p className="text-xs text-muted-foreground truncate">{p.professionalTitle || p.specialization}</p>
                              </div>
                              {selectedProvider?.id === p.id && <Check className="h-5 w-5 text-primary shrink-0" />}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                              {p.city && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}</span>}
                              {p.rating && Number(p.rating) > 0 && (
                                <span className="text-xs flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{Number(p.rating).toFixed(1)} ({p.totalReviews})</span>
                              )}
                              {p.consultationFee && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />From {fmtMoney(p.consultationFee)}</span>
                              )}
                              {p.yearsExperience != null && p.yearsExperience > 0 && (
                                <span className="text-xs text-muted-foreground">{p.yearsExperience}y exp.</span>
                              )}
                              {p.isVerified && <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">Verified</Badge>}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 1: Service ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Pick a service</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Services offered by <strong>{selectedProvider?.firstName} {selectedProvider?.lastName}</strong>
                  </p>
                </div>
                {loadingProviderDetails ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : providerServices.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>This provider hasn't listed any services yet.</p>
                    <Button variant="link" onClick={() => setStep(0)} className="mt-2">Choose a different provider</Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {providerServices.map(svc => {
                      const sub = svc.subService;
                      const displayPrice = svc.price ?? sub?.basePrice;
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => {
                            setSelectedService(svc);
                            setSelectedSlot(null);
                            setAutoPractitioner(null);
                          }}
                          data-testid={`service-card-${svc.id}`}
                          className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${selectedService?.id === svc.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selectedService?.id === svc.id ? "bg-primary/10" : "bg-muted"}`}>
                                <Tag className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{sub?.name ?? "Service"}</p>
                                {sub?.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sub.description}</p>}
                                <div className="flex items-center gap-3 mt-1">
                                  {sub?.durationMinutes != null && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{sub.durationMinutes}m</span>
                                  )}
                                  {displayPrice != null && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />{fmtMoney(displayPrice)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {selectedService?.id === svc.id && <Check className="h-5 w-5 text-primary shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Slot (visit type + date + time) ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Choose a slot</h2>
                  <p className="text-muted-foreground text-sm mt-1">Pick the visit type, then a date and time.</p>
                </div>

                {/* Visit type */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Visit type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "clinic", label: "In-clinic" },
                      { v: "home",   label: "Home visit" },
                      { v: "online", label: "Online" },
                    ].map(({ v, label }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVisitType(v as any)}
                        data-testid={`visit-type-${v}`}
                        className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all ${visitType === v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calendar */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Select date</Label>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-1.5">
                    {calendarDays.map(day => {
                      const d = new Date(day + "T12:00:00");
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => { setSelectedDate(day); setSelectedSlot(null); }}
                          data-testid={`date-btn-${day}`}
                          className={`p-2 rounded-lg text-center transition-all border text-sm ${selectedDate === day ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 hover:bg-primary/5"}`}
                        >
                          <div className="text-[10px] font-medium">{d.toLocaleDateString("en", { weekday: "short" })}</div>
                          <div className="font-bold text-base leading-none">{d.getDate()}</div>
                          <div className="text-[9px]">{d.toLocaleDateString("en", { month: "short" })}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time slots */}
                {selectedDate && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Select time</Label>
                    {loadingSlots ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                    ) : availableSlots.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                        No available slots on this date. Try another day.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {availableSlots.map(slot => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            data-testid={`slot-btn-${slot.id}`}
                            className={`p-2.5 rounded-lg text-center text-sm font-medium transition-all border ${selectedSlot?.id === slot.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 hover:bg-primary/5"}`}
                          >
                            {slot.startTime}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Sessions ── */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">How many sessions?</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Booking more than one session pre-pays the total. Future sessions can be scheduled with the provider after the first appointment.
                  </p>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-center gap-6">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setSessions(s => Math.max(1, s - 1))}
                        disabled={sessions <= 1}
                        data-testid="button-sessions-minus"
                        className="h-12 w-12 rounded-full"
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <div className="text-center min-w-[110px]">
                        <div className="text-5xl font-bold text-primary" data-testid="text-sessions-count">{sessions}</div>
                        <div className="text-xs text-muted-foreground mt-1">{sessions === 1 ? "session" : "sessions"}</div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setSessions(s => Math.min(10, s + 1))}
                        disabled={sessions >= 10}
                        data-testid="button-sessions-plus"
                        className="h-12 w-12 rounded-full"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-6">
                      {[1, 2, 4, 6, 10].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setSessions(n)}
                          data-testid={`button-sessions-preset-${n}`}
                          className={`py-1.5 rounded-md text-xs font-medium border transition-all ${sessions === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {sessions > 1 && (
                  <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/40 border">
                    Pricing reflects all {sessions} sessions. Only the first session uses the slot you picked — your provider will help schedule the rest.
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: Payment ── */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Payment</h2>
                  <p className="text-muted-foreground text-sm mt-1">Pick how you'd like to pay.</p>
                </div>

                {/* Promo code */}
                <div className="space-y-1">
                  <Label htmlFor="promo">Promo code (optional)</Label>
                  <Input
                    id="promo"
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="DISCOUNT10"
                    data-testid="input-promo"
                  />
                </div>

                {/* Wallet credit */}
                <div className="space-y-2 p-4 rounded-lg border-2 border-border bg-card/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Wallet className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <Label htmlFor="use-wallet" className="font-semibold cursor-pointer">Apply wallet credit</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Balance: <span className="font-medium text-foreground">{fmtMoney(walletBalance)}</span>
                          {walletFrozen && <span className="ml-1 text-destructive">(frozen)</span>}
                        </p>
                        {!walletFrozen && (walletBalance === 0 || walletBalance < totalDue) && (
                          <a
                            href="/wallet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                            data-testid="link-wallet-topup"
                          >
                            <Plus className="h-3 w-3" />
                            {walletBalance === 0 ? "Add credit" : "Top up for more"}
                          </a>
                        )}
                      </div>
                    </div>
                    <Switch
                      id="use-wallet"
                      checked={useWallet}
                      onCheckedChange={(v) => {
                        setUseWallet(v);
                        if (v) {
                          const max = Math.min(walletBalance, totalDue);
                          setWalletAmountInput(max > 0 ? max.toFixed(2) : "");
                        } else {
                          setWalletAmountInput("");
                        }
                      }}
                      disabled={walletFrozen || walletBalance <= 0 || totalDue <= 0}
                      data-testid="switch-use-wallet"
                    />
                  </div>

                  {useWallet && walletBalance > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={Math.min(walletBalance, totalDue)}
                          step="0.01"
                          value={walletAmountInput}
                          onChange={e => setWalletAmountInput(e.target.value)}
                          placeholder="Amount"
                          className="h-9"
                          data-testid="input-wallet-amount"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setWalletAmountInput(Math.min(walletBalance, totalDue).toFixed(2))}
                          data-testid="button-wallet-max"
                          className="h-9 shrink-0"
                        >
                          Max
                        </Button>
                      </div>
                      {walletAppliedRounded > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Applied to this booking</span>
                          <span className="font-medium text-primary">−{fmtMoney(walletAppliedRounded)}</span>
                        </div>
                      )}
                      {remainderDue > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Remaining <span className="font-medium text-foreground">{fmtMoney(remainderDue)}</span> will be charged via your selected payment method.
                        </p>
                      )}
                      {fullyCoveredByWallet && (
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <Check className="h-3 w-3" /> Wallet covers the full amount — no card needed.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Payment method (only relevant if there's a remainder) */}
                {!fullyCoveredByWallet && (
                  <div className="space-y-2">
                    <Label>Payment method</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        ["card", "Card"],
                        ["wallet", "Wallet"],
                        ["cash", "Cash"],
                        ["bank_transfer", "Bank Transfer"],
                      ] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPayMethod(val)}
                          data-testid={`pay-${val}`}
                          className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all ${payMethod === val ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 5: Booking (final) ── */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Confirm your booking</h2>
                  <p className="text-muted-foreground text-sm mt-1">Add your contact details and review the summary.</p>
                </div>

                {/* Contact info */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm">Contact information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="contact-name">Contact name *</Label>
                      <Input id="contact-name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name" data-testid="input-contact-name" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="contact-phone">Mobile number *</Label>
                      <Input id="contact-phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+36..." data-testid="input-contact-phone" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Symptoms, special requirements..." data-testid="input-notes" />
                  </div>
                </div>

                {/* Address (conditional on visit type) */}
                {visitType !== "online" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="address">
                        {visitType === "home" ? <>Home visit address <span className="text-destructive">*</span></> : "Address (optional)"}
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleUseCurrentLocation}
                        disabled={locating}
                        data-testid="button-use-current-location"
                        className="h-7 text-xs"
                      >
                        {locating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Locate className="h-3 w-3 mr-1" />}
                        Use my current location
                      </Button>
                    </div>
                    <Textarea
                      id="address"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder={visitType === "home"
                        ? "Street, building, floor, doorbell, city, postcode…"
                        : "Optional notes about the address"
                      }
                      rows={3}
                      data-testid="input-address"
                    />
                    {latitude !== null && longitude !== null && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-primary" />
                        Coordinates captured: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                )}

                {/* Consent */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
                  <Checkbox id="consent" checked={consent} onCheckedChange={v => setConsent(!!v)} data-testid="checkbox-consent" />
                  <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                    I agree to the Patient Consent &amp; Authorization. I understand that this is a booking request and the provider must confirm before the appointment is finalised.
                  </Label>
                </div>
              </div>
            )}

            {/* ── Navigation ── */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t">
              <Button variant="outline" onClick={goBack} disabled={step === 0} data-testid="button-wizard-back">
                <ChevronLeft className="h-4 w-4 mr-1" />Back
              </Button>

              {step < STEPS.length - 1 ? (
                <Button onClick={goNext} disabled={!canGoNext()} data-testid="button-wizard-next">
                  Next<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleConfirm}
                  disabled={!canGoNext() || bookMut.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-wizard-confirm"
                >
                  {bookMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Heart className="h-4 w-4 mr-2" />}
                  Confirm Booking
                </Button>
              )}
            </div>
          </div>

          {/* Right column: sticky live summary (lg+) */}
          <aside className="hidden lg:block">
            <div className="sticky top-32">
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Your booking</h3>

                  <div className="space-y-2 text-sm">
                    {selectedProvider ? (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Provider</span>
                        <span className="font-medium text-right truncate">{selectedProvider.firstName} {selectedProvider.lastName}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Pick a provider to begin.</p>
                    )}

                    {selectedService?.subService?.name && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Service</span>
                        <span className="font-medium text-right truncate">{selectedService.subService.name}</span>
                      </div>
                    )}

                    {step >= 2 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Visit</span>
                        <span className="font-medium capitalize">{visitType === "online" ? "Online" : visitType === "home" ? "Home visit" : "In-clinic"}</span>
                      </div>
                    )}

                    {selectedSlot && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Date</span>
                          <span className="font-medium">{new Date(selectedSlot.date + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Time</span>
                          <span className="font-medium">{selectedSlot.startTime}</span>
                        </div>
                      </>
                    )}

                    {step >= 3 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sessions</span>
                        <span className="font-medium">{sessions}</span>
                      </div>
                    )}

                    {autoPractitioner && step >= 2 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Practitioner</span>
                        <span className="font-medium text-right truncate">
                          {autoPractitioner.name || `${autoPractitioner.firstName ?? ""} ${autoPractitioner.lastName ?? ""}`.trim()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pricing breakdown */}
                  <div className="border-t pt-3">
                    {quotingPrice ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />Calculating…
                      </div>
                    ) : quote ? (
                      <div className="space-y-1.5">
                        {quote.lines?.map((l: any, i: number) => (
                          <div key={i} className={`flex justify-between text-xs ${l.amount < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                            <span>{l.label}</span>
                            <span className="font-medium">{l.amount < 0 ? "-" : ""}{fmtMoney(Math.abs(l.amount))}</span>
                          </div>
                        ))}
                        <div className="flex justify-between font-bold text-base pt-2 border-t mt-2">
                          <span>Subtotal</span>
                          <span data-testid="text-summary-total">{fmtMoney(quote.total)}</span>
                        </div>
                        {walletAppliedRounded > 0 && (
                          <>
                            <div className="flex justify-between text-xs text-green-600 pt-1">
                              <span className="flex items-center gap-1"><Wallet className="h-3 w-3" />Wallet credit</span>
                              <span className="font-medium">−{fmtMoney(walletAppliedRounded)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-base pt-2 border-t mt-1 text-primary">
                              <span>Due now</span>
                              <span data-testid="text-summary-remainder">{fmtMoney(remainderDue)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Select a service to see pricing.</p>
                    )}
                  </div>

                  {step >= 4 && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t">
                      <span className="text-muted-foreground">Paying with</span>
                      <span className="font-medium capitalize">
                        {fullyCoveredByWallet ? "Wallet" : payMethod.replace("_", " ")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
