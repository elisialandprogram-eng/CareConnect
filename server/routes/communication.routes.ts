/**
 * Communication routes — extracted from server/routes.ts (Sprint C5, Phase 1)
 *
 * Covers: chat conversations (rich), messaging, online-status,
 * unread counts, mute/pin, file uploads, video sessions.
 *
 * Sprint P13: Extended with appointment context, conversation locking,
 *             and a REST /api/chat/messages endpoint (fixes broken send in messages.tsx).
 */

import type { Express, Response } from "express";
import express from "express";
import { storage } from "../storage";
import { isTerminalStatus } from "../lib/appointmentStatus";
import {
  authenticateToken,
  AuthRequest,
} from "../middleware/auth";
import { isAdminRole } from "../middleware/country";
import { saveChatUpload } from "../services/uploads";
import { getOrCreateVideoSession } from "../services/video";
import { isUserOnline, pushToUser } from "../chat/ws";
import { db, pool } from "../db";
import { realtimeConversations, realtimeMessages, messageEditHistory } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

export function registerCommunicationRoutes(app: Express): void {

  app.get("/api/chat/messages/:conversationId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const msgs = await storage.getRealtimeMessages(req.params.conversationId);
      res.json(msgs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  // ── POST /api/chat/messages — REST send endpoint ──────────────────────────
  // Fixes critical bug: messages.tsx was calling this endpoint but it didn't
  // exist. WS is preferred for real-time; this REST endpoint is a reliable
  // fallback and also broadcasts the saved message to WS subscribers.
  app.post("/api/chat/messages", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { conversationId, content, attachmentUrl, attachmentType, attachmentName, voiceNoteUrl, voiceDurationSec } = req.body || {};
      if (!conversationId) return res.status(400).json({ message: "conversationId required" });
      if (!content && !attachmentUrl && !voiceNoteUrl) return res.status(400).json({ message: "content or attachment required" });

      // Verify user is a participant — direct query (avoids loading all conversations)
      const [conv] = await db.select().from(realtimeConversations).where(eq(realtimeConversations.id, conversationId));
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.participant1Id !== req.user!.id && conv.participant2Id !== req.user!.id) {
        return res.status(403).json({ message: "Not a participant in this conversation" });
      }

      // Check if conversation is locked
      const lockedAt: Date | null = (conv as any).lockedAt ?? null;
      if (lockedAt && lockedAt <= new Date()) {
        return res.status(423).json({ message: "This conversation has ended.", code: "CONVERSATION_LOCKED" });
      }

      const newMessage = await storage.createRealtimeMessage({
        conversationId,
        senderId: req.user!.id,
        content: content || (voiceNoteUrl ? "[voice note]" : attachmentUrl ? "[attachment]" : ""),
        attachmentUrl,
        attachmentType,
        attachmentName,
        voiceNoteUrl,
        voiceDurationSec,
      } as any);

      // Broadcast to both participants via WS
      const otherId = conv.participant1Id === req.user!.id ? conv.participant2Id : conv.participant1Id;
      pushToUser(req.user!.id, { type: "message", data: newMessage });
      pushToUser(otherId, { type: "message", data: newMessage });

      res.json(newMessage);
    } catch (e: any) {
      console.error("POST /api/chat/messages error:", e);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ── PATCH /api/chat/messages/:id — edit a sent message ──────────────────
  app.patch("/api/chat/messages/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { content } = req.body || {};
      if (!content?.trim()) return res.status(400).json({ message: "content required" });

      // Verify message exists and caller is the original sender
      const [msg] = await db.select().from(realtimeMessages).where(eq(realtimeMessages.id, req.params.id));
      if (!msg) return res.status(404).json({ message: "Message not found" });
      if (msg.senderId !== req.user!.id) return res.status(403).json({ message: "You can only edit your own messages" });

      // Check conversation lock
      const [conv] = await db.select().from(realtimeConversations).where(eq(realtimeConversations.id, msg.conversationId));
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if ((conv as any).lockedAt && new Date((conv as any).lockedAt) <= new Date()) {
        return res.status(423).json({ message: "This conversation has ended.", code: "CONVERSATION_LOCKED" });
      }

      // Persist audit trail + update message
      const updated = await storage.editRealtimeMessage(req.params.id, content.trim(), req.user!.id);

      // Broadcast edit to both participants via WS
      const editEvt = { type: "message_edited", data: updated };
      pushToUser(conv.participant1Id, editEvt);
      pushToUser(conv.participant2Id, editEvt);

      res.json(updated);
    } catch (e: any) {
      console.error("PATCH /api/chat/messages/:id error:", e);
      res.status(500).json({ message: "Failed to edit message" });
    }
  });

  // ── GET /api/chat/messages/:id/history — edit history for a message ───────
  app.get("/api/chat/messages/:id/history", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const [msg] = await db.select().from(realtimeMessages).where(eq(realtimeMessages.id, req.params.id));
      if (!msg) return res.status(404).json({ message: "Message not found" });

      // Only participants (or admins) can view edit history
      const [conv] = await db.select().from(realtimeConversations).where(eq(realtimeConversations.id, msg.conversationId));
      if (!conv || (conv.participant1Id !== req.user!.id && conv.participant2Id !== req.user!.id && !isAdminRole(req.user!.role))) {
        return res.status(403).json({ message: "Not a participant" });
      }

      const history = await storage.getMessageEditHistory(req.params.id);
      res.json(history);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to get edit history" });
    }
  });

  app.post("/api/chat/conversations", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { participantId } = req.body;
      const conv = await storage.getOrCreateConversation(req.user!.id, participantId);
      res.json(conv);
    } catch (error) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // ── Start a conversation (patient↔provider, *↔admin) ─────────────────────
  app.post("/api/chat/start", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { participantId, appointmentId } = req.body || {};
      if (!participantId) return res.status(400).json({ message: "participantId required" });
      if (participantId === req.user!.id) return res.status(400).json({ message: "Cannot chat with yourself" });
      const conv = await storage.getOrCreateRealtimeConversation(
        req.user!.id,
        participantId,
        appointmentId ? { appointmentId, contextType: "appointment" } : undefined,
      );
      res.json(conv);
    } catch (e) {
      console.error("chat/start error:", e);
      res.status(500).json({ message: "Failed to start conversation" });
    }
  });

  // ── GET conversation for a specific appointment ───────────────────────────
  // Gets or creates the linked conversation between the appointment's patient
  // and provider. Verifies caller is a participant first.
  app.get("/api/chat/conversation-for-appointment/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appt = await storage.getAppointment(req.params.id);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });

      let providerUserId: string | null = null;
      const provWithUser = await storage.getProviderWithUser(appt.providerId);
      providerUserId = provWithUser?.userId ?? null;

      const isParticipant =
        appt.patientId === req.user!.id ||
        providerUserId === req.user!.id ||
        isAdminRole(req.user!.role);
      if (!isParticipant) return res.status(403).json({ message: "Not a participant in this appointment" });
      if (!providerUserId) return res.status(400).json({ message: "Provider user not found" });
      if (providerUserId === appt.patientId) return res.status(400).json({ message: "Invalid participants" });

      const conv = await storage.getOrCreateRealtimeConversation(
        appt.patientId,
        providerUserId,
        { appointmentId: appt.id, contextType: "appointment" },
      );
      res.json(conv);
    } catch (e) {
      console.error("conversation-for-appointment error:", e);
      res.status(500).json({ message: "Failed to get/create conversation" });
    }
  });

  // ── Conversations enriched with participant + appointment context ──────────
  app.get("/api/chat/conversations-rich", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.user!.id;
      const convs = await storage.getRealtimeConversations(me);
      const counts = await storage.getUnreadChatCounts(me);
      const otherIds = Array.from(new Set(convs.map(c => c.participant1Id === me ? c.participant2Id : c.participant1Id)));
      const others = await Promise.all(otherIds.map(id => storage.getUser(id)));
      const map = new Map(others.filter(Boolean).map(u => [u!.id, u!]));

      // Batch-fetch appointment context for linked conversations
      const apptIds = convs
        .filter(c => !!(c as any).appointmentId)
        .map(c => (c as any).appointmentId as string);
      const apptMap = new Map<string, any>();
      if (apptIds.length > 0) {
        const appts = await Promise.all(apptIds.map(id => storage.getAppointment(id)));
        await Promise.all(appts.map(async (appt) => {
          if (!appt) return;
          let serviceName: string | null = null;
          if (appt.serviceId) {
            try {
              const svcRow = await pool.query(
                `SELECT name FROM services WHERE id = $1 LIMIT 1`,
                [appt.serviceId],
              );
              serviceName = svcRow.rows[0]?.name ?? null;
            } catch {}
          }
          apptMap.set(appt.id, {
            id: appt.id,
            date: appt.date,
            startTime: appt.startTime,
            endTime: (appt as any).endTime ?? null,
            status: appt.status,
            visitType: appt.visitType,
            serviceName,
          });
        }));
      }

      const out = convs.map(c => {
        const otherId = c.participant1Id === me ? c.participant2Id : c.participant1Id;
        const u = map.get(otherId);
        const apptId = (c as any).appointmentId as string | null;
        return {
          ...c,
          other: u ? {
            id: u.id,
            name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
            role: u.role,
            avatar: (u as any).avatarUrl ?? null,
          } : { id: otherId, name: "Unknown", role: "user", avatar: null },
          unread: counts[c.id] ?? 0,
          pinned: (c.pinnedBy ?? []).includes(me),
          muted: (c.mutedBy ?? []).includes(me),
          appointment: apptId ? (apptMap.get(apptId) ?? null) : null,
        };
      });
      out.sort((a, b) => Number(b.pinned) - Number(a.pinned)
        || new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());
      res.json(out);
    } catch (e) {
      console.error("conversations-rich error:", e);
      res.status(500).json([]);
    }
  });

  // ── Presence — which of the listed user ids have a live socket ────────────
  app.get("/api/chat/online-status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const idsParam = (req.query.ids as string) || "";
      const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
      const out: Record<string, boolean> = {};
      for (const id of ids) out[id] = isUserOnline(id);
      res.json(out);
    } catch {
      res.json({});
    }
  });

  // ── Unread counts (per-conversation badges + total dot) ───────────────────
  app.get("/api/chat/unread-counts", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const counts = await storage.getUnreadChatCounts(req.user!.id);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      res.json({ counts, total });
    } catch (e) {
      res.status(500).json({ counts: {}, total: 0 });
    }
  });

  // ── Mute / pin a conversation ─────────────────────────────────────────────
  app.post("/api/chat/conversations/:id/mute", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.toggleConversationFlag(req.params.id, req.user!.id, "mute", !!req.body?.muted);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  app.post("/api/chat/conversations/:id/pin", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.toggleConversationFlag(req.params.id, req.user!.id, "pin", !!req.body?.pinned);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  // ── File uploads (attachments + voice notes) ──────────────────────────────
  app.post(
    "/api/chat/upload",
    authenticateToken,
    express.raw({ type: "*/*", limit: "12mb" }),
    async (req: AuthRequest, res: Response) => {
      try {
        const buf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
        if (!buf?.length) return res.status(400).json({ message: "Empty upload" });
        const mimetype = (req.headers["content-type"] as string) || "application/octet-stream";
        const filename = decodeURIComponent((req.headers["x-filename"] as string) || "upload");
        const saved = await saveChatUpload(buf, filename, mimetype.split(";")[0].trim());
        res.json(saved);
      } catch (e: any) {
        res.status(400).json({ message: e?.message || "Upload failed" });
      }
    },
  );

  // ── GET /api/video/token — query-param alias for video room access ─────────
  app.get("/api/video/token", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointmentId = String(req.query.appointmentId ?? "");
      if (!appointmentId) return res.status(400).json({ message: "appointmentId is required" });
      const appt = await storage.getAppointment(appointmentId);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      const provUser = await storage.getProviderWithUser(appt.providerId);
      const isParticipant =
        appt.patientId === req.user!.id ||
        (provUser && provUser.userId === req.user!.id) ||
        isAdminRole(req.user!.role);
      if (!isParticipant) return res.status(403).json({ message: "Not a participant" });
      if (appt.visitType !== "online") {
        return res.status(400).json({ message: "Video token only available for online visits" });
      }
      // Block video room creation for terminal statuses (cancelled, rejected, expired, no_show, completed)
      if (isTerminalStatus(appt.status)) {
        return res.status(409).json({ message: `Video session unavailable — appointment is ${appt.status}.` });
      }
      const session = await getOrCreateVideoSession(appt.id);
      res.json(session);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to generate video token" });
    }
  });

  // ── Video sessions for telemedicine appointments ───────────────────────────
  app.get("/api/video/room/:appointmentId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appt = await storage.getAppointment(req.params.appointmentId);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      const provUser = await storage.getProviderWithUser(appt.providerId);
      const isParticipant =
        appt.patientId === req.user!.id ||
        (provUser && provUser.userId === req.user!.id) ||
        isAdminRole(req.user!.role);
      if (!isParticipant) return res.status(403).json({ message: "Not allowed" });
      if (appt.visitType !== "online") {
        return res.status(400).json({ message: "Video room only available for online visits" });
      }
      // Block video room creation for terminal statuses (cancelled, rejected, expired, no_show, completed)
      if (isTerminalStatus(appt.status)) {
        return res.status(409).json({ message: `Video session unavailable — appointment is ${appt.status}.` });
      }
      const session = await getOrCreateVideoSession(appt.id);
      res.json(session);
    } catch (e: any) {
      console.error("video room error", e);
      res.status(500).json({ message: "Failed to create video session" });
    }
  });
}
