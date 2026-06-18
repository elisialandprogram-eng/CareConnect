import { useState, useCallback, useMemo, useRef, type ElementType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAdminCurrency, formatInCurrency } from "@/lib/currency";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign, TrendingUp, CreditCard, RefreshCw, Download, Search,
  ChevronDown, ChevronRight, ChevronLeft, ChevronUp,
  BarChart3, Users, CalendarDays, AlertCircle, Clock, CheckCircle2,
  XCircle, Wallet, Receipt, Banknote, FileText, ArrowUpDown,
  Loader2, Filter, X, Printer, Columns, Save, BookOpen,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MasterRow {
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
  // Financial — booking currency
  total_amount: string;
  display_currency: string | null;
  display_amount: string | null;
  exchange_rate_used: string | null;
  service_price_snapshot: string | null;
  promo_code: string | null;
  promo_discount: string;
  tax_amount: string;
  refund_amount: string;
  refund_status: string | null;
  // Financial — USD
  final_total_usd: string | null;
  platform_fee_amount: string;
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
  // Earnings (USD)
  earning_id: string | null;
  provider_earning: string | null;
  earning_platform_fee: string | null;
  earning_total_amount: string | null;
  earning_status: string | null;
  payout_reference: string | null;
  earning_paid_at: string | null;
  // Invoice
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
}

interface Summary {
  totalBookings: number;
  completedCount: number;
  cancelledCount: number;
  refundedCount: number;
  grossRevenue: number;
  platformRevenue: number;
  providerEarnings: number;
  totalRefunds: number;
  taxesCollected: number;
  promoDiscounts: number;
  pendingPayouts: number;
}

interface PagedResponse {
  rows: MasterRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface LifecycleEvent {
  id: string;
  appointment_id: string;
  action: string;
  actor_user_id: string | null;
  actor_role: string | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  created_at: string;
  actor_first_name: string | null;
  actor_last_name: string | null;
  actor_email: string | null;
}

// ── Column visibility config ───────────────────────────────────────────────────

const COLUMN_GROUPS = [
  { id: "booking",   label: "A · Booking",   cols: ["ref","status","payment","type","date"] },
  { id: "patient",   label: "B · Patient",   cols: ["patient"] },
  { id: "provider",  label: "C · Provider",  cols: ["provider"] },
  { id: "service",   label: "D · Service",   cols: ["service"] },
  { id: "financial", label: "E · Financial", cols: ["gross","net"] },
  { id: "payout",    label: "G · Payout",    cols: ["earning"] },
] as const;

const DEFAULT_VISIBLE = new Set(["ref","status","payment","type","date","patient","provider","service","gross","net","earning"]);

// ── Helpers ────────────────────────────────────────────────────────────────────

const TOKEN = () => localStorage.getItem("token") || "";

function authFetch(url: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${TOKEN()}` } }).then(r => r.json());
}

function n(v: string | number | null | undefined) { return Number(v) || 0; }

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "d MMM yyyy"); } catch { return "—"; }
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "d MMM yyyy HH:mm"); } catch { return "—"; }
}

// ── Currency helpers ───────────────────────────────────────────────────────────

// For booking-currency values (total_amount, service_price_snapshot, promo_discount,
// tax_amount, refund_amount, platform_fee_amount — all stored in the booking currency).
function fmtBooking(amount: number, currency: string | null | undefined) {
  return formatInCurrency(amount, currency ?? "USD");
}

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  completed:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  confirmed:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  pending:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled:   "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  cancelled_by_patient:  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  cancelled_by_provider: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  no_show:     "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  in_progress: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  rescheduled: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  refunded:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  paid:        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed:      "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  processed:   "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const cls = STATUS_COLORS[value.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`capitalize text-xs ${cls}`}>
      {value.replace(/_/g, " ")}
    </Badge>
  );
}

// ── Dual currency display ─────────────────────────────────────────────────────

function DualAmount({
  bookingAmount, bookingCurrency, usdAmount, fmt,
}: {
  bookingAmount: number;
  bookingCurrency: string | null | undefined;
  usdAmount: number | null;
  fmt: (n: number) => string;
}) {
  const cur = bookingCurrency ?? "USD";
  const localStr = fmtBooking(bookingAmount, cur);
  if (cur === "USD" || !usdAmount) return <>{localStr}</>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span>{localStr}</span>
      <span className="text-[10px] text-muted-foreground">≈ {fmt(usdAmount)}</span>
    </span>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary, fmt }: { summary: Summary; fmt: (n: number) => string }) {
  const cards = [
    { label: "Gross Revenue",      value: fmt(summary.grossRevenue),      icon: DollarSign,    color: "from-emerald-500 to-teal-600", id: "gross", note: "USD" },
    { label: "Platform Revenue",   value: fmt(summary.platformRevenue),   icon: TrendingUp,    color: "from-blue-500 to-indigo-600",  id: "platform", note: "USD" },
    { label: "Provider Earnings",  value: fmt(summary.providerEarnings),  icon: Wallet,        color: "from-purple-500 to-fuchsia-600", id: "provider", note: "USD" },
    { label: "Pending Payouts",    value: fmt(summary.pendingPayouts),    icon: Clock,         color: "from-amber-500 to-orange-500", id: "pending-payout", note: "USD" },
    { label: "Total Refunds",      value: fmt(summary.totalRefunds),      icon: RefreshCw,     color: "from-rose-500 to-pink-600",    id: "refunds", note: "USD" },
    { label: "Taxes Collected",    value: fmt(summary.taxesCollected),    icon: Receipt,       color: "from-slate-500 to-gray-600",   id: "taxes", note: "USD" },
    { label: "Promo Discounts",    value: fmt(summary.promoDiscounts),    icon: Banknote,      color: "from-teal-500 to-cyan-600",    id: "promos", note: "USD" },
    { label: "Total Bookings",     value: String(summary.totalBookings),  icon: CalendarDays,  color: "from-violet-500 to-purple-600", id: "bookings", isCount: true },
    { label: "Completed",          value: String(summary.completedCount), icon: CheckCircle2,  color: "from-green-500 to-emerald-600", id: "completed", isCount: true },
    { label: "Cancelled",          value: String(summary.cancelledCount), icon: XCircle,       color: "from-red-500 to-rose-600",     id: "cancelled", isCount: true },
    { label: "Refunded",           value: String(summary.refundedCount),  icon: RefreshCw,     color: "from-orange-500 to-amber-600", id: "refunded", isCount: true },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.id}
            data-testid={`card-master-${c.id}`}
            className="relative overflow-hidden rounded-xl p-4 text-white shadow-md"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${c.color}`} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-white/80 leading-tight">{c.label}</p>
                <Icon className="h-3.5 w-3.5 text-white/60 shrink-0" />
              </div>
              <p className={`font-bold tabular-nums ${c.isCount ? "text-2xl" : "text-lg leading-tight"}`}>
                {c.value}
              </p>
              {c.note && <p className="text-[9px] text-white/50 mt-0.5">{c.note} normalized</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Lifecycle Timeline ────────────────────────────────────────────────────────

function LifecycleTimeline({ appointmentId }: { appointmentId: string }) {
  const { data: events = [], isLoading } = useQuery<LifecycleEvent[]>({
    queryKey: ["/api/admin/financial/master-report", appointmentId, "events"],
    queryFn: () => authFetch(`/api/admin/financial/master-report/${appointmentId}/events`),
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!events.length) return <p className="text-sm text-muted-foreground py-2">No lifecycle events recorded.</p>;

  return (
    <div className="relative ps-4">
      <div className="absolute start-1.5 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-3">
        {events.map((ev) => {
          const actor = ev.actor_first_name
            ? `${ev.actor_first_name} ${ev.actor_last_name}`
            : ev.actor_email ?? ev.actor_role ?? "System";
          return (
            <div key={ev.id} className="relative flex gap-3 items-start">
              <div className="absolute -start-1.5 top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
              <div className="ps-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold capitalize">{ev.action.replace(/_/g, " ")}</span>
                  {ev.from_status && ev.to_status && (
                    <span className="text-xs text-muted-foreground">
                      {ev.from_status} → {ev.to_status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{fmtDateTime(ev.created_at)} · {actor}</p>
                {ev.reason && <p className="text-xs italic text-muted-foreground mt-0.5">"{ev.reason}"</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Investigation Drawer ──────────────────────────────────────────────────────

function InvestigationDrawer({
  row, open, onClose, fmt,
}: {
  row: MasterRow | null; open: boolean; onClose: () => void; fmt: (n: number) => string;
}) {
  if (!row) return null;
  const cur = row.display_currency ?? "USD";
  const fmtLocal = (v: number) => fmtBooking(v, cur);
  const usdNorm = n(row.final_total_usd ?? row.total_amount);

  const Section = ({ title, icon: Icon, children }: { title: string; icon?: ElementType; children: ReactNode }) => (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </h4>
      {children}
    </div>
  );

  const Row = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-40">{label}</span>
      <span className="font-medium break-all">{value ?? "—"}</span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Investigation: {row.appointment_number ?? row.id.slice(0, 8)}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-10">

          {/* Section A — Booking */}
          <Section title="A · Booking" icon={CalendarDays}>
            <Row label="Appointment ID"  value={row.id} />
            <Row label="Booking Ref"     value={row.appointment_number} />
            <Row label="Status"          value={<StatusBadge value={row.status} />} />
            <Row label="Payment Status"  value={<StatusBadge value={row.payment_status} />} />
            <Row label="Visit Type"      value={row.visit_type} />
            <Row label="Location Type"   value={row.location_mode ?? row.visit_type} />
            <Row label="Created"         value={fmtDateTime(row.created_at)} />
            <Row label="Appointment At"  value={fmtDateTime(row.start_at)} />
            <Row label="Completion Date" value={fmtDateTime(row.end_at)} />
            <Row label="Last Updated"    value={fmtDateTime(row.updated_at)} />
            <Row label="Timezone"        value={row.provider_timezone} />
            <Row label="Country"         value={row.country_code} />
            <Row label="Audit Reference" value={<span className="font-mono text-xs">{row.id}</span>} />
          </Section>

          {/* Section B — Patient */}
          <Section title="B · Patient" icon={Users}>
            <Row label="Patient ID"  value={row.patient_id} />
            <Row label="Name"        value={`${row.patient_first_name} ${row.patient_last_name}`} />
            <Row label="Email"       value={row.patient_email} />
            <Row label="City"        value={row.patient_city} />
            <Row label="Country"     value={row.patient_country} />
          </Section>

          {/* Section C — Provider */}
          <Section title="C · Provider" icon={CreditCard}>
            <Row label="Provider ID"  value={row.provider_id} />
            <Row label="Name"         value={`${row.provider_first_name} ${row.provider_last_name}`} />
            <Row label="Email"        value={row.provider_email} />
            <Row label="Category"     value={row.provider_category?.replace(/_/g, " ")} />
            <Row label="City"         value={row.provider_city} />
            <Row label="Country"      value={row.provider_country} />
            <Row label="Clinic Name"  value={row.clinic_name} />
          </Section>

          {/* Section D — Service */}
          <Section title="D · Service" icon={BookOpen}>
            <Row label="Service ID"       value={row.service_id} />
            <Row label="Service"          value={row.service_name} />
            <Row label="Category"         value={row.service_category?.replace(/_/g, " ")} />
            <Row label="Duration"         value={row.service_duration ? `${row.service_duration} min` : null} />
          </Section>

          {/* Section E — Financial */}
          <Section title="E · Financial" icon={DollarSign}>
            <Row label="Booking Currency" value={
              <Badge variant="outline" className="text-xs font-mono">{cur}</Badge>
            } />
            <Row label="Base Price"      value={fmtLocal(n(row.service_price_snapshot))} />
            <Row label="Booking Amount"  value={
              <span className="font-semibold">
                {fmtLocal(n(row.total_amount))}
              </span>
            } />
            <Row label="Normalized (USD)" value={
              <span className="text-muted-foreground text-xs">
                {cur !== "USD" ? fmt(usdNorm) : "—"}
              </span>
            } />
            <Row label="Platform Fee"    value={fmtLocal(n(row.platform_fee_amount))} />
            <Row label="Tax"             value={fmtLocal(n(row.tax_amount))} />
            <Row label="Promo Discount"  value={n(row.promo_discount) > 0 ? fmtLocal(n(row.promo_discount)) : "—"} />
            <Row label="Promo Code"      value={row.promo_code} />
            <Row label="Refund Amount"   value={n(row.refund_amount) > 0 ? fmtLocal(n(row.refund_amount)) : "—"} />
            <Row label="Refund Status"   value={<StatusBadge value={row.refund_status} />} />
            {cur !== "USD" && row.exchange_rate_used && (
              <Row label="Exchange Rate"
                value={`1 USD = ${row.exchange_rate_used} ${cur}`}
              />
            )}
          </Section>

          {/* Section F — Payment */}
          <Section title="F · Payment" icon={Banknote}>
            <Row label="Payment ID"      value={row.payment_id} />
            <Row label="Method"          value={row.payment_method ?? row.appt_payment_method} />
            <Row label="Amount (USD)"    value={row.payment_amount ? fmt(n(row.payment_amount)) : null} />
            <Row label="Status"          value={<StatusBadge value={row.payment_record_status} />} />
            <Row label="Stripe Intent"   value={
              row.stripe_payment_id
                ? <span className="font-mono text-xs">{row.stripe_payment_id}</span>
                : null
            } />
            <Row label="Refunded (USD)"  value={n(row.payment_refunded_amount) > 0 ? fmt(n(row.payment_refunded_amount)) : "—"} />
          </Section>

          {/* Section G — Payout */}
          <Section title="G · Payout" icon={Wallet}>
            <Row label="Earning ID"      value={row.earning_id} />
            <Row label="Provider Earn. (USD)" value={row.provider_earning ? fmt(n(row.provider_earning)) : null} />
            <Row label="Platform Fee (USD)"   value={row.earning_platform_fee ? fmt(n(row.earning_platform_fee)) : null} />
            <Row label="Earnings Status" value={<StatusBadge value={row.earning_status} />} />
            <Row label="Payout Reference" value={row.payout_reference} />
            <Row label="Paid At"          value={fmtDateTime(row.earning_paid_at)} />
          </Section>

          {/* Section H — Audit */}
          <Section title="H · Audit" icon={Receipt}>
            <Row label="Invoice ID"      value={row.invoice_id} />
            <Row label="Invoice Number"  value={row.invoice_number} />
            <Row label="Invoice Status"  value={<StatusBadge value={row.invoice_status} />} />
          </Section>

          <Section title="Lifecycle Events" icon={Clock}>
            <LifecycleTimeline appointmentId={row.id} />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Expanded Row ──────────────────────────────────────────────────────────────

function ExpandedRow({ row, fmt }: { row: MasterRow; fmt: (n: number) => string }) {
  const cur = row.display_currency ?? "USD";
  const fmtLocal = (v: number) => fmtBooking(v, cur);
  const usdNorm = n(row.final_total_usd ?? row.total_amount);

  return (
    <tr>
      <td colSpan={12} className="px-4 py-3 bg-muted/30 border-b">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Pricing · {cur}
            </p>
            <div className="flex justify-between"><span className="text-muted-foreground">Base Price</span><span>{fmtLocal(n(row.service_price_snapshot))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Platform Fee</span><span>{fmtLocal(n(row.platform_fee_amount))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmtLocal(n(row.tax_amount))}</span></div>
            {n(row.promo_discount) > 0 && (
              <div className="flex justify-between text-green-600"><span>Promo ({row.promo_code})</span><span>−{fmtLocal(n(row.promo_discount))}</span></div>
            )}
            <div className="flex justify-between font-semibold border-t mt-1 pt-1"><span>Total</span><span>{fmtLocal(n(row.total_amount))}</span></div>
            {cur !== "USD" && (
              <div className="flex justify-between text-xs text-muted-foreground border-t pt-1">
                <span>≈ USD</span><span>{fmt(usdNorm)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1 text-sm">
            <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Payment</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="capitalize">{row.payment_method ?? row.appt_payment_method ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge value={row.payment_record_status} /></div>
            {row.stripe_payment_id && (
              <div className="flex justify-between"><span className="text-muted-foreground">Stripe ID</span><span className="font-mono text-xs truncate max-w-[140px]">{row.stripe_payment_id}</span></div>
            )}
            {n(row.refund_amount) > 0 && (
              <div className="flex justify-between text-rose-600"><span>Refund</span><span>{fmtLocal(n(row.refund_amount))}</span></div>
            )}
          </div>

          <div className="space-y-1 text-sm">
            <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Lifecycle</p>
            <LifecycleTimeline appointmentId={row.id} />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Saved Filters ──────────────────────────────────────────────────────────────

const FILTER_STORAGE_KEY = "master-report-saved-filters";

interface FilterPreset {
  name: string;
  status: string;
  paymentStatus: string;
  visitType: string;
  refundStatus: string;
  dateFrom: string;
  dateTo: string;
}

function loadSavedFilters(): FilterPreset[] {
  try { return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function persistSavedFilters(filters: FilterPreset[]) {
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FinancialMasterReport() {
  const { format: fmt } = useAdminCurrency();
  const { t } = useTranslation();

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [visitTypeFilter, setVisitTypeFilter] = useState("all");
  const [refundStatusFilter, setRefundStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerRow, setDrawerRow] = useState<MasterRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_VISIBLE);
  const [savedFilters, setSavedFilters] = useState<FilterPreset[]>(loadSavedFilters);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const LIMIT = 50;

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({
      page: String(page), limit: String(LIMIT), sortBy, sortDir,
    });
    if (search)                        p.set("search", search);
    if (dateFrom)                      p.set("dateFrom", dateFrom);
    if (dateTo)                        p.set("dateTo", dateTo);
    if (statusFilter !== "all")        p.set("status", statusFilter);
    if (paymentStatusFilter !== "all") p.set("paymentStatus", paymentStatusFilter);
    if (visitTypeFilter !== "all")     p.set("visitType", visitTypeFilter);
    if (refundStatusFilter !== "all")  p.set("refundStatus", refundStatusFilter);
    return p.toString();
  }, [page, sortBy, sortDir, search, dateFrom, dateTo, statusFilter, paymentStatusFilter, visitTypeFilter, refundStatusFilter]);

  const summaryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (search)                        p.set("search", search);
    if (dateFrom)                      p.set("dateFrom", dateFrom);
    if (dateTo)                        p.set("dateTo", dateTo);
    if (statusFilter !== "all")        p.set("status", statusFilter);
    if (paymentStatusFilter !== "all") p.set("paymentStatus", paymentStatusFilter);
    if (visitTypeFilter !== "all")     p.set("visitType", visitTypeFilter);
    if (refundStatusFilter !== "all")  p.set("refundStatus", refundStatusFilter);
    return p.toString();
  }, [search, dateFrom, dateTo, statusFilter, paymentStatusFilter, visitTypeFilter, refundStatusFilter]);

  const { data, isLoading, refetch } = useQuery<PagedResponse>({
    queryKey: ["/api/admin/financial/master-report", buildParams()],
    queryFn: () => authFetch(`/api/admin/financial/master-report?${buildParams()}`),
    placeholderData: (prev) => prev,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ["/api/admin/financial/master-report/summary", summaryParams],
    queryFn: () => authFetch(`/api/admin/financial/master-report/summary?${summaryParams}`),
    placeholderData: (prev) => prev,
  });

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
    setPage(1);
  }

  function handleSearch(v: string) { setSearch(v); setPage(1); }

  function clearFilters() {
    setSearch(""); setDateFrom(""); setDateTo("");
    setStatusFilter("all"); setPaymentStatusFilter("all");
    setVisitTypeFilter("all"); setRefundStatusFilter("all");
    setPage(1);
  }

  const hasActiveFilters = !!(search || dateFrom || dateTo ||
    statusFilter !== "all" || paymentStatusFilter !== "all" ||
    visitTypeFilter !== "all" || refundStatusFilter !== "all");

  // ── CSV Export ──────────────────────────────────────────────────────────────
  async function handleExportCsv() {
    const params = new URLSearchParams();
    if (search)                        params.set("search", search);
    if (dateFrom)                      params.set("dateFrom", dateFrom);
    if (dateTo)                        params.set("dateTo", dateTo);
    if (statusFilter !== "all")        params.set("status", statusFilter);
    if (paymentStatusFilter !== "all") params.set("paymentStatus", paymentStatusFilter);
    if (visitTypeFilter !== "all")     params.set("visitType", visitTypeFilter);
    if (refundStatusFilter !== "all")  params.set("refundStatus", refundStatusFilter);
    try {
      const resp = await fetch(`/api/admin/financial/master-report/export/csv?${params}`, {
        headers: { Authorization: `Bearer ${TOKEN()}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `financial-master-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch (err: any) {
      console.error("[csv-export]", err);
    }
  }

  // ── PDF Export (browser print) ──────────────────────────────────────────────
  function handleExportPdf() {
    const style = document.createElement("style");
    style.innerHTML = `
      @media print {
        body > *:not(#master-report-print) { display: none !important; }
        #master-report-print { display: block !important; }
        .no-print { display: none !important; }
        table { font-size: 9px; border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 3px 5px; }
        th { background: #f3f4f6; font-weight: 600; }
        @page { size: landscape; margin: 10mm; }
      }
    `;
    document.head.appendChild(style);
    const el = printRef.current;
    if (el) el.id = "master-report-print";
    window.print();
    setTimeout(() => {
      document.head.removeChild(style);
      if (el) el.removeAttribute("id");
    }, 2000);
  }

  // ── Saved Filters ───────────────────────────────────────────────────────────
  function saveCurrentFilter() {
    if (!saveFilterName.trim()) return;
    const preset: FilterPreset = {
      name: saveFilterName.trim(),
      status: statusFilter, paymentStatus: paymentStatusFilter,
      visitType: visitTypeFilter, refundStatus: refundStatusFilter,
      dateFrom, dateTo,
    };
    const updated = [...savedFilters.filter(f => f.name !== preset.name), preset];
    setSavedFilters(updated);
    persistSavedFilters(updated);
    setSaveFilterName("");
    setShowSaveInput(false);
  }

  function applyPreset(preset: FilterPreset) {
    setStatusFilter(preset.status);
    setPaymentStatusFilter(preset.paymentStatus);
    setVisitTypeFilter(preset.visitType);
    setRefundStatusFilter(preset.refundStatus);
    setDateFrom(preset.dateFrom);
    setDateTo(preset.dateTo);
    setPage(1);
  }

  function deletePreset(name: string) {
    const updated = savedFilters.filter(f => f.name !== name);
    setSavedFilters(updated);
    persistSavedFilters(updated);
  }

  // ── Column visibility ────────────────────────────────────────────────────────
  function toggleGroup(ids: readonly string[]) {
    setVisibleCols(prev => {
      const next = new Set(prev);
      const allVisible = ids.every(id => next.has(id));
      if (allVisible) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }

  function SortIcon({ field }: { field: string }) {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 ms-1 text-muted-foreground/50 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 ms-1 inline" />
      : <ChevronDown className="h-3 w-3 ms-1 inline" />;
  }

  const rows = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6" ref={printRef}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Financial Master Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full financial traceability: booking → payment → earnings → payout
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-master-refresh">
            <RefreshCw className="h-4 w-4 me-1.5" />Refresh
          </Button>

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-column-visibility">
                <Columns className="h-4 w-4 me-1.5" />Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMN_GROUPS.map(grp => (
                <DropdownMenuCheckboxItem
                  key={grp.id}
                  checked={grp.cols.every(c => visibleCols.has(c))}
                  onCheckedChange={() => toggleGroup(grp.cols)}
                >
                  {grp.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="button-master-csv">
            <Download className="h-4 w-4 me-1.5" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} data-testid="button-master-pdf">
            <Printer className="h-4 w-4 me-1.5" />PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards — USD platform totals */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : summary ? (
        <SummaryCards summary={summary} fmt={fmt} />
      ) : null}

      {/* Search + Filters + Saved Presets */}
      <Card className="no-print">
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search booking ref, patient, provider, promo, Stripe ID…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="ps-9 h-9"
                data-testid="input-master-search"
              />
              {search && (
                <button onClick={() => handleSearch("")} className="absolute end-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            <Button
              variant="outline" size="sm"
              onClick={() => setFiltersOpen(v => !v)}
              data-testid="button-master-filters"
              className={hasActiveFilters ? "border-primary text-primary" : ""}
            >
              <Filter className="h-4 w-4 me-1.5" />
              Filters
              {hasActiveFilters && <Badge className="ms-1.5 h-4 w-4 rounded-full p-0 text-[9px] flex items-center justify-center">!</Badge>}
            </Button>

            {hasActiveFilters && (
              <>
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-master-clear">
                  Clear all
                </Button>
                {showSaveInput ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={saveFilterName}
                      onChange={e => setSaveFilterName(e.target.value)}
                      placeholder="Filter name…"
                      className="h-8 text-sm w-36"
                      onKeyDown={e => e.key === "Enter" && saveCurrentFilter()}
                    />
                    <Button size="sm" className="h-8" onClick={saveCurrentFilter}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowSaveInput(false)}>×</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowSaveInput(true)} data-testid="button-save-filter">
                    <Save className="h-3.5 w-3.5 me-1" />Save
                  </Button>
                )}
              </>
            )}
          </div>

          {filtersOpen && (
            <div className="pt-3 border-t grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date From</label>
                <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-8 text-sm" data-testid="input-date-from" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date To</label>
                <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="h-8 text-sm" data-testid="input-date-to" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Booking Status</label>
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-booking-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Payment Status</label>
                <Select value={paymentStatusFilter} onValueChange={v => { setPaymentStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-payment-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Visit Type</label>
                <Select value={visitTypeFilter} onValueChange={v => { setVisitTypeFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-visit-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="clinic">Clinic</SelectItem>
                    <SelectItem value="home_visit">Home Visit</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="telemedicine">Telemedicine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Refund Status</label>
                <Select value={refundStatusFilter} onValueChange={v => { setRefundStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-refund-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processed">Processed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Saved filter presets */}
          {savedFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t">
              <span className="text-xs text-muted-foreground self-center">Saved:</span>
              {savedFilters.map(preset => (
                <div key={preset.name} className="flex items-center gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </Button>
                  <button
                    onClick={() => deletePreset(preset.name)}
                    className="h-6 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    title="Delete preset"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {isLoading ? "Loading…" : `${total.toLocaleString()} booking${total !== 1 ? "s" : ""}`}
            </CardTitle>
            <span className="text-sm text-muted-foreground no-print">
              Page {page} of {totalPages}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1200px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("created_at")}>
                    Created <SortIcon field="created_at" />
                  </th>
                  {visibleCols.has("ref") && (
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Ref</th>
                  )}
                  {visibleCols.has("patient") && (
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Patient</th>
                  )}
                  {visibleCols.has("provider") && (
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Provider</th>
                  )}
                  {visibleCols.has("service") && (
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Service</th>
                  )}
                  {visibleCols.has("type") && (
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Type</th>
                  )}
                  {visibleCols.has("status") && (
                    <th className="px-3 py-2.5 text-left font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("status")}>
                      Status <SortIcon field="status" />
                    </th>
                  )}
                  {visibleCols.has("payment") && (
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Payment</th>
                  )}
                  {visibleCols.has("gross") && (
                    <th className="px-3 py-2.5 text-right font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("total_amount")}>
                      Booking Amount <SortIcon field="total_amount" />
                    </th>
                  )}
                  {visibleCols.has("net") && (
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Net (USD)</th>
                  )}
                  {visibleCols.has("earning") && (
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Earning</th>
                  )}
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      No records match your filters.
                    </td>
                  </tr>
                ) : rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const cur = row.display_currency ?? "USD";
                  const usdNorm = n(row.final_total_usd ?? row.total_amount);
                  // Provider net: provider_earning (USD) minus platform_fee
                  const netEarning = n(row.provider_earning ?? 0);
                  const payMethod = row.payment_method ?? row.appt_payment_method;

                  return (
                    <>
                      <tr
                        key={row.id}
                        className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isExpanded ? "bg-muted/20" : ""}`}
                        data-testid={`row-master-${row.id}`}
                      >
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => toggleExpand(row.id)}
                            className="p-0.5 rounded hover:bg-muted transition-colors"
                            data-testid={`button-expand-${row.id}`}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap text-xs">
                          {fmtDate(row.created_at)}
                        </td>
                        {visibleCols.has("ref") && (
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {row.appointment_number ?? row.id.slice(0, 8)}
                          </td>
                        )}
                        {visibleCols.has("patient") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-medium text-xs">{row.patient_first_name} {row.patient_last_name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[140px]">{row.patient_email}</div>
                          </td>
                        )}
                        {visibleCols.has("provider") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-medium text-xs">{row.provider_first_name} {row.provider_last_name}</div>
                            <div className="text-xs text-muted-foreground capitalize">{row.provider_category?.replace(/_/g, " ")}</div>
                          </td>
                        )}
                        {visibleCols.has("service") && (
                          <td className="px-3 py-2.5 text-xs">
                            <div className="max-w-[120px] truncate">{row.service_name ?? "—"}</div>
                            {row.service_duration && <div className="text-muted-foreground">{row.service_duration}min</div>}
                          </td>
                        )}
                        {visibleCols.has("type") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="text-xs capitalize text-muted-foreground">
                              {(row.visit_type ?? row.location_mode ?? "").replace(/_/g, " ") || "—"}
                            </span>
                          </td>
                        )}
                        {visibleCols.has("status") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <StatusBadge value={row.status} />
                          </td>
                        )}
                        {visibleCols.has("payment") && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div><StatusBadge value={row.payment_status} /></div>
                            {payMethod && (
                              <div className="text-xs text-muted-foreground capitalize mt-0.5">{payMethod.replace(/_/g, " ")}</div>
                            )}
                          </td>
                        )}
                        {visibleCols.has("gross") && (
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap">
                            {/* Booking amount in booking currency — NOT USD */}
                            {fmtBooking(n(row.total_amount), cur)}
                            {cur !== "USD" && (
                              <div className="text-[10px] text-muted-foreground">≈ {fmt(usdNorm)}</div>
                            )}
                            {n(row.promo_discount) > 0 && (
                              <div className="text-xs text-green-600">−{fmtBooking(n(row.promo_discount), cur)}</div>
                            )}
                          </td>
                        )}
                        {visibleCols.has("net") && (
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                            {/* Net = usdNorm - platformFee (platform_fee_amount is booking currency) */}
                            {fmt(usdNorm - n(row.platform_fee_amount))}
                            {n(row.refund_amount) > 0 && (
                              <div className="text-xs text-rose-600">−{fmtBooking(n(row.refund_amount), cur)}</div>
                            )}
                          </td>
                        )}
                        {visibleCols.has("earning") && (
                          <td className="px-3 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400 whitespace-nowrap">
                            {/* Provider earning is USD (from provider_earnings table) */}
                            {netEarning > 0 ? fmt(netEarning) : <span className="text-muted-foreground">—</span>}
                            {row.earning_status && (
                              <div className="mt-0.5"><StatusBadge value={row.earning_status} /></div>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap no-print">
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => setDrawerRow(row)}
                            data-testid={`button-investigate-${row.id}`}
                          >
                            Investigate
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <ExpandedRow key={`${row.id}-expanded`} row={row} fmt={fmt} />
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t no-print">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
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
