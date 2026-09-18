---
name: Reschedule slot validation
description: The invariant that appointment rescheduling must use canonical available slots.
---

Rescheduling is a booking operation, not a free-form appointment edit. Direct reschedules, provider proposals, and patient acceptance of proposals must all validate the requested date/time against the provider's exact published or synthesized available slots, then perform a live conflict check with the current appointment excluded.

**Why:** Event metadata can outlive the availability state: another appointment, hold, block, travel constraint, daily cap, or minimum-notice boundary can invalidate a proposed time before it is accepted.

**How to apply:** Use the same provider/service/practitioner/visit-type inputs as booking, preserve provider timezone and UTC timestamps, and make the client choose from the availability response rather than typing arbitrary times.