/**
 * Appointment status state machine.
 *
 * Canonical lifecycle:
 *   pending → approved → confirmed → in_progress → completed
 *
 * Side branches at any non-terminal point: cancelled, cancelled_by_patient,
 * cancelled_by_provider, rejected, no_show, expired, reschedule_requested,
 * reschedule_proposed, rescheduled.
 *
 * Terminal states cannot transition anywhere.
 */

export type AppointmentStatus =
  | "pending"
  | "approved"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "cancelled_by_patient"
  | "cancelled_by_provider"
  | "rejected"
  | "rescheduled"
  | "reschedule_requested"
  | "reschedule_proposed"
  | "no_show"
  | "expired";

const TERMINAL_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  "completed",
  "cancelled",
  "cancelled_by_patient",
  "cancelled_by_provider",
  "rejected",
  "expired",
  "no_show",
]);

const CANCEL_LIKE: AppointmentStatus[] = [
  "cancelled",
  "cancelled_by_patient",
  "cancelled_by_provider",
  "rejected",
  "expired",
  "no_show",
];

const RESCHEDULE_BRANCH: AppointmentStatus[] = [
  "reschedule_requested",
  "reschedule_proposed",
  "rescheduled",
];

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["approved", "confirmed", ...CANCEL_LIKE, ...RESCHEDULE_BRANCH],
  approved: ["confirmed", "in_progress", ...CANCEL_LIKE, ...RESCHEDULE_BRANCH],
  confirmed: ["in_progress", "completed", ...CANCEL_LIKE, ...RESCHEDULE_BRANCH],
  in_progress: ["completed", "cancelled", "cancelled_by_provider", "no_show"],
  rescheduled: ["approved", "confirmed", "in_progress", ...CANCEL_LIKE],
  reschedule_requested: ["reschedule_proposed", "rescheduled", "confirmed", ...CANCEL_LIKE],
  reschedule_proposed: ["rescheduled", "confirmed", ...CANCEL_LIKE],
  // Terminal — no transitions out
  completed: [],
  cancelled: [],
  cancelled_by_patient: [],
  cancelled_by_provider: [],
  rejected: [],
  expired: [],
  no_show: [],
};

export function isTerminalStatus(s: string): boolean {
  return TERMINAL_STATUSES.has(s as AppointmentStatus);
}

/**
 * Returns true when `next` is a legal transition from `current`.
 * Self-transitions are rejected to avoid no-op writes.
 */
export function canTransition(current: string, next: string): boolean {
  if (current === next) return false;
  const allowed = TRANSITIONS[current as AppointmentStatus];
  if (!allowed) return false;
  return allowed.includes(next as AppointmentStatus);
}

/**
 * Returns the list of statuses an appointment in `current` may move to.
 * Useful for the UI to disable invalid options.
 */
export function nextStatusesFor(current: string): AppointmentStatus[] {
  return TRANSITIONS[current as AppointmentStatus] ?? [];
}
