---
name: Location-aware slot windows
description: The invariant that keeps clinic, home, and online availability consistent across the booking lifecycle.
---

## Rule

Every availability, hold, booking, and rescheduling decision must calculate the requested window and every existing appointment/hold with that item's own visit type and service-level buffers. A slot held for one visit type must not be reused after the patient changes visit type without selecting a fresh slot. Home-visit travel distance must be checked only against the immediately adjacent appointment in the provider's complete schedule; a clinic or online visit breaks the home-to-home route.

**Why:** a plain start/end-only availability query cannot distinguish clinic, home, and online buffers. It then shows slots that checkout rejects (or allows adjacent slots that should be protected by a home-visit travel buffer). Comparing a new home visit with every earlier home visit also falsely rejects valid schedules when a non-home visit separates them.

**How to apply:** keep appointment and hold loading rich enough to include `visit_type` and service buffers; use one effective-window implementation for both the picker and conflict checks; invalidate the selected slot and release its hold when visit type changes during checkout; select travel neighbors after ordering all active appointments by start time.