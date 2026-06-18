import {
  type AppointmentStatus,
  canTransition,
  isTerminalStatus,
} from "./appointmentStatus";

export type AppointmentAction = "cancel" | "reschedule" | "no_show" | "propose";
export type ActorRole = "patient" | "provider" | "admin";

export const APPOINTMENT_ACTIONS: AppointmentAction[] = [
  "cancel",
  "reschedule",
  "no_show",
  "propose",
];

/** Patient-specific cancel reasons */
export const PATIENT_CANCEL_REASON_CODES: string[] = [
  "schedule_conflict",
  "feeling_better",
  "found_alternative",
  "financial",
  "personal",
  "other",
];

/** Provider-specific cancel reasons */
export const PROVIDER_CANCEL_REASON_CODES: string[] = [
  "schedule_conflict",
  "provider_sick",
  "emergency",
  "overbooked",
  "patient_unresponsive",
  "other",
];

export const REASON_CODES: Record<AppointmentAction, string[]> = {
  cancel: PATIENT_CANCEL_REASON_CODES,
  reschedule: [
    "schedule_conflict",
    "transport_issue",
    "personal",
    "other",
  ],
  no_show: [
    "patient_did_not_arrive",
    "patient_unreachable",
    "other",
  ],
  propose: [
    "schedule_conflict",
    "transport_issue",
    "personal",
    "other",
  ],
};

export const PATIENT_CANCEL_MIN_HOURS = 6;
export const PATIENT_RESCHEDULE_MIN_HOURS = 2;
export const FULL_REFUND_HOURS = 24;
export const PARTIAL_REFUND_HOURS_LOW = 6;   // Below this → 0%
export const PARTIAL_REFUND_PERCENT = 0.5;

// ── DB-driven refund rule ─────────────────────────────────────────────────────
// Shape mirrors the refund_rules table row returned by the admin API.
export interface RefundRule {
  id?: string;
  scenario?: string;
  country_code?: string;
  full_refund_hours: number;
  partial_refund_hours: number;
  partial_refund_percent: number;
  is_active: boolean;
  description?: string;
}

/**
 * Calculates a refund quote, optionally applying a DB-driven rule.
 * When a rule is provided it overrides the hardcoded constants.
 * Falls back to hardcoded defaults if no rule is supplied.
 */
export function quoteRefundWithRule(
  opts: {
    action: AppointmentAction;
    actorRole: ActorRole;
    totalPaid: number;
    hoursBeforeStart: number | null;
  },
  rule?: RefundRule | null,
): RefundQuote {
  const { action, actorRole, totalPaid, hoursBeforeStart } = opts;
  const paid = Math.max(0, Number(totalPaid) || 0);

  if (action === "no_show") {
    return { amount: 0, policy: "no_show_none", reason: "No-show — no refund issued.", hoursBeforeStart };
  }
  if (action === "reschedule" || action === "propose") {
    return { amount: 0, policy: "none", reason: "No refund — funds carry to the appointment.", hoursBeforeStart };
  }

  if (actorRole === "provider" || actorRole === "admin") {
    return { amount: paid, policy: "provider_full", reason: "Full refund — cancellation by provider/admin.", hoursBeforeStart };
  }

  if (hoursBeforeStart === null) {
    return { amount: 0, policy: "none", reason: "Cannot determine appointment time.", hoursBeforeStart };
  }

  const fullHours   = rule?.full_refund_hours    ?? FULL_REFUND_HOURS;
  const partialLow  = rule?.partial_refund_hours  ?? PARTIAL_REFUND_HOURS_LOW;
  const partialPct  = rule?.partial_refund_percent != null
    ? Number(rule.partial_refund_percent) / 100
    : PARTIAL_REFUND_PERCENT;

  if (hoursBeforeStart >= fullHours) {
    return { amount: paid, policy: "full", reason: `Cancelled more than ${fullHours}h in advance — full refund.`, hoursBeforeStart };
  }
  if (hoursBeforeStart >= partialLow) {
    return {
      amount: Math.round(paid * partialPct * 100) / 100,
      policy: "partial",
      reason: `Cancelled ${partialLow}–${fullHours}h before appointment — ${partialPct * 100}% refund.`,
      hoursBeforeStart,
    };
  }
  return {
    amount: 0,
    policy: "none",
    reason: `Cancellations within ${partialLow}h of start are not refundable.`,
    hoursBeforeStart,
  };
}

/**
 * Returns the authoritative start Date for an appointment.
 * Priority: startAtUtc (TIMESTAMPTZ from DB) > date+time text (legacy fallback).
 */
export function getAppointmentStartDate(
  date: string,
  startTime: string,
  startAtUtc?: Date | string | null,
): Date | null {
  if (startAtUtc) {
    const d = typeof startAtUtc === "string" ? new Date(startAtUtc) : startAtUtc;
    if (!isNaN(d.getTime())) return d;
  }
  if (!date || !startTime) return null;
  const dateOnly = String(date).slice(0, 10);
  // Legacy fallback: parse as server-local. Works correctly on UTC servers.
  const parsed = new Date(`${dateOnly}T${startTime}:00`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns hours until appointment start. Positive = future, negative = past.
 * Uses startAtUtc (authoritative UTC timestamp) when provided; falls back to date+time text.
 */
export function hoursUntilStart(
  date: string,
  startTime: string,
  now: Date = new Date(),
  startAtUtc?: Date | string | null,
): number | null {
  const start = getAppointmentStartDate(date, startTime, startAtUtc);
  if (!start) return null;
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export interface RefundQuote {
  amount: number;
  policy: "full" | "partial" | "none" | "provider_full" | "no_show_none";
  reason: string;
  hoursBeforeStart: number | null;
}

export interface ActionPermitResult {
  ok: boolean;
  status: number;
  message?: string;
  toStatus?: AppointmentStatus;
}

/**
 * Validates whether the actor can perform the action on the appointment in
 * its current status, and returns the target status the appointment should
 * move to. This is the single source of truth for action → status mapping.
 */
export function checkAction(opts: {
  action: AppointmentAction;
  actorRole: ActorRole;
  currentStatus: string;
  hoursBeforeStart: number | null;
  ownsAppointment: boolean;
  /** Set true when the patient's active membership includes a free_cancellations benefit */
  bypassPatientCancelHours?: boolean;
}): ActionPermitResult {
  const { action, actorRole, currentStatus, hoursBeforeStart, ownsAppointment, bypassPatientCancelHours } = opts;

  if (!ownsAppointment && actorRole !== "admin") {
    return { ok: false, status: 403, message: "You don't have access to this appointment." };
  }

  if (isTerminalStatus(currentStatus)) {
    return {
      ok: false,
      status: 409,
      message: `Appointment is already ${currentStatus} and cannot be changed.`,
    };
  }

  let toStatus: AppointmentStatus;
  switch (action) {
    case "cancel": {
      if (actorRole === "patient") {
        // Appointment already in the past — give a clear, accurate message instead
        // of the confusing "cannot cancel within 6 hours" copy.
        if (hoursBeforeStart !== null && hoursBeforeStart < 0) {
          return {
            ok: false,
            status: 409,
            message: "This appointment's scheduled time has already passed. Unconfirmed bookings are automatically cancelled by the system — no further action is needed.",
          };
        }
        if (!bypassPatientCancelHours && hoursBeforeStart !== null && hoursBeforeStart < PATIENT_CANCEL_MIN_HOURS) {
          return {
            ok: false,
            status: 409,
            message: `Patients cannot cancel within ${PATIENT_CANCEL_MIN_HOURS} hours of the appointment. Please contact the provider.`,
          };
        }
        toStatus = "cancelled_by_patient";
      } else if (actorRole === "provider") {
        toStatus = "cancelled_by_provider";
      } else {
        toStatus = "cancelled_by_provider"; // admin acts on provider side
      }
      break;
    }
    case "reschedule": {
      if (actorRole === "patient") {
        if (hoursBeforeStart !== null && hoursBeforeStart < PATIENT_RESCHEDULE_MIN_HOURS) {
          return {
            ok: false,
            status: 409,
            message: `Patients cannot reschedule within ${PATIENT_RESCHEDULE_MIN_HOURS} hours of the appointment.`,
          };
        }
        toStatus = "reschedule_requested";
      } else {
        toStatus = "rescheduled";
      }
      break;
    }
    case "no_show": {
      if (actorRole === "patient") {
        return { ok: false, status: 403, message: "Only providers or admins can mark a no-show." };
      }
      if (hoursBeforeStart !== null && hoursBeforeStart > 0) {
        return {
          ok: false,
          status: 409,
          message: "Cannot mark no-show before the appointment time.",
        };
      }
      toStatus = "no_show";
      break;
    }
    case "propose": {
      if (actorRole === "patient") {
        return { ok: false, status: 403, message: "Only providers or admins can propose a new time." };
      }
      if (!["confirmed", "rescheduled", "approved"].includes(currentStatus)) {
        return {
          ok: false,
          status: 409,
          message: "A new time can only be proposed for approved or confirmed appointments.",
        };
      }
      toStatus = "reschedule_proposed";
      break;
    }
    default:
      return { ok: false, status: 400, message: "Unknown action." };
  }

  if (actorRole !== "admin" && !canTransition(currentStatus, toStatus)) {
    return {
      ok: false,
      status: 409,
      message: `Cannot ${action} an appointment in '${currentStatus}' state.`,
    };
  }

  return { ok: true, status: 200, toStatus };
}
