import type { Express, Response } from "express";
import { z } from "zod";
import { pool } from "../../db";
import { authenticateToken, requireAdmin, type AuthRequest } from "../../middleware/auth";
import { requirePermission, PERMISSIONS } from "../../middleware/rbac";
import { isGlobalAdmin, listingCountryFilter } from "../../middleware/country";
import {
  executeCustomReport,
  getCustomReportMetadata,
  validateCustomReportDefinition,
  type ReportDefinition,
} from "../../services/custom-report-builder";

const mw = [
  authenticateToken,
  requireAdmin,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
];

const savedReportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  definition: z.unknown(),
});

function csvValue(value: unknown): string {
  const text = value == null ? "" : String(value);
  const escaped = text.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function reportToCsv(columns: Array<{ key: string; label: string }>, rows: Record<string, unknown>[]): string {
  return [
    columns.map(column => csvValue(column.label)).join(","),
    ...rows.map(row => columns.map(column => csvValue(row[column.key])).join(",")),
  ].join("\n");
}

function accessibleCountry(req: AuthRequest): string | null {
  return listingCountryFilter(req.user!, {}) ?? null;
}

function isGlobalScope(req: AuthRequest): boolean {
  return isGlobalAdmin(req.user?.role);
}

export function registerAdminCustomReportsRoutes(app: Express): void {
  app.get("/api/admin/custom-reports/metadata", ...mw, (_req: AuthRequest, res: Response) => {
    res.json(getCustomReportMetadata());
  });

  app.post("/api/admin/custom-reports/query", ...mw, async (req: AuthRequest, res: Response) => {
    try {
      const page = Number(req.body?.page ?? 1);
      const limit = Number(req.body?.limit ?? 50);
      const definition = validateCustomReportDefinition(req.body?.definition);
      const result = await executeCustomReport(definition, accessibleCountry(req), page, limit);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Invalid report definition" });
    }
  });

  app.post("/api/admin/custom-reports/export/csv", ...mw, async (req: AuthRequest, res: Response) => {
    try {
      const definition = validateCustomReportDefinition(req.body?.definition);
      const result = await executeCustomReport(definition, accessibleCountry(req), 1, 10000, 10000);
      const csv = reportToCsv(result.columns, result.rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="custom-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Unable to export report" });
    }
  });

  app.get("/api/admin/custom-reports/saved", ...mw, async (req: AuthRequest, res: Response) => {
    try {
      const country = accessibleCountry(req);
      const result = await pool.query(
        `SELECT id, name, definition, created_by, created_at, updated_at
         FROM admin_saved_reports
         WHERE $2 OR country_code IS NOT DISTINCT FROM $1
         ORDER BY updated_at DESC, created_at DESC`,
        [country, isGlobalScope(req)],
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Unable to load saved reports" });
    }
  });

  app.post("/api/admin/custom-reports/saved", ...mw, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = savedReportSchema.parse(req.body);
      const definition: ReportDefinition = validateCustomReportDefinition(parsed.definition);
      const country = accessibleCountry(req);
      const result = await pool.query(
        `INSERT INTO admin_saved_reports (name, definition, created_by, country_code)
         VALUES ($1, $2::jsonb, $3, $4)
         RETURNING id, name, definition, created_by, created_at, updated_at`,
        [parsed.name, JSON.stringify(definition), req.user!.id, country],
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Unable to save report" });
    }
  });

  app.patch("/api/admin/custom-reports/saved/:id", ...mw, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = savedReportSchema.parse(req.body);
      const definition: ReportDefinition = validateCustomReportDefinition(parsed.definition);
      const result = await pool.query(
        `UPDATE admin_saved_reports
         SET name = $1, definition = $2::jsonb, updated_at = NOW()
         WHERE id = $3 AND ($5 OR country_code IS NOT DISTINCT FROM $4)
         RETURNING id, name, definition, created_by, created_at, updated_at`,
        [parsed.name, JSON.stringify(definition), req.params.id, accessibleCountry(req), isGlobalScope(req)],
      );
      if (!result.rowCount) return res.status(404).json({ message: "Saved report not found" });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Unable to update report" });
    }
  });

  app.delete("/api/admin/custom-reports/saved/:id", ...mw, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `DELETE FROM admin_saved_reports
         WHERE id = $1 AND ($3 OR country_code IS NOT DISTINCT FROM $2)`,
        [req.params.id, accessibleCountry(req), isGlobalScope(req)],
      );
      if (!result.rowCount) return res.status(404).json({ message: "Saved report not found" });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Unable to delete report" });
    }
  });
}