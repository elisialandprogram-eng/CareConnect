---
name: Slot-hold self-blocking bug
description: The conflict engine blocked patients from booking their own reserved slot; root cause and all 3 fix locations.
---

## The Bug

`POST /api/appointments` always returned 409 "This slot is temporarily reserved by another patient."

**Flow:**
1. Patient clicks a slot → `POST /api/slot-holds` → 201 → `appointment_slot_holds` row inserted with `patient_id = userId`
2. Patient fills details, clicks Confirm → `POST /api/appointments`
3. `checkConflict()` is called — but `excludePatientId` is **not passed**
4. Conflict engine queries ALL active holds for that slot+provider+date — finds the patient's own hold
5. Returns `conflictType: "slot_hold"` / `hasConflict: true` → caller returns 409

**Why it's wrong:** A slot hold is designed to block OTHER patients from stealing the slot during checkout. It should NEVER block the holder themselves.

## The Fix

Added `excludePatientId?: string` to `ConflictCheckParams` in `server/conflictEngine.ts`. In the slot-hold SQL query:

```sql
-- Old: only excluded by hold ID
AND id != $holdId

-- New: also excludes all holds owned by the booking patient
AND id != $holdId AND patient_id != $patientId
```

### All 3 call sites that need `excludePatientId: userId`:

1. `server/routes/appointment.routes.ts` — main booking conflict check (Phase after time-off check)
2. `server/routes/appointment.routes.ts` — multi-session extra-slot conflict check (inside `additionalSlots` loop)
3. `server/routes/appointment-waitlist.routes.ts` — `POST /api/slot-holds` pre-conflict check (so re-selecting the same slot after navigating back doesn't fail)

**How to apply:** Any future `checkConflict()` call that is made on behalf of a specific patient booking should pass `excludePatientId: userId`. Calls made for admin/provider purposes (e.g. checking if a slot is free for any patient) should NOT pass this param.
