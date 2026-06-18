import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAdminCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, Calendar, LayoutGrid, AlignJustify } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CalView = "day" | "week" | "month";

const STATUS_COLOR: Record<string, string> = {
  completed: "bg-emerald-500",
  confirmed: "bg-blue-500",
  in_progress: "bg-indigo-500",
  cancelled: "bg-red-400",
  cancelled_by_provider: "bg-red-400",
  cancelled_by_patient: "bg-red-300",
  pending: "bg-amber-500",
  rejected: "bg-rose-600",
  no_show: "bg-gray-500",
  rescheduled: "bg-purple-400",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  confirmed: "Confirmed",
  in_progress: "In progress",
  cancelled: "Cancelled",
  cancelled_by_provider: "Cancelled (provider)",
  cancelled_by_patient: "Cancelled (client)",
  pending: "Pending",
  rejected: "Rejected",
  no_show: "No show",
  rescheduled: "Rescheduled",
};

function fmt(d: Date, opts: Intl.DateTimeFormatOptions) {
  return d.toLocaleDateString(undefined, opts);
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function EventChip({ b, onClick }: { b: any; onClick: () => void }) {
  const color = STATUS_COLOR[b.status] ?? "bg-slate-400";
  return (
    <button
      className={`w-full text-left p-1.5 rounded text-xs text-white ${color} hover:opacity-90 transition-opacity truncate`}
      onClick={onClick}
      data-testid={`event-cal-${b.id}`}
    >
      <span className="font-semibold">{fmtTime(new Date(b.scheduledAt || b.date || Date.now()))}</span>
      <span className="ml-1 opacity-90 truncate">{b.serviceName || b.service?.name || "—"}</span>
    </button>
  );
}

function BookingDetailDialog({ booking, open, onClose }: { booking: any; open: boolean; onClose: () => void }) {
  if (!booking) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Booking details</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[booking.status] ?? "bg-slate-400"}`} />
            <span className="font-medium">{STATUS_LABEL[booking.status] ?? booking.status}</span>
          </div>
          <p><span className="text-muted-foreground">Service:</span> {booking.serviceName || booking.service?.name || "—"}</p>
          <p><span className="text-muted-foreground">Client:</span> {booking.customerName || booking.customer?.name || "—"}</p>
          <p><span className="text-muted-foreground">Provider:</span> {booking.providerName || booking.provider?.name || "—"}</p>
          <p><span className="text-muted-foreground">Date:</span> {new Date(booking.scheduledAt || booking.date || Date.now()).toLocaleString()}</p>
          {booking.visitType && <p><span className="text-muted-foreground">Visit type:</span> {booking.visitType}</p>}
          {booking.totalAmount && <p><span className="text-muted-foreground">Amount:</span> ${Number(booking.totalAmount).toFixed(2)}</p>}
          {booking.appointmentNumber && <p><span className="text-muted-foreground">Ref:</span> {booking.appointmentNumber}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminCalendarView() {
  const { t } = useTranslation();
  const { format: _fmtMoney } = useAdminCurrency();
  const [view, setView] = useState<CalView>("week");
  const [offset, setOffset] = useState(0);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);

  const { data: rawBookings, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/bookings"],
  });
  const bookings: any[] = Array.isArray(rawBookings)
    ? rawBookings
    : rawBookings?.bookings ?? rawBookings?.appointments ?? [];

  const { data: rawProviders } = useQuery<any>({
    queryKey: ["/api/admin/providers"],
  });
  const providers: any[] = Array.isArray(rawProviders)
    ? rawProviders
    : rawProviders?.providers ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const anchor = useMemo(() => {
    if (view === "day") {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d;
    }
    if (view === "week") {
      const d = new Date(today);
      const dayOfWeek = d.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      d.setDate(d.getDate() + diff + offset * 7);
      return d;
    }
    // month
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return d;
  }, [view, offset]);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(anchor);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
    // month — full weeks (pad to start on Monday)
    const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const dow = firstDay.getDay();
    const startPad = dow === 0 ? 6 : dow - 1;
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startPad);
    const weeks = 6;
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [view, anchor]);

  const rangeLabel = useMemo(() => {
    if (view === "day") return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (view === "week") {
      const end = days[6];
      return `${fmt(days[0], { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return fmt(anchor, { month: "long", year: "numeric" });
  }, [view, anchor, days]);

  const filtered = useMemo(() => {
    return (bookings || []).filter((b: any) => {
      if (providerFilter !== "all" && b.providerId !== providerFilter) return false;
      return true;
    });
  }, [bookings, providerFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    days.forEach((d) => map.set(d.toDateString(), []));
    filtered.forEach((b: any) => {
      const key = new Date(b.scheduledAt || b.date || Date.now()).toDateString();
      if (map.has(key)) map.get(key)!.push(b);
    });
    map.forEach((arr) =>
      arr.sort((a, b) =>
        new Date(a.scheduledAt || a.date || 0).getTime() -
        new Date(b.scheduledAt || b.date || 0).getTime(),
      ),
    );
    return map;
  }, [filtered, days]);

  const isCurrentMonth = (d: Date) => d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear();
  const isToday = (d: Date) => isSameDay(d, new Date());

  const dayHeaderClass = (d: Date) =>
    `text-xs text-center py-1 font-medium ${isToday(d) ? "text-primary" : "text-muted-foreground"}`;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setOffset((o) => o - 1)} data-testid="button-cal-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOffset(0)} data-testid="button-cal-today">
                {t("admin.today", "Today")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOffset((o) => o + 1)} data-testid="button-cal-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 font-semibold text-sm" data-testid="text-cal-range">{rangeLabel}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-md border overflow-hidden">
                {(["day", "week", "month"] as CalView[]).map((v) => (
                  <button
                    key={v}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    onClick={() => { setView(v); setOffset(0); }}
                    data-testid={`button-cal-view-${v}`}
                  >
                    {v === "day" ? <AlignJustify className="h-3 w-3" /> : v === "week" ? <LayoutGrid className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-cal-provider">
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {providers.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.businessName || p.user?.name || p.clinicName || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : view === "day" ? (
            <DayView day={days[0]} events={byDay.get(days[0].toDateString()) ?? []} onEventClick={setSelectedBooking} />
          ) : view === "week" ? (
            <WeekView days={days} byDay={byDay} onEventClick={setSelectedBooking} />
          ) : (
            <MonthView
              days={days}
              byDay={byDay}
              isCurrentMonth={isCurrentMonth}
              onEventClick={setSelectedBooking}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs">
        {[
          ["bg-amber-500", t("admin.pending", "Pending")],
          ["bg-blue-500", t("admin.confirmed", "Confirmed")],
          ["bg-indigo-500", "In progress"],
          ["bg-emerald-500", t("admin.completed", "Completed")],
          ["bg-red-400", t("admin.cancelled", "Cancelled")],
          ["bg-purple-400", "Rescheduled"],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded ${color}`} />
            {label}
          </span>
        ))}
      </div>

      <BookingDetailDialog
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </div>
  );
}

function DayView({ day, events, onEventClick }: { day: Date; events: any[]; onEventClick: (b: any) => void }) {
  const isToday = isSameDay(day, new Date());
  return (
    <div className={`border rounded-lg p-4 min-h-[360px] ${isToday ? "border-primary bg-primary/5" : ""}`}>
      <p className="text-sm font-medium mb-3 text-muted-foreground">
        {day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        {events.length > 0 && <Badge variant="secondary" className="ml-2">{events.length}</Badge>}
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 italic">No bookings</p>
      ) : (
        <div className="space-y-2">
          {events.map((b: any) => (
            <div
              key={b.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors`}
              onClick={() => onEventClick(b)}
              data-testid={`event-cal-${b.id}`}
            >
              <span className={`mt-0.5 h-3 w-3 rounded-full flex-shrink-0 ${STATUS_COLOR[b.status] ?? "bg-slate-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{b.serviceName || b.service?.name || "—"}</p>
                <p className="text-xs text-muted-foreground">{b.customerName || b.customer?.name || ""}</p>
                <p className="text-xs text-muted-foreground">{fmtTime(new Date(b.scheduledAt || b.date || Date.now()))}</p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">{STATUS_LABEL[b.status] ?? b.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekView({ days, byDay, onEventClick }: { days: Date[]; byDay: Map<string, any[]>; onEventClick: (b: any) => void }) {
  const today = new Date();
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const evts = byDay.get(d.toDateString()) ?? [];
        const todayDay = isSameDay(d, today);
        return (
          <div
            key={d.toISOString()}
            className={`border rounded-lg p-2 min-h-[220px] ${todayDay ? "border-primary bg-primary/5" : "bg-card"}`}
            data-testid={`col-cal-${d.toDateString()}`}
          >
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[10px] uppercase text-muted-foreground font-medium">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span className={`text-base font-semibold ${todayDay ? "text-primary" : ""}`}>{d.getDate()}</span>
            </div>
            <div className="space-y-1">
              {evts.slice(0, 4).map((b: any) => (
                <EventChip key={b.id} b={b} onClick={() => onEventClick(b)} />
              ))}
              {evts.length > 4 && (
                <p className="text-[10px] text-muted-foreground text-center">+{evts.length - 4} more</p>
              )}
              {evts.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 italic">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  days,
  byDay,
  isCurrentMonth,
  onEventClick,
}: {
  days: Date[];
  byDay: Map<string, any[]>;
  isCurrentMonth: (d: Date) => boolean;
  onEventClick: (b: any) => void;
}) {
  const today = new Date();
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map((wd) => (
          <div key={wd} className="text-center text-xs font-medium text-muted-foreground py-1">{wd}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-t">
        {days.map((d) => {
          const evts = byDay.get(d.toDateString()) ?? [];
          const inMonth = isCurrentMonth(d);
          const todayDay = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`border-r border-b p-1.5 min-h-[90px] ${!inMonth ? "bg-muted/30" : ""} ${todayDay ? "bg-primary/5" : ""}`}
              data-testid={`cell-cal-${d.toDateString()}`}
            >
              <span
                className={`inline-flex items-center justify-center h-6 w-6 text-xs font-medium rounded-full mb-1 ${
                  todayDay ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/50" : "text-foreground"
                }`}
              >
                {d.getDate()}
              </span>
              <div className="space-y-0.5">
                {evts.slice(0, 3).map((b: any) => (
                  <button
                    key={b.id}
                    className={`w-full text-left px-1 py-0.5 rounded text-[10px] text-white truncate ${STATUS_COLOR[b.status] ?? "bg-slate-400"} hover:opacity-90`}
                    onClick={() => onEventClick(b)}
                    data-testid={`event-cal-${b.id}`}
                  >
                    {b.serviceName || b.service?.name || "Booking"}
                  </button>
                ))}
                {evts.length > 3 && (
                  <p className="text-[10px] text-muted-foreground px-1">+{evts.length - 3}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
