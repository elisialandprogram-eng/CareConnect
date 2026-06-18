/**
 * BookingCanvas — Premium fluid multi-step booking drawer.
 *
 * Three animated micro-steps:
 *   1. Appointment Intent (reason, visit type)
 *   2. Patient Profile Selector + Demographics & Consent
 *   3. Payment Route (Wallet vs Stripe)
 *
 * Features:
 *  - "Who is this for?" family member selector in Step 1
 *  - Inline "+ Add New Family Member" sub-form with live cache invalidation
 *  - Sticky context bar: provider name, date/time, 10-min hold countdown
 *  - Horizontal slide transitions between steps (no page reload)
 *  - Controlled by parent via open/onClose props
 *
 * ARCHITECTURE NOTE (C18.4):
 *  All render helpers (renderContextBar, renderStepProgress, renderStep0,
 *  renderStep1, renderStep2) are plain functions called as {renderX()} — NOT
 *  React component instances (<X />). Defining components inside a render body
 *  and using them as JSX elements causes React to create a new type reference on
 *  every re-render, unmounting and remounting all DOM nodes which destroys focus.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Calendar,
  Wallet,
  CreditCard,
  User,
  Users,
  UserPlus,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  Timer,
  Loader2,
  Tag,
  X,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency, formatInCurrency } from "@/lib/currency";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PlacesAutocomplete, type StructuredAddress } from "@/components/location/PlacesAutocomplete";
import { SavedAddressesPicker, type SavedAddress } from "@/components/location/SavedAddressesPicker";

/* ── Types ───────────────────────────────────────────────────────── */
export interface BookingCanvasSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface BookingCanvasProvider {
  id: string;
  displayName: string;
  title?: string | null;
  specialization?: string | null;
  rating?: string | null;
  reviewCount?: number | null;
  providerType?: string | null;
  avatarUrl?: string | null;
}

export interface BookingCanvasValues {
  visitType: "clinic" | "home" | "online";
  reason: string;
  notes: string;
  patientAddress: string;
  patientLatitude?: number;
  patientLongitude?: number;
  consentTerms: boolean;
  consentData: boolean;
  payMethod: "card" | "wallet" | "cash" | "bank_transfer";
  walletAmount: number;
  contactName: string;
  contactMobile: string;
  familyMemberId?: string | null;
  intakeResponses: Record<string, unknown>;
  promoCode?: string;
}

export interface PricingBreakdownSnapshot {
  base?: number;
  platformFee?: number;
  visitTypeFee?: number;
  tax?: number;
  discount?: number;
  membershipDiscount?: number;
  total?: number;
  currency?: string;
  /** PRICE-DRIFT-FIX: native currency code for all amounts in this snapshot (e.g. "HUF") */
  bookingCurrency?: string;
}

/** Coverage check result from GET /api/locations/check-coverage */
interface CoverageResult {
  isEligible: boolean;
  distanceKm: number;
  providerRadiusKm: number;
  message: string;
}

/** A single intake-form field descriptor returned by the server. */
interface IntakeField {
  id: string;
  type: "text" | "textarea" | "select" | "checkbox" | "number";
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface FamilyMember {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
}

interface NewMemberForm {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  relationship: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  provider: BookingCanvasProvider | null;
  slot: BookingCanvasSlot | null;
  holdExpiresAt: Date | null;
  walletBalance: number;
  totalDue: number;
  currency: string;
  initialVisitType?: "clinic" | "home" | "online";
  onConfirm: (values: BookingCanvasValues) => void;
  isSubmitting?: boolean;
  defaultContactName?: string;
  defaultContactMobile?: string;
  /** Called ~2.5 s after the hold expires so the parent can reset slot selection */
  onHoldExpired?: () => void;
  /** C21.0 — sub-service ID used to fetch the dynamic intake schema */
  subServiceId?: string | null;
  /** Full pricing breakdown from /api/pricing/quote for the summary display */
  breakdown?: PricingBreakdownSnapshot | null;
  /** Called when the user changes visit type inside the canvas, so the parent can re-fetch the quote */
  onVisitTypeChange?: (vt: "clinic" | "home" | "online") => void;
}

const BLANK_NEW_MEMBER: NewMemberForm = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  relationship: "spouse",
};

/* ── Countdown hook ──────────────────────────────────────────────── */
function useCountdown(target: Date | null): number {
  const [secsLeft, setSecsLeft] = useState(0);
  useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
      setSecsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return secsLeft;
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(`${dateStr}T12:00:00`));
  } catch {
    return dateStr;
  }
}

/* ── Step labels ─────────────────────────────────────────────────── */
const STEPS = ["Intent", "Details", "Payment"] as const;
type Step = 0 | 1 | 2;

/* ── Slide variants ──────────────────────────────────────────────── */
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "60%" : "-60%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-60%" : "60%", opacity: 0 }),
};

/* ── Main component ──────────────────────────────────────────────── */
export function BookingCanvas({
  open,
  onClose,
  provider,
  slot,
  holdExpiresAt,
  walletBalance,
  totalDue,
  currency,
  initialVisitType = "clinic",
  onConfirm,
  isSubmitting = false,
  defaultContactName = "",
  defaultContactMobile = "",
  onHoldExpired,
  subServiceId,
  breakdown,
  onVisitTypeChange,
}: Props) {
  const { t } = useTranslation();
  const { format: formatPrice, convert: convertToLocal } = useCurrency();
  // PRICE-DRIFT-FIX: when breakdown carries a non-USD bookingCurrency, all amounts
  // (base, fees, total) are already in that native currency — use formatInCurrency
  // to display them directly without an exchange-rate multiplication.
  const isNativePricing = !!(breakdown?.bookingCurrency && breakdown.bookingCurrency !== "USD");
  const nativeCurrency = breakdown?.bookingCurrency ?? breakdown?.currency ?? currency;

  /* ── Core form state ──────────────────────────────────────────── */
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState(1);
  const [values, setValues] = useState<BookingCanvasValues>({
    visitType: initialVisitType,
    reason: "",
    notes: "",
    patientAddress: "",
    patientLatitude: undefined,
    patientLongitude: undefined,
    consentTerms: false,
    consentData: false,
    payMethod: "card",
    walletAmount: 0,
    contactName: defaultContactName,
    contactMobile: defaultContactMobile,
    familyMemberId: null,
    intakeResponses: {},
  });

  /* ── Saved-address picker state (home visits) ─────────────────── */
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);

  /* ── Family member selector state ────────────────────────────── */
  // "self" = primary account holder; any other string = family member ID
  const [selectedFor, setSelectedFor] = useState<"self" | string>("self");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState<NewMemberForm>(BLANK_NEW_MEMBER);
  const [addError, setAddError] = useState("");

  /* ── Countdown ───────────────────────────────────────────────── */
  const secsLeft = useCountdown(holdExpiresAt);
  const holdExpired = holdExpiresAt !== null && secsLeft === 0;
  const holdCritical = secsLeft > 0 && secsLeft < 120;

  /* ── Family members query ─────────────────────────────────────── */
  // Only fetch when the drawer is open to avoid background requests
  const { data: familyMembers = [], isLoading: familyLoading } = useQuery<FamilyMember[]>({
    queryKey: ["/api/family-members"],
    enabled: open,
  });

  /* ── C21.0: Dynamic intake schema ────────────────────────────── */
  // Fetch the intake form schema for the selected service. Empty array when
  // no service is selected or the service has no configured intake fields.
  const { data: intakeSchemaData } = useQuery<{ schema: IntakeField[] }>({
    queryKey: ["/api/services", subServiceId, "intake-schema"],
    queryFn: async () => {
      if (!subServiceId) return { schema: [] };
      const r = await fetch(`/api/services/${subServiceId}/intake-schema`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      if (!r.ok) return { schema: [] };
      return r.json();
    },
    enabled: open && !!subServiceId,
    staleTime: 5 * 60 * 1000,
  });
  const intakeFields: IntakeField[] = intakeSchemaData?.schema ?? [];

  /* ── Active packages for membership discount badge ────────────── */
  const { data: activePkgs } = useQuery<{ id: string; packageName: string; benefits: Array<{ key: string; value: string }> }[]>({
    queryKey: ["/api/patient/package-summary"],
    enabled: open,
    staleTime: 60_000,
  });

  /* ── Home visit coverage check ───────────────────────────────── */
  const { data: coverageResult, isFetching: coverageChecking } = useQuery<CoverageResult | null>({
    queryKey: ["/api/locations/check-coverage", provider?.id, values.patientLatitude, values.patientLongitude],
    queryFn: async () => {
      if (!provider?.id || !values.patientLatitude || !values.patientLongitude) return null;
      const token = localStorage.getItem("token") ?? "";
      const url = `/api/locations/check-coverage?providerId=${provider.id}&patientLat=${values.patientLatitude}&patientLng=${values.patientLongitude}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && values.visitType === "home" && !!provider?.id && !!values.patientLatitude && !!values.patientLongitude,
    staleTime: 30_000,
  });

  /* ── Payment providers from registry ─────────────────────────── */
  const { data: registryProviders = [] } = useQuery<Array<{
    key: string;
    label: string;
    description: string;
    environment: string;
    priority: number;
    maintenanceMode: boolean;
  }>>({
    queryKey: ["/api/payment-providers/available"],
    enabled: open,
    staleTime: 60_000,
  });

  /* ── Promo code state ─────────────────────────────────────────── */
  const [promoEntry, setPromoEntry] = useState("");
  const [promoResult, setPromoResult] = useState<{
    code: string;
    discount: number;
    discountType: string;
    discountValue: string;
  } | null>(null);
  const [promoError, setPromoError] = useState("");

  /* ── Add family member mutation ───────────────────────────────── */
  const addMemberMut = useMutation({
    mutationFn: (data: NewMemberForm) =>
      apiRequest("POST", "/api/family-members", data).then(r => r.json()),
    onSuccess: (created: FamilyMember) => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-members"] });
      // Auto-select the newly created member
      const name = `${created.firstName} ${created.lastName}`.trim();
      setSelectedFor(created.id);
      setValues(v => ({
        ...v,
        contactName: name,
        contactMobile: created.phone ?? "",
        familyMemberId: created.id,
      }));
      setShowAddForm(false);
      setNewMember(BLANK_NEW_MEMBER);
      setAddError("");
    },
    onError: (e: any) => {
      setAddError(e?.message ?? "Failed to add family member. Please try again.");
    },
  });

  /* ── Promo validation mutation ────────────────────────────────── */
  const validatePromoMut = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/promo-codes/validate", {
        code,
        amount: totalDue,
        providerId: provider?.id,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).message || "Invalid promo code");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setPromoResult(data);
      setPromoError("");
      setValues(v => ({ ...v, promoCode: data.code }));
    },
    onError: (e: any) => {
      setPromoResult(null);
      setPromoError(e?.message ?? "Invalid promo code");
      setValues(v => ({ ...v, promoCode: undefined }));
    },
  });

  /* ── Reset on open ────────────────────────────────────────────── */
  useEffect(() => {
    if (open) {
      setStep(0);
      setDir(1);
      setSelectedFor("self");
      setShowAddForm(false);
      setNewMember(BLANK_NEW_MEMBER);
      setAddError("");
      setPromoEntry("");
      setPromoResult(null);
      setPromoError("");
      setValues(v => ({
        ...v,
        reason: "",
        notes: "",
        patientAddress: "",
        consentTerms: false,
        consentData: false,
        walletAmount: 0,
        contactName: defaultContactName || v.contactName,
        contactMobile: defaultContactMobile || v.contactMobile,
        familyMemberId: null,
        intakeResponses: {},
        promoCode: undefined,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sync visitType from parent
  useEffect(() => {
    setValues(v => ({ ...v, visitType: initialVisitType }));
  }, [initialVisitType]);

  // Fire onHoldExpired 2.5 s after the hold expires
  const expiredFiredRef = useRef(false);
  useEffect(() => {
    if (holdExpired && !expiredFiredRef.current && onHoldExpired) {
      expiredFiredRef.current = true;
      const timer = setTimeout(onHoldExpired, 2500);
      return () => clearTimeout(timer);
    }
    if (!holdExpired) expiredFiredRef.current = false;
  }, [holdExpired, onHoldExpired]);

  const go = useCallback((next: Step) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }, [step]);

  const canAdvance = (s: Step): boolean => {
    if (s === 0) {
      if (values.reason.trim().length < 3) return false;
      // Home visit requires a full address
      if (values.visitType === "home" && !values.patientAddress.trim()) return false;
      // Block if coverage check definitively failed with a set radius
      if (
        values.visitType === "home" &&
        coverageResult &&
        !coverageResult.isEligible &&
        coverageResult.providerRadiusKm > 0
      ) return false;
      // Validate required intake fields
      for (const field of intakeFields) {
        if (!field.required) continue;
        const val = values.intakeResponses[field.id];
        if (field.type === "checkbox") {
          if (!val) return false;
        } else {
          if (val === undefined || val === null || String(val).trim() === "") return false;
        }
      }
      return true;
    }
    if (s === 1) return values.consentTerms && values.consentData && values.contactName.trim().length >= 2;
    return true;
  };

  const promoDiscount = promoResult?.discount ?? 0;
  const discountedTotal = Math.max(0, totalDue - promoDiscount);
  // walletBalance is always in USD; convert to native units when in native-pricing mode.
  const walletInUnits = isNativePricing ? convertToLocal(walletBalance) : walletBalance;
  const walletUserAmt = values.walletAmount > 0
    ? (isNativePricing ? convertToLocal(values.walletAmount) : values.walletAmount)
    : walletInUnits;
  const walletApplied = Math.min(walletInUnits, discountedTotal, walletUserAmt);
  const remainder = Math.max(0, discountedTotal - (values.payMethod === "wallet" ? walletApplied : 0));

  /* ── Selector helper ─────────────────────────────────────────── */
  const selectSelf = () => {
    setSelectedFor("self");
    setShowAddForm(false);
    setValues(v => ({
      ...v,
      contactName: defaultContactName,
      contactMobile: defaultContactMobile,
      familyMemberId: null,
    }));
  };

  const selectMember = (m: FamilyMember) => {
    setSelectedFor(m.id);
    setShowAddForm(false);
    setValues(v => ({
      ...v,
      contactName: `${m.firstName} ${m.lastName}`.trim(),
      contactMobile: m.phone ?? "",
      familyMemberId: m.id,
    }));
  };

  const handleAddMemberSubmit = () => {
    setAddError("");
    if (!newMember.firstName.trim() || !newMember.lastName.trim() || !newMember.relationship) {
      setAddError("First name, last name, and relationship are required.");
      return;
    }
    addMemberMut.mutate(newMember);
  };

  /* ── Context bar ───────────────────────────────────────────────── */
  const renderContextBar = () => (
    <div className="rounded-xl border border-border/60 bg-muted/40 p-3 mb-5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{provider?.displayName ?? "—"}</p>
          {provider?.specialization && (
            <p className="text-xs text-muted-foreground truncate">{provider.specialization}</p>
          )}
        </div>
      </div>

      {slot && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(slot.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {slot.startTime} – {slot.endTime}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="capitalize">{values.visitType}</span>
          </span>
        </div>
      )}

      {holdExpiresAt && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 w-fit",
            holdExpired
              ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"
              : holdCritical
              ? "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
              : "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {holdExpired ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <Timer className="h-3 w-3 animate-pulse" />
          )}
          {holdExpired
            ? "Hold expired — please reselect a slot"
            : `Slot reserved · ${formatCountdown(secsLeft)} remaining`}
        </div>
      )}
    </div>
  );

  /* ── Step progress ─────────────────────────────────────────────── */
  const renderStepProgress = () => (
    <div className="flex items-center gap-2 mb-5">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2 flex-1">
          <button
            onClick={() => i < step && go(i as Step)}
            disabled={i >= step}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium transition-colors",
              i === step
                ? "text-primary"
                : i < step
                ? "text-emerald-600 dark:text-emerald-400 cursor-pointer"
                : "text-muted-foreground cursor-default",
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0",
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                  ? "bg-emerald-600 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "flex-1 h-px",
                i < step ? "bg-emerald-400" : "bg-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );

  /* ── Step 0: Intent (with optional dynamic intake fields) ───────── */
  const renderStep0 = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-1.5 block">
          Reason for visit <span className="text-destructive">*</span>
        </Label>
        <Textarea
          placeholder="Briefly describe what you'd like to be seen for…"
          value={values.reason}
          onChange={e => setValues(v => ({ ...v, reason: e.target.value }))}
          rows={4}
          className="resize-none"
          data-testid="input-booking-reason"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {values.reason.trim().length}/3 characters minimum
        </p>
      </div>

      {/* ── C21.0 Dynamic Intake Fields ──────────────────────────── */}
      {intakeFields.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Service intake questions
          </p>
          {intakeFields.map(field => {
            const fieldVal = values.intakeResponses[field.id];
            const setFieldVal = (val: unknown) =>
              setValues(v => ({ ...v, intakeResponses: { ...v.intakeResponses, [field.id]: val } }));
            return (
              <div key={field.id}>
                <Label className="text-sm font-medium mb-1 block">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                {field.type === "textarea" && (
                  <Textarea
                    placeholder={field.placeholder ?? ""}
                    value={String(fieldVal ?? "")}
                    onChange={e => setFieldVal(e.target.value)}
                    rows={3}
                    className="resize-none"
                    data-testid={`intake-${field.id}`}
                  />
                )}
                {(field.type === "text" || field.type === "number") && (
                  <Input
                    type={field.type}
                    placeholder={field.placeholder ?? ""}
                    value={String(fieldVal ?? "")}
                    onChange={e => setFieldVal(field.type === "number" ? Number(e.target.value) : e.target.value)}
                    data-testid={`intake-${field.id}`}
                  />
                )}
                {field.type === "select" && field.options && (
                  <div className="grid gap-1.5">
                    {field.options.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setFieldVal(opt)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-sm text-left transition-all",
                          fieldVal === opt
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/40",
                        )}
                        data-testid={`intake-${field.id}-${opt}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {field.type === "checkbox" && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`intake-${field.id}`}
                      checked={!!fieldVal}
                      onCheckedChange={checked => setFieldVal(!!checked)}
                      data-testid={`intake-${field.id}`}
                    />
                    <label htmlFor={`intake-${field.id}`} className="text-sm text-muted-foreground">
                      {field.placeholder ?? "Yes"}
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <Label className="text-sm font-medium mb-1.5 block">Visit type</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["clinic", "home", "online"] as const).map(vt => (
            <button
              key={vt}
              onClick={() => { setValues(v => ({ ...v, visitType: vt })); onVisitTypeChange?.(vt); }}
              className={cn(
                "rounded-lg border py-2 px-3 text-xs font-medium capitalize transition-all",
                values.visitType === vt
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
              data-testid={`btn-visit-type-${vt}`}
            >
              {vt}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-1.5 block">Additional notes</Label>
        <Textarea
          placeholder="Anything else the provider should know (optional)…"
          value={values.notes}
          onChange={e => setValues(v => ({ ...v, notes: e.target.value }))}
          rows={3}
          className="resize-none"
          data-testid="input-booking-notes"
        />
      </div>

      {values.visitType === "home" && (
        <div className="space-y-3">
          <Label className="text-sm font-medium mb-1.5 block">
            Home address <span className="text-destructive">*</span>
          </Label>
          {/* Saved-address picker — lets returning patients reuse a stored address */}
          <SavedAddressesPicker
            selectedId={selectedSavedAddressId}
            onSelect={(addr: SavedAddress | null) => {
              setSelectedSavedAddressId(addr?.id ?? null);
              if (addr) {
                const display = addr.formattedAddress ||
                  [addr.addressLine1, addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ");
                setValues(v => ({
                  ...v,
                  patientAddress: display,
                  patientLatitude: addr.latitude ?? undefined,
                  patientLongitude: addr.longitude ?? undefined,
                }));
              } else {
                setValues(v => ({ ...v, patientAddress: "", patientLatitude: undefined, patientLongitude: undefined }));
              }
            }}
            className="mb-1"
          />
          {/* Manual entry — shown below picker for typing a new address */}
          <PlacesAutocomplete
            value={selectedSavedAddressId ? "" : values.patientAddress}
            onChange={(text, structured?: StructuredAddress) => {
              setSelectedSavedAddressId(null);
              setValues(v => ({
                ...v,
                patientAddress: text,
                patientLatitude: structured?.latitude,
                patientLongitude: structured?.longitude,
              }));
            }}
            placeholder={selectedSavedAddressId ? "Or type a different address…" : "Full address for home visit"}
            data-testid="input-patient-address"
          />
          <p className="text-xs text-muted-foreground">
            We'll share this with your provider once the booking is confirmed.
          </p>

          {/* Coverage status banner — shown once an address with coords is selected */}
          {(values.patientLatitude && values.patientLongitude) ? (
            <div>
              {coverageChecking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking coverage…
                </div>
              )}
              {!coverageChecking && coverageResult && coverageResult.isEligible && (
                <div
                  className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3"
                  data-testid="banner-coverage-eligible"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    <p className="font-medium">Provider covers your location</p>
                    {coverageResult.distanceKm > 0 && coverageResult.providerRadiusKm > 0 && (
                      <p className="text-emerald-600/80 dark:text-emerald-500">
                        {coverageResult.distanceKm.toFixed(1)} km away · within {coverageResult.providerRadiusKm} km service area
                      </p>
                    )}
                    {coverageResult.providerRadiusKm === 0 && coverageResult.distanceKm > 0 && (
                      <p className="text-emerald-600/80 dark:text-emerald-500">
                        {coverageResult.distanceKm.toFixed(1)} km away · no distance restriction
                      </p>
                    )}
                  </div>
                </div>
              )}
              {!coverageChecking && coverageResult && !coverageResult.isEligible && coverageResult.providerRadiusKm > 0 && (
                <div
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  data-testid="banner-coverage-ineligible"
                >
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs text-destructive">
                    <p className="font-medium">Outside provider's service area</p>
                    <p className="text-destructive/80">
                      You are {coverageResult.distanceKm.toFixed(1)} km away — this provider covers up to {coverageResult.providerRadiusKm} km. Please enter a closer address or choose a different provider.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  /* ── Step 1: Patient selector + Demographics & Consent ────────── */
  const renderStep1 = () => (
    <div className="space-y-5">
      {/* Booking summary card */}
      <div className="rounded-xl bg-muted/50 border border-border/60 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Stethoscope className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Booking Summary</h3>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span>Provider</span>
          <span className="text-foreground font-medium truncate">{provider?.displayName}</span>
          {slot && <>
            <span>Date</span>
            <span className="text-foreground font-medium">{formatDate(slot.date)}</span>
            <span>Time</span>
            <span className="text-foreground font-medium">{slot.startTime} – {slot.endTime}</span>
          </>}
          <span>Visit type</span>
          <span className="text-foreground font-medium capitalize">{values.visitType}</span>
          <span>Reason</span>
          <span className="text-foreground font-medium truncate">{values.reason}</span>
        </div>
      </div>

      {/* ── Who is this appointment for? ─────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Who is this appointment for?
        </h3>

        {familyLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading profiles…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {/* Myself tile */}
            <button
              onClick={selectSelf}
              data-testid="btn-patient-self"
              className={cn(
                "rounded-xl border p-3 flex flex-col items-start gap-1 text-left transition-all",
                selectedFor === "self"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                selectedFor === "self" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}>
                <User className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold mt-0.5">Myself</p>
              {defaultContactName && (
                <p className="text-[10px] text-muted-foreground truncate w-full">{defaultContactName}</p>
              )}
              {selectedFor === "self" && (
                <CheckCircle2 className="h-3 w-3 text-primary self-end" />
              )}
            </button>

            {/* Existing family member tiles */}
            {familyMembers.map(m => (
              <button
                key={m.id}
                onClick={() => selectMember(m)}
                data-testid={`btn-patient-member-${m.id}`}
                className={cn(
                  "rounded-xl border p-3 flex flex-col items-start gap-1 text-left transition-all",
                  selectedFor === m.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/40",
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  selectedFor === m.id ? "bg-primary text-primary-foreground" : "bg-muted",
                )}>
                  <User className="h-4 w-4" />
                </div>
                <p className="text-xs font-semibold mt-0.5 truncate w-full">
                  {m.firstName} {m.lastName}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">{m.relationship}</p>
                {selectedFor === m.id && (
                  <CheckCircle2 className="h-3 w-3 text-primary self-end" />
                )}
              </button>
            ))}

            {/* Add new family member tile */}
            <button
              onClick={() => { setShowAddForm(f => !f); setAddError(""); }}
              data-testid="btn-add-family-member"
              className={cn(
                "rounded-xl border border-dashed p-3 flex flex-col items-center justify-center gap-1.5 text-left transition-all min-h-[90px]",
                showAddForm
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 text-muted-foreground",
              )}
            >
              <UserPlus className="h-5 w-5" />
              <p className="text-xs font-medium text-center leading-tight">
                {showAddForm ? "Cancel" : "+ Add New\nFamily Member"}
              </p>
            </button>
          </div>
        )}

        {/* Inline add-member form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 mt-2">
                <p className="text-xs font-semibold text-primary">New Family Member</p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      First name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="First name"
                      value={newMember.firstName}
                      onChange={e => setNewMember(m => ({ ...m, firstName: e.target.value }))}
                      data-testid="input-new-member-firstname"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Last name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Last name"
                      value={newMember.lastName}
                      onChange={e => setNewMember(m => ({ ...m, lastName: e.target.value }))}
                      data-testid="input-new-member-lastname"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Date of birth</Label>
                    <Input
                      type="date"
                      value={newMember.dateOfBirth}
                      onChange={e => setNewMember(m => ({ ...m, dateOfBirth: e.target.value }))}
                      data-testid="input-new-member-dob"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Gender</Label>
                    {/* Native select avoids Radix SelectItem empty-value crash */}
                    <select
                      value={newMember.gender}
                      onChange={e => setNewMember(m => ({ ...m, gender: e.target.value }))}
                      data-testid="select-new-member-gender"
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    Relationship <span className="text-destructive">*</span>
                  </Label>
                  <select
                    value={newMember.relationship}
                    onChange={e => setNewMember(m => ({ ...m, relationship: e.target.value }))}
                    data-testid="select-new-member-relationship"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="spouse">Spouse</option>
                    <option value="child">Child</option>
                    <option value="parent">Parent</option>
                    <option value="dependent">Dependent</option>
                  </select>
                </div>

                {addError && (
                  <p className="text-xs text-destructive">{addError}</p>
                )}

                <Button
                  size="sm"
                  onClick={handleAddMemberSubmit}
                  disabled={addMemberMut.isPending}
                  className="w-full"
                  data-testid="btn-save-new-member"
                >
                  {addMemberMut.isPending ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-2" />Saving…</>
                  ) : (
                    <><CheckCircle2 className="h-3 w-3 mr-2" />Save & Select</>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Contact information — autofilled by selection, still editable */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Contact Information</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="Your full name"
              value={values.contactName}
              onChange={e => setValues(v => ({ ...v, contactName: e.target.value }))}
              data-testid="input-contact-name"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Mobile number</Label>
            <Input
              placeholder="+1 555 000 0000"
              value={values.contactMobile}
              onChange={e => setValues(v => ({ ...v, contactMobile: e.target.value }))}
              data-testid="input-contact-mobile"
            />
          </div>
        </div>
        {selectedFor !== "self" && (
          <p className="text-xs text-primary/80 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Booking on behalf of{" "}
            <span className="font-semibold">
              {familyMembers.find(m => m.id === selectedFor)
                ? `${familyMembers.find(m => m.id === selectedFor)!.firstName} ${familyMembers.find(m => m.id === selectedFor)!.lastName}`
                : "family member"}
            </span>
          </p>
        )}
      </div>

      {/* Consent */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Consent & Agreements</h3>

        <label className="flex items-start gap-3 cursor-pointer group" data-testid="check-consent-terms">
          <Checkbox
            checked={values.consentTerms}
            onCheckedChange={v => setValues(s => ({ ...s, consentTerms: !!v }))}
            className="mt-0.5 shrink-0"
          />
          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-snug">
            I agree to the{" "}
            <a href="/terms" target="_blank" className="text-primary underline underline-offset-2">
              Terms of Service
            </a>{" "}
            and cancellation policy for this appointment.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer group" data-testid="check-consent-data">
          <Checkbox
            checked={values.consentData}
            onCheckedChange={v => setValues(s => ({ ...s, consentData: !!v }))}
            className="mt-0.5 shrink-0"
          />
          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-snug">
            I consent to my health information being shared with this provider for the purpose of this appointment, in accordance with our{" "}
            <a href="/privacy" target="_blank" className="text-primary underline underline-offset-2">
              Privacy Policy
            </a>.
          </span>
        </label>
      </div>
    </div>
  );

  /* ── Step 2: Payment ────────────────────────────────────────────── */
  const renderStep2 = () => {
    // PRICE-DRIFT-FIX: breakdown amounts are in native currency when isNativePricing.
    // Use formatInCurrency (no USD multiplication) for booking amounts.
    // Wallet balance is always in USD — always use formatPrice (USD→local) for it.
    const fmt = (n: number) =>
      isNativePricing
        ? formatInCurrency(n, nativeCurrency)
        : (formatPrice ? formatPrice(n) : `${currency} ${n.toFixed(2)}`);
    const hasBreakdown = breakdown && (
      (breakdown.platformFee ?? 0) > 0 ||
      (breakdown.visitTypeFee ?? 0) > 0 ||
      (breakdown.tax ?? 0) > 0 ||
      (breakdown.membershipDiscount ?? 0) > 0
    );

    return (
    <div className="space-y-4">
      <div className="rounded-xl bg-muted/50 border border-border/60 p-4 space-y-2">
        {/* Active membership badge */}
        {activePkgs && activePkgs.length > 0 && (
          <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 text-xs">
              <Crown className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
              <span className="font-medium text-violet-700 dark:text-violet-300">{activePkgs[0].packageName}</span>
              <span className="text-violet-500 dark:text-violet-400">— active membership</span>
            </div>
            {activePkgs[0].benefits && activePkgs[0].benefits.length > 0 && (
              <ul className="pl-5 space-y-0.5">
                {activePkgs[0].benefits.map((b) => {
                  const val = Number(b.value);
                  const label =
                    b.key === "service_discount_percent" ? `${val}% service discount` :
                    b.key === "platform_fee_discount"    ? `${val}% platform fee discount` :
                    b.key === "wallet_bonus"             ? `${fmt(val)} wallet bonus` :
                    b.key === "reduced_commission"       ? `${val}% reduced commission` :
                    b.key === "free_cancellations"       ? `Free cancellations` :
                    b.key === "priority_support"         ? `Priority support` :
                    b.key === "featured_provider"        ? `Featured listing` :
                    `${b.key}: ${b.value}`;
                  return (
                    <li key={b.key} className="text-[11px] text-violet-600 dark:text-violet-400 list-disc">
                      {label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Price breakdown — detailed lines when we have a full quote */}
        <div className="space-y-1">
          {/* Base price */}
          {hasBreakdown && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Base price</span>
              <span>{fmt(breakdown!.base ?? totalDue)}</span>
            </div>
          )}
          {/* Visit-type surcharge */}
          {hasBreakdown && (breakdown!.visitTypeFee ?? 0) > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Visit fee
              </span>
              <span>+{fmt(breakdown!.visitTypeFee!)}</span>
            </div>
          )}
          {/* Platform fee */}
          {hasBreakdown && (breakdown!.platformFee ?? 0) > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Platform fee</span>
              <span>+{fmt(breakdown!.platformFee!)}</span>
            </div>
          )}
          {/* Membership discount */}
          {hasBreakdown && (breakdown!.membershipDiscount ?? 0) > 0 && (
            <div className="flex items-center justify-between text-xs text-violet-600 dark:text-violet-400">
              <span className="flex items-center gap-1">
                <Crown className="h-3 w-3" />
                Membership discount
              </span>
              <span>−{fmt(breakdown!.membershipDiscount!)}</span>
            </div>
          )}
          {/* Promo discount */}
          {promoResult && (
            <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Code <span className="font-mono font-semibold ml-0.5">{promoResult.code}</span>
              </span>
              <span>−{fmt(promoResult.discount)}</span>
            </div>
          )}
          {/* Tax */}
          {hasBreakdown && (breakdown!.tax ?? 0) > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tax</span>
              <span>+{fmt(breakdown!.tax!)}</span>
            </div>
          )}
          {/* Divider before total */}
          {(hasBreakdown || promoResult) && (
            <div className="border-t border-border/60 pt-1" />
          )}
          {/* Total due */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Total due</span>
            <span className="text-lg font-bold text-primary">
              {fmt(discountedTotal)}
            </span>
          </div>
        </div>

        {walletBalance > 0 && (
          <div className="text-xs text-muted-foreground">
            {/* walletBalance is always in USD — always convert from USD regardless of pricing mode */}
            Wallet balance: {formatPrice ? formatPrice(walletBalance) : `${walletBalance.toFixed(2)}`}
          </div>
        )}
        {selectedFor !== "self" && (
          <div className="mt-1 text-xs text-primary/80 flex items-center gap-1">
            <Users className="h-3 w-3" />
            Booking for:{" "}
            <span className="font-semibold">
              {familyMembers.find(m => m.id === selectedFor)
                ? `${familyMembers.find(m => m.id === selectedFor)!.firstName} ${familyMembers.find(m => m.id === selectedFor)!.lastName}`
                : "family member"}
            </span>
          </div>
        )}
      </div>

      {/* Promo code input */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Promo code</p>
        {promoResult ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex-1">
              Code <span className="font-mono">{promoResult.code}</span> — saving{" "}
              {fmt(promoResult.discount)}
            </span>
            <button
              type="button"
              onClick={() => {
                setPromoResult(null);
                setPromoEntry("");
                setPromoError("");
                setValues(v => ({ ...v, promoCode: undefined }));
              }}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200"
              data-testid="button-remove-promo"
              aria-label="Remove promo code"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Enter promo code"
              value={promoEntry}
              onChange={e => { setPromoEntry(e.target.value.toUpperCase()); setPromoError(""); }}
              className="font-mono uppercase tracking-widest"
              data-testid="input-promo-code"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={promoEntry.trim().length < 2 || validatePromoMut.isPending}
              onClick={() => validatePromoMut.mutate(promoEntry.trim())}
              data-testid="button-apply-promo"
            >
              {validatePromoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
          </div>
        )}
        {promoError && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1" data-testid="text-promo-error">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {promoError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Payment method</h3>

        {/* Registry-driven payment methods */}
        {registryProviders.map(provider => {
          const isWallet = provider.key === "wallet";
          const isCash = provider.key === "cash";
          const isBankTransfer = provider.key === "bank_transfer";
          const isCard = provider.key === "stripe";

          // Wallet only shown when patient has a balance
          if (isWallet && !(walletBalance > 0 && discountedTotal > 0)) return null;

          const payKey = isWallet ? "wallet" : isCash ? "cash" : isBankTransfer ? "bank_transfer" : "card";
          const isSelected = values.payMethod === payKey;

          const Icon = isWallet ? Wallet : isCard ? CreditCard : isCash ? Tag : AlertCircle;
          const title = isWallet
            ? "Pay with Wallet"
            : isCash
            ? "Pay Cash"
            : isBankTransfer
            ? "Bank Transfer"
            : provider.label;
          const subtitle = isWallet
            ? walletBalance >= discountedTotal
              ? `Use ${fmt(discountedTotal)} from your balance — instant confirmation`
              : `Apply ${fmt(walletBalance)} wallet credit — remainder via card`
            : provider.description;

          return (
            <button
              key={provider.key}
              onClick={() => setValues(v => ({ ...v, payMethod: payKey }))}
              className={cn(
                "w-full rounded-xl border p-4 flex items-center gap-3 text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/50",
              )}
              data-testid={`btn-pay-${provider.key}`}
            >
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted",
              )}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              </div>
              {isSelected && (
                <CheckCircle2 className="h-4 w-4 text-primary ml-auto shrink-0" />
              )}
            </button>
          );
        })}

        {/* Wallet fallback — shown when the user has balance but wallet was not
            returned by the registry (e.g. registry still loading or country filter). */}
        {walletBalance > 0 && discountedTotal > 0 && !registryProviders.some(p => p.key === "wallet") && (
          <button
            onClick={() => setValues(v => ({ ...v, payMethod: "wallet" }))}
            className={cn(
              "w-full rounded-xl border p-4 flex items-center gap-3 text-left transition-all",
              values.payMethod === "wallet"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/50",
            )}
            data-testid="btn-pay-wallet"
          >
            <div className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
              values.payMethod === "wallet" ? "bg-primary text-primary-foreground" : "bg-muted",
            )}>
              <Wallet className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Pay with Wallet</p>
              <p className="text-xs text-muted-foreground truncate">
                {walletBalance >= discountedTotal
                  ? `Use ${fmt(discountedTotal)} from your balance — instant confirmation`
                  : `Apply ${fmt(walletBalance)} wallet credit — remainder via card`}
              </p>
            </div>
            {values.payMethod === "wallet" && (
              <CheckCircle2 className="h-4 w-4 text-primary ml-auto shrink-0" />
            )}
          </button>
        )}

        {/* Fallback when registry is empty or loading — always show card */}
        {registryProviders.length === 0 && (
          <button
            onClick={() => setValues(v => ({ ...v, payMethod: "card" }))}
            className={cn(
              "w-full rounded-xl border p-4 flex items-center gap-3 text-left transition-all",
              values.payMethod === "card"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/50",
            )}
            data-testid="btn-pay-card"
          >
            <div className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
              values.payMethod === "card" ? "bg-primary text-primary-foreground" : "bg-muted",
            )}>
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Pay by Card</p>
              <p className="text-xs text-muted-foreground">Secure checkout</p>
            </div>
            {values.payMethod === "card" && (
              <CheckCircle2 className="h-4 w-4 text-primary ml-auto shrink-0" />
            )}
          </button>
        )}
      </div>

      {values.payMethod === "cash" && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Your booking will be pending until the provider confirms receipt of payment at the appointment.</span>
        </div>
      )}

      {values.payMethod === "bank_transfer" && (
        <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Bank Transfer Instructions</p>
            <p>Transfer {fmt(discountedTotal)} to the bank account details that will be provided in your booking confirmation. Your appointment will be confirmed once the provider verifies receipt of payment.</p>
            <p className="text-amber-600 dark:text-amber-400 font-medium">⚠ Your slot is reserved for 48 hours — please transfer promptly to secure your appointment.</p>
          </div>
        </div>
      )}

      {values.payMethod === "wallet" && walletBalance < discountedTotal && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
          Your wallet covers {fmt(walletBalance)} of the total.
          The remaining {fmt(remainder)} will be charged by card.
        </div>
      )}
    </div>
    );
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  const stepContent = [renderStep0(), renderStep1(), renderStep2()];

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 gap-0 overflow-hidden"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/60 shrink-0">
          <SheetTitle className="text-base font-semibold">
            Confirm Appointment
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
          {renderContextBar()}
          {renderStepProgress()}

          <div className="relative overflow-hidden">
            <AnimatePresence initial={false} custom={dir} mode="wait">
              <motion.div
                key={step}
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
              >
                {stepContent[step]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Fixed bottom nav */}
        <div className="absolute bottom-0 inset-x-0 border-t border-border/60 bg-background/95 backdrop-blur-sm px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => step === 0 ? onClose() : go((step - 1) as Step)}
            disabled={isSubmitting}
            data-testid="btn-booking-back"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {step < 2 ? (
            <Button
              size="sm"
              onClick={() => go((step + 1) as Step)}
              disabled={!canAdvance(step)}
              data-testid="btn-booking-next"
            >
              Continue
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onConfirm(values)}
              disabled={isSubmitting || holdExpired}
              data-testid="btn-booking-confirm"
            >
              {isSubmitting ? "Confirming…" : "Confirm Booking"}
              {!isSubmitting && <CheckCircle2 className="h-4 w-4 ml-1" />}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
