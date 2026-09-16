---
name: Direct chat eligibility
description: Patient-provider chat access is tied to an upcoming or ongoing appointment, while support conversations remain unrestricted.
---

Patient-provider direct chat must require at least one related appointment in an upcoming or in-progress state. Enforce this in conversation listing, conversation creation, message retrieval, REST sends, and WebSocket sends; do not apply the restriction to admin/support conversations.

**Why:** Conversation rows persist after an appointment ends, so UI-only hiding or lock timestamps alone can leave stale direct-chat paths available or prevent a new appointment from reopening the channel.

**How to apply:** Use the shared chat-access check for both client and provider paths. When a new appointment reuses an older patient-provider conversation, update its appointment context and clear the old lock.