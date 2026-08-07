/**
 * Admin Development Tools — GX-02 Environment Management API
 *
 * POST /api/admin/dev/reset/preview          — full dry-run count
 * POST /api/admin/dev/reset/execute          — full destructive reset
 * POST /api/admin/dev/reset/profile/preview  — profile-targeted dry-run
 * POST /api/admin/dev/reset/profile/execute  — profile-targeted execute
 * GET  /api/admin/dev/reset/profiles         — list all reset profiles
 * GET  /api/admin/dev/reset/history          — audit log
 * GET  /api/admin/dev/seed/status            — seed account status
 * POST /api/admin/dev/seed/execute           — seed UAT data
 * GET  /api/admin/dev/env/snapshot           — environment snapshot
 * GET  /api/admin/dev/env/test-data          — test data detection
 * GET  /api/admin/dev/env/platform-stats     — platform-wide stats
 * GET  /api/admin/dev/env/db-health          — database health metrics
 *
 * Requires: global_admin role.
 */

import type { Express, Response } from "express";
import { pool } from "../../db";
import {
  authenticateToken,
  requireGlobalAdmin,
  AuthRequest,
} from "../../middleware/auth";
import {
  previewReset,
  executeReset,
  previewProfileReset,
  executeProfileReset,
  RESET_PROFILES,
} from "../../services/database-reset.service";
import { getSeedStatus, executeSeed } from "../../services/seed-uat.service";
import {
  getDbHealth,
  captureEnvironmentSnapshot,
  detectTestData,
  getPlatformStats,
} from "../../services/environment-management.service";

const CONFIRMATION_PHRASE = "RESET DATABASE";

export function registerAdminDevToolsRoutes(app: Express): void {

  // ── GET /api/admin/dev/reset/profiles ────────────────────────────────────
  app.get(
    "/api/admin/dev/reset/profiles",
    authenticateToken,
    requireGlobalAdmin,
    (_req: AuthRequest, res: Response) => {
      res.json({ profiles: RESET_PROFILES });
    }
  );

  // ── POST /api/admin/dev/reset/preview ─────────────────────────────────────
  app.post(
    "/api/admin/dev/reset/preview",
    authenticateToken,
    requireGlobalAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const counts = await previewReset();
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user!.id, "db_reset_preview", "system", "db_reset",
           JSON.stringify({ counts, ip: req.ip }), "GL"]
        ).catch(() => null);
        res.json({ counts });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Preview failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── POST /api/admin/dev/reset/execute ─────────────────────────────────────
  app.post(
    "/api/admin/dev/reset/execute",
    authenticateToken,
    requireGlobalAdmin,
    async (req: AuthRequest, res: Response) => {
      const { confirm, understood } = req.body as { confirm?: string; understood?: boolean };
      if (!understood) return res.status(400).json({ error: "Must acknowledge destructive action (understood: true)" });
      if (confirm !== CONFIRMATION_PHRASE) return res.status(400).json({ error: `Confirmation phrase must be exactly: ${CONFIRMATION_PHRASE}` });

      const start = Date.now();
      try {
        const result = await executeReset();
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user!.id, "db_reset_executed", "system", "db_reset",
           JSON.stringify({ counts: result.counts, durationMs: result.durationMs, errors: result.errors, ip: req.ip }), "GL"]
        ).catch(() => null);
        res.json({ success: true, counts: result.counts, durationMs: result.durationMs, errors: result.errors, executedAt: new Date().toISOString(), executedBy: req.user!.id });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Reset failed";
        console.error("[db-reset] execute error:", msg, "duration:", Date.now() - start, "ms");
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── POST /api/admin/dev/reset/profile/preview ─────────────────────────────
  app.post(
    "/api/admin/dev/reset/profile/preview",
    authenticateToken,
    requireGlobalAdmin,
    async (req: AuthRequest, res: Response) => {
      const { profileId } = req.body as { profileId?: string };
      if (!profileId) return res.status(400).json({ error: "profileId required" });
      const valid = RESET_PROFILES.find((p) => p.id === profileId);
      if (!valid) return res.status(400).json({ error: `Unknown profile: ${profileId}` });
      try {
        const preview = await previewProfileReset(profileId);
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user!.id, "db_reset_preview", "system", `db_reset_profile_${profileId}`,
           JSON.stringify({ profileId, preview, ip: req.ip }), "GL"]
        ).catch(() => null);
        res.json({ preview });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Profile preview failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── POST /api/admin/dev/reset/profile/execute ─────────────────────────────
  app.post(
    "/api/admin/dev/reset/profile/execute",
    authenticateToken,
    requireGlobalAdmin,
    async (req: AuthRequest, res: Response) => {
      const { profileId, confirm, understood } = req.body as {
        profileId?: string; confirm?: string; understood?: boolean;
      };
      if (!profileId) return res.status(400).json({ error: "profileId required" });
      if (!understood) return res.status(400).json({ error: "Must acknowledge destructive action (understood: true)" });
      const phrase = `RESET ${profileId.toUpperCase()}`;
      if (confirm !== phrase && confirm !== CONFIRMATION_PHRASE) {
        return res.status(400).json({ error: `Confirmation phrase must be: ${phrase}` });
      }
      const valid = RESET_PROFILES.find((p) => p.id === profileId);
      if (!valid) return res.status(400).json({ error: `Unknown profile: ${profileId}` });
      const start = Date.now();
      try {
        const result = await executeProfileReset(profileId);
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user!.id, "db_reset_executed", "system", `db_reset_profile_${profileId}`,
           JSON.stringify({ profileId, rowsDeleted: result.rowsDeleted, durationMs: result.durationMs, errors: result.errors, ip: req.ip }), "GL"]
        ).catch(() => null);
        res.json({ success: true, profileId, rowsDeleted: result.rowsDeleted, durationMs: result.durationMs, errors: result.errors, executedAt: new Date().toISOString() });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Profile reset failed";
        console.error("[db-reset] profile execute error:", msg, "duration:", Date.now() - start, "ms");
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── GET /api/admin/dev/seed/status ────────────────────────────────────────
  app.get(
    "/api/admin/dev/seed/status",
    authenticateToken,
    requireGlobalAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const status = await getSeedStatus();
        res.json(status);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Status check failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── POST /api/admin/dev/seed/execute ──────────────────────────────────────
  app.post(
    "/api/admin/dev/seed/execute",
    authenticateToken,
    requireGlobalAdmin,
    async (req: AuthRequest, res: Response) => {
      const start = Date.now();
      try {
        const result = await executeSeed();
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user!.id, "create", "system", "uat_seed",
           JSON.stringify({ created: result.created, alreadyExists: result.alreadyExists, durationMs: Date.now() - start, ip: req.ip }), "GL"]
        ).catch(() => null);
        res.json(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Seed failed";
        console.error("[uat-seed] execute error:", msg, "duration:", Date.now() - start, "ms");
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── GET /api/admin/dev/reset/history ──────────────────────────────────────
  app.get(
    "/api/admin/dev/reset/history",
    authenticateToken,
    requireGlobalAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const { rows } = await pool.query(
          `SELECT al.id, al.user_id, al.action, al.details, al.created_at,
                  u.first_name, u.last_name, u.email
           FROM audit_logs al
           LEFT JOIN users u ON u.id = al.user_id
           WHERE al.action IN ('db_reset_preview','db_reset_executed')
             AND al.entity_type = 'system'
           ORDER BY al.created_at DESC
           LIMIT 30`
        );
        res.json({ history: rows });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "History query failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── GET /api/admin/dev/env/snapshot ───────────────────────────────────────
  app.get(
    "/api/admin/dev/env/snapshot",
    authenticateToken,
    requireGlobalAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const snapshot = await captureEnvironmentSnapshot();
        res.json({ snapshot });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Snapshot failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── GET /api/admin/dev/env/test-data ──────────────────────────────────────
  app.get(
    "/api/admin/dev/env/test-data",
    authenticateToken,
    requireGlobalAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const report = await detectTestData();
        res.json({ report });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Test data detection failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── GET /api/admin/dev/env/platform-stats ─────────────────────────────────
  app.get(
    "/api/admin/dev/env/platform-stats",
    authenticateToken,
    requireGlobalAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const stats = await getPlatformStats();
        res.json({ stats });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Platform stats failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ── GET /api/admin/dev/env/db-health ──────────────────────────────────────
  app.get(
    "/api/admin/dev/env/db-health",
    authenticateToken,
    requireGlobalAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const health = await getDbHealth();
        res.json(health);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "DB health query failed";
        res.status(500).json({ error: msg });
      }
    }
  );
}
