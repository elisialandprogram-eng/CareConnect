/**
 * Community / Engagement routes — extracted from server/routes.ts (Sprint C5, Phase 3)
 *
 * Covers: referrals (patient + admin), promo code validation,
 * referral leaderboard, referral code lookup.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  AuthRequest,
} from "../middleware/auth";

// ── Referral reward config (mirrors routes.ts constants) ──────────────────────
const REFERRAL_REFERRER_REWARD = Number(process.env.REFERRAL_REFERRER_REWARD || 5);
const REFERRAL_REFERRED_REWARD = Number(process.env.REFERRAL_REFERRED_REWARD || 5);
const REFERRAL_REWARD_CURRENCY = process.env.REFERRAL_REWARD_CURRENCY || "USD";

export function registerCommunityRoutes(app: Express): void {

  // ── Promo code validation (used by booking page) ──────────────────────────
  app.post("/api/promo-codes/validate", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { code, amount, providerId } = req.body as { code?: string; amount?: number; providerId?: string };
      if (!code) return res.status(400).json({ message: "Code required" });
      const promo = await storage.getPromoCodeByCode(String(code).trim().toUpperCase());
      if (!promo || !promo.isActive) {
        return res.status(404).json({ message: "Invalid promo code" });
      }
      const now = new Date();
      if (new Date(promo.validFrom) > now || new Date(promo.validUntil) < now) {
        return res.status(400).json({ message: "Promo code is not active" });
      }
      if (promo.maxUses != null && (promo.usedCount ?? 0) >= promo.maxUses) {
        return res.status(400).json({ message: "Promo code has reached its usage limit" });
      }
      if (promo.applicableProviders && promo.applicableProviders.length > 0 && providerId && !promo.applicableProviders.includes(providerId)) {
        return res.status(400).json({ message: "Promo code not valid for this provider" });
      }
      const baseAmount = Number(amount ?? 0);
      if (promo.minAmount != null && baseAmount < Number(promo.minAmount)) {
        return res.status(400).json({ message: `Minimum order amount is ${promo.minAmount}` });
      }
      let discount = 0;
      if (promo.discountType === "percentage") {
        discount = (baseAmount * Number(promo.discountValue)) / 100;
      } else {
        discount = Number(promo.discountValue);
      }
      if (discount > baseAmount) discount = baseAmount;
      res.json({
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discount: Number(discount.toFixed(2)),
      });
    } catch (e) {
      console.error("Promo validate error:", e);
      res.status(500).json({ message: "Failed to validate promo code" });
    }
  });

  // ── Referral program ──────────────────────────────────────────────────────
  // Returns the signed-in user's referral code, the share link, configured
  // rewards, and the list of friends they've referred.
  app.get("/api/referrals/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const code = await storage.getOrCreateReferralCode(req.user!.id);
      const referrals = await storage.getReferralsByReferrer(req.user!.id);
      const referredIds = Array.from(new Set(referrals.map(r => r.referredUserId)));
      const referredUsers = referredIds.length
        ? await Promise.all(referredIds.map(id => storage.getUser(id)))
        : [];
      const byId = new Map(referredUsers.filter(Boolean).map(u => [u!.id, u!]));
      const totalEarned = referrals
        .filter(r => r.status === "qualified")
        .reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0);
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const shareUrl = `${proto}://${host}/register?ref=${encodeURIComponent(code)}`;
      res.json({
        code,
        shareUrl,
        rewards: {
          referrer: REFERRAL_REFERRER_REWARD,
          referred: REFERRAL_REFERRED_REWARD,
          currency: REFERRAL_REWARD_CURRENCY,
        },
        totalEarned,
        referrals: referrals.map(r => ({
          ...r,
          referredUser: byId.get(r.referredUserId)
            ? {
                firstName: byId.get(r.referredUserId)!.firstName,
                lastName: byId.get(r.referredUserId)!.lastName,
              }
            : null,
        })),
      });
    } catch (error) {
      console.error("[referrals/me] failed:", error);
      res.status(500).json({ message: "Failed to load referrals" });
    }
  });

  // ── Patient: referral leaderboard (authenticated, not admin-only) ────────
  // Must be registered BEFORE the /api/admin/... leaderboard route to avoid
  // Express matching "admin" as the :code param in the lookup route above.
  app.get("/api/referrals/leaderboard", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit || 10), 25);
      const rows = await storage.getReferralLeaderboard(limit);
      // Anonymise: only expose first name + last initial, referral count, total earned
      const safe = rows.map((r: any, i: number) => ({
        rank: i + 1,
        name: r.firstName
          ? `${r.firstName} ${(r.lastName || "").charAt(0)}.`.trim()
          : `User #${i + 1}`,
        referralCount: Number(r.referral_count ?? r.referralCount ?? 0),
        totalEarned: Number(r.total_earned ?? r.totalEarned ?? 0),
      }));
      res.json(safe);
    } catch (error) {
      console.error("[referrals/leaderboard] failed:", error);
      res.status(500).json({ message: "Failed to load leaderboard" });
    }
  });

  // ── Admin: referral leaderboard ───────────────────────────────────────────
  app.get("/api/admin/referrals/leaderboard", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit || 25), 100);
      const rows = await storage.getReferralLeaderboard(limit);
      res.json(rows);
    } catch (error) {
      console.error("[admin/referrals/leaderboard] failed:", error);
      res.status(500).json({ message: "Failed to load leaderboard" });
    }
  });

  // ── Public referral code lookup (for registration page) ──────────────────
  app.get("/api/referrals/lookup/:code", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByReferralCode(req.params.code);
      if (!user) return res.status(404).json({ message: "Code not found" });
      res.json({
        valid: true,
        referrerName: `${user.firstName} ${(user.lastName || "").charAt(0)}.`.trim(),
      });
    } catch {
      res.status(500).json({ message: "Lookup failed" });
    }
  });
}
