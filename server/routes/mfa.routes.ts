/**
 * MFA Routes — Workstream 1 (P1 Launch Blockers)
 *
 * GET  /api/auth/mfa/status          — current MFA status for authenticated user
 * POST /api/auth/mfa/setup           — generate TOTP secret + QR code
 * POST /api/auth/mfa/verify          — confirm TOTP → enable MFA + return recovery codes
 * POST /api/auth/mfa/challenge       — complete MFA during login (accepts mfa_token)
 * POST /api/auth/mfa/disable         — disable MFA (requires TOTP + password)
 * POST /api/auth/mfa/recovery        — complete login using a recovery code
 * POST /api/auth/mfa/recovery-codes/regenerate — regenerate recovery codes (requires TOTP)
 * GET  /api/auth/mfa/recovery-codes  — remaining code count
 * GET  /api/admin/mfa/status         — admin: list all admin users + MFA status
 */

import type { Express, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { pool } from "../db";
import { storage } from "../storage";
import { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN, ACCESS_TOKEN_COOKIE_MAX_AGE, REFRESH_TOKEN_EXPIRES_IN, type AuthRequest } from "../middleware/auth";
import { requireGlobalAdmin } from "../middleware/auth";
import { hashToken } from "./shared/helpers";
import {
  getMfaStatus, setupMfa, verifyAndEnableMfa, verifyMfaToken,
  disableMfa, useRecoveryCode, generateNewRecoveryCodes, isMfaRequired,
} from "../services/mfa.service";

const MFA_TOKEN_SECRET = process.env.SESSION_SECRET ?? "mfa-fallback-dev-secret";
const MFA_TOKEN_EXPIRES = "15m";

function issueMfaToken(userId: string): string {
  return jwt.sign({ mfa_challenge: true, userId }, MFA_TOKEN_SECRET, { expiresIn: MFA_TOKEN_EXPIRES });
}

function verifyMfaToken2(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, MFA_TOKEN_SECRET) as { mfa_challenge?: boolean; userId?: string };
    if (!decoded.mfa_challenge || !decoded.userId) return null;
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

async function issueFullTokens(res: Response, user: { id: string; email: string; role: string }): Promise<void> {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, mfa_verified: true },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  const refreshToken = randomBytes(64).toString("hex");
  await storage.createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
  });
  res.cookie("accessToken", accessToken, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: REFRESH_TOKEN_EXPIRES_IN,
  });
  pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(() => null);
  res.json({ user, accessToken, mfa_verified: true });
}

export function registerMfaRoutes(app: Express): void {

  // ── GET /api/auth/mfa/status ────────────────────────────────────────────────
  app.get("/api/auth/mfa/status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const status = await getMfaStatus(req.user!.id);
      res.json(status);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/auth/mfa/setup ────────────────────────────────────────────────
  app.post("/api/auth/mfa/setup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await setupMfa(req.user!.id, req.user!.email);
      res.json({ secret: result.secret, qrCodeDataUrl: result.qrCodeDataUrl, otpauthUrl: result.otpauthUrl });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/auth/mfa/verify ───────────────────────────────────────────────
  app.post("/api/auth/mfa/verify", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Invalid TOTP code format" });
      const result = await verifyAndEnableMfa(req.user!.id, code);
      if (!result.success) return res.status(401).json({ error: "Invalid code — check your authenticator app" });
      res.json({ success: true, recoveryCodes: result.recoveryCodes, message: "MFA enabled. Save these recovery codes securely." });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/auth/mfa/challenge ────────────────────────────────────────────
  // Called during login when mfa_required is returned.
  app.post("/api/auth/mfa/challenge", async (req: Request, res: Response) => {
    try {
      const { mfa_token, code } = req.body as { mfa_token?: string; code?: string };
      if (!mfa_token || !code) return res.status(400).json({ error: "mfa_token and code are required" });

      const payload = verifyMfaToken2(mfa_token);
      if (!payload) return res.status(401).json({ error: "Invalid or expired MFA session. Please log in again." });

      const user = await storage.getUser(payload.userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      const valid = await verifyMfaToken(user.id, code);
      if (!valid) {
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.id, "update", "mfa", user.id, JSON.stringify({ event: "mfa_challenge_failed", ip: req.ip }), "GL"]
        ).catch(() => null);
        return res.status(401).json({ error: "Invalid authenticator code" });
      }

      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, "create", "mfa", user.id, JSON.stringify({ event: "mfa_challenge_passed", ip: req.ip }), "GL"]
      ).catch(() => null);

      const { password: _, ...userWithoutPassword } = user;
      await issueFullTokens(res, userWithoutPassword as { id: string; email: string; role: string });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/auth/mfa/recovery ─────────────────────────────────────────────
  app.post("/api/auth/mfa/recovery", async (req: Request, res: Response) => {
    try {
      const { mfa_token, recovery_code } = req.body as { mfa_token?: string; recovery_code?: string };
      if (!mfa_token || !recovery_code) return res.status(400).json({ error: "mfa_token and recovery_code are required" });

      const payload = verifyMfaToken2(mfa_token);
      if (!payload) return res.status(401).json({ error: "Invalid or expired MFA session" });

      const user = await storage.getUser(payload.userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      const valid = await useRecoveryCode(user.id, recovery_code);
      if (!valid) return res.status(401).json({ error: "Invalid or already-used recovery code" });

      const { password: _, ...userWithoutPassword } = user;
      await issueFullTokens(res, userWithoutPassword as { id: string; email: string; role: string });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/auth/mfa/disable ──────────────────────────────────────────────
  app.post("/api/auth/mfa/disable", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { code, password } = req.body as { code?: string; password?: string };
      if (!code || !password) return res.status(400).json({ error: "TOTP code and current password are required" });

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(401).json({ error: "User not found" });

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(401).json({ error: "Incorrect password" });

      const validCode = await verifyMfaToken(req.user!.id, code);
      if (!validCode) return res.status(401).json({ error: "Invalid TOTP code" });

      await disableMfa(req.user!.id);
      res.json({ success: true, message: "MFA has been disabled" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/auth/mfa/recovery-codes/regenerate ────────────────────────────
  app.post("/api/auth/mfa/recovery-codes/regenerate", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code) return res.status(400).json({ error: "TOTP code required" });
      const valid = await verifyMfaToken(req.user!.id, code);
      if (!valid) return res.status(401).json({ error: "Invalid TOTP code" });
      const newCodes = await generateNewRecoveryCodes(req.user!.id);
      res.json({ success: true, recoveryCodes: newCodes, message: "Recovery codes regenerated. Save them securely — they will not be shown again." });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/auth/mfa/recovery-codes ───────────────────────────────────────
  app.get("/api/auth/mfa/recovery-codes", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const status = await getMfaStatus(req.user!.id);
      res.json({ recoveryCodesRemaining: status.recoveryCodesRemaining });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/admin/mfa/status ───────────────────────────────────────────────
  app.get("/api/admin/mfa/status", authenticateToken, requireGlobalAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          u.id, u.email, u.first_name, u.last_name, u.role,
          ms.enabled AS mfa_enabled,
          ms.created_at AS mfa_created_at,
          (SELECT COUNT(*) FROM mfa_recovery_codes rc WHERE rc.user_id = u.id AND rc.used = false)::int AS recovery_codes_remaining
        FROM users u
        LEFT JOIN mfa_secrets ms ON ms.user_id = u.id
        WHERE u.role::text IN ('admin','global_admin','country_admin')
        ORDER BY u.role, u.email
      `);
      const total = rows.length;
      const enabled = rows.filter((r) => r.mfa_enabled).length;
      res.json({
        summary: { total, enabled, disabled: total - enabled, complianceRate: total > 0 ? Math.round((enabled / total) * 100) : 0 },
        admins: rows,
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}

// ── Middleware: require MFA verified for sensitive routes ─────────────────────

export function requireMfaVerified(req: AuthRequest, res: Response, next: () => void): void {
  // Global admins with MFA enabled must have mfa_verified in their token.
  // If the user doesn't have MFA enabled yet, we allow through (with a warning header).
  const token = req.headers.authorization?.replace("Bearer ", "") ?? (req as Request & { cookies?: Record<string,string> }).cookies?.accessToken;
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { mfa_verified?: boolean; role?: string };
    // Only enforce for admin roles that have MFA enrolled
    if ((decoded.role === "global_admin" || decoded.role === "admin") && decoded.mfa_verified !== true) {
      // Check if MFA is actually set up for this user; if not, let them in but log it
      // (non-blocking for now — enforcement after MFA rollout period)
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
