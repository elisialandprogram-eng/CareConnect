import {
  type AppointmentStatus,
  canTransition,
  isTerminalStatus,
} from "./appointmentStatus";

export type AppointmentAction = "cancel" | "reschedule" | "no_show";
export type ActorRole = "patient" | "provider" | "admin";

export const APPOINTMENT_ACTIONS: AppointmentAction[] = [
  "cancel",
  "reschedule",
  "no_show",
];

export const REASON_CODES: Record<AppointmentAction, string[]> = {
  cancel: [
    "schedule_conflict",
    "feeling_better",
    "found_alternative",
    "financial",
    "personal",
    "other",
  ],
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
};

export const PATIENT_CANCEL_MIN_HOURS = 2;
export const PATIENT_RESCHEDULE_MIN_HOURS = 2;
export const FULL_REFUND_HOURS = 24;
export const PARTIAL_REFUND_PERCENT = 0.5;

export function getAppointmentStartDate(date: string, startTime: string): Date | null {
  if (!date || !startTime) return null;
  const dateOnly = String(date).slice(0, 10);
  const parsed = new Date(`${dateOnly}T${startTime}:00`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function hoursUntilStart(date: string, startTime: string, now: Date = new Date()): number | null {
  const start = getAppointmentStartDate(date, startTime);
  if (!start) return null;
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export interface RefundQuote {
  amount: number;
  policy: "full" | "partial" | "none" | "provider_full" | "no_show_none";
  reason: string;
  hoursBeforeStart: number | null;
}

export function quoteRefund(opts: {
  action: AppointmentAction;
  actorRole: ActorRole;
  totalPaid: number;
  hoursBeforeStart: number | null;
}): RefundQuote {
  const { action, actorRole, totalPaid, hoursBeforeStart } = opts;
  const paid = Math.max(0, Number(totalPaid) || 0);

  if (action === "no_show") {
    return { amount: 0, policy: "no_show_none", reason: "No-show — no refund issued.", hoursBeforeStart };
  }

  if (action === "reschedule") {
    return { amount: 0, policy: "none", reason: "No refund — funds carry to the new slot.", hoursBeforeStart };
  }

  // cancel
  if (actorRole === "provider" || actorRole === "admin") {
    return {
      amount: paid,
      policy: "provider_full",
      reason: "Full refund — cancellation by provider/admin.",
      hoursBeforeStart,
    };
  }

  // patient cancel — time-based policy
  if (hoursBeforeStart === null) {
    return { amount: 0, policy: "none", reason: "Cannot determine appointment time.", hoursBeforeStart };
  }
  if (hoursBeforeStart >= FULL_REFUND_HOURS) {
    return { amount: paid, policy: "full", reason: `Cancelled more than ${FULL_REFUND_HOURS}h in advance — full refund.`, hoursBeforeStart };
  }
  if (hoursBeforeStart >= PATIENT_CANCEL_MIN_HOURS) {
    return {
      amount: Math.round(paid * PARTIAL_REFUND_PERCENT * 100) / 100,
      policy: "partial",
      reason: `Cancelled within ${FULL_REFUND_HOURS}h — ${PARTIAL_REFUND_PERCENT * 100}% refund.`,
      hoursBeforeStart,
    };
  }
  return {
    amount: 0,
    policy: "none",
    reason: `Cancellations within ${PATIENT_CANCEL_MIN_HOURS}h of start are not refundable.`,
    hoursBeforeStart,
  };
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
}): ActionPermitResult {
  const { action, actorRole, currentStatus, hoursBeforeStart, ownsAppointment } = opts;

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
        if (hoursBeforeStart !== null && hoursBeforeStart < PATIENT_CANCEL_MIN_HOURS) {
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
