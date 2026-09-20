---
name: Provider document expiry column
description: The two date fields used by provider document compliance queries.
---

`provider_documents` does not have an `expires_at` column. Its planned document expiry is stored as `expiry_date` text, while `expired_at` is the separate timestamp used for expiry processing.

**Why:** A compliance analytics query using the generic `expires_at` name failed at runtime because the provider-document schema predates that convention.

**How to apply:** Use `NULLIF(expiry_date, '')::date` for reporting windows and reserve `expired_at` for the processing/status timestamp.