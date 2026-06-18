/**
 * Admin Home Summary API
 *
 * GET /api/admin/home-summary
 *
 * Single aggregated endpoint that powers the Admin Home Experience.
 * Uses a single checked-out client (never parallel pool.query calls) to
 * avoid pool exhaustion under concurrent admin users.
 */

import type { Express, Response } from "express";
import { pool } from "../../db";
import {
  authenticateToken,
  requireAdmin,
  AuthRequest,
} from "../../middleware/auth";
import { getJobStates, countFailingJobs } from "../../lib/cronState";
import { listingCountryFilter } from "../../middleware/country";

// 60-second TTL cache to avoid hammering Supabase for every admin page load
const homeSummaryCache = new Map<string, { data: any; ts: number }>();
const HOME_SUMMARY_TTL_MS = 60_000;

export function registerAdminHomeRoutes(app: Express): void {

  app.get(
    "/api/admin/home-summary",
    authenticateToken,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const cacheKey = `home:${countryFilter || "global"}`;
      const cached = homeSummaryCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < HOME_SUMMARY_TTL_MS) {
        res.setHeader("X-Cache", "HIT");
        return res.json(cached.data);
      }
      const client = await pool.connect();
      try {
        const ccClause  = countryFilter ? `AND country_code::text = '${countryFilter}'` : "";
        const pccClause = countryFilter ? `AND p.country_code::text = '${countryFilter}'` : "";

        // ── 1. Platform overview ─────────────────────────────────────────────
        const platformRes = await client.query(`
          SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'patient' ${ccClause}) AS total_patients,
            (SELECT COUNT(*) FROM users WHERE role = 'provider' ${ccClause}) AS total_providers,
            (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE ${ccClause}) AS new_users_today,
            (SELECT COUNT(*) FROM appointments WHERE start_at::date = CURRENT_DATE AND status NOT IN ('cancelled','cancelled_by_patient','cancelled_by_provider','rejected','no_show','expired') ${ccClause}) AS appointments_today,
            (SELECT COUNT(*) FROM appointments WHERE status = 'pending' ${ccClause}) AS pending_bookings,
            (SELECT COUNT(*) FROM user_packages up
              JOIN packages pkg ON pkg.id = up.package_id
              JOIN users u ON u.id = up.user_id
              WHERE up.status = 'active' AND up.expires_at > NOW()
              ${countryFilter ? `AND u.country_code::text = '${countryFilter}'` : ""}) AS active_memberships
        `);

        // ── 2. Provider review queue + lifecycle breakdown ────────────────────
        const providerRes = await client.query(`
          SELECT
            (SELECT COUNT(*) FROM providers WHERE status IN ('submitted','pending_approval') ${ccClause}) AS pending_approval,
            (SELECT COUNT(*) FROM providers WHERE status = 'action_required' ${ccClause}) AS action_required,
            (SELECT COUNT(*) FROM providers WHERE status = 'draft' ${ccClause}) AS draft_count,
            (SELECT COUNT(*) FROM provider_documents pd JOIN providers p ON p.id = pd.provider_id
              WHERE pd.verification_status = 'pending' ${pccClause}) AS docs_pending,
            (SELECT COUNT(*) FROM provider_documents pd JOIN providers p ON p.id = pd.provider_id
              WHERE pd.verification_status = 'rejected' ${pccClause}) AS docs_rejected,
            (SELECT COUNT(*) FROM providers
              WHERE status IN ('submitted','under_review','action_required','pending_approval','documents_verified') ${ccClause}) AS total_needs_review,
            (SELECT COUNT(*) FROM providers WHERE status IN ('submitted','pending_approval') ${ccClause}) AS lifecycle_submitted,
            (SELECT COUNT(*) FROM providers WHERE status IN ('under_review','documents_verified') ${ccClause}) AS lifecycle_under_review,
            (SELECT COUNT(*) FROM providers WHERE status = 'action_required' ${ccClause}) AS lifecycle_action_required,
            (SELECT COUNT(*) FROM providers WHERE status IN ('approved','active') ${ccClause}) AS lifecycle_approved,
            (SELECT COUNT(*) FROM providers WHERE status = 'suspended' ${ccClause}) AS lifecycle_suspended,
            (SELECT COUNT(*) FROM providers WHERE status = 'deactivated' ${ccClause}) AS lifecycle_deactivated,
            (SELECT COUNT(*) FROM providers WHERE status = 'draft' ${ccClause}) AS lifecycle_draft,
            (SELECT COUNT(*) FROM providers ${ccClause ? `WHERE ${ccClause.replace(/^AND /, "")}` : ""}) AS lifecycle_total
        `);

        // ── 3. Today's appointments ──────────────────────────────────────────
        const apptWhere = ccClause ? `WHERE ${ccClause.replace(/^AND /, '')}` : "";
        const appointmentRes = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE start_at::date = CURRENT_DATE AND status NOT IN ('cancelled','cancelled_by_patient','cancelled_by_provider','rejected','no_show','expired')) AS total_today,
            COUNT(*) FILTER (WHERE start_at::date = CURRENT_DATE AND visit_type = 'online') AS video_today,
            COUNT(*) FILTER (WHERE start_at::date = CURRENT_DATE AND status = 'cancelled') AS cancelled_today,
            COUNT(*) FILTER (WHERE start_at::date = CURRENT_DATE AND status = 'no_show') AS no_show_today,
            COUNT(*) FILTER (WHERE start_at::date = CURRENT_DATE AND status = 'confirmed') AS confirmed_today,
            COUNT(*) FILTER (WHERE start_at::date = CURRENT_DATE AND status = 'completed') AS completed_today
          FROM appointments
          ${apptWhere}
        `);

        // ── 4. Financial watchlist ───────────────────────────────────────────
        const financialRes = await client.query(`
          SELECT
            (SELECT COUNT(*) FROM provider_wallets pw JOIN providers p ON p.id = pw.provider_id
              WHERE pw.available_balance::numeric > 0 ${pccClause}) AS pending_payouts,
            (SELECT COUNT(*) FROM appointments
              WHERE refund_status = 'pending' ${ccClause}) AS pending_refunds,
            (SELECT COUNT(*) FROM appointments
              WHERE payment_status = 'failed'
              AND created_at > NOW() - INTERVAL '7 days' ${ccClause}) AS failed_payments,
            (SELECT COALESCE(SUM(total_amount::numeric), 0) FROM appointments
              WHERE start_at::date = CURRENT_DATE AND payment_status = 'completed' ${ccClause}) AS revenue_today
        `);

        // ── 5. Support & incidents ────────────────────────────────────────────
        const supportRes = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'open') AS open_tickets,
            COUNT(*) FILTER (WHERE status = 'open' AND priority = 'urgent') AS urgent_tickets,
            COUNT(*) FILTER (WHERE status IN ('open','in_progress')) AS active_tickets,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today
          FROM support_tickets
        `);

        // ── 6. Compliance — uses provider_documents.expiry_date (TEXT) ───────
        //    provider_credentials has no expiry_date column.
        const complianceRes = await client.query(`
          SELECT
            (SELECT COUNT(*) FROM provider_documents pd JOIN providers p ON p.id = pd.provider_id
              WHERE pd.expiry_date IS NOT NULL
              AND pd.expiry_date::date <= CURRENT_DATE + INTERVAL '30 days'
              AND pd.expiry_date::date > CURRENT_DATE
              ${pccClause}) AS expiring_credentials,
            (SELECT COUNT(*) FROM provider_documents pd JOIN providers p ON p.id = pd.provider_id
              WHERE pd.expiry_date IS NOT NULL
              AND pd.expiry_date::date <= CURRENT_DATE
              ${pccClause}) AS expired_credentials,
            (SELECT COUNT(*) FROM providers
              WHERE is_verified = false AND status = 'active' ${ccClause}) AS unverified_active
        `);

        // ── 7. Recent activity ────────────────────────────────────────────────
        const activityRes = await client.query(`
          SELECT al.id, al.action, al.entity_type, al.entity_id, al.created_at,
                 u.first_name, u.last_name, u.role, al.details
          FROM audit_logs al
          LEFT JOIN users u ON u.id = al.user_id
          ORDER BY al.created_at DESC
          LIMIT 12
        `);

        // ── 8. Bug reports ────────────────────────────────────────────────────
        // bug_status enum values: 'new','triaged','in_progress','waiting_for_user','resolved','closed','duplicate','rejected'
        const bugRes = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('new','triaged','in_progress','waiting_for_user')) AS open_bugs,
            COUNT(*) FILTER (WHERE status IN ('new','triaged','in_progress','waiting_for_user') AND severity IN ('critical','high')) AS critical_bugs,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today
          FROM bug_reports
        `);

        // ── Scheduler health (in-memory, no DB) ──────────────────────────────
        const schedulerJobs = getJobStates();
        const failingJobs   = countFailingJobs();

        const ps  = platformRes.rows[0]    || {};
        const pvs = providerRes.rows[0]    || {};
        const as  = appointmentRes.rows[0] || {};
        const fs  = financialRes.rows[0]   || {};
        const ss  = supportRes.rows[0]     || {};
        const cs  = complianceRes.rows[0]  || {};
        const bs  = bugRes.rows[0]         || {};

        const totalActionsRequired =
          (parseInt(pvs.total_needs_review) || 0) +
          (parseInt(pvs.docs_pending)       || 0) +
          (parseInt(ss.urgent_tickets)      || 0) +
          (parseInt(fs.pending_refunds)     || 0) +
          (parseInt(fs.failed_payments)     || 0) +
          (parseInt(bs.critical_bugs)       || 0) +
          failingJobs;

        const _resp = {
          generatedAt: new Date().toISOString(),
          totalActionsRequired,

          platform: {
            totalPatients:     parseInt(ps.total_patients)     || 0,
            totalProviders:    parseInt(ps.total_providers)    || 0,
            newUsersToday:     parseInt(ps.new_users_today)    || 0,
            appointmentsToday: parseInt(ps.appointments_today) || 0,
            pendingBookings:   parseInt(ps.pending_bookings)   || 0,
            activeMemberships: parseInt(ps.active_memberships) || 0,
          },

          providers: {
            pendingApproval:  parseInt(pvs.pending_approval)   || 0,
            actionRequired:   parseInt(pvs.action_required)    || 0,
            draftCount:       parseInt(pvs.draft_count)        || 0,
            docsPending:      parseInt(pvs.docs_pending)       || 0,
            docsRejected:     parseInt(pvs.docs_rejected)      || 0,
            totalNeedsReview: parseInt(pvs.total_needs_review) || 0,
            lifecycle: {
              draft:          parseInt(pvs.lifecycle_draft)           || 0,
              submitted:      parseInt(pvs.lifecycle_submitted)       || 0,
              underReview:    parseInt(pvs.lifecycle_under_review)    || 0,
              actionRequired: parseInt(pvs.lifecycle_action_required) || 0,
              approved:       parseInt(pvs.lifecycle_approved)        || 0,
              suspended:      parseInt(pvs.lifecycle_suspended)       || 0,
              deactivated:    parseInt(pvs.lifecycle_deactivated)     || 0,
              total:          parseInt(pvs.lifecycle_total)           || 0,
            },
          },

          appointments: {
            totalToday:     parseInt(as.total_today)     || 0,
            videoToday:     parseInt(as.video_today)     || 0,
            cancelledToday: parseInt(as.cancelled_today) || 0,
            noShowToday:    parseInt(as.no_show_today)   || 0,
            confirmedToday: parseInt(as.confirmed_today) || 0,
            completedToday: parseInt(as.completed_today) || 0,
          },

          financial: {
            pendingPayouts: parseInt(fs.pending_payouts)  || 0,
            pendingRefunds: parseInt(fs.pending_refunds)  || 0,
            failedPayments: parseInt(fs.failed_payments)  || 0,
            revenueToday:   parseFloat(fs.revenue_today)  || 0,
          },

          support: {
            openTickets:   parseInt(ss.open_tickets)   || 0,
            urgentTickets: parseInt(ss.urgent_tickets) || 0,
            activeTickets: parseInt(ss.active_tickets) || 0,
            newToday:      parseInt(ss.new_today)      || 0,
          },

          compliance: {
            expiringCredentials: parseInt(cs.expiring_credentials) || 0,
            expiredCredentials:  parseInt(cs.expired_credentials)  || 0,
            unverifiedActive:    parseInt(cs.unverified_active)    || 0,
          },

          bugs: {
            openBugs:    parseInt(bs.open_bugs)    || 0,
            criticalBugs: parseInt(bs.critical_bugs) || 0,
            newToday:    parseInt(bs.new_today)    || 0,
          },

          scheduler: {
            totalJobs:    schedulerJobs.length,
            failingJobs,
            healthyJobs:  schedulerJobs.filter(j => j.status === "ok").length,
            jobs: schedulerJobs.slice(0, 8).map(j => ({
              name:               j.jobName,
              status:             j.status,
              lastRunAt:          j.lastRunAt,
              consecutiveFailures: j.consecutiveFailures,
              lastError:          j.lastError,
            })),
          },

          recentActivity: activityRes.rows.map(r => ({
            id:         r.id,
            action:     r.action,
            entityType: r.entity_type,
            entityId:   r.entity_id,
            createdAt:  r.created_at,
            actorName:  r.first_name ? `${r.first_name} ${r.last_name}`.trim() : "System",
            actorRole:  r.role,
            details:    r.details,
          })),
        };
        homeSummaryCache.set(cacheKey, { data: _resp, ts: Date.now() });
        res.json(_resp);

      } catch (err: any) {
        console.error("[admin/home-summary]", err);
        res.status(500).json({ message: "Failed to load admin home summary" });
      } finally {
        client.release();
      }
    },
  );
}
