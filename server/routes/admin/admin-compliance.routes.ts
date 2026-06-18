/**
 * Admin Compliance routes — extracted from server/routes.ts
 *
 * Covers: admin messages/broadcasts/notification-logs/notifications,
 * disputes (patient + admin), patient-documents (admin), slot-holds cleanup,
 * storage orphan scan, admin privacy-requests, retention-policy.
 */

import type { Express, Response } from "express";
import { storage } from "../../storage";
import { pool } from "../../db";
import { z } from "zod";
import {
  authenticateToken,
  requireAdmin,
  AuthRequest,
} from "../../middleware/auth";
import {
  isAdminRole,
  canAccessCountry,
  listingCountryFilter,
} from "../../middleware/country";
import { dispatchNotification, notify } from "../../services/notification-dispatcher";
import { pushToUser } from "../../chat/ws";
import { getStripe } from "../../stripe";
import { isCloudinaryConfigured, deleteCloudinaryFile, cloudinary } from "../../services/cloudinary";

export function registerAdminComplianceRoutes(app: Express): void {

  // ── Admin → user direct message ───────────────────────────────────────────
  app.post("/api/admin/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { recipientId, message } = req.body || {};
      if (!recipientId || !message) return res.status(400).json({ message: "recipientId and message required" });
      const conv = await storage.getOrCreateRealtimeConversation(req.user!.id, recipientId);
      const m = await storage.createRealtimeMessage({
        conversationId: conv.id,
        senderId: req.user!.id,
        content: message,
      } as any);
      pushToUser(recipientId, { type: "message", data: m });
      const sender = await storage.getUser(req.user!.id);
      notify.chatMessage(recipientId, {
        senderName: sender ? `${sender.firstName} ${sender.lastName} (Admin)` : "GoldenLife Admin",
        preview: message,
        conversationId: conv.id,
      }).catch(() => {});
      res.json({ conversation: conv, message: m });
    } catch (e) {
      res.status(500).json({ message: "Failed to send admin message" });
    }
  });

  // ── Broadcasts ────────────────────────────────────────────────────────────
  app.post("/api/admin/broadcasts", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const {
        title, message, audience = "all",
        channels = ["in_app", "email"],
        scheduledAt, expiresAt,
        targetCountries, targetVerifiedOnly = false,
      } = req.body || {};
      if (!title || !message) return res.status(400).json({ message: "title and message required" });

      const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();
      const status = isScheduled ? "scheduled" : "sent";

      // Build SQL conditions to avoid getAllUsers() 500-row cap — query recipients directly.
      const conds: string[] = ["is_deleted = false"];
      const qParams: any[] = [];
      let qi = 1;
      if (audience === "patients") { conds.push(`role = $${qi++}`); qParams.push("patient"); }
      else if (audience === "providers") { conds.push(`role = $${qi++}`); qParams.push("provider"); }
      else if (audience === "admins") { conds.push(`role = ANY($${qi++})`); qParams.push(["admin","global_admin"]); }
      else if (audience?.startsWith?.("role:")) { conds.push(`role = $${qi++}`); qParams.push(audience.slice(5)); }
      if (targetVerifiedOnly) conds.push("(is_email_verified = true OR is_verified = true)");
      if (Array.isArray(targetCountries) && targetCountries.length) {
        conds.push(`country_code::text = ANY($${qi++})`);
        qParams.push(targetCountries);
      }
      const whereClause = conds.join(" AND ");
      const { rows: recipientRows } = await pool.query(
        `SELECT id FROM users WHERE ${whereClause} ORDER BY created_at ASC`,
        qParams,
      );
      const recipients = recipientRows as { id: string }[];

      const broadcast = await storage.createAdminBroadcast({
        senderId: req.user!.id,
        title, message, audience, channels,
        recipientCount: recipients.length,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        status, targetCountries: targetCountries ?? null,
        targetVerifiedOnly,
      } as any);

      if (!isScheduled) {
        (async () => {
          for (const u of recipients) {
            await dispatchNotification({
              userId: u.id, eventKey: "system.broadcast",
              title, body: message,
              email: { subject: title, headingKey: "system.broadcast.heading", intro: message },
            }).catch(err => console.error("[broadcast] dispatch failed for", u.id, err));
          }
        })();
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'create', 'broadcast', $2, $3, $4, $5)`,
        [req.user!.id, broadcast.id, JSON.stringify({ title, audience, channels, status, recipientCount: recipients.length, targetCountries: targetCountries ?? null }), req.ip ?? null, req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json({ broadcast, recipientCount: recipients.length, status });
    } catch (e) {
      console.error("broadcast error", e);
      res.status(500).json({ message: "Failed to broadcast" });
    }
  });

  app.get("/api/admin/broadcasts", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await storage.getRecentAdminBroadcasts(50));
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  app.post("/api/admin/broadcasts/:id/send", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query("SELECT * FROM admin_broadcasts WHERE id = $1", [req.params.id]);
      if (!rows[0]) return res.status(404).json({ message: "Broadcast not found" });
      const b = rows[0];
      if (b.status === "sent") return res.status(409).json({ message: "Already sent" });
      if (b.status === "cancelled") return res.status(409).json({ message: "Broadcast was cancelled" });

      // Build SQL conditions to avoid getAllUsers() 500-row cap — query recipients directly.
      const bConds: string[] = ["is_deleted = false"];
      const bParams: any[] = [];
      let bqi = 1;
      if (b.audience === "patients") { bConds.push(`role = $${bqi++}`); bParams.push("patient"); }
      else if (b.audience === "providers") { bConds.push(`role = $${bqi++}`); bParams.push("provider"); }
      else if (b.audience === "admins") { bConds.push(`role = ANY($${bqi++})`); bParams.push(["admin","global_admin"]); }
      else if (b.audience?.startsWith?.("role:")) { bConds.push(`role = $${bqi++}`); bParams.push(b.audience.slice(5)); }
      if (b.target_verified_only) bConds.push("(is_email_verified = true OR is_verified = true)");
      if (b.target_countries?.length) { bConds.push(`country_code::text = ANY($${bqi++})`); bParams.push(b.target_countries); }
      const { rows: recipients } = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE ${bConds.join(" AND ")} ORDER BY created_at ASC`,
        bParams,
      );

      await pool.query("UPDATE admin_broadcasts SET status = 'sent', recipient_count = $1 WHERE id = $2", [recipients.length, b.id]);
      (async () => {
        for (const u of recipients) {
          await dispatchNotification({ userId: u.id, eventKey: "system.broadcast", title: b.title, body: b.message, email: { subject: b.title, headingKey: "system.broadcast.heading", intro: b.message } }).catch(() => {});
        }
      })();
      res.json({ ok: true, recipientCount: recipients.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/broadcasts/:id/cancel", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query("UPDATE admin_broadcasts SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled' RETURNING id", [req.params.id]);
      if (!rows[0]) return res.status(404).json({ message: "Not found or not in scheduled state" });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Notification delivery logs ────────────────────────────────────────────
  app.get("/api/admin/notification-logs", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await storage.getRecentDeliveryLogs(200));
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  // ── Admin activity notifications ──────────────────────────────────────────
  app.get("/api/admin/notifications", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const isGlobal = req.user?.role === "global_admin";
      const countryCode = isGlobal ? (req.query.country as string | undefined) : req.user?.countryCode;
      const unreadOnly = req.query.unread === "true";
      const severity   = req.query.severity as string | undefined;
      const page  = Math.max(1, Number(req.query.page)  || 1);
      const limit = Math.min(100, Number(req.query.limit) || 30);
      const offset = (page - 1) * limit;

      const conds: string[] = [];
      const params: any[] = [];
      let i = 1;
      if (countryCode) { conds.push(`an.country_code = $${i++}`); params.push(countryCode); }
      if (unreadOnly) conds.push(`an.is_read = false`);
      if (severity)   { conds.push(`an.severity = $${i++}`); params.push(severity); }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

      const [totalR, unreadR, dataR] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM admin_notifications an ${where}`, params),
        pool.query(
          `SELECT COUNT(*) FROM admin_notifications an WHERE an.is_read = false${countryCode ? " AND an.country_code = $1" : ""}`,
          countryCode ? [countryCode] : []
        ),
        pool.query(
          `SELECT an.*, u.first_name, u.last_name, u.avatar_url, p.provider_type, p.is_verified
           FROM admin_notifications an
           LEFT JOIN providers p ON p.id = an.provider_id
           LEFT JOIN users u ON u.id = p.user_id
           ${where}
           ORDER BY an.created_at DESC
           LIMIT $${i++} OFFSET $${i++}`,
          [...params, limit, offset]
        ),
      ]);

      res.json({
        notifications: dataR.rows,
        total: Number(totalR.rows[0].count),
        unreadCount: Number(unreadR.rows[0].count),
        page, limit,
      });
    } catch (err: any) {
      console.error("[admin/notifications]", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/admin/notifications/mark-all-read", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const isGlobal = req.user?.role === "global_admin";
      const countryCode = isGlobal ? undefined : req.user?.countryCode;
      await pool.query(
        `UPDATE admin_notifications SET is_read=true, read_by=$1, read_at=NOW()${countryCode ? " WHERE country_code=$2" : ""}`,
        countryCode ? [req.user!.id, countryCode] : [req.user!.id]
      );
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: "Failed" }); }
  });

  app.patch("/api/admin/notifications/:id/read", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `UPDATE admin_notifications SET is_read=true, read_by=$1, read_at=NOW() WHERE id=$2 RETURNING *`,
        [req.user!.id, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ message: "Notification not found" });
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: "Failed" }); }
  });

  // ── Disputes ──────────────────────────────────────────────────────────────
  app.post("/api/disputes", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") return res.status(403).json({ message: "Patients only" });
      const schema = z.object({
        appointmentId: z.string(),
        reason: z.string().min(5),
        description: z.string().optional(),
      });
      const { appointmentId, reason, description } = schema.parse(req.body);
      const apptQ = await pool.query(
        `SELECT * FROM appointments WHERE id = $1 AND patient_id = $2`,
        [appointmentId, req.user!.id],
      );
      if (!apptQ.rows[0]) return res.status(404).json({ message: "Appointment not found" });
      const appt = apptQ.rows[0];
      const existQ = await pool.query(
        `SELECT id FROM disputes WHERE appointment_id = $1 AND status NOT IN ('resolved','closed')`,
        [appointmentId],
      );
      if (existQ.rows.length > 0) return res.status(409).json({ message: "A dispute is already open for this appointment" });
      const result = await pool.query(
        `INSERT INTO disputes (appointment_id, patient_id, provider_id, reason, description, country_code)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [appointmentId, req.user!.id, appt.provider_id, reason, description || null, appt.country_code || "HU"],
      );
      await pool.query(
        `INSERT INTO user_notifications (user_id, type, title, message)
         SELECT u.id, 'system', 'New dispute filed', 'A patient filed a dispute for appointment #' || $1
         FROM users u WHERE u.role IN ('admin','global_admin','country_admin')`,
        [appointmentId],
      );
      res.status(201).json(result.rows[0]);
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: "Invalid input" });
      res.status(500).json({ message: "Failed to file dispute" });
    }
  });

  app.get("/api/disputes/mine", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT d.*, a.appointment_number FROM disputes d
         LEFT JOIN appointments a ON a.id = d.appointment_id
         WHERE d.patient_id = $1 ORDER BY d.created_at DESC`,
        [req.user!.id],
      );
      res.json(result.rows);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.get("/api/admin/disputes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (countryFilter) { params.push(countryFilter); where += ` AND d.country_code = $${params.length}`; }
      const statusQ = req.query.status as string;
      if (statusQ) { params.push(statusQ); where += ` AND d.status = $${params.length}`; }
      const result = await pool.query(
        `SELECT d.*, a.appointment_number,
                u.first_name AS patient_first_name, u.last_name AS patient_last_name, u.email AS patient_email,
                pu.first_name AS provider_first_name, pu.last_name AS provider_last_name
         FROM disputes d
         LEFT JOIN appointments a ON a.id = d.appointment_id
         LEFT JOIN users u ON u.id = d.patient_id
         LEFT JOIN providers p ON p.id = d.provider_id
         LEFT JOIN users pu ON pu.id = p.user_id
         ${where} ORDER BY d.created_at DESC`,
        params,
      );
      res.json(result.rows);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.patch("/api/admin/disputes/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        status: z.enum(["under_review", "resolved", "closed"]),
        resolution: z.string().optional(),
        refundIssued: z.boolean().optional(),
        refundAmount: z.number().min(0).optional(),
      });
      const { status, resolution, refundIssued, refundAmount } = schema.parse(req.body);
      const disputeQ = await pool.query(`SELECT * FROM disputes WHERE id = $1`, [req.params.id]);
      const dispute = disputeQ.rows[0];
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });

      if (refundAmount && refundAmount > 0) {
        const paidQ = await pool.query(
          `SELECT COALESCE(SUM(p.amount), 0) AS paid,
                  COALESCE(a.total_amount, 0) AS appt_total
           FROM payments p
           JOIN appointments a ON a.id = p.appointment_id
           WHERE p.appointment_id = $1 AND p.status = 'completed'
           GROUP BY a.total_amount`,
          [dispute.appointment_id],
        );
        const totalPaid = Number(paidQ.rows[0]?.paid || 0);
        const apptTotal = Number(paidQ.rows[0]?.appt_total || 0);
        const alreadyRefunded = Number(dispute.refund_amount || 0);
        // Primary guard: never refund more than what was paid minus already refunded
        const maxAllowed = Math.max(0, totalPaid - alreadyRefunded);
        if (refundAmount > maxAllowed + 0.01) {
          return res.status(400).json({
            message: `Refund amount USD ${refundAmount.toFixed(2)} exceeds the available refundable amount USD ${maxAllowed.toFixed(2)}`,
          });
        }
        // Secondary guard: C14.5-P3 — total refunds must never exceed original appointment USD amount
        if (apptTotal > 0 && refundAmount + alreadyRefunded > apptTotal + 0.01) {
          return res.status(400).json({
            message: `Refund amount would exceed the original booking total of USD ${apptTotal.toFixed(2)}`,
          });
        }
      }

      const isResolution = ["resolved", "closed"].includes(status);
      const shouldRefund = isResolution && (refundIssued || (refundAmount && refundAmount > 0)) && !dispute.refund_issued;
      let financialRefundProcessed = false;

      if (shouldRefund && refundAmount && refundAmount > 0) {
        try {
          const paymentQ = await pool.query(
            `SELECT * FROM payments WHERE appointment_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [dispute.appointment_id],
          );
          const payment = paymentQ.rows[0];
          if (payment?.payment_method === "card" && payment?.stripe_payment_intent_id) {
            const stripe = getStripe();
            if (stripe) {
              await stripe.refunds.create({
                payment_intent: payment.stripe_payment_intent_id,
                amount: Math.round(refundAmount * 100),
              }, { idempotencyKey: `dispute:${dispute.id}:refund` });
              await pool.query(
                `UPDATE payments SET refunded_amount = COALESCE(refunded_amount, 0) + $1,
                 refund_status = 'processed' WHERE id = $2`,
                [refundAmount, payment.id],
              );
              financialRefundProcessed = true;
            } else {
              console.warn("[dispute] Stripe not configured — skipping card refund for dispute", dispute.id);
            }
          } else {
            await storage.refundWallet(dispute.patient_id, refundAmount, {
              description: `Dispute refund — ${dispute.reason}`,
              referenceType: "dispute",
              referenceId: dispute.id,
              idempotencyKey: `dispute:${dispute.id}:wallet-refund`,
            });
            financialRefundProcessed = true;
          }
        } catch (refundErr: any) {
          console.error("[dispute] financial refund failed:", refundErr?.message);
          return res.status(500).json({ message: `Dispute metadata updated but refund failed: ${refundErr?.message}` });
        }
      }

      await pool.query(
        `UPDATE disputes SET status = $1, resolution = $2,
         refund_issued = $3, refund_amount = $4,
         resolved_by_user_id = $5,
         resolved_at = CASE WHEN $1 IN ('resolved','closed') THEN NOW() ELSE NULL END,
         updated_at = NOW() WHERE id = $6`,
        [
          status, resolution || null,
          shouldRefund ? true : (refundIssued || false),
          refundAmount || dispute.refund_amount || 0,
          req.user!.id, req.params.id,
        ],
      );

      const refundNote = financialRefundProcessed && refundAmount
        ? ` A refund of $${refundAmount.toFixed(2)} has been issued.`
        : "";
      await storage.createNotification({
        userId: dispute.patient_id,
        type: "dispute_update",
        subject: "Your dispute has been updated",
        body: `Your dispute status is now: ${status}.${resolution ? ` Admin note: ${resolution}` : ""}${refundNote}`,
      });

      const updated = await pool.query(`SELECT * FROM disputes WHERE id = $1`, [req.params.id]);
      res.json({ ...updated.rows[0], financialRefundProcessed });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: "Invalid input" });
      console.error("[dispute patch]", e?.message);
      res.status(500).json({ message: "Failed to update dispute" });
    }
  });

  // ── Admin patient documents ───────────────────────────────────────────────
  app.get("/api/admin/patient-documents", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = typeof req.query.country === "string" ? req.query.country : undefined;
      const limit = Math.min(Number(req.query.limit || 50), 200);
      const offset = Number(req.query.offset || 0);
      const docs = await storage.getAllPatientDocuments({ countryCode, limit, offset });
      res.json(docs.map((d: any) => ({
        id: d.id, patientId: d.patientId, appointmentId: d.appointmentId,
        documentType: d.documentType, title: d.title, mimeType: d.mimeType,
        fileSizeBytes: d.fileSizeBytes, visibility: d.visibility,
        countryCode: d.countryCode, createdAt: d.createdAt,
      })));
    } catch (err) {
      console.error("[admin/patient-documents]", err);
      res.status(500).json({ message: "Failed to load documents" });
    }
  });

  app.delete("/api/admin/patient-documents/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const doc = await storage.getPatientDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if ((doc as any).cloudinaryPublicId) {
        try { await deleteCloudinaryFile((doc as any).cloudinaryPublicId); } catch {}
      }
      await storage.deletePatientDocument(doc.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin/patient-documents/delete]", err);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // ── Slot holds cleanup ────────────────────────────────────────────────────
  app.post("/api/admin/slot-holds/cleanup", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteExpiredSlotHolds();
      return res.json({ deleted });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── Cloudinary orphan scan ────────────────────────────────────────────────
  app.post("/api/admin/storage/scan-orphans", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: "Admin access required" });
    const doDelete = req.body?.delete === true;
    try {
      const [galleryRows, docRows, credRows, patientDocRows] = await Promise.all([
        pool.query(`SELECT id, public_id AS pid, 'provider_gallery' AS tbl FROM provider_gallery WHERE public_id IS NOT NULL AND public_id <> ''`),
        pool.query(`SELECT id, cloudinary_public_id AS pid, 'provider_documents' AS tbl FROM provider_documents WHERE cloudinary_public_id IS NOT NULL AND cloudinary_public_id <> ''`),
        pool.query(`SELECT id, cloudinary_public_id AS pid, 'provider_credentials' AS tbl FROM provider_credentials WHERE cloudinary_public_id IS NOT NULL AND cloudinary_public_id <> ''`),
        pool.query(`SELECT id, cloudinary_public_id AS pid, 'patient_documents' AS tbl FROM patient_documents WHERE cloudinary_public_id IS NOT NULL AND cloudinary_public_id <> ''`),
      ]);

      const allEntries: Array<{ id: string; pid: string; tbl: string }> = [
        ...galleryRows.rows, ...docRows.rows, ...credRows.rows, ...patientDocRows.rows,
      ];

      if (!isCloudinaryConfigured()) {
        return res.json({
          scannedAt: new Date().toISOString(),
          cloudinaryConfigured: false,
          note: "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to enable live orphan detection.",
          dbEntriesWithPublicId: allEntries.length,
          orphans: [], deleted: 0,
        });
      }

      const CONCURRENCY = 10;
      const orphans: Array<{ id: string; publicId: string; table: string }> = [];
      for (let i = 0; i < allEntries.length; i += CONCURRENCY) {
        const batch = allEntries.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (entry) => {
          try {
            await (cloudinary as any).v2.api.resource(entry.pid);
          } catch (e: any) {
            if (e?.http_code === 404 || e?.error?.http_code === 404 || String(e?.message).includes("not found")) {
              orphans.push({ id: entry.id, publicId: entry.pid, table: entry.tbl });
            }
          }
        }));
      }

      let deletedCount = 0;
      if (doDelete && orphans.length > 0) {
        const byTable = orphans.reduce<Record<string, string[]>>((acc, o) => {
          (acc[o.table] = acc[o.table] ?? []).push(o.id);
          return acc;
        }, {});
        const colMap: Record<string, string> = {
          provider_gallery: "public_id",
          provider_documents: "cloudinary_public_id",
          provider_credentials: "cloudinary_public_id",
          patient_documents: "cloudinary_public_id",
        };
        for (const [tbl, ids] of Object.entries(byTable)) {
          if (!colMap[tbl]) continue;
          const r = await pool.query(`DELETE FROM ${tbl} WHERE id = ANY($1) RETURNING id`, [ids]);
          deletedCount += r.rowCount ?? 0;
        }
      }

      res.json({
        scannedAt: new Date().toISOString(),
        cloudinaryConfigured: true,
        dbEntriesWithPublicId: allEntries.length,
        orphanCount: orphans.length,
        orphans, deleted: deletedCount,
      });
    } catch (err: any) {
      console.error("[storage/scan-orphans]", err);
      res.status(500).json({ message: err?.message || "Scan failed" });
    }
  });

  // ── Admin privacy requests ────────────────────────────────────────────────
  app.get("/api/admin/privacy-requests", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (countryFilter) { params.push(countryFilter); where += ` AND pr.country_code = $${params.length}`; }
      const { status, requestType } = req.query as any;
      if (status) { params.push(status); where += ` AND pr.status = $${params.length}`; }
      if (requestType) { params.push(requestType); where += ` AND pr.request_type = $${params.length}`; }

      const result = await pool.query(
        `SELECT pr.id, pr.request_type, pr.status, pr.notes, pr.admin_notes,
                pr.country_code, pr.completed_at, pr.created_at, pr.updated_at,
                u.email AS user_email, u.first_name, u.last_name, u.role,
                au.email AS processed_by_email
         FROM privacy_requests pr
         JOIN users u ON u.id = pr.user_id
         LEFT JOIN users au ON au.id = pr.processed_by
         ${where}
         ORDER BY pr.created_at DESC LIMIT 200`,
        params,
      );
      return res.json({ total: result.rows.length, requests: result.rows });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to fetch privacy requests" });
    }
  });

  app.patch("/api/admin/privacy-requests/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const adminId = req.user!.id;
    const { status, adminNotes } = req.body as { status: string; adminNotes?: string };
    const validStatuses = ["processing", "completed", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "status must be one of: processing, completed, rejected" });
    }

    try {
      const existing = await pool.query(
        `SELECT pr.*, u.country_code AS user_country FROM privacy_requests pr
         JOIN users u ON u.id = pr.user_id WHERE pr.id = $1`,
        [id],
      );
      if (!existing.rows[0]) return res.status(404).json({ message: "Privacy request not found" });
      const request = existing.rows[0];
      if (!canAccessCountry(req.user!, request.country_code)) {
        return res.status(403).json({ message: "Access denied: cross-country privacy request" });
      }
      const completedAt = status === "completed" ? new Date() : null;
      const updated = await pool.query(
        `UPDATE privacy_requests
         SET status = $1, admin_notes = COALESCE($2, admin_notes), processed_by = $3,
             completed_at = COALESCE($4, completed_at), updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [status, adminNotes ?? null, adminId, completedAt, id],
      );
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'privacy_request_updated', 'privacy_request', $2, $3, $4)`,
        [adminId, id, JSON.stringify({ status, requestType: request.request_type, targetUserId: request.user_id }), request.country_code],
      );
      return res.json({ message: "Privacy request updated", request: updated.rows[0] });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to update privacy request" });
    }
  });

  // ── Retention policy ──────────────────────────────────────────────────────
  app.get("/api/admin/retention-policy", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    return res.json({
      canonical_currency: "USD",
      policy_version: "1.0",
      last_reviewed: "2026-06-04",
      retention_windows: {
        user_notifications:   { days: Number(process.env.RETAIN_NOTIFICATIONS_DAYS  || 90),  configurable_via: "RETAIN_NOTIFICATIONS_DAYS"  },
        system_events:        { days: Number(process.env.RETAIN_SYSTEM_EVENTS_DAYS   || 90),  configurable_via: "RETAIN_SYSTEM_EVENTS_DAYS"   },
        audit_logs:           { days: Number(process.env.RETAIN_AUDIT_LOGS_DAYS      || 180), configurable_via: "RETAIN_AUDIT_LOGS_DAYS"      },
        idempotency_keys:     { policy: "deleted when expires_at < NOW()", configurable_via: "not configurable — expiry set at creation time" },
        appointment_slot_holds: { policy: "deleted when expires_at < NOW()", configurable_via: "not configurable" },
      },
      cannot_be_deleted: [
        { table: "payments",            reason: "Financial records — required for accounting, tax compliance, and dispute resolution" },
        { table: "invoices",            reason: "Legal tax documents — minimum 7-year retention in HU/IR jurisdictions" },
        { table: "wallet_transactions", reason: "Financial ledger — needed for balance reconciliation and audit" },
        { table: "provider_earnings",   reason: "Payroll records — required for provider payout verification" },
        { table: "payout_requests",     reason: "Financial records — required for accounting" },
        { table: "appointment_events",  reason: "Medical safety audit trail — status transition log" },
        { table: "disputes",            reason: "Legal dispute record — needed for chargebacks and compliance" },
      ],
      soft_delete_behavior: {
        users: "PII anonymized (email → deleted+{id}@deleted.local, name/phone/address cleared). Row kept for foreign key integrity. isDeleted=true prevents login.",
        providers: "is_active=false on parent provider row. Future time slots removed. Past appointments preserved.",
        services: "is_active=false. Hidden from search. Historical appointment references preserved.",
      },
      deletion_request_sla_days: 30,
      export_request_sla_days: 30,
      note: "Patient self-service export available at GET /api/patient/me/data-export. GDPR Article 17 deletion requests processed via /api/privacy/requests.",
    });
  });
}
