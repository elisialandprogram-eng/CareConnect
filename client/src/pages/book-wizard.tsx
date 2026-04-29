import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import {
  Loader2, ChevronLeft, ChevronRight, Check,
  Stethoscope, Layers, Users, User, Calendar, ClipboardList,
  Star, MapPin, Clock, DollarSign, Heart, Tag, ArrowRight,
  Sparkles, Locate, Home,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────── */
/*  Types                                                             */
/* ────────────────────────────────────────────────────────────────── */
interface Category {
  id: string; slug: string; name: string; description?: string | null; icon?: string | null; isActive?: boolean;
}
interface SubService {
  id: string; name: string; category: string; description?: string | null;
  basePrice?: string; platformFee?: string; durationMinutes?: number; pricingType?: string; isActive?: boolean;
}
interface Provider {
  id: string; firstName?: string; lastName?: string; professionalTitle?: string;
  specialization?: string; city?: string; rating?: string; totalReviews?: number;
  consultationFee?: string; homeVisitFee?: string; yearsExperience?: number;
  avatarUrl?: string; isVerified?: boolean; providerType?: string;
}
interface Practitioner {
  id: string; name: string; title?: string; specialization?: string;
  experienceYears?: number; avatarUrl?: string; languages?: string[];
}
interface TimeSlot { id: string; date: string; startTime: string; endTime: string; isBooked?: boolean; isBlocked?: boolean; }

const STEPS = [
  { id: "category",     icon: Stethoscope, label: "Category"    },
  { id: "subservice",   icon: Layers,      label: "Service"     },
  { id: "provider",     icon: Users,       label: "Provider"    },
  { id: "practitioner", icon: User,        label: "Practitioner"},
  { id: "datetime",     icon: Calendar,    label: "Date & Time" },
  { id: "confirm",      icon: ClipboardList,label: "Confirm"    },
] as const;
type StepId = typeof STEPS[number]["id"];

/* ────────────────────────────────────────────────────────────────── */
/*  Progress bar                                                      */
/* ────────────────────────────────────────────────────────────────── */
function ProgressBar({ current }: { current: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        {STEPS.map((s, i) => {
          const done    = i < current;
          const active  = i === current;
          const Icon    = s.icon;
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
          style={{ width: `${((current) / (STEPS.length - 1)) * 100}%` }}
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
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();
  const { user } = useAuth();

  const [step,              setStep]             = useState(0);
  const [selectedCategory,  setSelectedCategory] = useState<Category | null>(null);
  const [selectedSub,       setSelectedSub]      = useState<SubService | null>(null);
  const [selectedProvider,  setSelectedProvider] = useState<Provider | null>(null);
  const [selectedPract,     setSelectedPract]    = useState<Practitioner | null>(null);
  const [selectedDate,      setSelectedDate]     = useState<string>("");
  const [selectedSlot,      setSelectedSlot]     = useState<TimeSlot | null>(null);

  // Confirm step fields
  const [visitType,   setVisitType]   = useState("clinic");
  const [contactName, setContactName] = useState("");
  const [contactPhone,setContactPhone]= useState("");
  const [notes,       setNotes]       = useState("");
  const [promoCode,   setPromoCode]   = useState("");
  const [consent,     setConsent]     = useState(false);
  const [payMethod,   setPayMethod]   = useState("card");
  const [address,     setAddress]     = useState("");
  const [latitude,    setLatitude]    = useState<number | null>(null);
  const [longitude,   setLongitude]   = useState<number | null>(null);
  const [locating,    setLocating]    = useState(false);
  const [autoAssigned, setAutoAssigned] = useState(false);
  const [autoAssignBusy, setAutoAssignBusy] = useState(false);

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

  // Pre-fill contact from user profile
  useEffect(() => {
    if (user) {
      setContactName(`${user.firstName || ""} ${user.lastName || ""}`.trim());
      setContactPhone(user.phone || user.mobileNumber || "");
    }
  }, [user]);

  /* ── Queries ── */
  const { data: categories = [], isLoading: loadingCats } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: subServices = [], isLoading: loadingSubs } = useQuery<SubService[]>({
    queryKey: ["/api/sub-services", selectedCategory?.slug],
    queryFn: () => fetch(selectedCategory ? `/api/sub-services?category=${selectedCategory.slug}` : "/api/sub-services").then(r => r.json()),
    enabled: step >= 1,
  });

  const { data: providers = [], isLoading: loadingProviders } = useQuery<Provider[]>({
    queryKey: ["/api/providers", "by-sub", selectedSub?.id],
    queryFn: () => fetch(`/api/providers?subServiceId=${selectedSub!.id}`).then(r => r.json()),
    enabled: !!selectedSub && step >= 2,
  });

  const { data: practitioners = [], isLoading: loadingPracts } = useQuery<Practitioner[]>({
    queryKey: ["/api/providers", selectedProvider?.id, "practitioners"],
    queryFn: () => fetch(`/api/providers/${selectedProvider!.id}/practitioners`).then(r => r.json()),
    enabled: !!selectedProvider && step >= 3,
  });

  const { data: slots = [], isLoading: loadingSlots } = useQuery<TimeSlot[]>({
    queryKey: ["/api/providers", selectedProvider?.id, "slots", selectedDate],
    queryFn: () => fetch(`/api/providers/${selectedProvider!.id}/available-slots?date=${selectedDate}`).then(r => r.json()),
    enabled: !!selectedProvider && !!selectedDate && step >= 4,
  });

  const { data: providerServices = [] } = useQuery<any[]>({
    queryKey: ["/api/providers", selectedProvider?.id, "services"],
    queryFn: () => fetch(`/api/providers/${selectedProvider!.id}/services`).then(r => r.json()),
    enabled: !!selectedProvider && step >= 4,
  });

  /* ── Find the specific service offered by the provider for the selected sub-service ── */
  const providerService = providerServices.find((s: any) => s.subServiceId === selectedSub?.id);

  /* ── Pricing quote ── */
  const { data: quote, isLoading: quotingPrice } = useQuery<any>({
    queryKey: ["/api/pricing/quote", providerService?.id, visitType, promoCode],
    queryFn: () =>
      apiRequest("POST", "/api/pricing/quote", {
        serviceId: providerService?.id,
        practitionerId: selectedPract?.id,
        visitType,
        sessions: 1,
        promoCode: promoCode.trim() || undefined,
      }),
    enabled: !!providerService && step === 5,
  });

  /* ── Booking mutation ── */
  const bookMut = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/appointments", payload),
    onSuccess: (data: any) => {
      toast({ title: "Booking submitted!", description: `Reference: ${data.appointmentNumber || "pending"}` });
      navigate("/patient-dashboard");
    },
    onError: (e: any) => toast({ title: "Booking failed", description: e?.message || "Please try again", variant: "destructive" }),
  });

  const handleConfirm = () => {
    if (!selectedProvider || !selectedSlot) return;
    // Generate a stable idempotency key so a double-tap doesn't book twice.
    const idemKey = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    bookMut.mutate({
      providerId: selectedProvider.id,
      serviceId: providerService?.id,
      practitionerId: selectedPract?.id || undefined,
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      visitType,
      paymentMethod: payMethod,
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

  const handleAutoAssign = async () => {
    if (!providerService?.id) return;
    setAutoAssignBusy(true);
    try {
      const res = await fetch(`/api/services/${providerService.id}/auto-practitioner`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Auto-assign failed");
      }
      const data = await res.json();
      const p = data.practitioner;
      setSelectedPract({
        id: p.id,
        name: `${p.firstName ?? p.name ?? ""} ${p.lastName ?? ""}`.trim() || p.name || "Practitioner",
        title: p.title,
        specialization: p.specialization,
        experienceYears: p.experienceYears,
        avatarUrl: p.avatarUrl,
      });
      setAutoAssigned(true);
      toast({ title: "Practitioner assigned", description: "We picked the most available specialist for you." });
      setStep(s => Math.max(s, 4));
    } catch (e: any) {
      toast({ title: "Couldn't auto-assign", description: e?.message || "Please pick a practitioner manually.", variant: "destructive" });
    } finally {
      setAutoAssignBusy(false);
    }
  };

  /* ── Navigation helpers ── */
  const goNext = () => {
    // Auto-skip practitioner step if none available
    if (step === 2 && practitioners.length === 0 && !loadingPracts) {
      setStep(4);
    } else {
      setStep(s => s + 1);
    }
  };
  const goBack = () => setStep(s => Math.max(0, s - 1));

  const canGoNext = () => {
    switch (step) {
      case 0: return !!selectedCategory;
      case 1: return !!selectedSub;
      case 2: return !!selectedProvider;
      case 3: return true; // practitioner optional
      case 4: return !!selectedSlot;
      case 5: {
        if (!consent || contactName.trim().length === 0) return false;
        // Address is required for home visits; ignored for online; optional for clinic.
        if (visitType === "home" && address.trim().length === 0) return false;
        return true;
      }
      default: return false;
    }
  };

  /* ── Generate calendar days (next 30 days) ── */
  const calendarDays = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().split("T")[0];
  });

  const availableSlots = slots.filter(s => !s.isBooked && !s.isBlocked);

  const initials = (p: Provider) => `${p.firstName?.[0] || ""}${p.lastName?.[0] || ""}`.toUpperCase() || "DR";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold">Book an Appointment</h1>
            {selectedCategory && <Badge variant="outline">{selectedCategory.icon} {selectedCategory.name}</Badge>}
          </div>
          <ProgressBar current={step} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column: step content + navigation */}
          <div className="lg:col-span-2 min-w-0">

        {/* ── Step 0: Category ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">What type of care do you need?</h2>
              <p className="text-muted-foreground text-sm mt-1">Choose a category to browse available services.</p>
            </div>
            {loadingCats ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(categories.filter(c => c.isActive)).map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { setSelectedCategory(cat); setSelectedSub(null); setSelectedProvider(null); setSelectedPract(null); setSelectedSlot(null); }}
                    data-testid={`cat-card-${cat.id}`}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${selectedCategory?.id === cat.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${selectedCategory?.id === cat.id ? "bg-primary/10" : "bg-muted"}`}>
                        {cat.icon || <Stethoscope className="h-6 w-6 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{cat.name}</p>
                          {selectedCategory?.id === cat.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </div>
                        {cat.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{cat.description}</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Sub-service ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">What service do you need?</h2>
              <p className="text-muted-foreground text-sm mt-1">Services within <strong>{selectedCategory?.name}</strong></p>
            </div>
            {loadingSubs ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : subServices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No services listed for this category yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {subServices.filter(s => s.isActive !== false).map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => { setSelectedSub(sub); setSelectedProvider(null); setSelectedPract(null); setSelectedSlot(null); }}
                    data-testid={`sub-card-${sub.id}`}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${selectedSub?.id === sub.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedSub?.id === sub.id ? "bg-primary/10" : "bg-muted"}`}>
                          <Tag className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-semibold">{sub.name}</p>
                          {sub.description && <p className="text-xs text-muted-foreground mt-0.5">{sub.description}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{sub.durationMinutes}m</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />From {fmtMoney(sub.basePrice)}</span>
                          </div>
                        </div>
                      </div>
                      {selectedSub?.id === sub.id && <Check className="h-5 w-5 text-primary shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Provider ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Choose a provider</h2>
              <p className="text-muted-foreground text-sm mt-1">Providers offering <strong>{selectedSub?.name}</strong></p>
            </div>
            {loadingProviders ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : providers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No providers available for this service yet.</p>
                <Button variant="link" onClick={() => setStep(1)} className="mt-2">Choose a different service</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {providers.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedProvider(p); setSelectedPract(null); setSelectedSlot(null); }}
                    data-testid={`provider-card-${p.id}`}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${selectedProvider?.id === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${selectedProvider?.id === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {initials(p)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold">{p.firstName} {p.lastName}</p>
                            <p className="text-xs text-muted-foreground">{p.professionalTitle || p.specialization}</p>
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
                          {p.yearsExperience && p.yearsExperience > 0 && (
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

        {/* ── Step 3: Practitioner ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Choose a practitioner</h2>
              <p className="text-muted-foreground text-sm mt-1">Optional — or <button type="button" onClick={goNext} className="text-primary underline-offset-2 hover:underline">skip to continue</button></p>
            </div>

            {/* Auto-assign best available practitioner */}
            {practitioners.length > 0 && (
              <button
                type="button"
                onClick={handleAutoAssign}
                disabled={autoAssignBusy}
                data-testid="button-auto-assign-practitioner"
                className="w-full text-left p-4 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 transition-all disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    {autoAssignBusy ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Sparkles className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Auto-assign best available</p>
                    <p className="text-xs text-muted-foreground mt-0.5">We'll pick the most available specialist on this team for you.</p>
                  </div>
                  {autoAssigned && selectedPract && (
                    <Badge className="bg-primary/15 text-primary border-primary/30">Assigned: {selectedPract.name}</Badge>
                  )}
                </div>
              </button>
            )}

            {loadingPracts ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : practitioners.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl">
                <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No individual practitioners listed.</p>
                <p className="text-sm mt-1">You will be seen by any available clinician.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {practitioners.map(pr => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => setSelectedPract(selectedPract?.id === pr.id ? null : pr)}
                    data-testid={`pract-card-${pr.id}`}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${selectedPract?.id === pr.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${selectedPract?.id === pr.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {pr.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{pr.name}</p>
                        {pr.title && <p className="text-xs text-muted-foreground">{pr.title}</p>}
                        {pr.experienceYears && <p className="text-xs text-muted-foreground mt-0.5">{pr.experienceYears}y experience</p>}
                      </div>
                      {selectedPract?.id === pr.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Date & Time ── */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Pick a date & time</h2>
              <p className="text-muted-foreground text-sm mt-1">Available slots for <strong>{selectedProvider?.firstName} {selectedProvider?.lastName}</strong></p>
            </div>

            {/* Calendar */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select date</Label>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-1.5">
                {calendarDays.map(day => {
                  const d = new Date(day + "T12:00:00");
                  const hasSlots = selectedDate === day ? availableSlots.length > 0 : true;
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

        {/* ── Step 5: Confirm ── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold">Confirm your booking</h2>
              <p className="text-muted-foreground text-sm mt-1">Review the details and submit your request.</p>
            </div>

            {/* Booking summary */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Booking Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{selectedSub?.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="font-medium">{selectedProvider?.firstName} {selectedProvider?.lastName}</span></div>
                  {selectedPract && <div className="flex justify-between"><span className="text-muted-foreground">Practitioner</span><span className="font-medium">{selectedPract.name}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{selectedSlot?.date && new Date(selectedSlot.date + "T12:00:00").toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{selectedSlot?.startTime} – {selectedSlot?.endTime}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Visit type</span>
                    <Select value={visitType} onValueChange={setVisitType}>
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clinic">In-clinic</SelectItem>
                        <SelectItem value="home">Home visit</SelectItem>
                        <SelectItem value="online">Online / Telemedicine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="border-t pt-2 mt-2 space-y-1">
                    {quotingPrice ? (
                      <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculating price...</div>
                    ) : quote ? (
                      <>
                        {quote.lines?.map((l: any, i: number) => (
                          <div key={i} className={`flex justify-between text-sm ${l.amount < 0 ? "text-green-600" : ""}`}>
                            <span className="text-muted-foreground">{l.label}</span>
                            <span className="font-medium">{l.amount < 0 ? "-" : ""}{fmtMoney(Math.abs(l.amount))}</span>
                          </div>
                        ))}
                        <div className="flex justify-between font-bold text-base pt-1 border-t">
                          <span>Total</span><span>{fmtMoney(quote.total)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between"><span className="text-muted-foreground">Est. total</span><span className="font-medium">From {fmtMoney(selectedSub?.basePrice)}</span></div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Contact Information</h3>
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
                {visitType === "home" && (
                  <p className="text-xs text-muted-foreground">
                    The practitioner will use this address to reach you.
                  </p>
                )}
              </div>
            )}

            {/* Promo code */}
            <div className="space-y-1">
              <Label htmlFor="promo">Promo code (optional)</Label>
              <Input id="promo" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="DISCOUNT10" data-testid="input-promo" />
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <Label>Payment method</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[["card", "Card"], ["wallet", "Wallet"], ["cash", "Cash"], ["bank_transfer", "Bank Transfer"]].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setPayMethod(val)} data-testid={`pay-${val}`}
                    className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all ${payMethod === val ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Consent */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
              <Checkbox id="consent" checked={consent} onCheckedChange={v => setConsent(!!v)} data-testid="checkbox-consent" />
              <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                I agree to the Patient Consent & Authorization. I understand that this is a booking request and the provider must confirm before the appointment is finalised.
              </Label>
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t">
          <Button variant="outline" onClick={goBack} disabled={step === 0} data-testid="button-wizard-back">
            <ChevronLeft className="h-4 w-4 mr-1" />Back
          </Button>

          {step < 5 ? (
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
          {/* Right column: sticky live summary (desktop only) */}
          <aside className="hidden lg:block">
            <div className="sticky top-32 space-y-3">
              <Card className="border-2">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Your booking</h3>
                  </div>

                  <div className="space-y-2.5 text-sm">
                    {selectedCategory && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground shrink-0">Category</span>
                        <span className="font-medium text-right">{selectedCategory.name}</span>
                      </div>
                    )}
                    {selectedSub && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground shrink-0">Service</span>
                        <span className="font-medium text-right">{selectedSub.name}</span>
                      </div>
                    )}
                    {selectedProvider && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground shrink-0">Provider</span>
                        <span className="font-medium text-right">{selectedProvider.firstName} {selectedProvider.lastName}</span>
                      </div>
                    )}
                    {selectedPract && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground shrink-0">Practitioner</span>
                        <span className="font-medium text-right flex items-center gap-1">
                          {autoAssigned && <Sparkles className="h-3 w-3 text-primary" />}
                          {selectedPract.name}
                        </span>
                      </div>
                    )}
                    {selectedSlot && (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground shrink-0">Date</span>
                          <span className="font-medium text-right">{new Date(selectedSlot.date + "T12:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground shrink-0">Time</span>
                          <span className="font-medium text-right">{selectedSlot.startTime} – {selectedSlot.endTime}</span>
                        </div>
                      </>
                    )}
                    {step >= 5 && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground shrink-0">Visit type</span>
                        <span className="font-medium text-right capitalize flex items-center gap-1">
                          {visitType === "home" && <Home className="h-3 w-3" />}
                          {visitType === "online" ? "Online" : visitType === "home" ? "Home visit" : "In-clinic"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pricing breakdown */}
                  <div className="border-t pt-3">
                    {quotingPrice ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Calculating…
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
                          <span>Total</span>
                          <span data-testid="text-summary-total">{fmtMoney(quote.total)}</span>
                        </div>
                      </div>
                    ) : selectedSub ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Estimated</span>
                        <span className="font-medium">From {fmtMoney(selectedSub.basePrice)}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Select a service to see pricing.</p>
                    )}
                  </div>

                  {step >= 5 && payMethod && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t">
                      <span className="text-muted-foreground">Paying with</span>
                      <span className="font-medium capitalize">{payMethod.replace("_", " ")}</span>
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
