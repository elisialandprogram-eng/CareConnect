/**
 * Admin Monitoring routes — extracted from server/routes.ts
 *
 * Covers: analytics, bookings (admin), audit-logs, my-permissions,
 * permissions-matrix, enhanced-analytics, monitoring stats/events,
 * analytics events/funnel, public analytics track.
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
  requirePermission,
  PERMISSIONS,
  loadUserPermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from "../../middleware/rbac";
import {
  canAccessCountry,
  listingCountryFilter,
} from "../../middleware/country";
import { getEventSummary, getDailyFunnel, trackEvent } from "../../services/analyticsTracker";
import { createInvoiceForAppointment } from "../../utils/invoice-helper";

export function registerAdminMonitoringRoutes(app: Express): void {

  // ── Analytics ─────────────────────────────────────────────────────────────
  app.get("/api/admin/analytics", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = listingCountryFilter(req.user!, req.query as any) ?? undefined;
      const stats = await storage.getAnalyticsStats(countryCode);
      res.json(stats);
    } catch (error) {
      console.error("[analytics]", error);
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // ── Bookings (paginated) ──────────────────────────────────────────────────
  app.get("/api/admin/bookings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string || "1",  10));
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string || "50", 10)));
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const userId = req.query.userId as string | undefined;

      const { rows, total } = await storage.getAppointmentListPaginated({
        page, limit,
        countryCode: countryFilter ?? undefined,
        userId,
      });

      res.json({
        appointments: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get bookings" });
    }
  });

  app.patch("/api/admin/bookings/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body;
      const booking = await storage.getAppointment(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (!canAccessCountry(req.user!, (booking as any).countryCode)) {
        return res.status(404).json({ message: "Booking not found" });
      }

      let updated;
      if (typeof status === "string" && status !== booking.status) {
        const adminStatusToAction: Record<string, string> = {
          approved: "approve", confirmed: "confirm", in_progress: "start",
          completed: "complete", rejected: "reject", cancelled: "cancel",
          cancelled_by_patient: "cancel", cancelled_by_provider: "cancel",
          no_show: "no_show", rescheduled: "reschedule", expired: "cancel",
        };
        const verb = adminStatusToAction[status];
        if (verb) {
          const txRes = await storage.updateAppointmentWithEvent(
            req.params.id,
            req.body,
            {
              action: verb as any,
              actorUserId: req.user?.id ?? null,
              actorRole: "admin" as any,
              fromStatus: booking.status as any,
              toStatus: status as any,
              reason: typeof req.body?.reason === "string" ? req.body.reason : "Admin override",
              reasonCode: "admin_override",
            },
          );
          updated = txRes?.appointment;
        } else {
          updated = await storage.updateAppointment(req.params.id, req.body);
        }
      } else {
        updated = await storage.updateAppointment(req.params.id, req.body);
      }
      if (!updated) return res.status(404).json({ message: "Booking not found" });

      if (status === "completed" && !booking.invoiceGenerated) {
        try { await createInvoiceForAppointment(booking.id); } catch (genError) {
          console.error("Auto invoice generation error:", genError);
        }
      }
      if (status === "completed") {
        try { await storage.recordProviderEarning(booking.id); } catch (earnErr) {
          console.error("[routes] earnings record failed (admin booking update):", earnErr);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Failed to update booking status:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  // ── Audit logs ────────────────────────────────────────────────────────────
  app.get("/api/admin/audit-logs", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.AUDIT_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const action = req.query.action as string | undefined;
      const entityType = req.query.entityType as string | undefined;
      const countryCode = canAccessCountry(req.user!, null)
        ? (req.query.countryCode as string | undefined)
        : req.user!.countryCode;
      const result = await storage.getAllAuditLogs({ limit, offset, action, entityType, countryCode });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // ── My permissions ────────────────────────────────────────────────────────
  app.get("/api/admin/my-permissions", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { role } = req.user!;
      if (role === "admin" || role === "global_admin") {
        const allPerms = Object.values(PERMISSIONS);
        return res.json({ roleName: "super_admin", permissions: allPerms, countryCode: null });
      }
      const { perms, country, roleName } = await loadUserPermissions(req.user!.id);
      const effectivePerms = perms.size > 0 ? [...perms] : (DEFAULT_ROLE_PERMISSIONS.country_admin as string[]);
      return res.json({ roleName, permissions: effectivePerms, countryCode: country });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/permissions-matrix", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const { getPermissionsMatrix } = await import("../../middleware/rbac");
      return res.json(getPermissionsMatrix());
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── Enhanced analytics ────────────────────────────────────────────────────
  app.get("/api/admin/analytics/enhanced", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = canAccessCountry(req.user!, null)
        ? (req.query.countryCode as string | undefined)
        : req.user!.countryCode;
      const cacheKey = `analytics:${countryCode ?? "all"}`;
      const { analyticsCache } = await import("../../lib/cache");
      const cached = analyticsCache.get(cacheKey);
      if (cached) return res.json(cached);
      const data = await storage.getEnhancedAnalytics(countryCode);
      const responseWithMeta = {
        ...data,
        canonical_currency: "USD",
        currency_note: "All financial values (refundTotal, revenue) are stored and returned in USD.",
      };
      analyticsCache.set(cacheKey, responseWithMeta);
      res.json(responseWithMeta);
    } catch (e: any) {
      console.error("[analytics/enhanced]", e);
      res.status(500).json({ message: "Failed to get enhanced analytics" });
    }
  });

  // ── System monitoring ─────────────────────────────────────────────────────
  app.get("/api/admin/monitoring/stats", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = canAccessCountry(req.user!, null)
        ? (req.query.countryCode as string | undefined)
        : req.user!.countryCode;
      const stats = await storage.getSystemEventStats(countryCode);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/monitoring/events", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const eventType = req.query.eventType as string | undefined;
      const severity = req.query.severity as string | undefined;
      const unresolvedOnly = req.query.unresolvedOnly === "true";
      const countryCode = canAccessCountry(req.user!, null)
        ? (req.query.countryCode as string | undefined)
        : req.user!.countryCode;
      const result = await storage.getSystemEvents({ limit, offset, eventType, severity, countryCode, unresolvedOnly });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/monitoring/events/:id/resolve", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const ev = await storage.resolveSystemEvent(req.params.id, req.user!.id);
      if (!ev) return res.status(404).json({ message: "Event not found" });
      res.json(ev);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Analytics events/funnel ───────────────────────────────────────────────
  app.get("/api/admin/analytics/events", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query as Record<string, string>;
      const countryCode = canAccessCountry(req.user!, null)
        ? (req.query.countryCode as string | undefined ?? null)
        : (req.user!.countryCode ?? null);
      const summary = await getEventSummary({ countryCode, startDate, endDate });
      res.json({ events: summary });
    } catch (error) {
      console.error("[admin/analytics/events]", error);
      res.status(500).json({ message: "Failed to load event analytics" });
    }
  });

  app.get("/api/admin/analytics/funnel", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const days = Math.min(parseInt(String(req.query.days ?? "30"), 10) || 30, 180);
      const countryCode = canAccessCountry(req.user!, null)
        ? (req.query.countryCode as string | undefined ?? null)
        : (req.user!.countryCode ?? null);
      const funnel = await getDailyFunnel({ days, countryCode });
      res.json({ funnel, days });
    } catch (error) {
      console.error("[admin/analytics/funnel]", error);
      res.status(500).json({ message: "Failed to load funnel analytics" });
    }
  });

  // ── Public analytics track ────────────────────────────────────────────────
  app.post("/api/analytics/track", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        eventType: z.enum([
          "search", "booking_started", "booking_completed", "booking_cancelled",
          "waitlist_joined", "waitlist_fulfilled", "package_purchased",
          "provider_onboarded", "provider_verified", "refund_issued",
          "review_submitted", "profile_viewed",
        ]),
        providerId: z.string().optional().nullable(),
        serviceCategory: z.string().optional().nullable(),
        serviceMode: z.string().optional().nullable(),
        metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      });
      const data = schema.parse(req.body);
      await trackEvent({
        ...data,
        userId: req.user?.id ?? null,
        countryCode: req.user?.countryCode ?? null,
      });
      res.json({ ok: true });
    } catch (error: any) {
      if (error?.issues) return res.status(400).json({ message: "Invalid payload", issues: error.issues });
      res.status(500).json({ message: "Track failed" });
    }
  });

  // ── GET /api/admin/monitoring/daily-summaries ──────────────────────────────
  // Section E — persistent daily request metrics
  app.get(
    "/api/admin/monitoring/daily-summaries",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (_req: AuthRequest, res: Response) => {
      try {
        const { rows } = await pool.query(
          `SELECT snapshot_date, total_requests, errors_4xx, errors_5xx, slow_requests,
                  created_at, updated_at
           FROM monitoring_daily_summary
           ORDER BY snapshot_date DESC
           LIMIT 90`,
        );
        res.json({ summaries: rows });
      } catch {
        res.status(500).json({ message: "Failed to load daily summaries" });
      }
    },
  );

  // ── GET /api/admin/monitoring/endpoint-performance ─────────────────────────
  // Section E — per-endpoint trend data (last 30 days, top routes)
  app.get(
    "/api/admin/monitoring/endpoint-performance",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const route  = req.query.route as string | undefined;
        const days   = Math.min(90, parseInt((req.query.days as string) || "30", 10));

        const { rows } = await pool.query(
          `SELECT snapshot_date, route, total_requests, avg_ms, max_ms,
                  errors_4xx, errors_5xx, slow_hits
           FROM monitoring_endpoint_stats
           WHERE snapshot_date >= CURRENT_DATE - $1::int
             ${route ? "AND route = $2" : ""}
           ORDER BY snapshot_date DESC, total_requests DESC
           LIMIT 100`,
          route ? [days, route] : [days],
        );
        res.json({ stats: rows });
      } catch {
        res.status(500).json({ message: "Failed to load endpoint performance" });
      }
    },
  );

  // ── GET /api/admin/monitoring/error-trends ─────────────────────────────────
  // Section E — aggregated error rate trends per day
  app.get(
    "/api/admin/monitoring/error-trends",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (_req: AuthRequest, res: Response) => {
      try {
        const { rows } = await pool.query(
          `SELECT
             snapshot_date,
             SUM(total_requests)  AS total_requests,
             SUM(errors_4xx)      AS errors_4xx,
             SUM(errors_5xx)      AS errors_5xx,
             SUM(slow_hits)       AS slow_hits,
             CASE WHEN SUM(total_requests) > 0
               THEN ROUND((SUM(errors_5xx)::numeric / SUM(total_requests)) * 100, 2)
               ELSE 0 END AS error_rate_pct
           FROM monitoring_endpoint_stats
           WHERE snapshot_date >= CURRENT_DATE - 30
           GROUP BY snapshot_date
           ORDER BY snapshot_date DESC`,
        );
        res.json({ trends: rows });
      } catch {
        res.status(500).json({ message: "Failed to load error trends" });
      }
    },
  );

  // ── GET /api/admin/support/analytics ──────────────────────────────────────
  // Phase C — support ticket trends, SLA metrics, escalation visibility
  app.get(
    "/api/admin/support/analytics",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.TICKETS_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const days = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? "30"), 10)));
        const client = await pool.connect();
        try {
          const [overviewRows, trendRows, slaRows, priorityRows] = await Promise.all([
            // Overall volume snapshot
            client.query(
              `SELECT
                 COUNT(*)                                              AS total,
                 COUNT(*) FILTER (WHERE status = 'open')              AS open_count,
                 COUNT(*) FILTER (WHERE status = 'in_progress')       AS in_progress_count,
                 COUNT(*) FILTER (WHERE status = 'resolved')          AS resolved_count,
                 COUNT(*) FILTER (WHERE status = 'closed')            AS closed_count,
                 COUNT(*) FILTER (WHERE priority IN ('high','urgent')) AS escalated_count,
                 CASE WHEN COUNT(*) > 0
                   THEN ROUND(COUNT(*) FILTER (WHERE priority IN ('high','urgent')) * 100.0 / COUNT(*), 1)
                   ELSE 0 END AS escalation_rate_pct
               FROM support_tickets
               WHERE created_at >= NOW() - ($1::int || ' days')::interval`,
              [days],
            ),
            // Daily ticket volume trend
            client.query(
              `SELECT
                 TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
                 COUNT(*)                                               AS created,
                 COUNT(*) FILTER (WHERE status IN ('resolved','closed')) AS resolved
               FROM support_tickets
               WHERE created_at >= NOW() - ($1::int || ' days')::interval
               GROUP BY DATE_TRUNC('day', created_at)
               ORDER BY day ASC`,
              [days],
            ),
            // SLA: avg resolution time for tickets resolved in window
            client.query(
              `SELECT
                 COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)  AS resolved_with_ts,
                 ROUND(AVG(
                   EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
                 ) FILTER (WHERE resolved_at IS NOT NULL)::numeric, 1)     AS avg_resolution_hrs,
                 ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
                 ) FILTER (WHERE resolved_at IS NOT NULL))::numeric, 1)     AS median_resolution_hrs,
                 ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
                 ) FILTER (WHERE resolved_at IS NOT NULL))::numeric, 1)     AS p90_resolution_hrs
               FROM support_tickets
               WHERE created_at >= NOW() - ($1::int || ' days')::interval`,
              [days],
            ),
            // Volume by priority
            client.query(
              `SELECT
                 priority,
                 COUNT(*)                          AS total,
                 COUNT(*) FILTER (WHERE status IN ('resolved','closed')) AS resolved
               FROM support_tickets
               WHERE created_at >= NOW() - ($1::int || ' days')::interval
               GROUP BY priority
               ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
              [days],
            ),
          ]);

          const ov = overviewRows.rows[0] ?? {};
          const sla = slaRows.rows[0] ?? {};

          res.json({
            days,
            overview: {
              total: Number(ov.total ?? 0),
              openCount: Number(ov.open_count ?? 0),
              inProgressCount: Number(ov.in_progress_count ?? 0),
              resolvedCount: Number(ov.resolved_count ?? 0),
              closedCount: Number(ov.closed_count ?? 0),
              escalatedCount: Number(ov.escalated_count ?? 0),
              escalationRatePct: parseFloat(ov.escalation_rate_pct ?? "0"),
            },
            sla: {
              resolvedWithTimestamp: Number(sla.resolved_with_ts ?? 0),
              avgResolutionHrs: sla.avg_resolution_hrs ? parseFloat(sla.avg_resolution_hrs) : null,
              medianResolutionHrs: sla.median_resolution_hrs ? parseFloat(sla.median_resolution_hrs) : null,
              p90ResolutionHrs: sla.p90_resolution_hrs ? parseFloat(sla.p90_resolution_hrs) : null,
            },
            dailyTrend: trendRows.rows.map((r: any) => ({
              day: r.day,
              created: Number(r.created),
              resolved: Number(r.resolved),
            })),
            byPriority: priorityRows.rows.map((r: any) => ({
              priority: r.priority,
              total: Number(r.total),
              resolved: Number(r.resolved),
              resolutionRate: Number(r.total) > 0 ? Math.round(Number(r.resolved) * 100 / Number(r.total)) : 0,
            })),
          });
        } finally {
          client.release();
        }
      } catch (err: any) {
        console.error("[support/analytics]", err);
        res.status(500).json({ message: "Failed to load support analytics" });
      }
    },
  );

  // ── GET /api/admin/analytics/growth-metrics ────────────────────────────────
  // Phase C — acquisition, repeat booking rate, retention, no-show analysis
  app.get(
    "/api/admin/analytics/growth-metrics",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const weeks = Math.min(52, Math.max(4, parseInt(String(req.query.weeks ?? "12"), 10)));
        const countryCode = listingCountryFilter(req.user!, req.query as any);
        const ccFilter = countryCode ? `AND u.country_code::text = $2` : "";
        const ccApptFilter = countryCode ? `AND a.country_code::text = $2` : "";
        const params: unknown[] = [weeks];
        if (countryCode) params.push(countryCode);

        const client = await pool.connect();
        try {
          const [acquisitionRows, repeatRows, noShowRows, retentionRows] = await Promise.all([
            // Weekly new patient acquisition
            client.query(
              `SELECT
                 TO_CHAR(DATE_TRUNC('week', u.created_at), 'YYYY-MM-DD') AS week_start,
                 COUNT(*)                                                  AS new_patients
               FROM users u
               WHERE u.role = 'patient'
                 AND u.created_at >= NOW() - ($1::int || ' weeks')::interval
                 ${ccFilter}
               GROUP BY DATE_TRUNC('week', u.created_at)
               ORDER BY week_start ASC`,
              params,
            ),
            // Repeat booking rate: patients with 2+ completed appointments
            client.query(
              `SELECT
                 COUNT(DISTINCT a.patient_id) FILTER (WHERE appt_count >= 2) AS repeat_patients,
                 COUNT(DISTINCT a.patient_id)                                  AS total_patients,
                 CASE WHEN COUNT(DISTINCT a.patient_id) > 0
                   THEN ROUND(COUNT(DISTINCT a.patient_id) FILTER (WHERE appt_count >= 2) * 100.0 / COUNT(DISTINCT a.patient_id), 1)
                   ELSE 0 END AS repeat_rate_pct
               FROM (
                 SELECT patient_id, COUNT(*) AS appt_count
                 FROM appointments
                 WHERE payment_status = 'completed'
                   ${countryCode ? "AND country_code::text = $1" : ""}
                 GROUP BY patient_id
               ) a`,
              countryCode ? [countryCode] : [],
            ),
            // No-show analysis by visit type
            client.query(
              `SELECT
                 visit_type::text   AS visit_type,
                 COUNT(*)           AS total_appointments,
                 COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count,
                 CASE WHEN COUNT(*) > 0
                   THEN ROUND(COUNT(*) FILTER (WHERE status = 'no_show') * 100.0 / COUNT(*), 1)
                   ELSE 0 END AS no_show_rate_pct
               FROM appointments a
               WHERE a.created_at >= NOW() - ($1::int || ' weeks')::interval
                 ${ccApptFilter}
               GROUP BY visit_type
               ORDER BY no_show_rate_pct DESC`,
              params,
            ),
            // Retention: patients active in last 90 days vs inactive 90-180 days
            client.query(
              `SELECT
                 COUNT(DISTINCT CASE WHEN last_appt >= NOW() - INTERVAL '90 days'  THEN patient_id END) AS active_patients,
                 COUNT(DISTINCT CASE WHEN last_appt < NOW() - INTERVAL '90 days'
                                      AND last_appt >= NOW() - INTERVAL '180 days' THEN patient_id END) AS churned_patients,
                 COUNT(DISTINCT patient_id) AS total_with_appts
               FROM (
                 SELECT patient_id, MAX(created_at) AS last_appt
                 FROM appointments
                 WHERE payment_status = 'completed'
                   ${countryCode ? "AND country_code::text = $1" : ""}
                 GROUP BY patient_id
               ) sub`,
              countryCode ? [countryCode] : [],
            ),
          ]);

          const repeatData = repeatRows.rows[0] ?? {};
          const retentionData = retentionRows.rows[0] ?? {};

          res.json({
            weeks,
            acquisition: {
              weeklyTrend: acquisitionRows.rows.map((r: any) => ({
                weekStart: r.week_start,
                newPatients: Number(r.new_patients),
              })),
            },
            repeatBooking: {
              repeatPatients: Number(repeatData.repeat_patients ?? 0),
              totalPatients: Number(repeatData.total_patients ?? 0),
              repeatRatePct: parseFloat(repeatData.repeat_rate_pct ?? "0"),
            },
            noShowAnalysis: noShowRows.rows.map((r: any) => ({
              visitType: r.visit_type,
              totalAppointments: Number(r.total_appointments),
              noShowCount: Number(r.no_show_count),
              noShowRatePct: parseFloat(r.no_show_rate_pct),
            })),
            retention: {
              activePatients: Number(retentionData.active_patients ?? 0),
              churnedPatients: Number(retentionData.churned_patients ?? 0),
              totalWithAppointments: Number(retentionData.total_with_appts ?? 0),
              retentionRatePct: (() => {
                const active = Number(retentionData.active_patients ?? 0);
                const churned = Number(retentionData.churned_patients ?? 0);
                const denom = active + churned;
                return denom > 0 ? Math.round(active * 100 / denom) : 0;
              })(),
            },
          });
        } finally {
          client.release();
        }
      } catch (err: any) {
        console.error("[growth-metrics]", err);
        res.status(500).json({ message: "Failed to load growth metrics" });
      }
    },
  );
}
