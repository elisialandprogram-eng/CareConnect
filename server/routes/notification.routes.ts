/**
 * Notification routes
 * Routes: 10 | Owner: notifications | Auth: required (most), public (capabilities/vapid)
 * Country isolation: N/A | Financial impact: no
 *
 * GET    /api/notifications
 * PATCH  /api/notifications/:id/read
 * GET    /api/notifications/unread-count
 * POST   /api/notifications/mark-all-read
 * GET    /api/comms/capabilities
 * GET    /api/notification-preferences
 * PATCH  /api/notification-preferences
 * GET    /api/push/vapid-public-key
 * POST   /api/push/subscribe
 * POST   /api/push/unsubscribe
 */

import type { Express, Response } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { userNotifications } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { VAPID_PUBLIC_KEY, isPushConfigured } from "../services/channels/push";
import { isSmsConfigured } from "../services/channels/sms";
import { isWhatsAppConfigured } from "../services/channels/whatsapp";
import { isEmailConfigured } from "../services/channels/email";
import { authenticateToken, type AuthRequest } from "../middleware/auth";

export function registerNotificationRoutes(app: Express): void {

  // ── GET /api/notifications ──────────────────────────────────────────────
  // Uses Drizzle ORM so column names are always correct (title/message/data/
  // isRead/createdAt) and the response matches the UserNotification TS type.
  // Previously used raw pool.query with wrong column names (subject/body/
  // metadata → 42703 PostgreSQL error) which caused a 500 on every fetch,
  // leaving the notification list empty despite the bell showing a count.
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const rows = await db
        .select({
          id: userNotifications.id,
          type: userNotifications.type,
          title: userNotifications.title,
          message: userNotifications.message,
          isRead: userNotifications.isRead,
          createdAt: userNotifications.createdAt,
        })
        .from(userNotifications)
        .where(eq(userNotifications.userId, req.user!.id))
        .orderBy(desc(userNotifications.createdAt))
        .limit(limit);
      res.json(rows);
    } catch (err: any) {
      console.error("[GET /api/notifications]", err?.message);
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  // ── PATCH /api/notifications/:id/read ──────────────────────────────────
  // Persistence hardening: explicit SQL transaction scoped to the user's ID
  // so is_read = true is committed to PostgreSQL — not just an in-memory flag.
  app.patch("/api/notifications/:id/read", authenticateToken, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rowCount } = await client.query(
        `UPDATE user_notifications
            SET is_read = TRUE
          WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user!.id],
      );
      await client.query("COMMIT");
      if (!rowCount) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.status(204).end();
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: "Failed to mark notification as read" });
    } finally {
      client.release();
    }
  });

  // ── GET /api/notifications/unread-count ────────────────────────────────
  app.get("/api/notifications/unread-count", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const c = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count: c });
    } catch {
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  // ── POST /api/notifications/mark-all-read ──────────────────────────────
  // Persistence hardening: explicit SQL transaction for bulk mark-all-read.
  app.post("/api/notifications/mark-all-read", authenticateToken, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE user_notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
        [req.user!.id],
      );
      await client.query("COMMIT");
      res.status(204).end();
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: "Failed to mark all read" });
    } finally {
      client.release();
    }
  });

  // ── DELETE /api/notifications/:id ──────────────────────────────────────
  app.delete("/api/notifications/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM user_notifications WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user!.id],
      );
      if (!rowCount) return res.status(404).json({ message: "Notification not found" });
      res.status(204).end();
    } catch {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // ── POST /api/notifications/bulk-action ────────────────────────────────
  // Supports actions: "mark_read" (mark selected as read), "delete" (delete selected)
  app.post("/api/notifications/bulk-action", authenticateToken, async (req: AuthRequest, res: Response) => {
    const { action, ids } = req.body as { action?: string; ids?: string[] };
    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "action and ids[] required" });
    }
    if (!["mark_read", "delete"].includes(action)) {
      return res.status(400).json({ message: "action must be mark_read or delete" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (action === "mark_read") {
        await client.query(
          `UPDATE user_notifications SET is_read = TRUE WHERE id = ANY($1::text[]) AND user_id = $2`,
          [ids, req.user!.id],
        );
      } else {
        await client.query(
          `DELETE FROM user_notifications WHERE id = ANY($1::text[]) AND user_id = $2`,
          [ids, req.user!.id],
        );
      }
      await client.query("COMMIT");
      res.status(204).end();
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: "Bulk action failed" });
    } finally {
      client.release();
    }
  });

  // ── GET /api/comms/capabilities ─────────────────────────────────────────
  app.get("/api/comms/capabilities", (_req, res) => {
    res.json({
      email:          isEmailConfigured(),
      sms:            isSmsConfigured(),
      whatsapp:       isWhatsAppConfigured(),
      push:           isPushConfigured(),
      vapidPublicKey: VAPID_PUBLIC_KEY || null,
    });
  });

  // ── GET /api/notification-preferences ──────────────────────────────────
  app.get("/api/notification-preferences", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const prefs =
        (await storage.getNotificationPreferences(req.user!.id)) ||
        (await storage.upsertNotificationPreferences(req.user!.id, {} as any));
      res.json(prefs);
    } catch {
      res.status(500).json({ message: "Failed to load preferences" });
    }
  });

  // ── PATCH /api/notification-preferences ────────────────────────────────
  // `language` is no longer stored on notification_preferences — it is the
  // single authority on users.language_preference.  When a language value is
  // received here we forward it to the users table and strip it from the
  // notification-preferences patch so the defunct column is never written.
  app.patch("/api/notification-preferences", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const allowed = [
        "emailEnabled", "smsEnabled", "whatsappEnabled", "pushEnabled", "inAppEnabled",
        "eventOverrides", "quietHoursStart", "quietHoursEnd", "emailDigest",
      ];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];

      // Forward language preference to the single authority: users.language_preference
      if (req.body.language !== undefined) {
        await storage.updateUser(req.user!.id, { languagePreference: req.body.language });
      }

      const updated = await storage.upsertNotificationPreferences(req.user!.id, patch);
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // ── GET /api/push/vapid-public-key ─────────────────────────────────────
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ key: VAPID_PUBLIC_KEY || null, configured: isPushConfigured() });
  });

  // ── POST /api/push/subscribe ────────────────────────────────────────────
  app.post("/api/push/subscribe", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { endpoint, keys, userAgent } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription" });
      }
      const sub = await storage.addPushSubscription({
        userId: req.user!.id,
        endpoint,
        p256dh: keys.p256dh,
        authKey: keys.auth,
        userAgent: userAgent || req.headers["user-agent"] || null,
      } as any);
      res.json(sub);
    } catch {
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  // ── POST /api/push/unsubscribe ──────────────────────────────────────────
  app.post("/api/push/unsubscribe", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.body?.endpoint) return res.status(400).json({ message: "endpoint required" });
      await storage.removePushSubscription(req.body.endpoint);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });
}
