/**
 * Operations Bookings Center
 * Full operational console for platform bookings — sections A-H.
 * Data source: /api/admin/financial/master-report (enriched join)
 * Status updates: PATCH /api/admin/bookings/:id
 */
import { useState, useCallback, useRef, type ElementType, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAdminCurrency, formatInCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/format-utils";
import { format } from "date-fns";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search, Filter, X, Columns, Download, Printer, Save,
  ChevronDown, ChevronRight, ChevronLeft, ChevronUp,
  RefreshCw, Loader2, AlertCircle, ArrowUpDown,
  CalendarDays, Users, Building2, Stethoscope, DollarSign,
  CreditCard, Wallet, FileText, Clock, Shield, ExternalLink,
  Receipt, Banknote, BookOpen, MapPin,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BookingRow {
  id: string;
  appointment_number: string | null;
  status: string;
  payment_status: string;
  visit_type: string;
  location_mode: string | null;
  created_at: string;
  updated_at: string | null;
  start_at: string | null;
  end_at: string | null;
  provider_timezone: string | null;
  country_code: string;
  booking_note: string | null;
  // Financial
  total_amount: string;
  final_total_usd: string | null;
  display_currency: string | null;
  display_amount: string | null;
  exchange_rate_used: string | null;
  platform_fee_amount: string;
  commission_amount: string | null;
  provider_commission_usd: string | null;
  promo_code: string | null;
  promo_discount: string;
  tax_amount: string;
  service_tax_rate: string | null;
  service_tax_amount: string | null;
  platform_tax_rate: string | null;
  platform_tax_amount: string | null;
  refund_amount: string;
  refund_status: string | null;
  service_price_snapshot: string | null;
  appt_payment_method: string | null;
  // Patient
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_email: string;
  patient_country: string;
  patient_city: string | null;
  // Provider
  provider_id: string;
  provider_first_name: string;
  provider_last_name: string;
  provider_email: string;
  provider_category: string;
  provider_country: string;
  provider_city: string | null;
  clinic_name: string | null;
  // Service
  service_id: string | null;
  service_name: string | null;
  service_duration: number | null;
  service_category: string | null;
  // Payment
  payment_id: string | null;
  payment_method: string | null;
  stripe_payment_id: string | null;
  payment_amount: string | null;
  payment_record_status: string | null;
  payment_refund_status: string | null;
  payment_refunded_amount: string | null;
  // Earnings
  provider_net_earnings_usd: string | null;
  earning_platform_fee: string | null;
  earning_status: string | null;
  payout_reference: string | null;
  earning_paid_at: string | null;
  // Invoice
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
}

interface PagedResponse { rows: BookingRow[]; total: number; page: number; limit: number; totalPages: number; }
interface LifecycleEvent {
  id: string; appointment_id: string; action: string;
  actor_user_id: string | null; actor_role: string | null;
  from_status: string | null; to_status: string | null;
  reason: string | null; created_at: string;
  actor_first_name: string | null; actor_last_name: string | null; actor_email: string | null;
}

// ── Column groups ──────────────────────────────────────────────────────────────

const COL_GROUPS = [
  { id: "booking",   label: "A · Booking",   cols: ["ref","status","payment","date"] as const },
  { id: "appt",      label: "B · Appointment",cols: ["appt"] as const },
  { id: "patient",   label: "C · Member",   cols: ["patient"] as const },
  { id: "provider",  label: "D · Provider",  cols: ["provider"] as const },
  { id: "service",   label: "E · Service",   cols: ["service"] as const },
  { id: "financial", label: "F · Financial", cols: ["amount"] as const },
  { id: "payment",   label: "G · Payment",   cols: ["method"] as const },
] as const;

const DEFAULT_VISIBLE = new Set(["ref","status","payment","date","appt","patient","provider","service","amount"]);

// ── Saved views ────────────────────────────────────────────────────────────────

const VIEW_STORAGE_KEY = "ops-bookings-saved-views";
const FILTER_STORAGE_KEY = "ops-bookings-saved-filters";

interface SavedView { name: string; cols: string[]; }
interface SavedFilter {
  name: string; status: string; paymentStatus: string;
  visitType: string; refundStatus: string; dateFrom: string; dateTo: string;
}

function loadViews(): SavedView[] {
  try { return JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveViews(v: SavedView[]) { localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(v)); }

function loadFilters(): SavedFilter[] {
  try { return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveFilters(v: SavedFilter[]) { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(v)); }

// ── Helpers ────────────────────────────────────────────────────────────────────

const TOKEN = () => localStorage.getItem("token") || "";
function authFetch(url: string) { return fetch(url, { headers: { Authorization: `Bearer ${TOKEN()}` } }).then(r => r.json()); }
function n(v: string | number | null | undefined) { return Number(v) || 0; }
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "d MMM yyyy"); } catch { return "—"; }
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "d MMM yyyy HH:mm"); } catch { return "—"; }
}
function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "HH:mm"); } catch { return "—"; }
}
function fmtBooking(amount: number, currency: string | null | undefined) {
  return formatInCurrency(amount, currency ?? "USD");
}

// ── Status colours ─────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  // Appointment statuses
  pending:               "bg-amber-100 text-amber-700",
  approved:              "bg-blue-100 text-blue-700",
  confirmed:             "bg-green-100 text-green-700",
  in_progress:           "bg-purple-100 text-purple-700",
  completed:             "bg-emerald-100 text-emerald-700",
  cancelled:             "bg-rose-100 text-rose-700",
  cancelled_by_patient:  "bg-rose-100 text-rose-700",
  cancelled_by_provider: "bg-rose-100 text-rose-700",
  rejected:              "bg-rose-100 text-rose-800",
  no_show:               "bg-gray-100 text-gray-500",
  rescheduled:           "bg-cyan-100 text-cyan-700",
  reschedule_requested:  "bg-violet-100 text-violet-700",
  reschedule_proposed:   "bg-indigo-100 text-indigo-700",
  expired:               "bg-zinc-100 text-zinc-500",
  // Payment statuses
  paid:                  "bg-emerald-100 text-emerald-700",
  refunded:              "bg-orange-100 text-orange-700",
  partially_refunded:    "bg-amber-100 text-amber-600",
  failed:                "bg-rose-100 text-rose-700",
  processed:             "bg-teal-100 text-teal-700",
  processing:            "bg-blue-100 text-blue-600",
  not_required:          "bg-gray-100 text-gray-400",
  pending_approval:      "bg-amber-100 text-amber-700",
};

function SBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation();
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const normalized = value.toLowerCase().replace(/^refund:/, "");
  const label = String(t(`admin.booking_status_${normalized}`, {
    defaultValue: normalized.replace(/_/g, " "),
  }));
  return (
    <Badge variant="outline" className={`capitalize text-xs ${STATUS_CLS[value.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </Badge>
  );
}

// ── Lifecycle Timeline ──────────────────────────────────────────────────────────

function Timeline({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data: events = [], isLoading } = useQuery<LifecycleEvent[]>({
    queryKey: ["/api/admin/financial/master-report", id, "events"],
    queryFn: () => authFetch(`/api/admin/financial/master-report/${id}/events`),
  });
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
   if (!events.length) return <p className="text-xs text-muted-foreground">{t("admin.no_lifecycle_events", "No events yet.")}</p>;
  return (
    <div className="relative ps-4 space-y-3">
      <div className="absolute start-1.5 top-0 bottom-0 w-0.5 bg-border" />
      {events.map(ev => (
        <div key={ev.id} className="relative text-xs">
          <div className="absolute -start-1.5 top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
          <p className="ps-2 font-medium capitalize">{ev.action.replace(/_/g, " ")}</p>
           <p className="ps-2 text-muted-foreground">
             {fmtDateTime(ev.created_at)} · {ev.actor_first_name ? `${ev.actor_first_name} ${ev.actor_last_name}` : ev.actor_role ?? t("admin.system", "System")}
          </p>
          {ev.from_status && ev.to_status && (
            <p className="ps-2 text-muted-foreground">{ev.from_status} → {ev.to_status}</p>
          )}
          {ev.reason && <p className="ps-2 italic text-muted-foreground">"{ev.reason}"</p>}
        </div>
      ))}
    </div>
  );
}

// ── Investigation Drawer ───────────────────────────────────────────────────────

function InvestigationDrawer({
  row, open, onClose, fmt,
}: { row: BookingRow | null; open: boolean; onClose: () => void; fmt: (n: number) => string }) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  if (!row) return null;

  const cur = row.display_currency ?? "USD";
  const fmtLocal = (v: number) => fmtBooking(v, cur);
  // Only use final_total_usd when it is actually populated (NULL for cash/bank-transfer
  // bookings) — using total_amount (HUF/IRR) as a USD fallback produces a wrong figure.
  const usdNorm = row.final_total_usd != null ? n(row.final_total_usd) : null;

  const Section = ({ title, icon: Icon, children }: { title: string; icon?: ElementType; children: ReactNode }) => (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}{title}
      </h4>
      {children}
    </div>
  );
  const Row = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-36">{label}</span>
      <span className="font-medium break-all">{value ?? "—"}</span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
             {row.appointment_number ?? row.id.slice(0, 8)} — {t("admin.investigation", "Investigation")}
          </SheetTitle>
        </SheetHeader>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mb-6 p-3 bg-muted/40 rounded-lg">
           <p className="w-full text-xs font-semibold text-muted-foreground mb-1">{t("admin.quick_actions", "Quick actions")}</p>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
            <a href={`/appointments/${row.id}`} target="_blank" rel="noreferrer">
               <ExternalLink className="h-3 w-3" />{t("admin.booking", "Booking")}
            </a>
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { onClose(); navigate(`/admin?tab=users&userId=${row.patient_id}`); }}>
               <Users className="h-3 w-3" />{t("admin.member", "Member")}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { onClose(); navigate(`/admin?tab=providers&id=${row.provider_id}`); }}>
               <Building2 className="h-3 w-3" />{t("admin.provider", "Provider")}
          </Button>
          {row.invoice_id && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { onClose(); navigate(`/admin?tab=invoices&id=${row.invoice_id}`); }}>
               <FileText className="h-3 w-3" />{t("admin.invoice", "Invoice")}
            </Button>
          )}
          {row.payment_id && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { onClose(); navigate(`/admin?tab=revenue-billing&sub=payments`); }}>
               <CreditCard className="h-3 w-3" />{t("admin.payment", "Payment")}
            </Button>
          )}
          {n(row.refund_amount) > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { onClose(); navigate(`/admin?tab=revenue-billing&sub=refunds`); }}>
               <RefreshCw className="h-3 w-3" />{t("admin.refund", "Refund")}
            </Button>
          )}
        </div>

        <div className="space-y-5 pb-10">

          {/* A: Booking */}
           <Section title={`A · ${t("admin.booking", "Booking")}`} icon={CalendarDays}>
             <Row label={t("admin.id", "ID")} value={<span className="font-mono text-xs">{row.id}</span>} />
             <Row label={t("admin.booking_ref", "Booking ref")} value={row.appointment_number} />
             <Row label={t("admin.booking_status", "Booking status")} value={<SBadge value={row.status} />} />
             <Row label={t("admin.payment_status", "Payment status")} value={<SBadge value={row.payment_status} />} />
             <Row label={t("admin.refund_status", "Refund status")} value={<SBadge value={row.refund_status} />} />
             <Row label={t("admin.country", "Country")} value={row.country_code} />
             <Row label={t("admin.booking_note", "Booking note")} value={row.booking_note?.trim() || t("admin.no_booking_note", "No booking note recorded")} />
             <Row label={t("admin.created", "Created")} value={fmtDateTime(row.created_at)} />
             <Row label={t("admin.last_updated", "Last updated")} value={fmtDateTime(row.updated_at)} />
             <Row label={t("admin.audit_ref", "Audit ref")} value={<span className="font-mono text-xs">{row.id}</span>} />
          </Section>

          {/* B: Appointment */}
           <Section title={`B · ${t("admin.appointment", "Appointment")}`} icon={Clock}>
             <Row label={t("admin.date", "Date")} value={fmtDate(row.start_at)} />
             <Row label={t("admin.start_time", "Start time")} value={fmtTime(row.start_at)} />
             <Row label={t("admin.end_time", "End time")} value={fmtTime(row.end_at)} />
             <Row label={t("admin.duration", "Duration")} value={row.service_duration ? `${row.service_duration} min` : null} />
             <Row label={t("admin.timezone", "Timezone")} value={row.provider_timezone} />
             <Row label={t("admin.visit_type", "Visit type")} value={row.visit_type} />
             <Row label={t("admin.location", "Location")} value={row.location_mode ?? row.visit_type} />
             <Row label={t("admin.clinic", "Clinic")} value={row.clinic_name} />
          </Section>

          {/* C: Member */}
           <Section title={`C · ${t("admin.member", "Member")}`} icon={Users}>
             <Row label={t("admin.name", "Name")} value={`${row.patient_first_name} ${row.patient_last_name}`} />
             <Row label={t("admin.email", "Email")} value={row.patient_email} />
             <Row label={t("admin.city", "City")} value={row.patient_city} />
             <Row label={t("admin.country", "Country")} value={row.patient_country} />
             <Row label={t("admin.profile", "Profile")} value={
              <Button size="sm" variant="ghost" className="h-5 p-0 text-xs" onClick={() => { onClose(); navigate(`/admin?tab=users&userId=${row.patient_id}`); }}>
                 {t("admin.view_member_profile", "View member profile")} →
              </Button>
            } />
          </Section>

          {/* D: Provider */}
           <Section title={`D · ${t("admin.provider", "Provider")}`} icon={Building2}>
             <Row label={t("admin.name", "Name")} value={`${row.provider_first_name} ${row.provider_last_name}`} />
             <Row label={t("admin.email", "Email")} value={row.provider_email} />
             <Row label={t("admin.category", "Category")} value={row.provider_category?.replace(/_/g, " ")} />
             <Row label={t("admin.city", "City")} value={row.provider_city} />
             <Row label={t("admin.country", "Country")} value={row.provider_country} />
             <Row label={t("admin.clinic", "Clinic")} value={row.clinic_name} />
          </Section>

          {/* E: Service */}
           <Section title={`E · ${t("admin.service", "Service")}`} icon={Stethoscope}>
             <Row label={t("admin.service", "Service")} value={row.service_name} />
             <Row label={t("admin.category", "Category")} value={row.service_category?.replace(/_/g, " ")} />
             <Row label={t("admin.visit_type", "Visit type")} value={row.visit_type} />
             <Row label={t("admin.duration", "Duration")} value={row.service_duration ? `${row.service_duration} min` : null} />
          </Section>

          {/* F: Financials */}
           <Section title={`F · ${t("admin.financials", "Financials")}`} icon={DollarSign}>
             <Row label={t("admin.booking_currency", "Booking currency")} value={<Badge variant="outline" className="text-xs font-mono">{cur}</Badge>} />
             <Row label={t("admin.base_price", "Base price")} value={fmtLocal(n(row.service_price_snapshot))} />
             <Row label={t("admin.booking_amount", "Booking amount")} value={<strong>{fmtLocal(n(row.total_amount))}</strong>} />
             {cur !== "USD" && usdNorm != null && <Row label="≈ USD" value={<span className="text-muted-foreground">{fmt(usdNorm)}</span>} />}
             <Row label={t("admin.platform_fee", "Platform fee")} value={fmtLocal(n(row.platform_fee_amount))} />
              <Row label={t("admin.platform_commission", "Platform commission")} value={
               <span>
                 {fmtLocal(n(row.commission_amount))}
                 {cur !== "USD" && row.provider_commission_usd != null && (
                   <span className="text-xs text-muted-foreground ms-1">
                     ({fmt(n(row.provider_commission_usd))})
                   </span>
                 )}
               </span>
             } />
             <Row label={`${t("admin.service_tax", "Service tax")} (${n(row.service_tax_rate)}%)`} value={fmtLocal(n(row.service_tax_amount))} />
             <Row label={`${t("admin.platform_tax", "Platform tax")} (${n(row.platform_tax_rate)}%)`} value={fmtLocal(n(row.platform_tax_amount))} />
             <Row label={t("admin.total_tax", "Total tax")} value={fmtLocal(n(row.tax_amount))} />
             {n(row.promo_discount) > 0 && <Row label={t("admin.promo_discount", "Promo discount")} value={`−${fmtLocal(n(row.promo_discount))}`} />}
             {row.promo_code && <Row label={t("admin.promo_code", "Promo code")} value={row.promo_code} />}
             {n(row.refund_amount) > 0 && <Row label={t("admin.refund_amount", "Refund amount")} value={fmtLocal(n(row.refund_amount))} />}
             {row.exchange_rate_used && cur !== "USD" && <Row label={t("admin.exchange_rate", "Exchange rate")} value={`1 USD = ${row.exchange_rate_used} ${cur}`} />}
             <Row label={t("admin.provider_net_earnings", "Provider net earnings (USD)")} value={row.provider_net_earnings_usd ? fmt(n(row.provider_net_earnings_usd)) : null} />
              <Row label={t("admin.provider_side_commission", "Provider-side commission (USD)")} value={
               row.provider_commission_usd != null ? fmt(n(row.provider_commission_usd)) : null
             } />
          </Section>

          {/* G: Payment */}
           <Section title={`G · ${t("admin.payment", "Payment")}`} icon={CreditCard}>
             <Row label={t("admin.method", "Method")} value={row.payment_method ?? row.appt_payment_method} />
             <Row label={t("admin.amount_usd", "Amount (USD)")} value={row.payment_amount ? fmt(n(row.payment_amount)) : null} />
             <Row label={t("admin.status", "Status")} value={<SBadge value={row.payment_record_status} />} />
             <Row label={t("admin.stripe_id", "Stripe ID")} value={row.stripe_payment_id ? <span className="font-mono text-xs">{row.stripe_payment_id}</span> : null} />
             <Row label={t("admin.invoice", "Invoice")} value={row.invoice_number} />
             <Row label={t("admin.invoice_status", "Invoice status")} value={<SBadge value={row.invoice_status} />} />
             <Row label={t("admin.tx_ref", "Transaction ref")} value={row.payout_reference} />
          </Section>

          {/* H: Audit */}
           <Section title={`H · ${t("admin.audit_timeline", "Audit & timeline")}`} icon={Shield}>
            <Timeline id={row.id} />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Expanded inline row ────────────────────────────────────────────────────────

function ExpandedRow({ row, fmt }: { row: BookingRow; fmt: (n: number) => string }) {
  const { t } = useTranslation();
  const cur = row.display_currency ?? "USD";
  const fmtLocal = (v: number) => fmtBooking(v, cur);
  // Only use final_total_usd when it is actually populated; falling back to total_amount
  // (booking currency HUF/IRR) and formatting it with fmt() (USD formatter) produces a
  // wildly wrong figure for cash/bank-transfer bookings that have no payment record.
  const usdNorm = row.final_total_usd != null ? n(row.final_total_usd) : null;
  return (
    <tr>
      <td colSpan={12} className="px-4 py-3 bg-muted/20 border-b text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
             <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("admin.appointment", "Appointment")}</p>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.date", "Date")}</span><span>{fmtDate(row.start_at)}</span></div>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.time", "Time")}</span><span>{fmtTime(row.start_at)} – {fmtTime(row.end_at)}</span></div>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.timezone", "Timezone")}</span><span className="text-xs">{row.provider_timezone ?? "—"}</span></div>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.location", "Location")}</span><span className="capitalize">{(row.location_mode ?? row.visit_type)?.replace(/_/g," ")}</span></div>
             {row.clinic_name && <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.clinic", "Clinic")}</span><span>{row.clinic_name}</span></div>}
          </div>
          <div className="space-y-1">
             <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("admin.financials", "Financials")} · {cur}</p>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.base_price", "Base price")}</span><span>{fmtLocal(n(row.service_price_snapshot))}</span></div>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.platform_fee", "Platform fee")}</span><span>{fmtLocal(n(row.platform_fee_amount))}</span></div>
             {n(row.promo_discount) > 0 && <div className="flex justify-between text-green-600"><span>{t("admin.promo", "Promo")} ({row.promo_code})</span><span>−{fmtLocal(n(row.promo_discount))}</span></div>}
             <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>{t("admin.total", "Total")}</span><span>{fmtLocal(n(row.total_amount))}</span></div>
            {cur !== "USD" && usdNorm != null && <div className="flex justify-between text-xs text-muted-foreground"><span>≈ USD</span><span>{fmt(usdNorm)}</span></div>}
          </div>
          <div className="space-y-1">
             <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("admin.payment_invoice", "Payment & invoice")}</p>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.method", "Method")}</span><span className="capitalize">{(row.payment_method ?? row.appt_payment_method ?? "—").replace(/_/g," ")}</span></div>
             <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.status", "Status")}</span><SBadge value={row.payment_record_status} /></div>
             {row.stripe_payment_id && <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.stripe", "Stripe")}</span><span className="font-mono text-xs truncate max-w-[140px]">{row.stripe_payment_id}</span></div>}
             {row.invoice_number && <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.invoice", "Invoice")}</span><span>{row.invoice_number}</span></div>}
             {n(row.refund_amount) > 0 && <div className="flex justify-between text-rose-600"><span>{t("admin.refunded", "Refunded")}</span><span>{fmtLocal(n(row.refund_amount))}</span></div>}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function BookingsManagementComponent() {
  const { format: fmt } = useAdminCurrency();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Filters
  const [search, setSearch]                   = useState("");
  const [dateFrom, setDateFrom]               = useState("");
  const [dateTo, setDateTo]                   = useState("");
  const [statusFilter, setStatusFilter]       = useState("all");
  const [paymentFilter, setPaymentFilter]     = useState("all");
  const [typeFilter, setTypeFilter]           = useState("all");
  const [refundFilter, setRefundFilter]       = useState("all");
  const [page, setPage]                       = useState(1);
  const [sortBy, setSortBy]                   = useState("created_at");
  const [sortDir, setSortDir]                 = useState<"asc"|"desc">("desc");
  const LIMIT = 50;

  // UI
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [drawerRow, setDrawerRow]             = useState<BookingRow | null>(null);
  const [filtersOpen, setFiltersOpen]         = useState(false);
  const [visibleCols, setVisibleCols]         = useState<Set<string>>(DEFAULT_VISIBLE);
  const [savedViews, setSavedViews]           = useState<SavedView[]>(loadViews);
  const [savedFilters, setSavedFilters]       = useState<SavedFilter[]>(loadFilters);
  const [viewName, setViewName]               = useState("");
  const [filterName, setFilterName]           = useState("");
  const [showSaveView, setShowSaveView]       = useState(false);
  const [showSaveFilter, setShowSaveFilter]   = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT), sortBy, sortDir });
    if (search)                  p.set("search", search);
    if (dateFrom)                p.set("dateFrom", dateFrom);
    if (dateTo)                  p.set("dateTo", dateTo);
    if (statusFilter !== "all")  p.set("status", statusFilter);
    if (paymentFilter !== "all") p.set("paymentStatus", paymentFilter);
    if (typeFilter !== "all")    p.set("visitType", typeFilter);
    if (refundFilter !== "all")  p.set("refundStatus", refundFilter);
    return p.toString();
  }, [page, sortBy, sortDir, search, dateFrom, dateTo, statusFilter, paymentFilter, typeFilter, refundFilter]);

  const { data, isLoading, refetch } = useQuery<PagedResponse>({
    queryKey: ["/api/admin/financial/master-report", buildParams()],
    queryFn: () => authFetch(`/api/admin/financial/master-report?${buildParams()}`),
    placeholderData: prev => prev,
  });

  const updateStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/bookings/${id}`, { status, reason: "Admin override" });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/financial/master-report"] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const hasFilters = !!(search || dateFrom || dateTo ||
    statusFilter !== "all" || paymentFilter !== "all" ||
    typeFilter !== "all" || refundFilter !== "all");

  function clearFilters() {
    setSearch(""); setDateFrom(""); setDateTo("");
    setStatusFilter("all"); setPaymentFilter("all"); setTypeFilter("all"); setRefundFilter("all");
    setPage(1);
  }

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
    setPage(1);
  }

  function toggleCol(id: string) {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleGroup(cols: readonly string[]) {
    setVisibleCols(prev => {
      const next = new Set(prev);
      const allOn = cols.every(c => next.has(c));
      if (allOn) cols.forEach(c => next.delete(c)); else cols.forEach(c => next.add(c));
      return next;
    });
  }

  function saveCurrentView() {
    if (!viewName.trim()) return;
    const v: SavedView = { name: viewName.trim(), cols: [...visibleCols] };
    const updated = [...savedViews.filter(x => x.name !== v.name), v];
    setSavedViews(updated); saveViews(updated); setViewName(""); setShowSaveView(false);
  }
  function applyView(v: SavedView) { setVisibleCols(new Set(v.cols)); }
  function deleteView(name: string) { const u = savedViews.filter(x => x.name !== name); setSavedViews(u); saveViews(u); }

  function saveCurrentFilter() {
    if (!filterName.trim()) return;
    const f: SavedFilter = { name: filterName.trim(), status: statusFilter, paymentStatus: paymentFilter, visitType: typeFilter, refundStatus: refundFilter, dateFrom, dateTo };
    const updated = [...savedFilters.filter(x => x.name !== f.name), f];
    setSavedFilters(updated); saveFilters(updated); setFilterName(""); setShowSaveFilter(false);
  }
  function applyFilter(f: SavedFilter) {
    setStatusFilter(f.status); setPaymentFilter(f.paymentStatus); setTypeFilter(f.visitType);
    setRefundFilter(f.refundStatus); setDateFrom(f.dateFrom); setDateTo(f.dateTo); setPage(1);
  }
  function deleteFilter(name: string) { const u = savedFilters.filter(x => x.name !== name); setSavedFilters(u); saveFilters(u); }

  // ── CSV Export ──────────────────────────────────────────────────────────────
  async function handleCsv() {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (paymentFilter !== "all") p.set("paymentStatus", paymentFilter);
    if (typeFilter !== "all") p.set("visitType", typeFilter);
    if (refundFilter !== "all") p.set("refundStatus", refundFilter);
    const resp = await fetch(`/api/admin/financial/master-report/export/csv?${p}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    if (!resp.ok) { toast({ title: t("admin.export_failed"), variant: "destructive" }); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bookings-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── PDF Export ──────────────────────────────────────────────────────────────
  function handlePdf() {
    const style = document.createElement("style");
    style.innerHTML = `@media print { body > *:not(#ops-bookings-print){display:none!important} #ops-bookings-print{display:block!important} .no-print{display:none!important} table{font-size:9px;border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:3px 5px} th{background:#f3f4f6} @page{size:landscape;margin:10mm} }`;
    document.head.appendChild(style);
    const el = printRef.current;
    if (el) el.id = "ops-bookings-print";
    window.print();
    setTimeout(() => { document.head.removeChild(style); if (el) el.removeAttribute("id"); }, 2000);
  }

  function SortIcon({ field }: { field: string }) {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 ms-1 text-muted-foreground/50 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 ms-1 inline" />
      : <ChevronDown className="h-3 w-3 ms-1 inline" />;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" ref={printRef}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div>
           <h2 className="text-xl font-bold">{t("admin.bookings_center_title")}</h2>
           <p className="text-xs text-muted-foreground">{t("admin.bookings_center_desc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-ops-refresh">
             <RefreshCw className="h-4 w-4 me-1.5" />{t("admin.refresh")}
          </Button>

          {/* Saved Views */}
          <DropdownMenu>
             <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-saved-views">
                 <BookOpen className="h-4 w-4 me-1.5" />{t("admin.views", "Views")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
               <DropdownMenuLabel>{t("admin.saved_views")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
               {savedViews.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">{t("admin.no_saved_views")}</p>}
              {savedViews.map(v => (
                <div key={v.name} className="flex items-center justify-between px-2">
                  <DropdownMenuItem onClick={() => applyView(v)} className="flex-1 cursor-pointer">{v.name}</DropdownMenuItem>
                  <button onClick={() => deleteView(v.name)} className="text-muted-foreground hover:text-destructive p-1"><X className="h-3 w-3" /></button>
                </div>
              ))}
              <DropdownMenuSeparator />
              {showSaveView ? (
                <div className="p-2 space-y-1.5">
                   <Input value={viewName} onChange={e => setViewName(e.target.value)} placeholder={t("admin.view_name")} className="h-7 text-xs" onKeyDown={e => e.key === "Enter" && saveCurrentView()} />
                  <div className="flex gap-1">
                     <Button size="sm" className="h-6 text-xs flex-1" onClick={saveCurrentView}>{t("common.save")}</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowSaveView(false)}>×</Button>
                  </div>
                </div>
              ) : (
                <DropdownMenuItem onClick={() => setShowSaveView(true)}>
                   <Save className="h-3.5 w-3.5 me-1.5" />{t("admin.save_current_view")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-ops-columns">
                 <Columns className="h-4 w-4 me-1.5" />{t("admin.columns", "Columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
               <DropdownMenuLabel>{t("admin.toggle_columns", "Toggle columns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COL_GROUPS.map(g => (
                <DropdownMenuCheckboxItem
                  key={g.id}
                  checked={g.cols.every(c => visibleCols.has(c))}
                  onCheckedChange={() => toggleGroup(g.cols)}
                >
                  {g.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-ops-export">
                 <Download className="h-4 w-4 me-1.5" />{t("admin.export", "Export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCsv}>
                 <Download className="h-4 w-4 me-1.5" />{t("admin.export_csv", "Export CSV")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePdf}>
                 <Printer className="h-4 w-4 me-1.5" />{t("admin.export_pdf", "Export PDF")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search + Filters */}
      <Card className="no-print">
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                 placeholder={t("admin.bookings_search", "Search ref, member, provider, service, promo, Stripe ID…")}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="ps-9 h-9"
                data-testid="input-ops-search"
              />
              {search && (
                <button onClick={() => { setSearch(""); setPage(1); }} className="absolute end-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(v => !v)} className={hasFilters ? "border-primary text-primary" : ""} data-testid="button-ops-filters">
               <Filter className="h-4 w-4 me-1.5" />{t("admin.filters", "Filters")}
              {hasFilters && <Badge className="ms-1 h-4 w-4 rounded-full p-0 text-[9px] flex items-center justify-center">!</Badge>}
            </Button>
            {hasFilters && (
              <>
                 <Button variant="ghost" size="sm" onClick={clearFilters}>{t("admin.clear_all", "Clear all")}</Button>
                {showSaveFilter ? (
                  <div className="flex gap-1">
                     <Input value={filterName} onChange={e => setFilterName(e.target.value)} placeholder={t("admin.filter_name", "Filter name…")} className="h-8 text-sm w-32" onKeyDown={e => e.key === "Enter" && saveCurrentFilter()} />
                     <Button size="sm" className="h-8" onClick={saveCurrentFilter}>{t("common.save", "Save")}</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowSaveFilter(false)}>×</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowSaveFilter(true)}>
                     <Save className="h-3.5 w-3.5 me-1" />{t("admin.save_filter", "Save filter")}
                  </Button>
                )}
              </>
            )}
          </div>

          {filtersOpen && (
            <div className="pt-3 border-t grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                 <label className="text-xs text-muted-foreground mb-1 block">{t("admin.date_from", "From")}</label>
                <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-8 text-sm" data-testid="input-ops-from" />
              </div>
              <div>
                 <label className="text-xs text-muted-foreground mb-1 block">{t("admin.date_to", "To")}</label>
                <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="h-8 text-sm" data-testid="input-ops-to" />
              </div>
              <div>
                 <label className="text-xs text-muted-foreground mb-1 block">{t("admin.booking_status", "Booking status")}</label>
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-ops-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="all">{t("admin.all", "All")}</SelectItem>
                     <SelectItem value="pending">{t("admin.booking_status_pending", "Pending")}</SelectItem>
                     <SelectItem value="confirmed">{t("admin.booking_status_confirmed", "Confirmed")}</SelectItem>
                     <SelectItem value="in_progress">{t("admin.booking_status_in_progress", "In progress")}</SelectItem>
                     <SelectItem value="completed">{t("admin.booking_status_completed", "Completed")}</SelectItem>
                     <SelectItem value="cancelled">{t("admin.booking_status_cancelled", "Cancelled")}</SelectItem>
                     <SelectItem value="no_show">{t("admin.booking_status_no_show", "No show")}</SelectItem>
                     <SelectItem value="rescheduled">{t("admin.booking_status_rescheduled", "Rescheduled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                 <label className="text-xs text-muted-foreground mb-1 block">{t("admin.payment", "Payment")}</label>
                <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-ops-payment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="all">{t("admin.all", "All")}</SelectItem>
                     <SelectItem value="pending">{t("admin.booking_status_pending", "Pending")}</SelectItem>
                     <SelectItem value="completed">{t("admin.booking_status_completed", "Completed")}</SelectItem>
                     <SelectItem value="refunded">{t("admin.booking_status_refunded", "Refunded")}</SelectItem>
                     <SelectItem value="failed">{t("admin.booking_status_failed", "Failed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                 <label className="text-xs text-muted-foreground mb-1 block">{t("admin.visit_type", "Visit type")}</label>
                <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-ops-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="all">{t("admin.all", "All")}</SelectItem>
                     <SelectItem value="clinic">{t("admin.clinic", "Clinic")}</SelectItem>
                     <SelectItem value="home_visit">{t("admin.home_visit", "Home visit")}</SelectItem>
                     <SelectItem value="video">{t("admin.video", "Video")}</SelectItem>
                     <SelectItem value="telemedicine">{t("admin.telemedicine", "Telemedicine")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                 <label className="text-xs text-muted-foreground mb-1 block">{t("admin.refund_status", "Refund status")}</label>
                <Select value={refundFilter} onValueChange={v => { setRefundFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-ops-refund"><SelectValue /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="all">{t("admin.all", "All")}</SelectItem>
                     <SelectItem value="none">{t("admin.booking_status_none", "None")}</SelectItem>
                     <SelectItem value="pending">{t("admin.booking_status_pending", "Pending")}</SelectItem>
                     <SelectItem value="processed">{t("admin.booking_status_processed", "Processed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Saved filter presets */}
          {savedFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t">
               <span className="text-xs text-muted-foreground self-center">{t("admin.saved", "Saved")}:</span>
              {savedFilters.map(f => (
                <div key={f.name} className="flex items-center">
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2 rounded-e-none" onClick={() => applyFilter(f)}>{f.name}</Button>
                  <button onClick={() => deleteFilter(f.name)} className="h-6 px-1 border border-s-0 rounded-e flex items-center hover:bg-destructive/10">
                    <X className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
                {isLoading ? t("admin.loading", "Loading…") : t("admin.bookings_count", "{{count}} booking(s)", { count: total })}
            </CardTitle>
             <span className="text-xs text-muted-foreground no-print">{t("admin.page_of", "Page {{page}} of {{total}}", { page, total: totalPages })}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap" onClick={() => toggleSort("created_at")}>
                     {t("admin.created", "Created")} <SortIcon field="created_at" />
                  </th>
                   {visibleCols.has("ref") && <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t("admin.ref", "Ref")}</th>}
                   {visibleCols.has("patient") && <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t("admin.member", "Member")}</th>}
                   {visibleCols.has("provider") && <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t("admin.provider", "Provider")}</th>}
                   {visibleCols.has("service") && <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t("admin.service", "Service")}</th>}
                  {visibleCols.has("appt") && (
                    <th className="px-3 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap" onClick={() => toggleSort("start_at")}>
                       {t("admin.appointment", "Appointment")} <SortIcon field="start_at" />
                    </th>
                  )}
                  {visibleCols.has("status") && (
                    <th className="px-3 py-2 text-left font-medium text-xs cursor-pointer whitespace-nowrap" onClick={() => toggleSort("status")}>
                       {t("admin.status", "Status")} <SortIcon field="status" />
                    </th>
                  )}
                   {visibleCols.has("payment") && <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t("admin.payment", "Payment")}</th>}
                  {visibleCols.has("amount") && (
                    <th className="px-3 py-2 text-right font-medium text-xs cursor-pointer whitespace-nowrap" onClick={() => toggleSort("total_amount")}>
                       {t("admin.amount", "Amount")} <SortIcon field="total_amount" />
                    </th>
                  )}
                   {visibleCols.has("method") && <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{t("admin.method", "Method")}</th>}
                   <th className="px-3 py-2 text-right font-medium text-xs whitespace-nowrap no-print">{t("admin.actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={12} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                ) : rows.length === 0 ? (
                   <tr><td colSpan={12} className="py-12 text-center text-muted-foreground"><AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />{t("admin.no_bookings_match", "No bookings match your filters.")}</td></tr>
                ) : rows.map(row => {
                  const isExpanded = expandedId === row.id;
                  const cur = row.display_currency ?? "USD";
                  const usdNorm = n(row.final_total_usd ?? row.total_amount);
                  const payMethod = (row.payment_method ?? row.appt_payment_method ?? "").replace(/_/g, " ");
                  return (
                    <>
                      <tr
                        key={row.id}
                        className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isExpanded ? "bg-muted/10" : ""}`}
                        data-testid={`row-ops-${row.id}`}
                      >
                        <td className="px-3 py-2.5">
                          <button onClick={() => setExpandedId(prev => prev === row.id ? null : row.id)} className="p-0.5 rounded hover:bg-muted" data-testid={`button-ops-expand-${row.id}`}>
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {fmtDate(row.created_at)}
                        </td>
                        {visibleCols.has("ref") && (
                          <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                            {row.appointment_number ?? row.id.slice(0, 8)}
                          </td>
                        )}
                        {visibleCols.has("patient") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="text-xs font-medium">{row.patient_first_name} {row.patient_last_name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[120px]">{row.patient_email}</div>
                            {row.patient_city && <div className="text-xs text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{row.patient_city}</div>}
                          </td>
                        )}
                        {visibleCols.has("provider") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="text-xs font-medium">{row.provider_first_name} {row.provider_last_name}</div>
                            <div className="text-xs text-muted-foreground capitalize">{row.provider_category?.replace(/_/g, " ")}</div>
                            {row.provider_city && <div className="text-xs text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{row.provider_city}</div>}
                          </td>
                        )}
                        {visibleCols.has("service") && (
                          <td className="px-3 py-2.5 text-xs">
                            <div className="max-w-[110px] truncate">{row.service_name ?? "—"}</div>
                            {row.service_duration && <div className="text-muted-foreground">{row.service_duration}min</div>}
                          </td>
                        )}
                        {visibleCols.has("appt") && (
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                            <div>{fmtDate(row.start_at)}</div>
                            <div className="text-muted-foreground">{fmtTime(row.start_at)}</div>
                          </td>
                        )}
                        {visibleCols.has("status") && (
                          <td className="px-3 py-2.5 whitespace-nowrap"><SBadge value={row.status} /></td>
                        )}
                        {visibleCols.has("payment") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <SBadge value={row.payment_status} />
                            {row.refund_status && row.refund_status !== "none" && (
                              <div className="mt-0.5"><SBadge value={`refund:${row.refund_status}`} /></div>
                            )}
                          </td>
                        )}
                        {visibleCols.has("amount") && (
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap">
                            {fmtBooking(n(row.total_amount), cur)}
                            {/* Only show USD equivalent when final_total_usd is populated — falling back to
                                total_amount (booking currency) would show HUF/IRR as a USD figure */}
                            {cur !== "USD" && row.final_total_usd && <div className="text-[10px] text-muted-foreground">≈ {fmt(n(row.final_total_usd))}</div>}
                          </td>
                        )}
                        {visibleCols.has("method") && (
                          <td className="px-3 py-2.5 text-xs capitalize whitespace-nowrap">{payMethod || "—"}</td>
                        )}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap no-print">
                          <div className="flex items-center gap-1 justify-end">
                            {/* Quick status update */}
                            <Select
                              value={row.status}
                              onValueChange={status => updateStatusMut.mutate({ id: row.id, status })}
                            >
                              <SelectTrigger className="w-32 h-7 text-xs" data-testid={`select-ops-status-${row.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                               <SelectItem value="pending">{t("admin.booking_status_pending", "Pending")}</SelectItem>
                               <SelectItem value="confirmed">{t("admin.booking_status_confirmed", "Confirmed")}</SelectItem>
                               <SelectItem value="in_progress">{t("admin.booking_status_in_progress", "In progress")}</SelectItem>
                               <SelectItem value="completed">{t("admin.booking_status_completed", "Completed")}</SelectItem>
                               <SelectItem value="cancelled">{t("admin.booking_status_cancelled", "Cancelled")}</SelectItem>
                               <SelectItem value="no_show">{t("admin.booking_status_no_show", "No show")}</SelectItem>
                               <SelectItem value="rescheduled">{t("admin.booking_status_rescheduled", "Rescheduled")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDrawerRow(row)} data-testid={`button-ops-investigate-${row.id}`}>
                               {t("admin.investigate", "Investigate")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && <ExpandedRow key={`${row.id}-exp`} row={row} fmt={fmt} />}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t no-print">
              <p className="text-sm text-muted-foreground">
                 {t("admin.range_of_total", "{{from}}–{{to}} of {{total}}", {
                   from: ((page - 1) * LIMIT) + 1,
                   to: Math.min(page * LIMIT, total),
                   total: formatCount(total),
                 })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page===1} onClick={() => setPage(p => p-1)} data-testid="button-ops-prev">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                 <span className="text-sm tabular-nums">{t("admin.page_of", "Page {{page}} of {{total}}", { page, total: totalPages })}</span>
                <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p => p+1)} data-testid="button-ops-next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Investigation Drawer */}
      <InvestigationDrawer row={drawerRow} open={!!drawerRow} onClose={() => setDrawerRow(null)} fmt={fmt} />
    </div>
  );
}
