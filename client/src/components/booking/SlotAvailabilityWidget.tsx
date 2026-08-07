/**
 * SlotAvailabilityWidget — Part 3: Client Real-Time Slot Availability Matrix
 *
 * Visual states:
 *  BOOKED          → hidden entirely
 *  HELD (other)    → muted amber "In another cart" tile
 *  HELD (own)      → pulsating primary border + live hold-expiry countdown
 *  AVAILABLE       → interactive button; urgency tier applied for same-day slots:
 *    urgent (<10 min)  → orange border + ⚡ badge + "Xm" countdown subtext
 *    soon   (<30 min)  → amber border + "Xm" countdown subtext
 *    comfortable       → standard / peak / off-peak colours unchanged
 */

import { useState, useEffect } from "react";
import { Loader2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency, formatInCurrency } from "@/lib/currency";

export interface WidgetSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Authoritative UTC instant for this slot (ISO string). When present, urgency
   *  and countdown calculations use this instead of the browser-local parse of
   *  date+startTime, which is only correct when the browser timezone matches the
   *  provider timezone. */
  startAtUtc?: string;
  isBooked?: boolean;
  isBlocked?: boolean;
  status?: "AVAILABLE" | "HELD" | "BOOKED";
  pricingTier?: "standard" | "peak" | "off_peak";
}

interface SlotAvailabilityWidgetProps {
  slots: WidgetSlot[];
  holdId: string | null;
  holdExpiresAt: Date | null;
  selectedSlot: WidgetSlot | null;
  onSelectSlot: (slot: WidgetSlot) => void;
  isCreatingHold: boolean;
  price?: number;
  /** ISO-4217 currency code for the price prop (e.g. "HUF", "IRR", "USD").
   *  When provided, prices are formatted with formatInCurrency (no USD conversion). */
  currency?: string;
}

function useCountdown(expiresAt: Date | null): string {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!expiresAt) { setRemaining(""); return; }
    function tick() {
      const diff = Math.max(0, expiresAt!.getTime() - Date.now());
      const mins = Math.floor(diff / 60_000);
      const secs = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${mins}:${String(secs).padStart(2, "0")}`);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

type UrgencyTier = "urgent" | "soon" | null;

/**
 * Resolve a slot's start time as UTC milliseconds.
 * Prefers startAtUtc (true UTC instant) to avoid timezone drift when the
 * patient's browser timezone differs from the provider's timezone.
 * Falls back to naive browser-local parse only for legacy slots without startAtUtc.
 */
function resolveSlotMs(slot: WidgetSlot): number {
  if (slot.startAtUtc) {
    const ms = new Date(slot.startAtUtc).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  // Fallback: browser-local parse — correct only when browser TZ = provider TZ
  return new Date(`${slot.date}T${slot.startTime}:00`).getTime();
}

function getUrgency(slot: WidgetSlot, now: Date): UrgencyTier {
  try {
    const slotMs = resolveSlotMs(slot);
    const diffMs = slotMs - now.getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
    const mins = diffMs / 60_000;
    if (mins <= 10) return "urgent";
    if (mins <= 30) return "soon";
    return null;
  } catch { return null; }
}

function minsUntilLabel(slot: WidgetSlot, now: Date): string | null {
  try {
    const diffMs = resolveSlotMs(slot) - now.getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
    const m = Math.floor(diffMs / 60_000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  } catch { return null; }
}

function computeSurgePrice(baseUsd: number, tier: string | undefined): number {
  if (tier === "peak") return baseUsd * 1.2;
  if (tier === "off_peak") return baseUsd * 0.85;
  return baseUsd;
}

export function SlotAvailabilityWidget({
  slots,
  holdId,
  holdExpiresAt,
  selectedSlot,
  onSelectSlot,
  isCreatingHold,
  price = 0,
  currency,
}: SlotAvailabilityWidgetProps) {
  // Keep useCurrency as USD fallback only. When booking currency is non-USD
  // (HUF, IRR) use formatInCurrency so we never multiply by exchange rate again.
  const { format: formatPriceUSD } = useCurrency();
  const fmtSlotPrice = (n: number) =>
    currency && currency !== "USD"
      ? formatInCurrency(n, currency)
      : formatPriceUSD(n);
  const holdCountdown = useCountdown(holdExpiresAt);
  const now = useNow();

  const visible = slots.filter(s => !s.isBooked && !s.isBlocked && s.status !== "BOOKED");
  if (visible.length === 0) {
    return (
      <div
        className="py-12 flex flex-col items-center gap-3 text-muted-foreground border-2 border-dashed rounded-xl"
        data-testid="slot-widget-empty"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" className="h-16 w-16 opacity-30" aria-hidden="true">
          <rect x="8" y="16" width="64" height="56" rx="6" fill="currentColor" opacity="0.12" />
          <rect x="8" y="16" width="64" height="12" rx="6" fill="currentColor" opacity="0.25" />
          <line x1="8" y1="36" x2="72" y2="36" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
          {[20, 34, 48, 62].map(x => [44, 56, 62].map(y => (
            <rect key={`${x}-${y}`} x={x} y={y} width="8" height="6" rx="2" fill="currentColor" opacity="0.18" />
          )))}
          <circle cx="40" cy="52" r="12" fill="currentColor" opacity="0.15" />
          <line x1="34" y1="52" x2="46" y2="52" stroke="currentColor" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        </svg>
        <div className="text-center">
          <p className="font-medium text-sm">No available slots</p>
          <p className="text-xs mt-0.5 opacity-70">All times are fully booked or held.</p>
        </div>
      </div>
    );
  }

  const hasUrgent = visible.some(s => getUrgency(s, now) === "urgent");
  const hasSoon   = visible.some(s => getUrgency(s, now) === "soon");

  return (
    <div className="space-y-3">
      {/* Urgency legend */}
      {(hasUrgent || hasSoon) && (
        <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground" data-testid="slot-urgency-legend">
          {hasSoon   && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />Starting soon (≤30 min)</span>}
          {hasUrgent && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />Last-minute (≤10 min)</span>}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {slots.map(slot => {
          if (slot.isBooked || slot.isBlocked || slot.status === "BOOKED") return null;

          const isActive  = selectedSlot?.id === slot.id;
          const isMyHold  = isActive && holdId != null;
          const isHeld    = slot.status === "HELD";
          const isPeak    = slot.pricingTier === "peak";
          const isOffPeak = slot.pricingTier === "off_peak";
          const isPending = isCreatingHold && isActive;
          const surgePrice = price > 0 ? computeSurgePrice(price, slot.pricingTier) : 0;
          const urgency    = getUrgency(slot, now);
          const minsLabel  = urgency ? minsUntilLabel(slot, now) : null;

          // HELD by another session
          if (isHeld && !isMyHold) {
            return (
              <div
                key={slot.id}
                data-testid={`slot-held-${slot.startTime}`}
                title="Reserved by another patient"
                className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 py-3 px-1 text-xs font-medium text-center text-amber-700 dark:text-amber-400 cursor-not-allowed select-none"
              >
                <span className="block font-semibold">{slot.startTime}</span>
                <span className="block text-[10px] leading-tight opacity-75 mt-0.5">In another cart</span>
              </div>
            );
          }

          // OWN SESSION HOLD: pulsating + hold countdown
          if (isMyHold) {
            return (
              <div
                key={slot.id}
                data-testid={`slot-own-hold-${slot.startTime}`}
                className="rounded-xl border-2 border-primary bg-primary/10 dark:bg-primary/20 py-3 px-1 text-xs font-medium text-center select-none animate-pulse"
              >
                <span className="block font-semibold text-primary">{slot.startTime}</span>
                {holdCountdown && (
                  <span className="block text-[10px] leading-tight text-primary/80 mt-0.5 tabular-nums">⏱ {holdCountdown}</span>
                )}
              </div>
            );
          }

          // AVAILABLE
          return (
            <button
              key={slot.id}
              type="button"
              disabled={isCreatingHold || isHeld}
              onClick={() => onSelectSlot(slot)}
              data-testid={`slot-btn-${slot.startTime}`}
              className={cn(
                "rounded-xl border py-2.5 px-1 text-sm font-medium text-center transition-all flex flex-col items-center gap-0.5 relative overflow-hidden",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm ring-2 ring-primary/30"
                  : urgency === "urgent"
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-900 dark:text-orange-100"
                    : urgency === "soon"
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-100"
                      : isPeak
                        ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30 hover:border-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                        : isOffPeak
                          ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:border-emerald-500 hover:bg-emerald-100"
                          : "border-border bg-card hover:border-primary hover:bg-primary/5",
                isCreatingHold && !isActive && "opacity-50 cursor-not-allowed",
              )}
            >
              {/* Peak badge — only when no urgency overrides */}
              {isPeak && !isActive && !urgency && (
                <span className="absolute top-0.5 right-0.5 text-[9px] leading-none font-bold text-orange-600 dark:text-orange-400 flex items-center gap-0.5">
                  <Flame className="h-2.5 w-2.5" />Popular
                </span>
              )}
              {/* Urgency indicator */}
              {urgency === "urgent" && !isActive && (
                <span className="absolute top-0.5 right-0.5 text-[10px] leading-none" title="Last-minute slot">⚡</span>
              )}

              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span className="font-semibold">{slot.startTime}</span>
                  {minsLabel && !isActive ? (
                    <span className={cn(
                      "text-[10px] leading-none font-medium",
                      urgency === "urgent"
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-amber-600 dark:text-amber-400",
                    )}>
                      {minsLabel}
                    </span>
                  ) : surgePrice > 0 ? (
                    <span
                      className={cn(
                        "text-[10px] leading-none",
                        isActive
                          ? "text-primary-foreground/80"
                          : isPeak
                            ? "text-orange-600 dark:text-orange-400 font-semibold"
                            : "text-muted-foreground",
                      )}
                      data-testid={`slot-price-${slot.startTime}`}
                    >
                      {fmtSlotPrice(surgePrice)}
                    </span>
                  ) : null}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
