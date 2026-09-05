---
name: Modality-aware scheduling
description: Provider time slots preserve clinic/home/online schedule provenance while shared slots remain reusable.
---

Provider schedule templates and generated time slots use canonical modality values `clinic`, `home`, and `online`; null means shared capacity. Availability may use shared slots for any supported visit type, but modality-specific slots must be filtered and regenerated independently.

**Why:** A single provider/date/start uniqueness key and all-or-nothing slot regeneration caused one visit-mode schedule to erase or hide another mode.

**How to apply:** Any new slot generator, bulk operation, reservation query, or schedule edit must preserve modality, scope deletions to the edited modality, and keep effective buffers inside provider/service windows.