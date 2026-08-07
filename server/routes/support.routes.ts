/**
 * Support & Bug-report routes
 * Routes: 16 | Owner: support | Auth: mixed | Country isolation: admin endpoints
 * Financial impact: no
 *
 * POST  /api/support/tickets
 * GET   /api/support/tickets
 * GET   /api/support/tickets/:id
 * POST  /api/support/tickets/:id/messages
 * POST  /api/support/contact
 * POST  /api/support/classify
 * POST  /api/admin/support/auto-categorize
 * POST  /api/bug-reports
 * GET   /api/bug-reports/my
 * GET   /api/bug-reports/:id
 * POST  /api/bug-reports/:id/comments
 * PATCH /api/bug-reports/:id/status
 * PATCH /api/bug-reports/:id/assign
 * PATCH /api/bug-reports/:id/priority
 * GET   /api/admin/bug-reports
 * GET   /api/admin/bug-reports/:id
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { storage } from "../storage";
import { pool } from "../db";
import { insertSupportTicketSchema } from "@shared/schema";
import { isAdminRole, canAccessCountry, listingCountryFilter } from "../middleware/country";
import { classifyTicket, recommendFaqs, autoCategorizePendingTickets } from "../services/ticketAutomation";
import { uploadDocumentFile, isCloudinaryConfigured } from "../services/cloudinary";
import { dispatchNotification, notify } from "../services/notification-dispatcher";
import { requireAdmin, authenticateToken, optionalAuth, type AuthRequest } from "../middleware/auth";

// Screenshot multer — memory-only, 5 MB cap, image + PDF
const bugScreenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

export function registerSupportRoutes(app: Express): void {

  // ── POST /api/support/tickets ───────────────────────────────────────────
  // Guest or logged-in users can submit a ticket.
  app.post("/api/support/tickets", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = insertSupportTicketSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid ticket data", errors: result.error.errors });
      }
      const ticket = await storage.createSupportTicket({
        ...result.data,
        userId: req.user?.id || null,
        status: "open",
      });
      res.status(201).json(ticket);
    } catch (error) {
      console.error("Create ticket error:", error);
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // ── GET /api/support/tickets ────────────────────────────────────────────
  app.get("/api/support/tickets", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const all = await storage.getAllSupportTickets();
      const mine = isAdminRole(req.user!.role) ? all : all.filter(t => t.userId === req.user!.id);

      // Batch-fetch all messages in one query instead of N individual queries
      const ticketIds = mine.map(t => t.id);
      let allMsgsMap = new Map<string, any[]>();
      if (ticketIds.length > 0) {
        const { rows: msgRows } = await pool.query(
          `SELECT * FROM support_ticket_messages WHERE ticket_id = ANY($1) ORDER BY created_at ASC`,
          [ticketIds],
        );
        for (const m of msgRows) {
          if (!allMsgsMap.has(m.ticket_id)) allMsgsMap.set(m.ticket_id, []);
          allMsgsMap.get(m.ticket_id)!.push(m);
        }
      }

      const enriched = mine.map(t => {
        const msgs = allMsgsMap.get(t.id) ?? [];
        const visible = msgs.filter((m: any) => !m.is_internal);
        const last = visible[visible.length - 1];
        return {
          ...t,
          replyCount: visible.length,
          lastMessageAt: last ? last.created_at : t.createdAt,
          lastMessagePreview: last ? last.message.slice(0, 80) : null,
          hasAdminReply: visible.some((m: any) => m.user_id !== t.userId),
        };
      });
      res.json(enriched);
    } catch {
      res.status(500).json({ message: "Failed" });
    }
  });

  // ── GET /api/support/tickets/:id ────────────────────────────────────────
  app.get("/api/support/tickets/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const t = await storage.getSupportTicket(req.params.id);
      if (!t) return res.status(404).json({ message: "Not found" });
      const isAdmin = isAdminRole(req.user!.role);
      if (!isAdmin && t.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      const allMessages = await storage.getTicketMessages(req.params.id);
      const messages = isAdmin ? allMessages : allMessages.filter(m => !m.isInternal);
      const msgSenderIds = [...new Set(messages.map((m: any) => m.userId).filter(Boolean))] as string[];
      const msgSenders = await storage.getUsersByIds(msgSenderIds);
      const userMap = new Map(msgSenders.map((u: any) => [u.id, u]));
      const withSenders = messages.map(m => {
        const u = userMap.get(m.userId);
        return {
          ...m,
          sender: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role } : null,
        };
      });
      res.json({ ticket: t, messages: withSenders });
    } catch {
      res.status(500).json({ message: "Failed" });
    }
  });

  // ── POST /api/support/tickets/:id/messages ──────────────────────────────
  app.post("/api/support/tickets/:id/messages", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const t = await storage.getSupportTicket(req.params.id);
      if (!t) return res.status(404).json({ message: "Not found" });
      const isAdmin = isAdminRole(req.user!.role);
      if (!isAdmin && t.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      if (!req.body?.message) return res.status(400).json({ message: "Message required" });
      const m = await storage.createTicketMessage({
        ticketId: req.params.id,
        userId: req.user!.id,
        message: req.body.message,
        isInternal: !!req.body.isInternal && isAdmin,
      } as any);
      const otherUserId = isAdmin ? t.userId : (t.assignedTo || null);
      if (otherUserId && !m.isInternal) {
        notify.ticketReplied(otherUserId, { ticketId: t.id, subject: t.subject }).catch(() => {});
      }
      res.json(m);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed" });
    }
  });

  // ── POST /api/support/contact ───────────────────────────────────────────
  // Creates/finds a realtime conversation between the patient and a support admin.
  app.post("/api/support/contact", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      // Use a targeted query instead of getAllUsers() (which caps at 500) so we
      // always find a support admin regardless of total user count.
      const supportEmails = ["support@goldenlife.com", "support@goldenlife.health", "help@goldenlife.com", "admin@goldenlife.com"];
      const { rows: adminRows } = await pool.query<{ id: string; email: string; role: string; first_name: string; last_name: string }>(
        `SELECT id, email, role, first_name, last_name FROM users
         WHERE is_deleted = false
           AND role IN ('admin','global_admin','country_admin')
         ORDER BY
           CASE WHEN email = ANY($1) THEN 0
                WHEN email ILIKE '%goldenlife%' THEN 1
                ELSE 2 END,
           created_at ASC
         LIMIT 10`,
        [supportEmails],
      );
      let admin = adminRows[0]
        ? { id: adminRows[0].id, email: adminRows[0].email, role: adminRows[0].role, firstName: adminRows[0].first_name, lastName: adminRows[0].last_name } as any
        : null;
      if (!admin) return res.status(503).json({ message: "No support agent available right now." });

      try {
        if (admin.firstName !== "GoldenLife" || admin.lastName !== "Support") {
          await storage.updateUser(admin.id, { firstName: "GoldenLife", lastName: "Support" } as any);
          admin = { ...admin, firstName: "GoldenLife", lastName: "Support" };
        }
      } catch (renameErr) {
        console.warn("[support] could not normalize support display name:", renameErr);
      }

      const conv = await storage.getOrCreateRealtimeConversation(req.user!.id, admin.id);
      res.json({ conversation: conv, adminId: admin.id });
    } catch (e) {
      console.error("support/contact error:", e);
      res.status(500).json({ message: "Failed to contact support" });
    }
  });

  // ── POST /api/support/classify ──────────────────────────────────────────
  // AI-assisted ticket classification (no auth required).
  app.post("/api/support/classify", async (req: Request, res: Response) => {
    try {
      const { subject, description } = z.object({
        subject: z.string().min(1).max(300),
        description: z.string().min(1).max(5000),
      }).parse(req.body);

      const classification = classifyTicket(subject, description);
      const faqs = await recommendFaqs(subject, description, 5);
      res.json({ classification, suggestedFaqs: faqs });
    } catch (error: any) {
      if (error?.issues) return res.status(400).json({ message: "Invalid input", issues: error.issues });
      res.status(500).json({ message: "Classification failed" });
    }
  });

  // ── POST /api/admin/support/auto-categorize ─────────────────────────────
  app.post("/api/admin/support/auto-categorize", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const updated = await autoCategorizePendingTickets();
      res.json({ updated, message: `Auto-categorized ${updated} ticket(s)` });
    } catch (error) {
      console.error("[admin/support/auto-categorize]", error);
      res.status(500).json({ message: "Auto-categorization failed" });
    }
  });

  // ── POST /api/bug-reports ───────────────────────────────────────────────
  app.post(
    "/api/bug-reports",
    authenticateToken,
    bugScreenshotUpload.single("screenshot"),
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!;
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

        if (!body.title || !body.description) {
          return res.status(400).json({ message: "title and description are required" });
        }

        let screenshotUrl: string | null = null;
        let screenshotPublicId: string | null = null;
        if (req.file && isCloudinaryConfigured()) {
          const uploaded = await uploadDocumentFile(req.file.buffer, req.file.mimetype);
          screenshotUrl = uploaded.secureUrl;
          screenshotPublicId = uploaded.publicId;
        }

        let priority = body.priority ?? "medium";
        if (body.severity === "critical") priority = "urgent";

        const report = await storage.createBugReport({
          countryCode: user.countryCode ?? "HU",
          reportedByUserId: user.id,
          reporterRole: user.role,
          title: body.title.slice(0, 200),
          description: body.description.slice(0, 5000),
          stepsToReproduce: body.stepsToReproduce ?? null,
          category: body.category ?? "bug",
          severity: body.severity ?? "medium",
          priority,
          pageUrl: body.pageUrl ?? null,
          browserInfo: body.browserInfo ?? null,
          deviceInfo: body.deviceInfo ?? null,
          correlationId: body.correlationId ?? (req as any).correlationId ?? null,
          screenshotUrl,
          screenshotPublicId,
          includeDiagnostics: body.includeDiagnostics === true,
        } as any);

        await storage.createAuditLog({
          userId: user.id,
          action: "create",
          entityType: "bug_report",
          entityId: report.id,
          details: JSON.stringify({ title: report.title, severity: report.severity, category: report.category }),
          ipAddress: req.ip ?? null,
          countryCode: user.countryCode ?? null,
        } as any);

        pool.query(
          `SELECT id FROM users WHERE role IN ('admin','global_admin','country_admin') AND country_code::text = $1 AND is_email_verified = true AND is_suspended = false LIMIT 20`,
          [user.countryCode ?? "HU"],
        ).then(({ rows }) => {
          for (const admin of rows) {
            dispatchNotification({
              userId: admin.id,
              eventKey: "bug.created",
              title: "New Bug Report",
              body: `${(user as any).firstName} ${(user as any).lastName} filed: ${report.title}`,
              data: { bugReportId: report.id },
              push: { url: `/admin/bug-reports` },
            }).catch(() => {});
          }
        }).catch(() => {});

        return res.status(201).json({ report });
      } catch (err: any) {
        console.error("[bug-reports] POST error:", err.message);
        return res.status(500).json({ message: "Failed to create report" });
      }
    }
  );

  // ── GET /api/bug-reports/my ─────────────────────────────────────────────
  app.get("/api/bug-reports/my", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const { reports, total } = await storage.getBugReportsByUser(req.user!.id, { limit, offset });
      return res.json({ reports, total, page: Math.floor(offset / limit) + 1, limit, totalPages: Math.ceil(total / limit) });
    } catch {
      return res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // ── GET /api/bug-reports/:id ────────────────────────────────────────────
  app.get("/api/bug-reports/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const report = await storage.getBugReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      const user = req.user!;
      const isAdmin = ["admin", "global_admin", "country_admin"].includes(user.role);
      const isOwner = report.reportedByUserId === user.id;
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Access denied" });
      if (isAdmin && !canAccessCountry(user, report.countryCode)) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }
      const comments = await storage.getBugReportComments(req.params.id);
      return res.json({ report, comments });
    } catch {
      return res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // ── POST /api/bug-reports/:id/comments ─────────────────────────────────
  app.post("/api/bug-reports/:id/comments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "message is required" });
      const report = await storage.getBugReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      const user = req.user!;
      const isAdmin = ["admin", "global_admin", "country_admin"].includes(user.role);
      const isOwner = report.reportedByUserId === user.id;
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Access denied" });

      const comment = await storage.createBugReportComment({
        bugReportId: report.id,
        userId: user.id,
        role: user.role,
        message: message.trim().slice(0, 5000),
        attachmentUrl: req.body.attachmentUrl ?? null,
      } as any);

      await storage.createAuditLog({
        userId: user.id,
        action: "create",
        entityType: "bug_report_comment",
        entityId: report.id,
        details: JSON.stringify({ commentId: comment.id }),
        ipAddress: req.ip ?? null,
        countryCode: user.countryCode ?? null,
      } as any);

      const notifyUserId = isAdmin ? report.reportedByUserId : (report.assignedTo ?? null);
      if (notifyUserId && notifyUserId !== user.id) {
        dispatchNotification({
          userId: notifyUserId,
          eventKey: "bug.comment_added",
          title: "New comment on your report",
          body: `${(user as any).firstName} ${(user as any).lastName} commented on: ${report.title}`,
          data: { bugReportId: report.id },
          push: { url: `/my-reports/${report.id}` },
        }).catch(() => {});
      }

      return res.status(201).json({ comment });
    } catch {
      return res.status(500).json({ message: "Failed to add comment" });
    }
  });

  // ── PATCH /api/bug-reports/:id/status ──────────────────────────────────
  app.patch("/api/bug-reports/:id/status", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;
      const isAdmin = ["admin", "global_admin", "country_admin"].includes(user.role);
      if (!isAdmin) return res.status(403).json({ message: "Admin only" });
      const { status, resolutionNotes, adminNotes } = req.body;
      const validStatuses = ["new", "triaged", "in_progress", "waiting_for_user", "resolved", "closed", "duplicate", "rejected"];
      if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });

      const report = await storage.getBugReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!canAccessCountry(user, report.countryCode)) return res.status(403).json({ message: "Cross-country access denied" });

      const updateData: any = { status };
      if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes;
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
      if (status === "resolved") updateData.resolvedAt = new Date();
      if (status === "closed") updateData.closedAt = new Date();

      const updated = await storage.updateBugReport(req.params.id, updateData);

      await storage.createAuditLog({
        userId: user.id, action: "update", entityType: "bug_report", entityId: report.id,
        details: JSON.stringify({ fromStatus: report.status, toStatus: status }),
        ipAddress: req.ip ?? null, countryCode: user.countryCode ?? null,
      } as any);

      const eventKey: any = status === "resolved" ? "bug.resolved" : status === "closed" ? "bug.closed" : "bug.status_changed";
      dispatchNotification({
        userId: report.reportedByUserId,
        eventKey,
        title: status === "resolved" ? "Your report has been resolved" : `Report status updated: ${status.replace(/_/g, " ")}`,
        body: resolutionNotes ?? `Your bug report "${report.title}" status changed to ${status.replace(/_/g, " ")}.`,
        data: { bugReportId: report.id },
        push: { url: `/my-reports/${report.id}` },
      }).catch(() => {});

      return res.json({ report: updated });
    } catch {
      return res.status(500).json({ message: "Failed to update status" });
    }
  });

  // ── PATCH /api/bug-reports/:id/assign ──────────────────────────────────
  app.patch("/api/bug-reports/:id/assign", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;
      if (!["admin", "global_admin", "country_admin"].includes(user.role)) return res.status(403).json({ message: "Admin only" });
      const report = await storage.getBugReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!canAccessCountry(user, report.countryCode)) return res.status(403).json({ message: "Cross-country access denied" });

      const assignedTo = req.body.assignedTo ?? user.id;
      const updated = await storage.updateBugReport(req.params.id, { assignedTo } as any);

      await storage.createAuditLog({
        userId: user.id, action: "update", entityType: "bug_report", entityId: report.id,
        details: JSON.stringify({ assignedTo }),
        ipAddress: req.ip ?? null, countryCode: user.countryCode ?? null,
      } as any);

      dispatchNotification({
        userId: report.reportedByUserId,
        eventKey: "bug.assigned",
        title: "Your report has been assigned",
        body: `Your bug report "${report.title}" has been assigned to a team member.`,
        data: { bugReportId: report.id },
        push: { url: `/my-reports/${report.id}` },
      }).catch(() => {});

      return res.json({ report: updated });
    } catch {
      return res.status(500).json({ message: "Failed to assign report" });
    }
  });

  // ── PATCH /api/bug-reports/:id/priority ────────────────────────────────
  app.patch("/api/bug-reports/:id/priority", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;
      if (!["admin", "global_admin", "country_admin"].includes(user.role)) return res.status(403).json({ message: "Admin only" });
      const { priority } = req.body;
      if (!["low", "medium", "high", "urgent"].includes(priority)) return res.status(400).json({ message: "Invalid priority" });
      const report = await storage.getBugReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!canAccessCountry(user, report.countryCode)) return res.status(403).json({ message: "Cross-country access denied" });
      const updated = await storage.updateBugReport(req.params.id, { priority } as any);
      await storage.createAuditLog({
        userId: user.id, action: "update", entityType: "bug_report", entityId: report.id,
        details: JSON.stringify({ priority }),
        ipAddress: req.ip ?? null, countryCode: user.countryCode ?? null,
      } as any);
      return res.json({ report: updated });
    } catch {
      return res.status(500).json({ message: "Failed to update priority" });
    }
  });

  // ── GET /api/admin/bug-reports ──────────────────────────────────────────
  app.get("/api/admin/bug-reports", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;
      if (!["admin", "global_admin", "country_admin"].includes(user.role)) return res.status(403).json({ message: "Admin only" });
      const countryFilter = listingCountryFilter(user, req.query);
      const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const { reports, total } = await storage.getAdminBugReports({
        countryCode: countryFilter,
        status: req.query.status as string,
        severity: req.query.severity as string,
        priority: req.query.priority as string,
        category: req.query.category as string,
        assignedTo: req.query.assignedTo as string,
        search: req.query.search as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        limit,
        offset,
      });
      return res.json({ reports, total, page: Math.floor(offset / limit) + 1, limit, totalPages: Math.ceil(total / limit) });
    } catch {
      return res.status(500).json({ message: "Failed to fetch bug reports" });
    }
  });

  // ── GET /api/admin/bug-reports/:id ─────────────────────────────────────
  app.get("/api/admin/bug-reports/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;
      if (!["admin", "global_admin", "country_admin"].includes(user.role)) return res.status(403).json({ message: "Admin only" });
      const report = await storage.getBugReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!canAccessCountry(user, report.countryCode)) return res.status(403).json({ message: "Cross-country access denied" });
      const comments = await storage.getBugReportComments(req.params.id);
      return res.json({ report, comments });
    } catch {
      return res.status(500).json({ message: "Failed to fetch report" });
    }
  });
}
