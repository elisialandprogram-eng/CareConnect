import { pool } from "../db";
import { storage } from "../storage";
import {
  checkConflict,
  effectiveWindow,
  getBufferSettings,
} from "../conflictEngine";
import { localToUTC, getProviderTimezone } from "./tzUtils";
import { normalizeVisitType, supportsVisitType } from "./visitType";

type VisitType = "clinic" | "home" | "online";

export interface RescheduleSlotRequest {
  providerId: string;
  serviceId?: string | null;
  practitionerId?: string | null;
  patientId?: string | null;
  excludeAppointmentId?: string;
  date: string;
  startTime: string;
  endTime: string;
  visitType?: string | null;
  patientLatitude?: number | null;
  patientLongitude?: number | null;
}

export interface RescheduleSlotValidation {
  ok: boolean;
  status: number;
  message?: string;
}

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function normalizeTime(value: unknown): string {
  return String(value ?? "").slice(0, 5);
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

async function getScheduleWindows(
  provider: any,
  providerId: string,
  date: string,
  visitType: VisitType,
): Promise<{ start: string; end: string }[]> {
  try {
    const result = await pool.query<{ start_time: string; end_time: string }>(
      `SELECT start_time, end_time
         FROM provider_schedule_templates
        WHERE provider_id = $1
          AND day_of_week = $2
          AND is_active = TRUE
          AND (modality IS NULL OR modality = $3)
        ORDER BY start_time`,
      [providerId, dayOfWeek(date), visitType],
    );
    if (result.rows.length > 0) {
      return result.rows.map(row => ({
        start: normalizeTime(row.start_time),
        end: normalizeTime(row.end_time),
      }));
    }
  } catch (error: any) {
    const pgCode = error?.code ?? error?.cause?.code;
    if (pgCode !== "42703") throw error;
  }

  const officeHours = await storage.getProviderOfficeHours(provider.userId);
  if (!officeHours?.weeklySchedule) return [];

  let weekly: Record<string, any>;
  try {
    weekly = typeof officeHours.weeklySchedule === "string"
      ? JSON.parse(officeHours.weeklySchedule)
      : officeHours.weeklySchedule;
  } catch {
    return [];
  }

  const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayOfWeek(date)];
  const day = weekly?.[key];
  if (!day?.enabled || !day.start || !day.end) return [];
  return Array.isArray(day.windows) && day.windows.length > 0
    ? day.windows.map((window: any) => ({
        start: normalizeTime(window.start),
        end: normalizeTime(window.end),
      }))
    : [{ start: normalizeTime(day.start), end: normalizeTime(day.end) }];
}

async function intersectPractitionerWindows(
  windows: { start: string; end: string }[],
  practitionerId: string | null | undefined,
  date: string,
): Promise<{ start: string; end: string }[]> {
  if (!practitionerId) return windows;
  const schedule = await storage.getPractitionerSchedule(practitionerId);
  if (!schedule?.weeklySchedule) return windows;

  const weekly = typeof schedule.weeklySchedule === "string"
    ? JSON.parse(schedule.weeklySchedule)
    : schedule.weeklySchedule;
  const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayOfWeek(date)];
  const day = weekly?.[key];
  if (!day?.enabled) return [];
  const practitionerWindows = Array.isArray(day.windows) && day.windows.length > 0
    ? day.windows
    : [{ start: day.start, end: day.end }];

  const result: { start: string; end: string }[] = [];
  for (const practitionerWindow of practitionerWindows) {
    for (const providerWindow of windows) {
      const start = Math.max(
        timeToMinutes(normalizeTime(practitionerWindow.start)),
        timeToMinutes(providerWindow.start),
      );
      const end = Math.min(
        timeToMinutes(normalizeTime(practitionerWindow.end)),
        timeToMinutes(providerWindow.end),
      );
      if (start < end) {
        result.push({ start: minutesToTime(start), end: minutesToTime(end) });
      }
    }
  }
  return result;
}

function isWithinWindow(
  startTime: string,
  endTime: string,
  windows: { start: string; end: string }[],
): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return windows.some(window =>
    start >= timeToMinutes(window.start) &&
    end <= timeToMinutes(window.end),
  );
}

/**
 * Reschedules are required to use the same slot model as booking. This
 * validates the exact slot shape first, then performs a live conflict check
 * with the current appointment excluded.
 */
export async function validateRescheduleSlot(
  request: RescheduleSlotRequest,
): Promise<RescheduleSlotValidation> {
  const {
    providerId,
    serviceId,
    practitionerId,
    patientId,
    excludeAppointmentId,
    date,
    startTime,
    endTime,
  } = request;
  const visitType = normalizeVisitType(request.visitType);

  if (!DATE_RE.test(date) || !TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return { ok: false, status: 400, message: "Choose a valid date and available time slot." };
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes < 0 || endMinutes > 24 * 60 || startMinutes >= endMinutes) {
    return { ok: false, status: 400, message: "Choose a valid appointment time." };
  }

  const provider = await storage.getProvider(providerId);
  if (!provider) {
    return { ok: false, status: 404, message: "Provider not found." };
  }
  const maxDailyPatients = Number((provider as any).maxPatientsPerDay ?? 0);
  if (maxDailyPatients > 0) {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM appointments
        WHERE provider_id = $1
          AND date = $2
          AND status IN ('pending','approved','confirmed','in_progress')`,
      [providerId, date],
    );
    if (Number(countResult.rows[0]?.count ?? 0) >= maxDailyPatients) {
      return { ok: false, status: 409, message: "The provider has reached the appointment limit for the selected date." };
    }
  }

  const service = serviceId ? await storage.getService(serviceId).catch(() => null) : null;
  if (serviceId && !service) {
    return { ok: false, status: 400, message: "The appointment service is no longer available." };
  }
  if (service && !supportsVisitType((service as any).locationMode, visitType)) {
    return { ok: false, status: 400, message: "This service is not available for the selected visit type." };
  }

  const timeOff = await storage.isProviderOnTimeOff(providerId, date).catch(() => null);
  if (timeOff) {
    return { ok: false, status: 409, message: "The provider is unavailable on the selected date." };
  }

  const exception = await pool.query(
    `SELECT 1 FROM availability_exceptions WHERE provider_id = $1 AND date = $2 LIMIT 1`,
    [providerId, date],
  );
  if (exception.rows.length > 0) {
    return { ok: false, status: 409, message: "The provider is not available on the selected date." };
  }

  const providerTimezone = await getProviderTimezone(providerId, (provider as any).userId);
  const requestedUtc = localToUTC(date, startTime, providerTimezone);
  const minimumNotice = Number((provider as any).minimumNoticeMinutes ?? 60);
  const maximumBookingDays = Number((provider as any).maximumBookingDays ?? 90);
  const now = Date.now();
  if (
    Number.isNaN(requestedUtc.getTime()) ||
    requestedUtc.getTime() <= now + minimumNotice * 60_000
  ) {
    return { ok: false, status: 409, message: "Choose a future slot that meets the provider's minimum notice period." };
  }
  const dayStartUtc = localToUTC(date, "00:00", providerTimezone).getTime();
  if ((dayStartUtc - now) / 86_400_000 > maximumBookingDays) {
    return { ok: false, status: 409, message: "The selected date is outside the provider's booking window." };
  }

  const visitWindow = (service as any)?.availabilityHours?.[visitType] as
    | { start?: string; end?: string }
    | undefined;
  const serviceStart = visitWindow?.start ? timeToMinutes(normalizeTime(visitWindow.start)) : null;
  const serviceEnd = visitWindow?.end ? timeToMinutes(normalizeTime(visitWindow.end)) : null;
  if (
    (serviceStart !== null && startMinutes < serviceStart) ||
    (serviceEnd !== null && endMinutes > serviceEnd)
  ) {
    return { ok: false, status: 409, message: "The selected slot is outside this service's available hours." };
  }

  const buffers = await getBufferSettings(providerId, practitionerId ?? undefined);
  const serviceBufferBefore = Number((service as any)?.bufferBefore ?? 0);
  const serviceBufferAfter = Number((service as any)?.bufferAfter ?? 0);
  const providerBefore = visitType === "home"
    ? buffers.homeBufferBefore
    : visitType === "online" ? buffers.onlineBufferBefore : buffers.clinicBufferBefore;
  const providerAfter = visitType === "home"
    ? buffers.homeBufferAfter
    : visitType === "online" ? buffers.onlineBufferAfter : buffers.clinicBufferAfter;
  const effectiveBefore = Math.max(providerBefore, serviceBufferBefore);
  const effectiveAfter = Math.max(providerAfter, serviceBufferAfter);

  const scheduleWindows = await getScheduleWindows(provider, providerId, date, visitType);
  const intersectedWindows = await intersectPractitionerWindows(
    scheduleWindows,
    practitionerId,
    date,
  );
  const timeSlots = await storage.getTimeSlotsByProvider(providerId, date);
  const relevantSlots = timeSlots.filter(slot => {
    const modality = (slot as any).modality;
    return modality == null || normalizeVisitType(modality) === visitType;
  });
  let matchesAvailableSlot = false;

  if (timeSlots.length > 0) {
    const serviceFits = (candidateStart: number, candidateEnd: number) => {
      const window = effectiveWindow(
        date,
        minutesToTime(candidateStart),
        minutesToTime(candidateEnd),
        visitType,
        buffers,
        serviceBufferBefore,
        serviceBufferAfter,
      );
      return (
        (serviceStart === null || window.effectiveStart >= serviceStart) &&
        (serviceEnd === null || window.effectiveEnd <= serviceEnd) &&
        (intersectedWindows.length === 0 ||
          isWithinWindow(
            minutesToTime(window.effectiveStart),
            minutesToTime(window.effectiveEnd),
            intersectedWindows,
          ))
      );
    };
    matchesAvailableSlot = relevantSlots.some(slot => {
      const candidateStart = normalizeTime((slot as any).startTime);
      const candidateEnd = normalizeTime((slot as any).endTime);
      return (
        String((slot as any).date ?? "").slice(0, 10) === date &&
        candidateStart === startTime &&
        candidateEnd === endTime &&
        !((slot as any).isBlocked) &&
        serviceFits(timeToMinutes(candidateStart), timeToMinutes(candidateEnd))
      );
    });
  } else {
    if (intersectedWindows.length === 0) {
      return { ok: false, status: 409, message: "The provider has no working hours on the selected date." };
    }
    const slotMinutes = Number((service as any)?.timeSlotLength || (service as any)?.duration || 30);
    const stepMinutes = slotMinutes + effectiveAfter;
    for (const providerWindow of intersectedWindows) {
      const providerStart = timeToMinutes(providerWindow.start);
      const providerEnd = timeToMinutes(providerWindow.end);
      const candidateStart = serviceStart === null
        ? providerStart
        : Math.max(providerStart, serviceStart);
      const candidateEnd = serviceEnd === null
        ? providerEnd
        : Math.min(providerEnd, serviceEnd);
      for (let cursor = candidateStart; cursor + slotMinutes <= candidateEnd; cursor += stepMinutes) {
        if (
          cursor - effectiveBefore < providerStart ||
          cursor + slotMinutes + effectiveAfter > providerEnd
        ) {
          continue;
        }
        if (cursor === startMinutes && cursor + slotMinutes === endMinutes) {
          matchesAvailableSlot = true;
          break;
        }
      }
      if (matchesAvailableSlot) break;
    }
  }

  if (!matchesAvailableSlot) {
    return {
      ok: false,
      status: 409,
      message: "That time is no longer an available appointment slot. Please choose another slot.",
    };
  }

  try {
    const conflict = await checkConflict({
      providerId,
      practitionerId: practitionerId ?? null,
      date,
      startTime,
      endTime,
      visitType,
      patientLatitude: request.patientLatitude ?? null,
      patientLongitude: request.patientLongitude ?? null,
      excludeAppointmentId,
      excludePatientId: patientId ?? undefined,
      serviceBufferBefore,
      serviceBufferAfter,
    });
    if (conflict.result.hasConflict) {
      return {
        ok: false,
        status: 409,
        message: conflict.result.message || "That slot is no longer available.",
      };
    }
  } catch (error) {
    console.error("[reschedule] availability conflict check failed:", error);
    return {
      ok: false,
      status: 503,
      message: "Scheduling is temporarily busy. Please retry in a few moments.",
    };
  }

  return { ok: true, status: 200 };
}