# Communication Hub Forensic Audit, Hardening & Completion Sprint
**Date:** 2026-06-12  
**Status:** COMPLETE

---

## Audit Findings & Resolutions

### SECURITY (Critical — all resolved)

| ID | Finding | File | Fix Applied |
|----|---------|------|-------------|
| S1 | WS `message` handler — no participant validation. Any authenticated user could inject messages into any conversation by knowing its ID. | `server/chat/ws.ts` | Added `isParticipant()` check at top of handler; 403 WS error + socket close on failure. |
| S2 | WS `typing` handler — same zero-validation path. | `server/chat/ws.ts` | Same `isParticipant()` guard added. |
| S3 | WS `read` handler — no participant validation + self-marking bug: `UPDATE … WHERE sender_id != userId` was missing the `ne()` clause so a user could mark their own outbound messages as read. | `server/chat/ws.ts` | Participant check added; Drizzle `ne(messages.senderId, ws.userId)` filter corrected. |

### LOGIC BUGS (all resolved)

| ID | Finding | File | Fix Applied |
|----|---------|------|-------------|
| L1 | `RichConv` type in `ChatBox.tsx` was missing `lockedAt` field → locked conversations never rendered the locked banner or disabled the input. | `client/src/components/chat/ChatBox.tsx` | Added `lockedAt` to `RichConv`; added `isConvLocked()` helper; locked banner replaces textarea when locked. |
| L2 | ChatBox handled WS `error` events with a generic `showErrorModal()` regardless of error code — `CONVERSATION_LOCKED` produced a modal instead of a contextual toast. | `client/src/components/chat/ChatBox.tsx` | Added explicit `CONVERSATION_LOCKED` branch → toast only; all other errors fall through to generic modal. |
| L3 | `getOrCreateRealtimeConversation()` only stored the *first* appointment ID for a patient–provider pair. Subsequent appointments were invisible in conversation context. | `server/storage/database-storage.ts` | Changed from conditional `if (!existing.appointmentId)` to unconditional `UPDATE SET appointment_id = $latest` on every call so the context always reflects the most-recent appointment. |
| L4 | `POST /api/chat/messages` loaded ALL conversations for the user via `getRealtimeConversations()` then filtered in JS — O(n) on conversation count, degrades with volume. | `server/routes/communication.routes.ts` | Replaced with a direct single-row `SELECT … WHERE id = $1` Drizzle query; O(1). |

### MISSING FEATURES (all implemented)

| ID | Feature | Files Changed | Notes |
|----|---------|--------------|-------|
| M1 | Message editing with full audit trail | `shared/schema.ts`, `server/db.ts`, `server/storage/database-storage.ts`, `server/routes/communication.routes.ts`, `client/src/components/chat/ChatBox.tsx`, `client/src/pages/messages.tsx` | See "New Capabilities" section below. |
| M2 | `message_edited` WS event emission + client handling | `server/chat/ws.ts`, `server/routes/communication.routes.ts`, `client/src/components/chat/ChatBox.tsx`, `client/src/pages/messages.tsx` | Broadcast fires on successful HTTP edit; both clients handle the event with cache invalidation. |

### ARCHITECTURE NOTE

| ID | Finding | Action |
|----|---------|--------|
| A1 | Three chat table sets in schema (`chatConversations`, `conversations`, `realtimeConversations`). Only `realtimeConversations` is active. | Existing comments clarified; no code change needed — dead tables do not affect runtime. |
| A2 | Dual WS connection when `/messages` page is open with a ChatBox widget: both components independently connect to `/ws/chat`. | Documented as **tech debt** — acceptable for now, not harmful, but means each user generates two WS sessions when on the messages page. Targeted for a future WS singleton refactor. |

---

## New Capabilities

### Schema additions (`shared/schema.ts` + migration `server/db.ts` Phase C22)

```sql
-- Two new columns on realtime_messages
ALTER TABLE realtime_messages
  ADD COLUMN IF NOT EXISTS is_edited  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ;

-- Full audit table for every edit
CREATE TABLE IF NOT EXISTS message_edit_history (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id      TEXT NOT NULL REFERENCES realtime_messages(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  edited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_by       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meh_message_id ON message_edit_history(message_id);
```

### New HTTP endpoints (`server/routes/communication.routes.ts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PATCH` | `/api/chat/messages/:id` | Patient or Provider | Edit a message. Requires ownership. Blocked if conversation is locked. Saves previous content to `message_edit_history`. Broadcasts `message_edited` WS event to all conversation participants. |
| `GET` | `/api/chat/messages/:id/history` | Patient or Provider | Returns full edit history for a message. Requires conversation participant. |

### WS event: `edit_message` (client → server)

```json
{ "type": "edit_message", "messageId": "…", "content": "new text" }
```

Server validates: ownership, conversation participant, conversation not locked. On success emits `message_edited` to all sockets in the conversation room.

### Client edit UX (both `ChatBox.tsx` and `messages.tsx`)

- Pencil icon appears on hover over **own** text-only messages in non-locked conversations.
- Clicking enters inline-edit mode: the bubble is replaced with an Input + Save + Cancel.
- `Enter` submits, `Escape` cancels.
- On success the message bubble shows a small **pencil + "edited"** indicator next to the timestamp.
- Locked conversations suppress the edit button entirely and show a lock banner in place of the send input.

---

## Storage methods added (`server/storage/database-storage.ts`)

- `editRealtimeMessage(messageId, senderId, content)` — ownership + lock check, writes history, updates message.
- `getMessageEditHistory(messageId, requesterId)` — participant check, returns history rows newest-first.

---

## Files Modified

| File | Change Type |
|------|-------------|
| `server/chat/ws.ts` | Security hardening (S1/S2/S3) + `edit_message` WS handler |
| `shared/schema.ts` | `isEdited`/`editedAt` columns + `messageEditHistory` table |
| `server/db.ts` | Phase C22 migration block |
| `server/storage/database-storage.ts` | `editRealtimeMessage`, `getMessageEditHistory`, `getOrCreateRealtimeConversation` fix |
| `server/routes/communication.routes.ts` | POST optimisation, PATCH edit endpoint, GET history endpoint |
| `client/src/components/chat/ChatBox.tsx` | L1/L2 fixes, edit UI, `message_edited` WS handler |
| `client/src/pages/messages.tsx` | Edit state/mutation, edit UI, `message_edited` WS handler |

---

## Pre-existing Issue (not in scope)

- `GET /api/provider/my-categories 500` — `provider_category_permissions.category_id` column does not exist (DB has `category` not `category_id`). This is a Drizzle schema vs Supabase column name mismatch unrelated to the communication domain. Needs a separate fix.
