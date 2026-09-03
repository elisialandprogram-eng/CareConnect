/**
 * Regression tests for consecutive home-visit travel validation.
 *
 * Run: npx tsx server/tests/conflict-engine-travel.test.ts
 */

import assert from "node:assert/strict";
import {
  findTravelDistanceConflict,
  type BookedAppointmentWindow,
} from "../conflictEngine";

const nearby = { patientLatitude: 47.4979, patientLongitude: 19.0402 };
const farAway = { patientLatitude: 48.8566, patientLongitude: 2.3522 };

function addMinutes(startTime: string, minutes: number): string {
  const [hours, mins] = startTime.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function appointment(
  id: string,
  startTime: string,
  visitType: "clinic" | "home" | "online",
  location?: { patientLatitude: number; patientLongitude: number },
): BookedAppointmentWindow {
  return {
    id,
    startTime,
    endTime: addMinutes(startTime, 30),
    visitType,
    patientLatitude: location?.patientLatitude ?? null,
    patientLongitude: location?.patientLongitude ?? null,
    serviceBufferBefore: 0,
    serviceBufferAfter: 0,
  };
}

const candidate = {
  startTime: "13:00",
  visitType: "home" as const,
  ...nearby,
};

const homeHomeClinicHome = [
  appointment("home-1", "09:00", "home", farAway),
  appointment("home-2", "10:00", "home", farAway),
  appointment("clinic", "11:00", "clinic"),
];

assert.equal(
  findTravelDistanceConflict(candidate, homeHomeClinicHome, 10),
  null,
  "a clinic between home visits must break the home-to-home travel check",
);

const consecutiveHome = [
  appointment("home-1", "09:00", "home", farAway),
  appointment("home-2", "10:00", "home", farAway),
];

const conflict = findTravelDistanceConflict(candidate, consecutiveHome, 10);
assert.equal(conflict?.appointment.id, "home-2");
assert.equal(conflict?.direction, "before");
assert.ok((conflict?.distanceKm ?? 0) > 10);

assert.equal(
  findTravelDistanceConflict(
    { ...candidate, visitType: "clinic" },
    consecutiveHome,
    10,
  ),
  null,
  "clinic visits must never trigger home travel validation",
);

console.log("✅ conflict-engine travel regression tests passed");