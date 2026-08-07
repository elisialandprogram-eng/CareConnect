/**
 * Session routes — extracted from server/routes.ts (Sprint C5, Phase 4)
 *
 * Covers: patient-side group session discovery, booking, joining,
 * and personal session history. Provider-side management lives in
 * provider.routes.ts.
 */

import type { Express, Response } from "express";
import { storage } from "../storage";
import {
  authenticateToken,
  optionalAuth,
  AuthRequest,
} from "../middleware/auth";

export function registerSessionRoutes(app: Express): void {

  // ── List upcoming group sessions for the patient's country ────────────────
  app.get("/api/group-sessions", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      let countryCode = "HU";
      if (req.user?.id) {
        const u = await storage.getUser(req.user.id);
        countryCode = u?.countryCode || "HU";
      } else if (typeof req.query.country === "string" && req.query.country) {
        countryCode = req.query.country.toUpperCase();
      }
      const list = await storage.listGroupSessionsByCountry(countryCode, { onlyUpcoming: true });
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to list group sessions" });
    }
  });

  // ── Patient books a group session (wallet-only in v1) ─────────────────────
  app.post("/api/group-sessions/:id/book", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await storage.bookGroupSessionWithWallet({
        sessionId: req.params.id,
        userId: req.user!.id,
      });
      res.status(201).json(result);
    } catch (e: any) {
      const msg = e?.message || "Failed to book";
      const status =
        msg.includes("full") ? 409 :
        msg.includes("Already") ? 409 :
        msg.includes("Country") ? 403 :
        msg.includes("Insufficient") ? 402 :
        msg.includes("not found") ? 404 :
        msg.includes("ended") ? 410 :
        msg.includes("cancelled") ? 410 :
        400;
      res.status(status).json({ message: msg });
    }
  });

  // ── Patient marks themselves as joined (within the join window) ───────────
  app.post("/api/group-sessions/:id/join", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const row = await storage.recordGroupSessionJoin(req.params.id, req.user!.id);
      if (!row) return res.status(409).json({ message: "Cannot join now" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "Failed to join" });
    }
  });

  // ── Patient's own group session bookings ──────────────────────────────────
  app.get("/api/me/group-sessions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const list = await storage.listMyGroupBookings(req.user!.id);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to load bookings" });
    }
  });
}
