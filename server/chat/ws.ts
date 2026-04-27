import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { storage } from "../storage";
import { db } from "../db";
import { realtimeMessages, realtimeConversations, providerOfficeHours, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { notify } from "../services/notification-dispatcher";

const JWT_SECRET = process.env.SESSION_SECRET || "careconnect-jwt-secret-key";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

// Map userId -> Set of open sockets so we can fan out to a user's tabs/devices
const sockets = new Map<string, Set<AuthenticatedWebSocket>>();

function attach(userId: string, ws: AuthenticatedWebSocket) {
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId)!.add(ws);
}
function detach(userId: string, ws: AuthenticatedWebSocket) {
  sockets.get(userId)?.delete(ws);
  if (sockets.get(userId)?.size === 0) sockets.delete(userId);
}
function sendTo(userId: string, payload: any) {
  const set = sockets.get(userId);
  if (!set) return;
  const json = JSON.stringify(payload);
  set.forEach((s) => {
    if (s.readyState === WebSocket.OPEN) {
      try { s.send(json); } catch {}
    }
  });
}

async function getConversationParticipants(conversationId: string): Promise<{ p1: string; p2: string } | null> {
  const [c] = await db.select().from(realtimeConversations).where(eq(realtimeConversations.id, conversationId));
  if (!c) return null;
  return { p1: c.participant1Id, p2: c.participant2Id };
}

async function isWithinOfficeHours(providerUserId: string): Promise<boolean> {
  const [oh] = await db.select().from(providerOfficeHours).where(eq(providerOfficeHours.providerUserId, providerUserId));
  if (!oh || !oh.weeklySchedule) return true; // assume always available if not configured
  let schedule: Record<string, { start: string; end: string } | null> = {};
  try { schedule = JSON.parse(oh.weeklySchedule); } catch { return true; }
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const now = new Date();
  const today = schedule[days[now.getDay()]];
  if (!today) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = today.start.split(":").map(Number);
  const [eH, eM] = today.end.split(":").map(Number);
  const s = sH * 60 + sM;
  const e = eH * 60 + eM;
  return cur >= s && cur < e;
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function setupChatWS(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/chat" });

  // Heartbeat to drop dead connections
  setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000).unref();

  wss.on("connection", (ws: AuthenticatedWebSocket, req) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    // Authenticate immediately from the httpOnly accessToken cookie sent during
    // the upgrade handshake. Falls back to a `?token=` query param so older
    // clients (or environments where the cookie is unavailable) still work.
    try {
      const cookieHeader = req.headers.cookie;
      let token = parseCookie(cookieHeader, "accessToken");
      if (!token && req.url) {
        try {
          const u = new URL(req.url, "http://localhost");
          const qp = u.searchParams.get("token");
          if (qp) token = qp;
        } catch {}
      }
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
        ws.userId = decoded.id;
        attach(ws.userId, ws);
        try { ws.send(JSON.stringify({ type: "auth_ok" })); } catch {}
      }
    } catch {
      // bad/expired token — leave ws.userId unset; the client may still send
      // an explicit auth message below.
    }

    ws.on("message", async (data) => {
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === "auth") {
        try {
          const decoded = jwt.verify(msg.token, JWT_SECRET) as { id: string };
          if (ws.userId && ws.userId !== decoded.id) detach(ws.userId, ws);
          ws.userId = decoded.id;
          attach(ws.userId, ws);
          ws.send(JSON.stringify({ type: "auth_ok" }));
        } catch {
          try { ws.close(1008, "Invalid token"); } catch {}
        }
        return;
      }

      if (!ws.userId) {
        try { ws.send(JSON.stringify({ type: "error", message: "not authenticated" })); } catch {}
        return;
      }

      try {
        switch (msg.type) {
          case "message": {
            const { conversationId, content, attachmentUrl, attachmentType, attachmentName, voiceNoteUrl, voiceDurationSec } = msg;
            const newMessage = await storage.createRealtimeMessage({
              conversationId,
              senderId: ws.userId,
              content: content || (voiceNoteUrl ? "[voice note]" : attachmentUrl ? "[attachment]" : ""),
              attachmentUrl,
              attachmentType,
              attachmentName,
              voiceNoteUrl,
              voiceDurationSec,
            } as any);
            const parts = await getConversationParticipants(conversationId);
            if (!parts) return;
            const recipientId = parts.p1 === ws.userId ? parts.p2 : parts.p1;

            // Push to both participants' open sockets
            sendTo(parts.p1, { type: "message", data: newMessage });
            sendTo(parts.p2, { type: "message", data: newMessage });

            // If recipient has no live socket, dispatch a real notification
            if (!sockets.get(recipientId)) {
              const sender = await db.select().from(users).where(eq(users.id, ws.userId)).limit(1).then(r => r[0]);
              const senderName = sender ? `${sender.firstName} ${sender.lastName}` : "Someone";
              notify.chatMessage(recipientId, {
                senderName,
                preview: newMessage.content || "",
                conversationId,
              }).catch(() => {});
            }

            // If recipient is a provider outside office hours and auto-reply is on, send their template
            const recipientUser = await db.select().from(users).where(eq(users.id, recipientId)).limit(1).then(r => r[0]);
            if (recipientUser?.role === "provider") {
              const [oh] = await db.select().from(providerOfficeHours).where(eq(providerOfficeHours.providerUserId, recipientId));
              if (oh?.autoReplyEnabled && !(await isWithinOfficeHours(recipientId))) {
                const auto = await storage.createRealtimeMessage({
                  conversationId,
                  senderId: recipientId,
                  content: oh.autoReplyMessage || "I'm currently out of office.",
                } as any);
                sendTo(parts.p1, { type: "message", data: auto });
                sendTo(parts.p2, { type: "message", data: auto });
              }
            }
            return;
          }

          case "typing": {
            const { conversationId, isTyping } = msg;
            const parts = await getConversationParticipants(conversationId);
            if (!parts) return;
            const recipientId = parts.p1 === ws.userId ? parts.p2 : parts.p1;
            sendTo(recipientId, { type: "typing", conversationId, userId: ws.userId, isTyping: !!isTyping });
            return;
          }

          case "read": {
            const { conversationId } = msg;
            // Mark all incoming messages in this conversation as read
            await db.update(realtimeMessages)
              .set({ isRead: true, readAt: new Date() })
              .where(and(
                eq(realtimeMessages.conversationId, conversationId),
                eq(realtimeMessages.isRead, false),
              ));
            const parts = await getConversationParticipants(conversationId);
            if (parts) {
              const otherId = parts.p1 === ws.userId ? parts.p2 : parts.p1;
              sendTo(otherId, { type: "read", conversationId, readerId: ws.userId, at: new Date().toISOString() });
            }
            return;
          }

          case "ping": {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }
        }
      } catch (e) {
        console.error("WS handler error:", e);
      }
    });

    ws.on("close", () => {
      if (ws.userId) detach(ws.userId, ws);
    });
  });

  return wss;
}

/** Push an arbitrary payload to a user's connected sockets (used by REST handlers) */
export function pushToUser(userId: string, payload: any) {
  sendTo(userId, payload);
}

/** True if the given user has at least one open socket. */
export function isUserOnline(userId: string): boolean {
  const set = sockets.get(userId);
  if (!set) return false;
  let online = false;
  set.forEach((s) => { if (s.readyState === WebSocket.OPEN) online = true; });
  return online;
}
