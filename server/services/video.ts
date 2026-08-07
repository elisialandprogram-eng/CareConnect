/**
 * Telemedicine video session provider.
 *
 * Abstracted so we can plug in Daily.co, Twilio Video, Whereby, Jitsi, etc.
 *
 * Required env vars to enable a real provider:
 *   VIDEO_PROVIDER = "daily" | "jitsi" | "stub"  (default "stub")
 *   DAILY_API_KEY  (if VIDEO_PROVIDER=daily)
 *   DAILY_DOMAIN   (e.g. "yourdomain.daily.co")
 *
 * The "stub" provider returns a deterministic Jitsi-Meet public room URL so
 * patients/providers can test end-to-end without any paid account. Replace with
 * a real provider for HIPAA-compliant production use.
 */
import { db } from "../db";
import { videoSessions, type VideoSession } from "@shared/schema";
import { eq } from "drizzle-orm";

const PROVIDER = (process.env.VIDEO_PROVIDER || "stub").toLowerCase();
const DAILY_KEY = process.env.DAILY_API_KEY;
const DAILY_DOMAIN = process.env.DAILY_DOMAIN;

export async function getOrCreateVideoSession(appointmentId: string): Promise<VideoSession> {
  const [existing] = await db.select().from(videoSessions).where(eq(videoSessions.appointmentId, appointmentId));
  if (existing && (!existing.expiresAt || existing.expiresAt.getTime() > Date.now())) {
    return existing;
  }

  const roomName = `gl-${appointmentId.slice(0, 12)}`;
  let provider = "stub";
  let roomUrl: string;
  let expiresAt: Date | null = null;

  if (PROVIDER === "daily" && DAILY_KEY && DAILY_DOMAIN) {
    try {
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 4; // 4h
      const resp = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DAILY_KEY}`,
        },
        body: JSON.stringify({
          name: roomName,
          properties: {
            exp,
            enable_chat: true,
            enable_screenshare: true,
            enable_knocking: true,
          },
        }),
      });
      const json: any = await resp.json();
      if (resp.ok) {
        provider = "daily";
        roomUrl = json.url;
        expiresAt = new Date(exp * 1000);
      } else {
        console.warn("[video] Daily.co room create failed, falling back to Jitsi:", json);
        roomUrl = `https://meet.jit.si/${roomName}`;
      }
    } catch (e) {
      console.warn("[video] Daily.co request failed, falling back to Jitsi:", e);
      roomUrl = `https://meet.jit.si/${roomName}`;
    }
  } else {
    if (PROVIDER === "daily") {
      console.warn("[video] VIDEO_PROVIDER=daily but DAILY_API_KEY/DAILY_DOMAIN missing — using public Jitsi");
    }
    roomUrl = `https://meet.jit.si/${roomName}`;
  }

  if (existing) {
    const [updated] = await db
      .update(videoSessions)
      .set({ provider, roomUrl, roomName, expiresAt })
      .where(eq(videoSessions.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(videoSessions)
    .values({ appointmentId, provider, roomUrl, roomName, expiresAt: expiresAt as any })
    .returning();
  return created;
}
