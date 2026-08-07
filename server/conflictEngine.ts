/**
 * Appointment Conflict Engine
 *
 * Checks whether a requested time slot is available for a given provider /
 * practitioner by inspecting three sources:
 *   1. Confirmed appointments (with per-visit-type buffer windows)
 *   2. Manual provider blocks (vacation, leave, breaks)
 *   3. Active slot holds (10-minute checkout reservations)
 *
 * Also validates home-visit travel feasibility when consecutive home
 * appointments are too far apart to travel between them.
 */

import { pool } from "./db";

// Appointment statuses that count as "occupying" time.
export const BLOCKING_STATUSES = [
  "pending",
  "approved",
  "confirmed",
  "in_progress",
] as const;

export interface BufferSettings {
  clinicBufferBefore: number;
  clinicBufferAfter: number;
  homeBufferBefore: number;
  homeBufferAfter: number;
  onlineBufferBefore: number;
  onlineBufferAfter: number;
  travelRadiusKm: number;
}

export interface ConflictCheckParams {
  providerId: string;
  practitionerId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  visitType: "clinic" | "home" | "online";
  patientLatitude?: number | null;
  patientLongitude?: number | null;
  excludeAppointmentId?: string;
  excludeHoldId?: string;
  /**
   * Exclude ALL active holds belonging to this patient.
   * A patient's own hold must never block their own booking — the hold exists
   * to prevent OTHER patients from taking the slot while they are in checkout.
   */
  excludePatientId?: string;
  /** Per-service buffer (minutes) applied before the slot. */
  serviceBufferBefore?: number;
  /** Per-service buffer (minutes) applied after the slot. */
  serviceBufferAfter?: number;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictType?: "appointment" | "manual_block" | "slot_hold" | "travel_distance";
  conflictId?: string;
  message: string;
  effectiveStart?: string;
  effectiveEnd?: string;
}

export interface ConflictReport {
  checked: ConflictCheckParams;
  buffers: BufferSettings;
  result: ConflictResult;
  checkedAt: string;
}

// ── Utility helpers ────────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Haversine distance in kilometres between two lat/lon pairs.
 */
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ── Buffer settings lookup ─────────────────────────────────────────────────────

export async function getBufferSettings(
  providerId: string,
  practitionerId?: string | null,
): Promise<BufferSettings> {
  let row: any = null;

  if (practitionerId) {
    const r = await pool.query(
      `SELECT * FROM provider_buffer_settings
       WHERE provider_id = $1 AND practitioner_id = $2
       LIMIT 1`,
      [providerId, practitionerId],
    );
    row = r.rows[0] ?? null;
  }

  if (!row) {
    const r = await pool.query(
      `SELECT * FROM provider_buffer_settings
       WHERE provider_id = $1 AND practitioner_id IS NULL
       LIMIT 1`,
      [providerId],
    );
    row = r.rows[0] ?? null;
  }

  return {
    clinicBufferBefore: row?.clinic_buffer_before ?? 0,
    clinicBufferAfter: row?.clinic_buffer_after ?? 0,
    homeBufferBefore: row?.home_buffer_before ?? 15,
    homeBufferAfter: row?.home_buffer_after ?? 15,
    onlineBufferBefore: row?.online_buffer_before ?? 0,
    onlineBufferAfter: row?.online_buffer_after ?? 0,
    travelRadiusKm: parseFloat(row?.travel_radius_km ?? "0"),
  };
}

// ── Effective window calculation ───────────────────────────────────────────────

export function effectiveWindow(
  date: string,
  startTime: string,
  endTime: string,
  visitType: "clinic" | "home" | "online",
  buffers: BufferSettings,
  serviceBufferBefore = 0,
  serviceBufferAfter = 0,
): { effectiveStart: number; effectiveEnd: number } {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);

  const providerBefore =
    visitType === "home"
      ? buffers.homeBufferBefore
      : visitType === "online"
        ? buffers.onlineBufferBefore
        : buffers.clinicBufferBefore;
  const providerAfter =
    visitType === "home"
      ? buffers.homeBufferAfter
      : visitType === "online"
        ? buffers.onlineBufferAfter
        : buffers.clinicBufferAfter;

  const bufferBefore = Math.max(providerBefore, serviceBufferBefore);
  const bufferAfter = Math.max(providerAfter, serviceBufferAfter);

  return {
    effectiveStart: startMins - bufferBefore,
    effectiveEnd: endMins + bufferAfter,
  };
}

// ── Core conflict check ────────────────────────────────────────────────────────

export async function checkConflict(
  params: ConflictCheckParams,
): Promise<ConflictReport> {
  const {
    providerId,
    practitionerId,
    date,
    startTime,
    endTime,
    visitType,
    patientLatitude,
    patientLongitude,
    excludeAppointmentId,
    excludeHoldId,
    excludePatientId,
    serviceBufferBefore = 0,
    serviceBufferAfter = 0,
  } = params;

  const buffers = await getBufferSettings(providerId, practitionerId);

  const { effectiveStart, effectiveEnd } = effectiveWindow(
    date, startTime, endTime, visitType as any, buffers,
    serviceBufferBefore, serviceBufferAfter,
  );

  const effectiveStartTime = minutesToTime(Math.max(effectiveStart, 0));
  const effectiveEndTime = minutesToTime(effectiveEnd);

  // ── 1. Check existing appointments ─────────────────────────────────────────
  {
    const placeholders: any[] = [
      providerId,
      date,
      BLOCKING_STATUSES,
    ];
    let practitionerClause = "";
    if (practitionerId) {
      practitionerClause = `AND (practitioner_id = $${placeholders.length + 1} OR practitioner_id IS NULL)`;
      placeholders.push(practitionerId);
    }
    const excludeClause = excludeAppointmentId
      ? `AND a.id != $${placeholders.length + 1}`
      : "";
    if (excludeAppointmentId) placeholders.push(excludeAppointmentId);

    const apptResult = await pool.query(
      `SELECT a.id, a.start_time, a.end_time, a.visit_type, a.patient_latitude, a.patient_longitude,
              COALESCE(s.buffer_before, 0) AS svc_buf_before,
              COALESCE(s.buffer_after,  0) AS svc_buf_after
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.provider_id = $1
         AND a.date = $2
         AND a.status = ANY($3::appointment_status[])
         ${practitionerClause}
         ${excludeClause}`,
      placeholders,
    );

    for (const row of apptResult.rows) {
      const existingVT = (row.visit_type === "home" ? "home" : "clinic") as "clinic" | "home";
      // Include the existing appointment's own service buffers so buffer-zone
      // collisions on both sides are caught (not just the new appointment's buffers).
      const existing = effectiveWindow(
        date, row.start_time, row.end_time, existingVT, buffers,
        Number(row.svc_buf_before ?? 0), Number(row.svc_buf_after ?? 0),
      );

      const overlaps =
        effectiveStart < existing.effectiveEnd &&
        effectiveEnd > existing.effectiveStart;

      if (overlaps) {
        return {
          checked: params,
          buffers,
          result: {
            hasConflict: true,
            conflictType: "appointment",
            conflictId: row.id,
            message: `Time slot overlaps with an existing appointment (effective window ${minutesToTime(existing.effectiveStart)}–${minutesToTime(existing.effectiveEnd)}).`,
            effectiveStart: effectiveStartTime,
            effectiveEnd: effectiveEndTime,
          },
          checkedAt: new Date().toISOString(),
        };
      }

      // Travel distance check for consecutive home visits
      if (
        visitType === "home" &&
        existingVT === "home" &&
        patientLatitude != null &&
        patientLongitude != null &&
        row.patient_latitude != null &&
        row.patient_longitude != null &&
        buffers.travelRadiusKm > 0
      ) {
        const distKm = haversineKm(
          patientLatitude, patientLongitude,
          parseFloat(row.patient_latitude), parseFloat(row.patient_longitude),
        );
        if (distKm > buffers.travelRadiusKm) {
          return {
            checked: params,
            buffers,
            result: {
              hasConflict: true,
              conflictType: "travel_distance",
              conflictId: row.id,
              message: `Travel distance to this home visit (${distKm.toFixed(1)} km) exceeds the provider's travel radius (${buffers.travelRadiusKm} km).`,
              effectiveStart: effectiveStartTime,
              effectiveEnd: effectiveEndTime,
            },
            checkedAt: new Date().toISOString(),
          };
        }
      }
    }
  }

  // ── 2. Check manual provider blocks ────────────────────────────────────────
  {
    // Pass ISO strings directly so Postgres compares TIMESTAMP ↔ TIMESTAMP
    // without any JS-side timezone conversion.  Using new Date() here would
    // coerce the string into UTC, which drifts by up to ±14 h from whatever
    // local time the block was entered as (DST risk).
    const requestStartStr = `${date}T${startTime}:00`;
    const requestEndStr = `${date}T${endTime}:00`;

    const placeholders: any[] = [providerId, requestStartStr, requestEndStr];
    let practitionerClause = "";
    if (practitionerId) {
      practitionerClause = `AND (practitioner_id = $${placeholders.length + 1} OR practitioner_id IS NULL)`;
      placeholders.push(practitionerId);
    }

    const blockResult = await pool.query(
      `SELECT id, block_type, reason, start_datetime, end_datetime
       FROM provider_blocks
       WHERE provider_id = $1
         AND start_datetime < $3
         AND end_datetime > $2
         ${practitionerClause}`,
      placeholders,
    );

    if (blockResult.rows.length > 0) {
      const block = blockResult.rows[0];
      return {
        checked: params,
        buffers,
        result: {
          hasConflict: true,
          conflictType: "manual_block",
          conflictId: block.id,
          message: `Provider is blocked during this time (${block.block_type}${block.reason ? `: ${block.reason}` : ""}).`,
          effectiveStart: effectiveStartTime,
          effectiveEnd: effectiveEndTime,
        },
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // ── 3. Check active slot holds ──────────────────────────────────────────────
  {
    const placeholders: any[] = [providerId, date, new Date()];
    let practitionerClause = "";
    if (practitionerId) {
      practitionerClause = `AND (practitioner_id = $${placeholders.length + 1} OR practitioner_id IS NULL)`;
      placeholders.push(practitionerId);
    }
    // Build exclusion clause: skip holds by specific ID and/or by patient owner.
    // A patient's own hold must NEVER block their own booking — the hold exists
    // to keep the slot reserved FOR them, not to block them.
    const excludeClauses: string[] = [];
    if (excludeHoldId) {
      excludeClauses.push(`id != $${placeholders.length + 1}`);
      placeholders.push(excludeHoldId);
    }
    if (excludePatientId) {
      excludeClauses.push(`patient_id != $${placeholders.length + 1}`);
      placeholders.push(excludePatientId);
    }
    const excludeClause = excludeClauses.length > 0
      ? `AND ${excludeClauses.join(" AND ")}`
      : "";

    const holdResult = await pool.query(
      `SELECT id, start_time, end_time, patient_id
       FROM appointment_slot_holds
       WHERE provider_id = $1
         AND date = $2
         AND expires_at > $3
         ${practitionerClause}
         ${excludeClause}`,
      placeholders,
    );

    for (const row of holdResult.rows) {
      const holdStartMins = timeToMinutes(row.start_time);
      const holdEndMins = timeToMinutes(row.end_time);

      const overlaps =
        effectiveStart < holdEndMins && effectiveEnd > holdStartMins;

      if (overlaps) {
        return {
          checked: params,
          buffers,
          result: {
            hasConflict: true,
            conflictType: "slot_hold",
            conflictId: row.id,
            message: "This slot is temporarily reserved by another patient. Please try again shortly.",
            effectiveStart: effectiveStartTime,
            effectiveEnd: effectiveEndTime,
          },
          checkedAt: new Date().toISOString(),
        };
      }
    }
  }

  return {
    checked: params,
    buffers,
    result: {
      hasConflict: false,
      message: "No conflict detected.",
      effectiveStart: effectiveStartTime,
      effectiveEnd: effectiveEndTime,
    },
    checkedAt: new Date().toISOString(),
  };
}
