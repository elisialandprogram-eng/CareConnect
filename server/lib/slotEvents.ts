/**
 * Slot-event WebSocket broadcaster — Sprint C20.0
 *
 * Maintains a lightweight set of open connections on /ws/slots.
 * No authentication required — slot availability is public information.
 *
 * Clients connect and receive SLOT_MUTATION events whenever a hold is
 * created or released, allowing the booking wizard to update its time-slot
 * grid in real time across open browser tabs without a full page refresh.
 *
 * Usage:
 *   setupSlotEventsWS(httpServer)   — call once at startup
 *   broadcastSlotMutation(...)       — call from slot-hold route handlers
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

const slotClients = new Set<WebSocket>();

export function setupSlotEventsWS(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  // Route only /ws/slots upgrades here; let /ws/chat and Vite HMR handle the rest.
  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (url.startsWith("/ws/slots")) {
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit("connection", ws);
      });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    slotClients.add(ws);
    ws.on("close",   () => slotClients.delete(ws));
    ws.on("error",   () => slotClients.delete(ws));
    // Clients may send a ping to keep the connection alive — respond with pong.
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "ping") {
          try { ws.send(JSON.stringify({ type: "pong" })); } catch {}
        }
      } catch {}
    });
  });

  // Prune stale connections every 30 s (mirrors chat WS heartbeat pattern).
  setInterval(() => {
    slotClients.forEach((ws) => {
      if (ws.readyState !== WebSocket.OPEN) slotClients.delete(ws);
    });
  }, 30_000).unref();

  console.log("[slotEvents] /ws/slots WebSocket broadcaster ready");
}

/**
 * Broadcast a slot mutation to every connected /ws/slots client.
 *
 * @param providerId  — provider whose calendar changed
 * @param date        — YYYY-MM-DD of the affected slot
 * @param startTime   — HH:mm of the affected slot
 * @param isAvailable — true = slot just freed; false = slot just held/booked
 */
export function broadcastSlotMutation(
  providerId: string,
  date: string,
  startTime: string,
  isAvailable: boolean,
): void {
  if (slotClients.size === 0) return;
  const payload = JSON.stringify({
    event: "SLOT_MUTATION",
    slotId: `${providerId}|${date}|${startTime}`,
    providerId,
    date,
    startTime,
    isAvailable,
  });
  slotClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch {}
    }
  });
}
