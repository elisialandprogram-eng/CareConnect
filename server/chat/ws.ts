import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { storage } from "../storage";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "careconnect-jwt-secret-key";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
}

export function setupChatWS(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/chat" });

  wss.on("connection", (ws: AuthenticatedWebSocket, req) => {
    console.log("New WS connection attempt");

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "auth") {
          try {
            const decoded = jwt.verify(message.token, JWT_SECRET) as { id: string };
            ws.userId = decoded.id;
            console.log("WS authenticated for user:", ws.userId);
          } catch (e) {
            ws.close(1008, "Invalid token");
          }
          return;
        }

        if (!ws.userId) return;

        if (message.type === "message") {
          const { conversationId, content } = message;
          const newMessage = await storage.createRealtimeMessage({
            conversationId,
            senderId: ws.userId,
            content,
          });

          // Broadcast to other participants in the conversation
          wss.clients.forEach((client: AuthenticatedWebSocket) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "message",
                data: newMessage
              }));
            }
          });
        }
      } catch (error) {
        console.error("WS error:", error);
      }
    });
  });

  return wss;
}
