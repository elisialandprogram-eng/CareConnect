/**
 * AppointmentTimingCard
 *
 * A dedicated timing panel shown on appointment detail pages and the booking
 * awareness flow.  It ticks every second so all live countdowns stay accurate.
 *
 * Displays vary by appointment status:
 *  confirmed / pending  → Current time · Starts at · Duration · Starts In (countdown)
 *  in_progress          → Started X ago · Elapsed · Ends at · Time Remaining
 *  completed            → Completed date · Duration
 *  cancelled / terminal → Terminal date
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Timer, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  date: string;
  startTime: string;
  endTime?: string;
  /** Authoritative UTC ISO string (start_at column). Used for exact countdowns. */
  startAtUtc?: string | null;
  status: string;
  /** If true renders a compact single-row variant (used inside booking panel) */
  compact?: boolean;
  className?: string;
}

const TERMINAL = ["completed", "cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"];

function fmt12(time: string): string {
  try {
    const [hStr, mStr] = time.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr ?? "00";
    const ampm = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m} ${ampm}`;
  } catch { return time; }
}

function durMins(startTime: string, endTime: string): number {
  try {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  } catch { return 0; }
}

type TimingTranslator = (key: string, fallback: string, options?: Record<string, unknown>) => string;

function fmtDur(mins: number, t?: TimingTranslator): string {
  if (mins <= 0) return "—";
  const tr = t ?? ((_key: string, fallback: string) => fallback);
  if (mins < 60) return tr("member_time.minutes", "{{count}} min", { count: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0
    ? `${tr("member_time.hours_short", "{{count}}h", { count: h })} ${tr("member_time.minutes_short", "{{count}}m", { count: m })}`
    : tr("member_time.hours_short", "{{count}}h", { count: h });
}

/** ms until appointment start (negative if past).
 *  Prefers the authoritative UTC start_at column; falls back to wall-clock parse. */
function msUntil(date: string, startTime: string, startAtUtc?: string | null): number {
  if (startAtUtc) {
    const utc = new Date(startAtUtc);
    if (!isNaN(utc.getTime())) return utc.getTime() - Date.now();
  }
  // Legacy fallback
  const [h, m] = (startTime || "00:00").split(":").map(Number);
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.getTime() - Date.now();
}

type ArrivalConfidence = "comfortable" | "limited" | "immediate" | null;

function arrivalConfidence(minsAway: number): ArrivalConfidence {
  if (minsAway > 30) return "comfortable";
  if (minsAway > 10) return "limited";
  if (minsAway >= 0) return "immediate";
  return null;
}

const CONF_STYLES: Record<NonNullable<ArrivalConfidence>, { bar: string; text: string; labelKey: string; label: string }> = {
  comfortable: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", labelKey: "comfortable_arrival", label: "Comfortable Arrival Window" },
  limited:     { bar: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400",   labelKey: "limited_preparation", label: "Limited Preparation Time" },
  immediate:   { bar: "bg-orange-500",  text: "text-orange-700 dark:text-orange-400", labelKey: "immediate_attendance", label: "Immediate Attendance Required" },
};

function fmtCountdown(ms: number, t?: TimingTranslator): string {
  const tr = t ?? ((_key: string, fallback: string) => fallback);
  if (ms <= 0) return tr("member_time.now", "Now");
  const totalSecs = Math.floor(ms / 1_000);
  const days  = Math.floor(totalSecs / 86_400);
  const hrs   = Math.floor((totalSecs % 86_400) / 3_600);
  const mins  = Math.floor((totalSecs % 3_600) / 60);
  const secs  = totalSecs % 60;
  if (days > 1) return `${tr("member_time.days_other", "{{count}} days", { count: days })} ${hrs}h`;
  if (days === 1) return hrs > 0 ? `${tr("member_time.days_one", "{{count}} day", { count: 1 })} ${hrs}h` : tr("member_time.days_one", "{{count}} day", { count: 1 });
  if (hrs > 0)   return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  if (mins > 0)  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  return `${secs}s`;
}

function fmtElapsed(ms: number, t?: TimingTranslator): string {
  const tr = t ?? ((_key: string, fallback: string) => fallback);
  const totalSecs = Math.floor(Math.abs(ms) / 1_000);
  const hrs  = Math.floor(totalSecs / 3_600);
  const mins = Math.floor((totalSecs % 3_600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  if (mins > 0) return secs > 5 ? `${mins}m ${secs}s` : `${mins}m`;
  return tr("member_time.seconds_short", "{{count}}s", { count: secs });
}

function localTimeStr(): string {
  const n = new Date();
  const h = String(n.getHours()).padStart(2, "0");
  const m = String(n.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/* ─────────────────────────────────────────────────────────────────────────── */

export function AppointmentTimingCard({ date, startTime, endTime = "", startAtUtc, status, compact = false, className }: Props) {
  const { t } = useTranslation();
  const translate: TimingTranslator = (key, fallback, options) => String(t(key, fallback, options));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (TERMINAL.includes(status)) return;
    const id = setInterval(() => setTick(t => t + 1), 1_000);
    return () => clearInterval(id);
  }, [status]);

  const isTerminal   = TERMINAL.includes(status);
  const isInProgress = status === "in_progress";
  const isUpcoming   = !isTerminal && !isInProgress;

  const msStart  = msUntil(date, startTime, startAtUtc);
  const dur      = endTime ? durMins(startTime, endTime) : 0;
  const minsAway = Math.floor(msStart / 60_000);

  /* ── Compact variant (used inside booking awareness panel) ── */
  if (compact) {
    if (isUpcoming && msStart > 0) {
      const conf = arrivalConfidence(minsAway);
      const confStyle = conf ? CONF_STYLES[conf] : null;
      return (
        <div className={cn("space-y-2", className)}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />{t("provider_sweep.schedule.current_time", "Current time")}
            </span>
            <span className="font-mono font-semibold tabular-nums">{localTimeStr()}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />{t("provider_sweep.schedule.starts_in", "Starts in")}
            </span>
            <span className={cn(
              "font-bold tabular-nums",
              minsAway <= 10 ? "text-red-600 dark:text-red-400 text-base" :
              minsAway <= 30 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
            )}>
              {fmtCountdown(msStart, translate)}
            </span>
          </div>
              {confStyle && (
            <div className={cn("flex items-center gap-2 text-xs font-medium mt-1", confStyle.text)}>
              <span className={cn("h-2 w-2 rounded-full shrink-0", confStyle.bar)} />
              {t(`member_time.${confStyle.labelKey}`, confStyle.label)}
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  /* ── Full card ── */
  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm overflow-hidden",
        isInProgress && "border-blue-300 dark:border-blue-600",
        className,
      )}
      data-testid="appointment-timing-card"
    >
      {/* Header */}
      <div className={cn(
        "px-4 py-2.5 flex items-center gap-2 text-sm font-semibold border-b",
        isInProgress
          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"
          : isTerminal
            ? "bg-muted/40 text-muted-foreground"
            : "bg-primary/5 text-primary",
      )}>
        {isInProgress ? <Timer className="h-4 w-4" /> :
         isTerminal   ? <CheckCircle2 className="h-4 w-4" /> :
                        <Clock className="h-4 w-4" />}
        <span>
          {isInProgress ? t("member_time.session_in_progress", "Session in progress") :
           status === "completed" ? t("member_time.session_completed", "Session completed") :
           TERMINAL.includes(status) ? t("member_time.appointment_closed", "Appointment closed") :
           t("member_time.appointment_timing", "Appointment timing")}
        </span>
      </div>

      <div className="px-4 py-3 space-y-0">
        {/* ── UPCOMING ── */}
        {isUpcoming && (
          <>
            <Row label={t("member_time.current_time", "Current time")} value={<span className="font-mono tabular-nums">{localTimeStr()}</span>} />
            <Row label={t("member_time.appointment", "Appointment")} value={`${fmt12(startTime)}${endTime ? ` – ${fmt12(endTime)}` : ""}`} />
            {dur > 0 && <Row label={t("member_time.duration", "Duration")} value={fmtDur(dur, translate)} />}
            <div className="border-t my-2" />
            {msStart > 0 ? (
              <>
                <Row
                  label={t("member_time.starts_in", "Starts in")}
                  value={
                    <span className={cn(
                      "font-bold tabular-nums",
                      minsAway <= 10 ? "text-red-600 dark:text-red-400 text-base" :
                      minsAway <= 30 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                    )}>
                      {fmtCountdown(msStart, translate)}
                    </span>
                  }
                  highlight
                />
                {(() => {
                  const conf = arrivalConfidence(minsAway);
                  if (!conf) return null;
                  const s = CONF_STYLES[conf];
                  return (
                    <div className={cn("flex items-center gap-2 mt-2 text-xs font-medium", s.text)} data-testid="arrival-confidence">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", s.bar)} />
                      {t(`member_time.${s.labelKey}`, s.label)}
                    </div>
                  );
                })()}
              </>
            ) : (
              <Row label={t("common.status", "Status")} value={<span className="text-amber-600 dark:text-amber-400 font-semibold">{t("member_time.starting_now", "Starting now")}</span>} highlight />
            )}
          </>
        )}

        {/* ── IN PROGRESS ── */}
        {isInProgress && (
          <>
            <Row label={t("member_time.current_time", "Current time")} value={<span className="font-mono tabular-nums">{localTimeStr()}</span>} />
            <Row label={t("member_time.started_at", "Started at")} value={fmt12(startTime)} />
            {dur > 0 && <Row label={t("member_time.duration", "Duration")} value={fmtDur(dur, translate)} />}
            <div className="border-t my-2" />
            <Row
              label={t("member_time.elapsed", "Elapsed")}
              value={<span className="font-bold text-blue-700 dark:text-blue-300 tabular-nums">{fmtElapsed(-msStart, translate)}</span>}
              highlight
            />
            {endTime && dur > 0 && (() => {
              const msEnd = msStart + dur * 60_000;
              return msEnd > 0 ? (
                <Row label={t("member_time.time_remaining", "Time remaining")} value={<span className="tabular-nums text-emerald-700 dark:text-emerald-300">{fmtCountdown(msEnd, translate)}</span>} />
              ) : null;
            })()}
          </>
        )}

        {/* ── TERMINAL ── */}
        {isTerminal && (
          <>
            <Row label={t("member_time.appointment", "Appointment")} value={`${fmt12(startTime)}${endTime ? ` – ${fmt12(endTime)}` : ""}`} />
            {dur > 0 && <Row label={t("member_time.duration", "Duration")} value={fmtDur(dur, translate)} />}
            <Row
              label={status === "completed" ? t("member_time.completed", "Completed") : t("member_time.closed", "Closed")}
              value={(() => {
                const diff = Math.abs(msStart);
                const days = Math.floor(diff / 86_400_000);
                 if (days === 0) return t("member_time.today", "Today");
                 if (days === 1) return t("member_time.yesterday", "Yesterday");
                 return t("member_time.days_ago", "{{count}} days ago", { count: days });
              })()}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 py-1.5",
      highlight && "rounded-lg px-2 -mx-2 bg-muted/40",
    )}>
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

/**
 * BookingAwarenessPanel — inline panel shown in book-wizard step 2 after slot selection.
 * Shows the slot time, a live countdown, arrival confidence, and a "Begin Checkout" CTA.
 */
interface BookingAwarenessPanelProps {
  slot: { date: string; startTime: string; endTime: string };
  onBeginCheckout: () => void;
  isLoading: boolean;
}

export function BookingAwarenessPanel({ slot, onBeginCheckout, isLoading }: BookingAwarenessPanelProps) {
  const { t } = useTranslation();
  const translate: TimingTranslator = (key, fallback, options) => String(t(key, fallback, options));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const msStart  = msUntil(slot.date, slot.startTime);
  const minsAway = Math.floor(msStart / 60_000);
  const dur      = slot.endTime ? durMins(slot.startTime, slot.endTime) : 0;
  const conf     = arrivalConfidence(minsAway);
  const confStyle = conf ? CONF_STYLES[conf] : null;

  const urgencyBg =
    minsAway <= 10 ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30" :
    minsAway <= 30 ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" :
    "border-primary/30 bg-primary/5";

  return (
    <div
      className={cn("rounded-xl border-2 p-4 space-y-3", urgencyBg)}
      data-testid="booking-awareness-panel"
    >
      {/* Slot headline */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase font-semibold tracking-wide text-muted-foreground mb-0.5">{t("member_time.selected_time", "Selected time")}</p>
          <p className="text-2xl font-bold tabular-nums leading-none">
            {slot.startTime}
            {slot.endTime && <span className="text-base font-normal text-muted-foreground"> – {slot.endTime}</span>}
          </p>
          {dur > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{fmtDur(dur, translate)}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">{t("member_time.current_time", "Current time")}</p>
          <p className="font-mono font-semibold tabular-nums">{localTimeStr()}</p>
        </div>
      </div>

      {/* Countdown */}
      {msStart > 0 ? (
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">{t("member_time.starts_in", "Starts in")}</span>
          <span className={cn(
            "text-lg font-bold tabular-nums",
            minsAway <= 10 ? "text-red-600 dark:text-red-400" :
            minsAway <= 30 ? "text-amber-600 dark:text-amber-400" :
            "text-emerald-600 dark:text-emerald-400",
          )}>
            {fmtCountdown(msStart, translate)}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">{t("member_time.starting_now", "Starting now")}</span>
        </div>
      )}

      {/* Arrival confidence */}
      {confStyle && (
        <div className={cn("flex items-center gap-2 text-xs font-medium", confStyle.text)}>
          <span className={cn("h-2 w-2 rounded-full shrink-0", confStyle.bar)} />
          {t(`member_time.${confStyle.labelKey}`, confStyle.label)}
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={onBeginCheckout}
        disabled={isLoading}
        data-testid="button-begin-checkout"
        className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-semibold py-2.5 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
            {t("member_time.reserving_slot", "Reserving slot…")}
          </>
        ) : t("member_time.begin_checkout", "Begin checkout →")}
      </button>
    </div>
  );
}
