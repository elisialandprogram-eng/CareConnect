/**
 * Family member routes
 * Routes: 8 | Owner: patient | Auth: required | Country isolation: N/A | Financial impact: no
 *
 * GET    /api/family-members
 * POST   /api/family-members
 * PATCH  /api/family-members/:id
 * DELETE /api/family-members/:id
 * GET    /api/family-members/:id/appointments
 * GET    /api/family-members/:id/documents
 * GET    /api/family-members/:id/consents
 * POST   /api/family-members/:id/consents
 */

import type { Express, Response } from "express";
import { storage } from "../storage";
import { insertFamilyMemberSchema } from "@shared/schema";
import { authenticateToken, type AuthRequest } from "../middleware/auth";

export function registerFamilyRoutes(app: Express): void {

  // ── GET /api/family-members ─────────────────────────────────────────────
  app.get("/api/family-members", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const members = await storage.getFamilyMembersByUser(req.user!.id);
      res.json(members);
    } catch (error) {
      console.error("Get family members error:", error);
      res.status(500).json({ message: "Failed to load family members" });
    }
  });

  // ── POST /api/family-members ────────────────────────────────────────────
  app.post("/api/family-members", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertFamilyMemberSchema.parse(req.body);
      const member = await storage.createFamilyMember(req.user!.id, parsed);
      res.status(201).json(member);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid family member data", errors: error.errors });
      }
      console.error("Create family member error:", error);
      res.status(500).json({ message: "Failed to add family member" });
    }
  });

  // ── PATCH /api/family-members/:id ──────────────────────────────────────
  app.patch("/api/family-members/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertFamilyMemberSchema.partial().parse(req.body);
      const updated = await storage.updateFamilyMember(req.params.id, req.user!.id, parsed);
      if (!updated) return res.status(404).json({ message: "Family member not found" });
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid family member data", errors: error.errors });
      }
      console.error("Update family member error:", error);
      res.status(500).json({ message: "Failed to update family member" });
    }
  });

  // ── DELETE /api/family-members/:id ─────────────────────────────────────
  app.delete("/api/family-members/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteFamilyMember(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Family member not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete family member error:", error);
      res.status(500).json({ message: "Failed to remove family member" });
    }
  });

  // ── GET /api/family-members/:id/appointments ───────────────────────────
  app.get("/api/family-members/:id/appointments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const fm = await storage.getFamilyMember(req.params.id);
      if (!fm || fm.primaryUserId !== req.user!.id) {
        return res.status(404).json({ message: "Family member not found" });
      }
      const appointments = await storage.getFamilyMemberAppointments(req.params.id, req.user!.id);
      res.json(appointments);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET /api/family-members/:id/documents ──────────────────────────────
  app.get("/api/family-members/:id/documents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const fm = await storage.getFamilyMember(req.params.id);
      if (!fm || fm.primaryUserId !== req.user!.id) {
        return res.status(404).json({ message: "Family member not found" });
      }
      const docs = await storage.getFamilyMemberDocuments(req.params.id, req.user!.id);
      res.json(docs);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET /api/family-members/:id/consents ───────────────────────────────
  app.get("/api/family-members/:id/consents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const fm = await storage.getFamilyMember(req.params.id);
      if (!fm || fm.primaryUserId !== req.user!.id) {
        return res.status(404).json({ message: "Family member not found" });
      }
      const consents = await storage.getFamilyMemberConsents(req.params.id, req.user!.id);
      res.json(consents);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── POST /api/family-members/:id/consents ──────────────────────────────
  app.post("/api/family-members/:id/consents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const fm = await storage.getFamilyMember(req.params.id);
      if (!fm || fm.primaryUserId !== req.user!.id) {
        return res.status(404).json({ message: "Family member not found" });
      }
      const { consentType, isAccepted, consentVersion } = req.body;
      if (!consentType || typeof isAccepted !== "boolean") {
        return res.status(400).json({ message: "consentType and isAccepted required" });
      }
      const consent = await storage.addFamilyMemberConsent(req.user!.id, req.params.id, {
        consentType,
        isAccepted,
        consentVersion,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      res.status(201).json(consent);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
