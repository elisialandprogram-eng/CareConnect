/**
 * Admin Users routes — extracted from server/routes.ts
 *
 * Covers: stale-bookings, admin users/providers CRUD, RBAC roles/permissions,
 * admin-users management (global admin only).
 */

import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db, pool } from "../../db";
import { z } from "zod";
import bcrypt from "bcrypt";
import { eq, and, desc, or, inArray, like, gte } from "drizzle-orm";
import {
  appointments,
  users,
  providers,
} from "@shared/schema";
import {
  authenticateToken,
  requireAdmin,
  requireGlobalAdmin,
  AuthRequest,
  invalidateAuthCache,
} from "../../middleware/auth";
import {
  requirePermission,
  PERMISSIONS,
  loadUserPermissions,
  invalidatePermCache,
} from "../../middleware/rbac";
import {
  isAdminRole,
  isGlobalAdmin,
  isCountryCode,
  canAccessCountry,
  listingCountryFilter,
  CountryCode,
} from "../../middleware/country";
import { providerListCache, providerSearchCache } from "../../lib/cache";
import { sanitizeUser } from "../../utils/sanitize";
import { dispatchNotification } from "../../services/notification-dispatcher";

export function registerAdminUsersRoutes(app: Express): void {

  // ── Stale bookings ────────────────────────────────────────────────────────
  app.get("/api/admin/stale-bookings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const countryFilter = listingCountryFilter(req.user!, req.query as any);

      const allRows = await db
        .select()
        .from(appointments)
        .where(and(
          gte(appointments.updatedAt, cutoff),
          or(
            eq(appointments.status, "expired"),
            and(
              inArray(appointments.status, ["cancelled", "cancelled_by_patient", "cancelled_by_provider", "no_show", "rejected"]),
              like(appointments.privateNote, "[AUTO]%"),
            ),
          ),
        ))
        .orderBy(desc(appointments.updatedAt))
        .limit(500);

      // Apply country isolation — country_admin may only see their own country
      const rows = countryFilter
        ? allRows.filter(r => (r as any).countryCode === countryFilter)
        : allRows;

      if (!rows.length) return res.json({ days, items: [] });

      const patientIds = Array.from(new Set(rows.map(r => r.patientId)));
      const providerIds = Array.from(new Set(rows.map(r => r.providerId)));

      const [patientRows, providerRows] = await Promise.all([
        patientIds.length ? db.select().from(users).where(inArray(users.id, patientIds)) : Promise.resolve([] as any[]),
        providerIds.length ? db.select().from(providers).where(inArray(providers.id, providerIds)) : Promise.resolve([] as any[]),
      ]);

      const providerUserIds = providerRows.map((p: any) => p.userId);
      const providerUsers = providerUserIds.length
        ? await db.select().from(users).where(inArray(users.id, providerUserIds))
        : [];
      const userById = new Map(
        [...patientRows, ...providerUsers].map(u => [u.id, u])
      );
      const providerById = new Map(providerRows.map((p: any) => [p.id, p]));

      const items = rows.map(r => {
        const patient = userById.get(r.patientId);
        const provider = providerById.get(r.providerId);
        const providerUser = provider ? userById.get((provider as any).userId) : null;
        const note = (r.privateNote || "").trim();
        const reasonLine = note.split("\n").find((line: string) => line.startsWith("[AUTO]")) || note;
        return {
          id: r.id,
          appointmentNumber: r.appointmentNumber,
          status: r.status,
          date: r.date,
          startTime: r.startTime,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
          totalAmount: r.totalAmount,
          patientName: patient ? `${(patient as any).firstName} ${(patient as any).lastName}` : "—",
          patientEmail: (patient as any)?.email || null,
          providerName: providerUser
            ? `${(providerUser as any).firstName} ${(providerUser as any).lastName}`
            : ((provider as any)?.businessName || "—"),
          reason: reasonLine.replace(/^\[AUTO\]\s*/, ""),
        };
      });

      res.json({ days, items });
    } catch (error) {
      console.error("[admin] stale-bookings error:", error);
      res.status(500).json({ message: "Failed to load stale bookings" });
    }
  });

  // ── Admin provider patch/delete ───────────────────────────────────────────
  // Explicit field whitelist — prevents structural column overwrites (user_id,
  // country_code, rating, etc.) from reaching the storage layer.
  const ADMIN_PROVIDER_WRITABLE_FIELDS = new Set([
    "bio", "status", "rejectionReason", "isVerified", "isActive", "bookingsEnabled",
    "riskScore", "internalNotes", "backgroundCheckStatus", "identityVerificationStatus",
    "malpracticeCoverage", "complianceApprovalStatus", "licenseNumber", "licensingAuthority",
    "licenseExpiryDate", "nationalProviderId", "providerAgreementAccepted",
    "dataProcessingAgreementAccepted", "telemedicineAgreementAccepted",
    "codeOfConductAccepted", "affiliatedHospital", "onCallAvailability",
    "preferredContactMethod", "emergencyContact", "twoFactorEnabled",
    "primaryTitle", "secondaryTitles", "displayTitle", "titleRequestStatus",
    "titleReviewedBy", "titleReviewedAt",
    "cancellationPolicyHours", "cancellationFeePercent",
    "minimumNoticeMinutes", "maximumBookingDays",
  ]);

  app.patch("/api/admin/providers/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PROVIDERS_VERIFY), async (req: AuthRequest, res: Response) => {
    try {
      const filteredBody: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(req.body)) {
        if (ADMIN_PROVIDER_WRITABLE_FIELDS.has(k)) filteredBody[k] = v;
      }
      if (Object.keys(filteredBody).length === 0) {
        return res.status(400).json({ message: "No permitted fields to update" });
      }
      const provider = await storage.updateProvider(req.params.id, filteredBody as any);
      if (provider?.userId) invalidateAuthCache(provider.userId);
      providerListCache.clear();
      providerSearchCache.clear();
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'update', 'provider', $2, $3, $4)`,
        [req.user!.id, req.params.id, JSON.stringify({ changes: Object.keys(filteredBody) }), req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json(provider);
    } catch (error) {
      console.error("Failed to update provider:", error);
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  // ── Admin user delete ─────────────────────────────────────────────────────
  app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.USERS_DELETE), async (req: AuthRequest, res: Response) => {
    try {
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === "global_admin") {
        return res.status(403).json({ message: "Global admin accounts cannot be deleted via this endpoint" });
      }
      if (isAdminRole(target.role) && !isGlobalAdmin(req.user!.role)) {
        return res.status(403).json({ message: "Only global admins can delete admin accounts" });
      }
      await storage.deleteUser(req.params.id);
      invalidateAuthCache(req.params.id);
      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "delete",
          entityType: "user",
          entityId: req.params.id,
          details: JSON.stringify({
            deletedUserEmail: target.email,
            deletedUserName: `${target.firstName} ${target.lastName}`.trim(),
            deletedUserRole: target.role,
            performedBy: req.user!.id,
          }),
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
        } as any);
      } catch (auditErr) {
        console.error("[admin/deleteUser] audit log failed:", auditErr);
      }
      res.status(204).end();
    } catch (error: any) {
      console.error("[admin/deleteUser] failed:", error?.message);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // ── Create admin ──────────────────────────────────────────────────────────
  app.post("/api/admin/admins", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, scope, countryCode } = req.body || {};
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "Email, password, first name and last name are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const requestedScope: "global" | "country" = scope === "global" ? "global" : "country";
      const newRole = requestedScope === "global" ? "global_admin" : "country_admin";
      const targetCountry: CountryCode = isCountryCode(countryCode)
        ? countryCode
        : (req.user!.countryCode ?? "HU");

      const normalizedEmail = String(email).trim().toLowerCase();
      const existing = await storage.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = await storage.createUser({
        email: normalizedEmail,
        password: hashedPassword,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phone: phone ? String(phone).trim() : null,
        role: newRole,
        countryCode: targetCountry,
        isEmailVerified: true,
      } as any);

      const { password: _pw, ...safe } = newAdmin as any;
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'create', 'admin_user', $2, $3, $4, $5)`,
        [req.user!.id, newAdmin.id, JSON.stringify({ email: normalizedEmail, role: newRole, scope: requestedScope, targetCountry }), req.ip ?? null, req.user!.countryCode ?? null]
      ).catch(() => {});
      res.status(201).json(safe);
    } catch (error: any) {
      console.error("Failed to create admin user:", error);
      res.status(500).json({ message: error?.message || "Failed to create admin" });
    }
  });

  // ── Admin provider delete ─────────────────────────────────────────────────
  app.delete("/api/admin/providers/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PROVIDERS_DELETE), async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteProvider(req.params.id);
      providerListCache.clear();
      providerSearchCache.clear();
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete provider" });
    }
  });

  // ── Admin: notify a user ──────────────────────────────────────────────────
  app.post("/api/admin/users/:id/notify", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { title, body } = req.body;
      if (!title || !body) return res.status(400).json({ message: "title and body are required" });
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      await dispatchNotification({
        userId: req.params.id,
        title,
        body,
        type: "admin_message",
      } as any);
      res.json({ message: "Notification sent" });
    } catch (error) {
      console.error("Admin notify error:", error);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // ── Admin: get wallet for a user ──────────────────────────────────────────
  app.get("/api/admin/wallets/:userId", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      if (!canAccessCountry(req.user!, targetUser.countryCode as any)) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) return res.status(404).json({ message: "Wallet not found" });
      res.json(wallet);
    } catch (error) {
      console.error("Admin get wallet error:", error);
      res.status(500).json({ message: "Failed to get wallet" });
    }
  });

  // ── Admin: suspend/unsuspend user ─────────────────────────────────────────
  app.patch("/api/admin/users/:id/suspend", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.USERS_SUSPEND), async (req: AuthRequest, res: Response) => {
    try {
      const { isSuspended, suspensionReason } = req.body;
      const user = await storage.updateUser(req.params.id, {
        isSuspended,
        suspensionReason: isSuspended ? suspensionReason : null,
      });
      if (!user) return res.status(404).json({ message: "User not found" });
      invalidateAuthCache(req.params.id);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, $2, 'user', $3, $4, $5)`,
        [req.user!.id, isSuspended ? "suspend" : "unsuspend", req.params.id,
          JSON.stringify({ isSuspended, suspensionReason: isSuspended ? suspensionReason : null }),
          req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // ── Admin: list users (paginated) ─────────────────────────────────────────
  app.get("/api/admin/users", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string || "1",  10));
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string || "50", 10)));
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const roleFilter   = req.query.role   as string | undefined;
      const search       = (req.query.search as string | undefined)?.trim();

      const { rows, total } = await storage.getUserListPaginated({
        page,
        limit,
        search,
        role: roleFilter,
        countryCode: countryFilter ?? undefined,
      });

      const sanitized = rows.map((u: any) => sanitizeUser(u, { strip: "public" }));
      res.json({
        users: sanitized,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  // ── RBAC roles & permissions ──────────────────────────────────────────────
  app.get("/api/rbac/roles", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const roles = await storage.getAdminRoles();
      const permsMap: Record<string, string[]> = {};
      for (const r of roles) {
        permsMap[r.id] = await storage.getRolePermissions(r.id);
      }
      return res.json(roles.map(r => ({ ...r, permissions: permsMap[r.id] ?? [] })));
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/rbac/permissions", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      return res.json(await storage.getAllPermissions());
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── Admin users management (global admin only) ────────────────────────────
  app.get("/api/admin/admin-users", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await storage.getAdminUsersWithRoles();
      return res.json(rows);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/admin-users", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, roleName, countryCode, notes } = req.body;
      if (!email || !password || !firstName || !lastName || !roleName) {
        return res.status(400).json({ message: "email, password, firstName, lastName, and roleName are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const role = await storage.getAdminRoleByName(roleName);
      if (!role) return res.status(400).json({ message: `Unknown role: ${roleName}` });

      const normalizedEmail = String(email).trim().toLowerCase();
      if (await storage.getUserByEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const resolvedCountry: any = isCountryCode(countryCode) ? countryCode : (req.user!.countryCode ?? "HU");
      const isGlobal = roleName === "super_admin";
      const userRole = isGlobal ? "global_admin" : "country_admin";

      const hashedPw = await bcrypt.hash(password, 10);
      const newUser = await storage.createUser({
        email: normalizedEmail,
        password: hashedPw,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phone: phone ? String(phone).trim() : null,
        role: userRole,
        countryCode: resolvedCountry,
        isEmailVerified: true,
      } as any);

      const assignment = await storage.createAdminAssignment({
        userId: newUser.id,
        roleId: role.id,
        countryCode: isGlobal ? null : resolvedCountry,
        isActive: true,
        assignedBy: req.user!.id,
        notes: notes ?? null,
      } as any);

      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "create",
          entityType: "admin_user",
          entityId: newUser.id,
          details: JSON.stringify({ email: newUser.email, role: userRole, roleName, assignmentId: assignment.id }),
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        } as any);
      } catch {}

      const { password: _pw, ...safe } = newUser as any;
      return res.status(201).json({ ...safe, assignment });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/admin/admin-users/:id/assignment", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { roleName, countryCode, isActive, notes } = req.body;

      const assignments = await storage.getAdminAssignments({ userId: id });
      let assignment = assignments[0];

      if (!assignment && roleName) {
        const role = await storage.getAdminRoleByName(roleName);
        if (!role) return res.status(400).json({ message: `Unknown role: ${roleName}` });
        const cc: any = isCountryCode(countryCode) ? countryCode : null;
        assignment = await storage.createAdminAssignment({
          userId: id,
          roleId: role.id,
          countryCode: cc,
          isActive: true,
          assignedBy: req.user!.id,
          notes: notes ?? null,
        } as any);
      } else if (assignment) {
        const updates: any = {};
        if (roleName) {
          const role = await storage.getAdminRoleByName(roleName);
          if (!role) return res.status(400).json({ message: `Unknown role: ${roleName}` });
          updates.roleId = role.id;
        }
        if (countryCode !== undefined) updates.countryCode = isCountryCode(countryCode) ? countryCode : null;
        if (isActive !== undefined) updates.isActive = isActive;
        if (notes !== undefined) updates.notes = notes;
        assignment = await storage.updateAdminAssignment(assignment.id, updates) ?? assignment;
      }

      const targetUser = await storage.getUser(id);
      if (targetUser && roleName) {
        const newCoarseRole = roleName === "super_admin" ? "global_admin" : "country_admin";
        await storage.updateUser(id, { role: newCoarseRole as any });
        invalidateAuthCache(id);
      }
      invalidatePermCache(id);

      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "update",
          entityType: "admin_assignment",
          entityId: assignment?.id ?? id,
          details: JSON.stringify({ targetUserId: id, roleName, isActive }),
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        } as any);
      } catch {}

      return res.json(assignment);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/admin/admin-users/:id/deactivate", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      if (id === req.user!.id) return res.status(400).json({ message: "Cannot deactivate yourself" });

      const assignments = await storage.getAdminAssignments({ userId: id });
      const updated = [];
      for (const a of assignments) {
        const u = await storage.updateAdminAssignment(a.id, { isActive: !!isActive });
        if (u) updated.push(u);
      }
      if (!isActive) {
        await storage.updateUser(id, { isSuspended: true, suspensionReason: "Admin account deactivated" } as any);
      } else {
        await storage.updateUser(id, { isSuspended: false, suspensionReason: null } as any);
      }
      invalidateAuthCache(id);
      invalidatePermCache(id);

      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "update",
          entityType: "admin_user",
          entityId: id,
          details: JSON.stringify({ action: isActive ? "activated" : "deactivated" }),
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        } as any);
      } catch {}

      return res.json({ ok: true, assignments: updated });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/admin/admin-users/:id", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (id === req.user!.id) return res.status(400).json({ message: "Cannot delete yourself" });
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "User not found" });
      await storage.deleteUser(id);
      invalidateAuthCache(id);
      invalidatePermCache(id);
      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "delete",
          entityType: "admin_user",
          entityId: id,
          details: JSON.stringify({ email: target.email, role: target.role }),
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        } as any);
      } catch {}
      return res.status(204).send();
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/session-revoke/:userId", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      await pool.query(`UPDATE users SET session_revoked_at = NOW() WHERE id = $1`, [userId]);
      invalidateAuthCache(userId);
      invalidatePermCache(userId);
      await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "logout",
          entityType: "admin_user",
          entityId: userId,
          details: JSON.stringify({ reason: "session_revoked_by_admin" }),
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        } as any);
      } catch {}
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/admin-users/:id/permissions", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { perms, country, roleName } = await loadUserPermissions(req.params.id);
      return res.json({ permissions: Array.from(perms), country, roleName });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/rbac/audit-log", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const entityType = req.query.entityType as string | undefined;
      const userId = req.query.userId as string | undefined;

      let where = "WHERE (entity_type LIKE 'admin%' OR action = 'login' OR action = 'logout')";
      const params: any[] = [];
      if (entityType) { params.push(entityType); where += ` AND entity_type = $${params.length}`; }
      if (userId) { params.push(userId); where += ` AND al.user_id = $${params.length}`; }

      const result = await pool.query(
        `SELECT al.*, u.email AS actor_email, u.first_name || ' ' || u.last_name AS actor_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM audit_logs al ${where}`,
        params,
      );
      return res.json({ logs: result.rows, total: Number(countResult.rows[0]?.count ?? 0) });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── Country migration (global-admin only) ─────────────────────────────────
  // Migrate a user (and every tenancy-bound row attached to them) from one
  // country to another. Global-admin only — country admins are not allowed
  // because the operation crosses their tenant boundary.
  app.post("/api/admin/users/:id/migrate-country", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { targetCountryCode, reason } = (req.body || {}) as { targetCountryCode?: string; reason?: string };
      if (!targetCountryCode || !isCountryCode(targetCountryCode)) {
        return res.status(400).json({ message: "Invalid or missing targetCountryCode" });
      }
      if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
        return res.status(400).json({ message: "A reason (min 5 chars) is required for the audit trail" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (isAdminRole(target.role)) {
        return res.status(400).json({ message: "Admin accounts cannot be migrated; their scope is managed via /api/admin/admins." });
      }

      let result: Awaited<ReturnType<typeof storage.migrateUserCountry>>;
      try {
        result = await storage.migrateUserCountry(req.params.id, targetCountryCode);
      } catch (err: any) {
        const msg = err?.message || "Migration failed";
        if (/already in target country/i.test(msg)) return res.status(409).json({ message: msg });
        if (/User not found/i.test(msg)) return res.status(404).json({ message: msg });
        throw err;
      }

      invalidateAuthCache(req.params.id);

      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "update",
          entityType: "user_country_migration",
          entityId: req.params.id,
          details: JSON.stringify({
            targetUserId: req.params.id,
            targetUserEmail: target.email,
            fromCountry: result.fromCountry,
            toCountry: result.toCountry,
            counts: result.counts,
            reason: reason.trim(),
            performedBy: req.user!.id,
          }),
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
        } as any);
      } catch (auditErr) {
        console.error("[admin/migrateCountry] audit log failed:", auditErr);
      }

      return res.json(result);
    } catch (error: any) {
      console.error("[admin/migrateCountry] failed:", error?.message);
      res.status(500).json({ message: "Failed to migrate user country" });
    }
  });

  // History of every cross-country user migration.
  app.get("/api/admin/country-migrations", authenticateToken, requireGlobalAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const history = await storage.getCountryMigrationHistory();
      res.json(history);
    } catch (error: any) {
      console.error("[admin/countryMigrations] failed:", error?.message);
      res.status(500).json({ message: "Failed to load migration history" });
    }
  });
}
