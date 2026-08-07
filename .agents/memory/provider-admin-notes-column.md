---
name: provider_admin_notes column drift
description: Supabase table uses "note" (NOT NULL); code was written expecting "content"; fix pattern for GET/POST/PATCH
---

## Rule
`provider_admin_notes` in Supabase has column `note TEXT NOT NULL`.  
Code was later written expecting `content` — causing POST 500 (`null value in column "note" violates not-null constraint`).

## How to apply
- **GET:** use `COALESCE(n.note, n.content) AS note_text` to handle both environments
- **INSERT:** `INSERT INTO provider_admin_notes (provider_id, admin_id, note) VALUES ($1, $2, $3)`
- **UPDATE:** `SET note = $N` not `content = $N`
- **Audit log INSERT** inside the POST handler must use `.catch(() => {})` — if `audit_logs` enum is missing the action value, the catch prevents cascading the audit failure into a notes-save failure
- **db.ts ALTER TABLE guards** added `content TEXT` as a nullable companion column — it is an orphan and can be dropped in a future migration

**Why:** The table was originally created in a different session with the column named `note`. A later refactor renamed it to `content` in code but never renamed the actual DB column.
