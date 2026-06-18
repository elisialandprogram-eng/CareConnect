import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency, formatInCurrency, getCurrencyConfigForCountry } from "@/lib/currency";
import { formatDate, formatTime } from "@/lib/datetime";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, Users, Layers, Calendar, Star, MapPin, Clock,
  ChevronLeft, ChevronRight, CheckCircle2, Building2, Video,
  UserCircle2, Stethoscope, Home, AlertTriangle, Timer,
} from "lucide-react";
import { usePageTitle } from "@/hooks/use-page-title";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import {
  BookingCanvas,
  type BookingCanvasValues,
  type BookingCanvasProvider as CanvasProvider,
} from "@/components/booking/booking-canvas";
import { SlotAvailabilityWidget } from "@/components/booking/SlotAvailabilityWidget";
import { BookingAwarenessPanel } from "@/components/appointment/AppointmentTimingCard";

/* ── Types ───────────────────────────────────────────────────────── */
interface Provider {
  id: string;
  firstName?: string; lastName?: string;
  professionalTitle?: string; specialization?: string;
  displayTitle?: string; display_title?: string;
  providerCategory?: string; provider_category?: string;
  providerSubcategory?: string; provider_subcategory?: string;
  city?: string; rating?: string; totalReviews?: number;
  consultationFee?: string; homeVisitFee?: string; yearsExperience?: number;
  avatarUrl?: string; isVerified?: boolean; providerType?: string;
  accountType?: string; clinicName?: string;
  serviceModes?: string[];
  user?: { firstName?: string; lastName?: string; avatarUrl?: string };
}

interface SubServiceLite {
  id: string; name: string; description?: string | null;
  basePrice?: string; durationMinutes?: number; locationMode?: string;
}

interface ProviderService {
  id: string; providerId: string; subServiceId: string;
  price?: string; isActive?: boolean;
  subService?: SubServiceLite;
}

interface TimeSlot {
  id: string; date: string; startTime: string; endTime: string;
  /** Authoritative UTC instant from the server — used for accurate past-slot filtering. */
  startAtUtc?: string;
  isBooked?: boolean; isBlocked?: boolean;
  status?: "AVAILABLE" | "HELD" | "BOOKED";
}

interface Practitioner {
  id: string; firstName?: string; lastName?: string;
  name?: string; title?: string; photoUrl?: string;
}

/* ── Draft persistence ───────────────────────────────────────────── */
const DRAFT_KEY = "booking_wizard_v2_draft";
function saveDraft(data: object) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
}
function loadDraft(): any {
  try {
    const s = sessionStorage.getItem(DRAFT_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function providerDisplayName(p?: Provider | null): string {
  if (!p) return "";
  if (p.accountType === "clinic" && p.clinicName) return p.clinicName;
  const fn = p.firstName ?? p.user?.firstName ?? "";
  const ln = p.lastName ?? p.user?.lastName ?? "";
  return `${fn} ${ln}`.trim();
}

function providerAvatarUrl(p?: Provider | null): string | undefined {
  return p?.avatarUrl ?? p?.user?.avatarUrl ?? undefined;
}

const VISIT_ICONS = { clinic: Building2, home: Home, online: Video };

const MODE_LABELS: Record<string, string> = {
  clinic: "Clinic only", home: "Home only", online: "Online only",
  home_clinic: "Home & Clinic", clinic_online: "Clinic & Online",
  home_online: "Home & Online", all: "All modes",
};

/* ── Step indicator ──────────────────────────────────────────────── */
const STEP_LABELS = ["Choose provider", "Choose service", "Pick a time"];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-all shrink-0",
              i < step
                ? "bg-emerald-600 text-white border-emerald-600"
                : i === step
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground",
            )}
          >
            {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-sm hidden sm:inline transition-colors",
              i === step ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {i < STEP_LABELS.length - 1 && (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mx-1" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
export default function BookWizard() {
  const { t } = useTranslation();
  usePageTitle(t("booking.wizard.step_booking", "Book Appointment"));
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const { toast } = useToast();
  const { format: fmtMoney, convert: convertToLocal, code: preferredCurrencyCode } = useCurrency();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const initialProviderId = queryParams.get("providerId");
  const initialServiceId  = queryParams.get("serviceId");
  const initialVisitType  = (queryParams.get("visitType") || "clinic") as "clinic" | "home" | "online";

  /* ── Step & selection state ─────────────────────────────────────── */
  const [step, setStep]                         = useState(0);
  const [providerSearch, setProviderSearch]     = useState("");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedService, setSelectedService]   = useState<ProviderService | null>(null);
  const [visitType, setVisitType]               = useState<"clinic" | "home" | "online">(initialVisitType);
  const [selectedDate, setSelectedDate]         = useState("");
  const [selectedSlot, setSelectedSlot]         = useState<TimeSlot | null>(null);
  const [autoPractitioner, setAutoPractitioner] = useState<Practitioner | null>(null);

  // Sprint C20.0 — Real-time slot overrides received via /ws/slots WebSocket.
  // key = "providerId|date|startTime", value = isAvailable (false = held/booked)
  const [slotOverrides, setSlotOverrides] = useState<Map<string, boolean>>(new Map());

  /* ── Canvas state ───────────────────────────────────────────────── */
  const [canvasOpen, setCanvasOpen]           = useState(false);
  const [holdExpiresAt, setHoldExpiresAt]     = useState<Date | null>(null);
  const [holdId, setHoldId]                   = useState<string | null>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [holdExpiredModalOpen, setHoldExpiredModalOpen] = useState(false);

  /* ── Part 2: Unmount beacon — release any active hold when the wizard
       unmounts (navigation away, tab close, Back without explicit cancel).
       navigator.sendBeacon sends a POST so we use /api/appointments/release-hold ── */
  const holdIdRef = useRef<string | null>(null);
  holdIdRef.current = holdId;
  useEffect(() => {
    return () => {
      const hid = holdIdRef.current;
      if (!hid) return;
      try {
        navigator.sendBeacon(
          "/api/appointments/release-hold",
          new Blob([JSON.stringify({ holdId: hid })], { type: "application/json" }),
        );
      } catch {}
    };
  }, []);

  const effectivePractitionerId = autoPractitioner?.id ?? undefined;

  /* ── Auth guard ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);

  /* ── Visit-type auto-detection ──────────────────────────────────── */
  useEffect(() => {
    if (!selectedService) return;
    // Use service-level locationMode first (set by provider), fall back to sub-service catalogue default
    const locMode: string = (selectedService as any).locationMode ?? (selectedService.subService as any)?.locationMode ?? "both";
    const supportsClinic = locMode === "both" || locMode === "all" || locMode.includes("clinic");
    const supportsHome   = locMode === "both" || locMode === "all" || locMode.includes("home");
    const supportsOnline = locMode === "all" || locMode.includes("online");
    const ok =
      (visitType === "clinic" && supportsClinic) ||
      (visitType === "home" && supportsHome) ||
      (visitType === "online" && supportsOnline);
    if (!ok) {
      if (supportsClinic) setVisitType("clinic");
      else if (supportsHome) setVisitType("home");
      else setVisitType("online");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService?.id]);

  /* ── Auto-practitioner background fetch ─────────────────────────── */
  useEffect(() => {
    if (!selectedService?.id || autoPractitioner) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/services/${selectedService.id}/auto-practitioner`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && data?.practitioner) setAutoPractitioner(data.practitioner);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedService?.id]);

  /* ── Draft save ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!selectedProvider) return;
    saveDraft({ providerId: selectedProvider.id, serviceId: selectedService?.id, visitType, step });
  }, [selectedProvider?.id, selectedService?.id, visitType, step]);

  /* ── Real-time slot state via /ws/slots ─────────────────────────── */
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        ws = new WebSocket(`${proto}//${window.location.host}/ws/slots`);

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg?.event === "SLOT_MUTATION") {
              const key = `${msg.providerId}|${msg.date}|${msg.startTime}`;
              setSlotOverrides(prev => {
                const next = new Map(prev);
                next.set(key, !!msg.isAvailable);
                return next;
              });
            }
          } catch {}
        };

        ws.onerror = () => {};
        ws.onclose = () => {
          // Reconnect after 5 s (non-critical; slots still refetch on demand)
          reconnectTimer = setTimeout(connect, 5_000);
        };
      } catch {}
    }

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch {}
    };
  }, []);

  // Clear WS overrides when the user picks a new date or provider — fresh server
  // data is about to be fetched and will be the authoritative source.
  useEffect(() => {
    setSlotOverrides(new Map());
  }, [selectedDate, selectedProvider?.id]);

  /* ── Local date helpers (avoid UTC date drift for users in UTC− timezones) ── */
  function toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /* ── Calendar days (next 30) ────────────────────────────────────── */
  const calendarDays = useMemo(
    () => Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i);
      return toLocalDateStr(d);
    }),
    [],
  );
  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);

  /* ── Queries ────────────────────────────────────────────────────── */
  const { data: providers = [], isLoading: loadingProviders } = useQuery<Provider[]>({
    queryKey: QK.providerBySearch(providerSearch.trim()),
    queryFn: () => {
      const u = providerSearch.trim()
        ? `/api/providers?q=${encodeURIComponent(providerSearch.trim())}`
        : "/api/providers";
      return fetch(u).then(r => r.json()).then(d => Array.isArray(d) ? d : (d?.providers ?? []));
    },
  });

  const { data: providerDetails, isLoading: loadingServices } = useQuery<any>({
    queryKey: QK.provider(selectedProvider?.id ?? ""),
    enabled: !!selectedProvider?.id,
  });
  const providerServices: ProviderService[] =
    providerDetails?.services?.filter((s: any) => s.isActive !== false) ?? [];

  const { data: slots = [], isLoading: loadingSlots } = useQuery<TimeSlot[]>({
    queryKey: QK.providerSlots(
      selectedProvider?.id ?? "",
      selectedDate,
      effectivePractitionerId ?? "any",
    ),
    queryFn: () => {
      const params = new URLSearchParams({ date: selectedDate });
      if (effectivePractitionerId) params.set("practitionerId", effectivePractitionerId);
      return fetch(
        `/api/providers/${selectedProvider!.id}/available-slots?${params}`,
      ).then(r => r.json());
    },
    enabled: !!selectedProvider && !!selectedDate && step >= 2,
    // Slot data is time-sensitive: always fetch fresh so past slots from a
    // stale cache never appear to patients as bookable.
    staleTime: 0,
  });
  // Apply real-time WS overrides on top of server data.
  // A WS SLOT_MUTATION(isAvailable=false) hides the slot immediately for all
  // open browser tabs without waiting for the next query refetch.
  // Slots in this query are always for `selectedProvider`, so we key on
  // `selectedProvider.id` from state (the local TimeSlot interface omits providerId).
  // Include HELD slots in the display list so patients see "in checkout by another user"
  // instead of a blank gap. Only BOOKED/BLOCKED slots are hidden entirely.
  const nowMs = Date.now();
  const availableSlots = slots.filter(s => {
    if (s.isBooked || s.isBlocked || s.status === "BOOKED") return false;
    const key = `${selectedProvider?.id ?? ""}|${s.date}|${s.startTime}`;
    const override = slotOverrides.get(key);
    if (override === false) return false;
    // Client-side safety net: never show a slot whose start time is already in
    // the past, even if the backend accidentally returned it (stale cache, tz edge-case).
    // Prefer startAtUtc (true UTC) over naive browser-local parse to avoid 2h+ drift
    // when the patient's browser timezone differs from the provider's timezone.
    try {
      const slotMs = s.startAtUtc
        ? new Date(s.startAtUtc).getTime()
        : new Date(`${s.date}T${s.startTime}:00`).getTime();
      if (Number.isFinite(slotMs) && slotMs <= nowMs) return false;
    } catch { /* non-fatal — defer to backend */ }
    return true;
  });

  const { data: walletData } = useQuery<{ balance: string | number; isFrozen?: boolean }>({
    queryKey: QK.wallet(),
    enabled: !!user,
  });
  // Wallet balance from the API is raw USD. Keep it in USD so the booking
  // canvas can display it correctly via useCurrency().format (which converts
  // from USD). The local-currency conversion is done inside handleCanvasConfirm
  // before comparing against totalDue (which is in local currency).
  const walletBalance = Number(walletData?.balance ?? 0) || 0;

  const { data: quote } = useQuery<any>({
    queryKey: QK.pricingQuote(
      selectedService?.id, visitType, 1, "", effectivePractitionerId ?? "none",
    ),
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/pricing/quote", {
        serviceId: selectedService?.id,
        practitionerId: effectivePractitionerId,
        visitType,
        sessions: 1,
      });
      return res.json();
    },
    enabled: !!selectedService,
  });
  // PRICE-DRIFT-FIX: quote amounts are now in bookingCurrency (native HUF/IRR/USD).
  // When bookingCurrency is non-USD, totalDue is already in local units — no convertToLocal needed.
  const totalDue = Number(quote?.total ?? 0) || 0;
  const quoteCurrency: string = (quote as any)?.bookingCurrency ?? preferredCurrencyCode ?? "USD";
  const isNativePricing = quoteCurrency !== "USD";

  /* ── Slot-hold mutation ─────────────────────────────────────────── */
  const createHoldMut = useMutation({
    mutationFn: async (slot: TimeSlot) => {
      const res = await apiRequest("POST", "/api/slot-holds", {
        providerId: selectedProvider!.id,
        serviceId: selectedService?.id ?? null,
        practitionerId: effectivePractitionerId ?? null,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        visitType,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const expiry = data?.expiresAt
        ? new Date(data.expiresAt)
        : new Date(Date.now() + 10 * 60 * 1000);
      setHoldExpiresAt(expiry);
      setHoldId(data?.id ?? null);
      setCanvasOpen(true);
    },
    onError: (e: any) => {
      toast({
        title: "Slot unavailable",
        description: e?.message || "This slot was just taken. Please choose another.",
        variant: "destructive",
      });
      setSelectedSlot(null);
    },
  });

  /* ── Booking mutation ───────────────────────────────────────────── */
  const bookMut = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/appointments", payload);
      if (res.status === 409) {
        // Tag the error so onError can distinguish a concurrency conflict
        const body = await res.json().catch(() => ({}));
        const err: any = new Error(body?.message || "Slot conflict");
        err.isConflict = true;
        throw err;
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: QK.patientAppointments() });
      queryClient.invalidateQueries({ queryKey: QK.providerAppointments() });
      queryClient.invalidateQueries({ queryKey: QK.wallet() });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/slot-holds"] });
      if (data?.checkoutUrl) window.location.assign(data.checkoutUrl);
      else if (data?.id) navigate(`/booking/confirmation/${data.id}`);
      else navigate("/patient-dashboard");
    },
    onError: (e: any) => {
      if (e?.isConflict) {
        // Part 3: 409 conflict — show modal then drop back to slot picker
        setConflictModalOpen(true);
        setCanvasOpen(false);
        setSelectedSlot(null);
        setHoldId(null);
        setHoldExpiresAt(null);
        queryClient.invalidateQueries({ queryKey: QK.providerSlots(selectedProvider?.id ?? "", selectedDate, effectivePractitionerId ?? "any") });
        return;
      }
      toast({ title: "Booking failed", description: e?.message || "Please try again.", variant: "destructive" });
    },
  });

  /* ── Canvas confirm ─────────────────────────────────────────────── */
  const handleCanvasConfirm = (cv: BookingCanvasValues) => {
    if (!selectedProvider || !selectedSlot || !selectedService) return;
    const idemKey =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // walletBalance is always in USD (stored that way in the wallet table).
    // totalDue is now in bookingCurrency (native HUF/IRR when isNativePricing).
    // walletAmountUsed sent to the server must be in LOCAL currency (Ft/IRR)
    // so the server's toUSDSync() converts it correctly to USD for debiting.
    const walletAmtUSD = cv.walletAmount > 0 ? cv.walletAmount : walletBalance;
    // When pricing is native, totalDue is already local — no conversion needed.
    const totalDueLocal = isNativePricing ? totalDue : convertToLocal(totalDue);
    const walletApplied =
      cv.payMethod === "wallet"
        ? Math.min(convertToLocal(walletAmtUSD), convertToLocal(walletBalance), totalDueLocal)
        : 0;
    const effectivePayMethod =
      walletApplied >= totalDueLocal && totalDueLocal > 0 ? "wallet" : cv.payMethod;
    bookMut.mutate({
      providerId: selectedProvider.id,
      serviceId: selectedService.id,
      practitionerId: effectivePractitionerId || undefined,
      date: selectedSlot.date,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      visitType: cv.visitType,
      sessions: 1,
      paymentMethod: effectivePayMethod,
      walletAmountUsed: walletApplied > 0 ? walletApplied : undefined,
      notes: [cv.reason, cv.notes].filter(Boolean).join("\n\n"),
      contactName: cv.contactName,
      contactMobile: cv.contactMobile,
      totalAmount: quote?.total?.toString(),
      patientAddress: cv.visitType === "online" ? null : (cv.patientAddress.trim() || null),
      idempotencyKey: idemKey,
      familyMemberId: cv.familyMemberId ?? undefined,
      intakeResponses: Object.keys(cv.intakeResponses).length > 0 ? cv.intakeResponses : undefined,
      promoCode: cv.promoCode ?? undefined,
      consentTerms: cv.consentTerms,
      consentData: cv.consentData,
    });
  };

  /* ── Canvas close: release hold ─────────────────────────────────── */
  const handleCanvasClose = async () => {
    setCanvasOpen(false);
    setSelectedSlot(null);
    const hid = holdId;
    setHoldId(null);
    setHoldExpiresAt(null);
    if (hid) {
      try { await apiRequest("DELETE", `/api/slot-holds/${hid}`); } catch {}
    }
  };

  /* ── Deep-link prefill ──────────────────────────────────────────── */
  const deepLinkProviderApplied = useRef(false);
  useEffect(() => {
    if (deepLinkProviderApplied.current || !initialProviderId || providers.length === 0 || selectedProvider) return;
    const match = providers.find(p => p.id === initialProviderId);
    if (match) {
      setSelectedProvider(match);
      setStep(s => Math.max(s, 1));
      deepLinkProviderApplied.current = true;
    }
  }, [initialProviderId, providers, selectedProvider]);

  const deepLinkServiceApplied = useRef(false);
  useEffect(() => {
    if (deepLinkServiceApplied.current || !initialServiceId || !selectedProvider || providerServices.length === 0) return;
    const match = providerServices.find(
      s => s.subServiceId === initialServiceId || s.id === initialServiceId,
    );
    if (match) {
      setSelectedService(match);
      setStep(s => Math.max(s, 2));
      deepLinkServiceApplied.current = true;
    }
  }, [initialServiceId, selectedProvider, providerServices]);

  /* ── Nav helpers ────────────────────────────────────────────────── */
  const canGoNext = () => (step === 0 ? !!selectedProvider : step === 1 ? !!selectedService : false);
  const goBack    = () => setStep(s => Math.max(0, s - 1));

  /* ── Canvas provider shape ──────────────────────────────────────── */
  const canvasProvider: CanvasProvider | undefined = selectedProvider
    ? {
        id: selectedProvider.id,
        displayName: providerDisplayName(selectedProvider),
        title: selectedProvider.professionalTitle ?? undefined,
        rating: selectedProvider.rating ?? undefined,
        reviewCount: selectedProvider.totalReviews ?? undefined,
        providerType: selectedProvider.providerType ?? undefined,
        avatarUrl: providerAvatarUrl(selectedProvider),
      }
    : undefined;

  const defaultContactName   = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const defaultContactMobile = (user as any)?.phone ?? "";

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <>
      {/* Page shell — pointer-events disabled while canvas is open so background is inert */}
      <div className={cn("min-h-screen bg-background", canvasOpen && "pointer-events-none select-none")}>

        {/* Sticky header */}
        <div className="border-b bg-card/90 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <PageBreadcrumbs
              items={[
                { label: t("common.home", "Home"), href: "/" },
                { label: t("booking.wizard.providers_breadcrumb", "Providers"), href: "/providers" },
                ...(selectedProvider
                  ? [{ label: providerDisplayName(selectedProvider), href: `/providers/${selectedProvider.id}` }]
                  : []),
                { label: t("booking.wizard.book_appointment_breadcrumb", "Book appointment") },
              ]}
              fallback="/providers"
              className="py-0 mb-0"
            />
          </div>
        </div>

        {/* Single-column content */}
        <div className="max-w-3xl mx-auto px-4 py-8">
          <StepBar step={step} />

          {/* ───────────── Step 0: Choose provider ───────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">
                  {t("booking.wizard.choose_provider", "Choose a provider")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("booking.wizard.choose_provider_desc", "Search for a doctor, therapist, nurse, dentist or specialist.")}
                </p>
              </div>

              <Input
                placeholder={t("booking.wizard.search_provider_placeholder", "Search by name or specialty…")}
                value={providerSearch}
                onChange={e => setProviderSearch(e.target.value)}
                data-testid="input-provider-search"
              />

              {loadingProviders ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : providers.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>{t("booking.wizard.no_providers", "No providers found.")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {providers.map(p => {
                    const isSelected = selectedProvider?.id === p.id;
                    const name   = providerDisplayName(p);
                    const avatar = providerAvatarUrl(p);
                    const feeVal = Number((p as any).minServicePrice ?? 0);
                    const provCurrCode = getCurrencyConfigForCountry((p as any).countryCode)?.code ?? "USD";
                    const fee    = feeVal > 0 ? formatInCurrency(feeVal, provCurrCode) : null;
                    return (
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
                        className={cn(
                          "w-full text-left rounded-xl border p-4 flex items-center gap-4 transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/40 bg-card",
                        )}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={name}
                              loading="lazy"
                              className="w-14 h-14 rounded-full object-cover border-2 border-background shadow"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                              <UserCircle2 className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          {p.isVerified && (
                            <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full p-0.5">
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            </span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{name}</span>
                            {p.professionalTitle && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {p.professionalTitle}
                              </Badge>
                            )}
                          </div>
                          {(p.displayTitle || p.display_title || p.specialization || p.providerSubcategory || p.provider_subcategory) && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              <Stethoscope className="h-3 w-3 inline mr-1" />
                              {[
                                p.displayTitle || p.display_title || p.providerSubcategory || p.provider_subcategory,
                                p.specialization,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                            {p.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{p.city}
                              </span>
                            )}
                            {p.rating && (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                                <Star className="h-3 w-3 fill-current" />
                                {Number(p.rating).toFixed(1)}
                                {p.totalReviews ? ` (${p.totalReviews})` : ""}
                              </span>
                            )}
                            <span className="font-medium text-foreground">
                              {fee ?? <span className="text-muted-foreground italic text-xs">Price varies</span>}
                            </span>
                          </div>
                        </div>

                        {isSelected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ───────────── Step 1: Choose service ───────────── */}
          {step === 1 && selectedProvider && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">
                  {t("booking.wizard.choose_service", "Choose a service")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("booking.wizard.choose_service_desc", "Select the service you need from")}{" "}
                  <span className="font-medium text-foreground">{providerDisplayName(selectedProvider)}</span>.
                </p>
              </div>

              {loadingServices ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : providerServices.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>{t("booking.wizard.no_services", "No services available.")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {providerServices.map(svc => {
                    const isSelected = selectedService?.id === svc.id;
                    const name     = svc.subService?.name ?? "Service";
                    const svcCurrency = (svc as any).currency ?? quoteCurrency ?? "USD";
                    const price    = svc.price ? formatInCurrency(Number(svc.price), svcCurrency) : null;
                    const duration = svc.subService?.durationMinutes;
                    // Service-level locationMode takes priority over provider-level serviceModes
                    const svcLocMode: string = (svc as any).locationMode ?? svc.subService?.locationMode ?? "both";
                    const modeLabel = (() => {
                      const parts: string[] = [];
                      if (svcLocMode === "both" || svcLocMode === "all" || svcLocMode.includes("clinic")) parts.push("Clinic");
                      if (svcLocMode === "both" || svcLocMode === "all" || svcLocMode.includes("home")) parts.push("Home");
                      if (svcLocMode === "all" || svcLocMode.includes("online")) parts.push("Online");
                      return parts.length > 0 ? parts.join(" · ") : (MODE_LABELS[svcLocMode] ?? svcLocMode);
                    })();
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => {
                          setSelectedService(svc);
                          setSelectedSlot(null);
                          setSelectedDate("");
                          setAutoPractitioner(null);
                        }}
                        data-testid={`service-card-${svc.id}`}
                        className={cn(
                          "w-full text-left rounded-xl border p-4 flex items-start gap-4 transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/40 bg-card",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{name}</span>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                          </div>
                          {svc.subService?.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {svc.subService.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            {duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />{duration} min
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {modeLabel}
                            </span>
                          </div>
                        </div>
                        {price && (
                          <span className="font-semibold text-sm text-primary shrink-0">{price}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Visit type — shown once a service is selected */}
              {selectedService && (
                <div className="pt-3 border-t border-border/60">
                  <p className="text-sm font-medium mb-2">
                    {t("booking.wizard.visit_type", "Visit type")}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(() => {
                      const spModes: string[] = selectedProvider?.serviceModes ?? [];
                      const svcLoc: string = (selectedService as any).locationMode ?? (selectedService?.subService as any)?.locationMode ?? "both";
                      const svcAllowsClinic = svcLoc === "both" || svcLoc === "all" || svcLoc.includes("clinic");
                      const svcAllowsHome   = svcLoc === "both" || svcLoc === "all" || svcLoc.includes("home");
                      const svcAllowsOnline = svcLoc === "all" || svcLoc.includes("online");
                      const vtMap: { vt: "clinic" | "home" | "online"; key: string; label: string }[] = [
                        { vt: "clinic", key: "clinic_visit", label: "Clinic" },
                        { vt: "home",   key: "home_visit",   label: "Home" },
                        { vt: "online", key: "telemedicine", label: "Online" },
                      ];
                      // Intersect provider-level serviceModes with service-level locationMode
                      const visible = vtMap.filter(m => {
                        if (m.vt === "clinic" && !svcAllowsClinic) return false;
                        if (m.vt === "home"   && !svcAllowsHome)   return false;
                        if (m.vt === "online" && !svcAllowsOnline) return false;
                        if (spModes.length > 0 && !spModes.includes(m.key)) return false;
                        return true;
                      });
                      return visible.map(({ vt, label }) => {
                        const Icon = VISIT_ICONS[vt];
                        return (
                          <button
                            key={vt}
                            type="button"
                            onClick={() => setVisitType(vt)}
                            data-testid={`visit-type-${vt}`}
                            className={cn(
                              "rounded-xl border py-2.5 px-3 flex items-center justify-center gap-2 text-sm font-medium capitalize transition-all",
                              visitType === vt
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/40",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {label}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────────── Step 2: Pick a time ───────────── */}
          {step === 2 && selectedProvider && selectedService && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">
                  {t("booking.wizard.pick_time", "Pick a time")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("booking.wizard.pick_time_desc", "Select a date, then tap a slot to see timing details.")}
                </p>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  Current time:{" "}
                  <span className="font-semibold font-mono text-foreground">
                    {formatTime(new Date(), { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
              </div>

              {/* Date strip */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {t("booking.wizard.date", "Date")}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  {calendarDays.map(day => {
                    const d = new Date(day + "T12:00:00");
                    const isSelected = selectedDate === day;
                    const isToday = day === todayStr;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => { setSelectedDate(day); setSelectedSlot(null); }}
                        data-testid={`date-btn-${day}`}
                        className={cn(
                          "shrink-0 w-14 py-2 rounded-xl border text-center transition-all",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "border-border hover:border-primary/50 bg-card",
                        )}
                      >
                        <div className="text-[10px] uppercase font-medium opacity-70">
                          {formatDate(d, { weekday: "short" })}
                        </div>
                        <div className="text-base font-bold">{d.getDate()}</div>
                        {isToday && !isSelected && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slot grid */}
              {selectedDate ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {t("booking.wizard.available_slots", "Available slots")}
                    {" — "}
                    <span className="normal-case font-normal">
                      {formatDate(selectedDate + "T12:00:00", { weekday: "long", month: "long", day: "numeric" })}
                    </span>
                  </p>
                  {loadingSlots ? (
                    <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">{t("booking.wizard.loading_slots", "Loading slots…")}</span>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl">
                      <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">{t("booking.wizard.no_slots_date", "No available slots for this date.")}</p>
                      <p className="text-xs mt-1 opacity-70">{t("booking.wizard.try_another_date", "Try a different date.")}</p>
                    </div>
                  ) : (
                    <SlotAvailabilityWidget
                      slots={availableSlots}
                      holdId={holdId}
                      holdExpiresAt={holdExpiresAt}
                      selectedSlot={selectedSlot}
                      onSelectSlot={(slot) => {
                        setSelectedSlot(slot);
                        // Hold is created when user confirms via the BookingAwarenessPanel below
                      }}
                      isCreatingHold={createHoldMut.isPending}
                      price={totalDue}
                      currency={quoteCurrency}
                    />
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {t("booking.wizard.select_date_first", "Select a date above to see available slots.")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Booking Time Awareness Panel: slot selected, canvas not yet open ── */}
          {step === 2 && selectedSlot && !canvasOpen && (
            <BookingAwarenessPanel
              slot={selectedSlot}
              onBeginCheckout={() => createHoldMut.mutate(selectedSlot)}
              isLoading={createHoldMut.isPending}
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-10 pt-4 border-t border-border/60">
            <Button
              variant="outline"
              onClick={goBack}
              disabled={step === 0}
              data-testid="button-wizard-back"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("common.back", "Back")}
            </Button>

            {step < 2 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={!canGoNext()}
                data-testid="button-wizard-next"
              >
                {t("common.next", "Next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : !selectedSlot ? (
              <p className="text-xs text-muted-foreground italic">
                {t("booking.wizard.click_slot_hint", "Tap a slot to see timing details.")}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Part 3: 409 Concurrency Conflict Modal ──────────────────────────── */}
      <Dialog open={conflictModalOpen} onOpenChange={setConflictModalOpen}>
        <DialogContent data-testid="dialog-conflict-modal" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Reservation window closed
            </DialogTitle>
            <DialogDescription>
              Your slot hold expired and someone else just claimed it. Pick a new
              available time to continue booking.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConflictModalOpen(false)}
              data-testid="button-conflict-pick-new"
            >
              Pick a new slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Hold Expired Modal ────────────────────────────────────────────── */}
      <Dialog open={holdExpiredModalOpen} onOpenChange={setHoldExpiredModalOpen}>
        <DialogContent data-testid="dialog-hold-expired-modal" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Your reservation has expired
            </DialogTitle>
            <DialogDescription>
              Your 10-minute slot hold has timed out and the time has been released. Pick a fresh
              slot to continue with your booking.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setHoldExpiredModalOpen(false)}
              data-testid="button-hold-expired-pick-new"
            >
              Pick a new slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BookingCanvas — full checkout overlay, floats above the inert background */}
      {canvasProvider && (
        <BookingCanvas
          open={canvasOpen}
          onClose={handleCanvasClose}
          provider={canvasProvider}
          slot={selectedSlot}
          holdExpiresAt={holdExpiresAt}
          walletBalance={walletBalance}
          totalDue={totalDue}
          currency={preferredCurrencyCode}
          initialVisitType={visitType}
          defaultContactName={defaultContactName}
          defaultContactMobile={defaultContactMobile}
          onConfirm={handleCanvasConfirm}
          isSubmitting={bookMut.isPending}
          subServiceId={selectedService?.subServiceId ?? null}
          breakdown={quote ?? null}
          onVisitTypeChange={setVisitType}
          onHoldExpired={() => {
            setCanvasOpen(false);
            setSelectedSlot(null);
            setHoldId(null);
            setHoldExpiresAt(null);
            setHoldExpiredModalOpen(true);
          }}
        />
      )}
    </>
  );
}
