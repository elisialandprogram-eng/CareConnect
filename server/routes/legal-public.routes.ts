/**
 * Public & authenticated legal routes for patients/providers.
 * These supplement the admin-only routes in admin/legal.routes.ts.
 */
import { Express, Request, Response } from "express";
import { pool } from "../db";
import { authenticateToken } from "../middleware/auth";
import { z } from "zod";

const acceptSchema = z.object({
  documentId: z.string().min(1),
  versionId:  z.string().min(1),
  source:     z.string().default("unknown"),
  metadata:   z.record(z.unknown()).optional(),
});

export function registerLegalPublicRoutes(app: Express): void {

  // ── GET /api/legal/documents ─────────────────────────────────────────────
  // Returns all published documents applicable to the current user's role
  // (or all published if unauthenticated — e.g. registration flow)
  app.get("/api/legal/documents", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const role = user?.role ?? null;
      const slug = req.query.slug as string | undefined;

      const params: any[] = [];
      const clauses: string[] = ["d.status = 'published'"];
      let p = 1;

      if (role) {
        clauses.push(`(d.target_roles = '{}' OR $${p} = ANY(d.target_roles))`);
        params.push(role); p++;
      }

      if (slug) {
        clauses.push(`d.slug = $${p++}`);
        params.push(slug);
      }

      const where = "WHERE " + clauses.join(" AND ");

      const { rows } = await pool.query(`
        SELECT d.id, d.slug, d.title, d.description, d.doc_type,
               d.target_roles, d.is_required, d.requires_reacceptance,
               d.status, d.current_version_id,
               v.version AS current_version, v.content AS current_content,
               v.effective_date, v.published_at
          FROM legal_documents d
     LEFT JOIN legal_document_versions v ON v.id = d.current_version_id
          ${where}
      ORDER BY d.doc_type, d.title
      `, params);

      res.json(rows);
    } catch (err: any) {
      console.error("[legal-public] list:", err.message);
      res.status(500).json({ error: "Failed to fetch legal documents" });
    }
  });

  // ── GET /api/legal/documents/:slugOrId ───────────────────────────────────
  app.get("/api/legal/documents/:slugOrId", async (req: Request, res: Response) => {
    try {
      const { slugOrId } = req.params;
      const { rows } = await pool.query(`
        SELECT d.*,
               v.version AS current_version, v.content AS current_content,
               v.effective_date, v.published_at, v.changelog
          FROM legal_documents d
     LEFT JOIN legal_document_versions v ON v.id = d.current_version_id
         WHERE d.status = 'published'
           AND (d.id = $1 OR d.slug = $1)
         LIMIT 1
      `, [slugOrId]);

      if (!rows.length) return res.status(404).json({ error: "Document not found or not published" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // ── POST /api/legal/accept ───────────────────────────────────────────────
  // Record a user's acceptance of a specific document version (idempotent)
  app.post("/api/legal/accept", authenticateToken, async (req: Request, res: Response) => {
    try {
      const data = acceptSchema.parse(req.body);
      const user = (req as any).user;
      const ipAddress = req.ip ?? req.headers["x-forwarded-for"]?.toString();
      const userAgent = req.headers["user-agent"];

      // Verify the document & version exist
      const doc = await pool.query(
        "SELECT id, status FROM legal_documents WHERE id = $1",
        [data.documentId]
      );
      if (!doc.rows.length) return res.status(404).json({ error: "Document not found" });
      if (doc.rows[0].status !== "published") return res.status(400).json({ error: "Document is not published" });

      const ver = await pool.query(
        "SELECT id, status FROM legal_document_versions WHERE id = $1 AND document_id = $2",
        [data.versionId, data.documentId]
      );
      if (!ver.rows.length) return res.status(404).json({ error: "Version not found" });
      if (ver.rows[0].status !== "published") return res.status(400).json({ error: "Version is not the current published version" });

      // Upsert — idempotent: if already accepted, update source/ip
      const { rows } = await pool.query(`
        INSERT INTO legal_acceptances
          (user_id, document_id, version_id, role_snapshot, ip_address, user_agent, source, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id, version_id) DO UPDATE
          SET source     = EXCLUDED.source,
              ip_address = EXCLUDED.ip_address,
              metadata   = EXCLUDED.metadata
        RETURNING id, accepted_at
      `, [
        user.id, data.documentId, data.versionId,
        user.role ?? "unknown", ipAddress ?? null, userAgent ?? null,
        data.source, data.metadata ? JSON.stringify(data.metadata) : null,
      ]);

      res.status(201).json({ message: "Acceptance recorded", id: rows[0].id, acceptedAt: rows[0].accepted_at });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      console.error("[legal-public] accept:", err.message);
      res.status(500).json({ error: "Failed to record acceptance" });
    }
  });

  // ── GET /api/legal/pending ───────────────────────────────────────────────
  // Returns published required documents the current user hasn't accepted yet
  app.get("/api/legal/pending", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      const { rows } = await pool.query(`
        SELECT d.id, d.slug, d.title, d.description, d.doc_type,
               d.is_required, d.requires_reacceptance,
               d.current_version_id,
               v.version AS current_version, v.content AS current_content,
               v.effective_date
          FROM legal_documents d
          JOIN legal_document_versions v ON v.id = d.current_version_id
         WHERE d.status = 'published'
           AND d.is_required = TRUE
           AND (d.target_roles = '{}' OR $1 = ANY(d.target_roles))
           AND NOT EXISTS (
             SELECT 1 FROM legal_acceptances la
              WHERE la.document_id = d.id
                AND la.version_id  = d.current_version_id
                AND la.user_id     = $2
           )
      ORDER BY d.doc_type
      `, [user.role, user.id]);

      res.json(rows);
    } catch (err: any) {
      console.error("[legal-public] pending:", err.message);
      res.status(500).json({ error: "Failed to fetch pending documents" });
    }
  });

  // ── GET /api/legal/my-acceptances ────────────────────────────────────────
  // Current user's full acceptance history
  app.get("/api/legal/my-acceptances", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      const { rows } = await pool.query(`
        SELECT la.id, la.document_id, la.version_id, la.source, la.accepted_at,
               d.title AS document_title, d.slug AS document_slug, d.doc_type,
               v.version AS version_number
          FROM legal_acceptances la
          JOIN legal_documents d      ON d.id = la.document_id
          JOIN legal_document_versions v ON v.id = la.version_id
         WHERE la.user_id = $1
      ORDER BY la.accepted_at DESC
      `, [user.id]);

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch acceptance history" });
    }
  });
}
