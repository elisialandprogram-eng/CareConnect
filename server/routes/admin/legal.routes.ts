import { Express, Request, Response } from "express";
import { pool } from "../../db";
import { authenticateToken, requireAdmin } from "../../middleware/auth";
import { z } from "zod";

const createDocSchema = z.object({
  slug: z.string().min(2).max(100).regex(/^[a-z0-9_]+$/, "slug must be lowercase letters, digits, underscores"),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  docType: z.string().min(1).max(80),
  targetRoles: z.array(z.string()).default([]),
  countryCode: z.string().nullable().optional(),
  isRequired: z.boolean().default(true),
  requiresReacceptance: z.boolean().default(false),
});

const updateDocSchema = createDocSchema.partial();

const createVersionSchema = z.object({
  version: z.string().min(1).max(30),
  content: z.string().default(""),
  changelog: z.string().optional(),
  effectiveDate: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const updateVersionSchema = createVersionSchema.omit({ version: true }).partial();

export function registerAdminLegalRoutes(app: Express): void {

  // ── GET /api/admin/legal/documents ──────────────────────────────────────────
  app.get("/api/admin/legal/documents", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, docType, search } = req.query as Record<string, string>;
      const clauses: string[] = [];
      const params: any[] = [];
      let p = 1;

      if (status) { clauses.push(`d.status = $${p++}`); params.push(status); }
      if (docType) { clauses.push(`d.doc_type = $${p++}`); params.push(docType); }
      if (search) { clauses.push(`(d.title ILIKE $${p} OR d.slug ILIKE $${p})`); params.push(`%${search}%`); p++; }

      const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

      const { rows } = await pool.query(`
        SELECT d.*,
               v.version       AS current_version,
               v.status        AS version_status,
               v.effective_date,
               v.published_at,
               u.first_name || ' ' || u.last_name AS created_by_name,
               (SELECT COUNT(*)::int FROM legal_acceptances la WHERE la.document_id = d.id) AS acceptance_count
          FROM legal_documents d
     LEFT JOIN legal_document_versions v ON v.id = d.current_version_id
     LEFT JOIN users u ON u.id = d.created_by
          ${where}
      ORDER BY d.created_at DESC
      `, params);

      res.json(rows);
    } catch (err: any) {
      console.error("[legal] list documents:", err.message);
      res.status(500).json({ error: "Failed to list documents" });
    }
  });

  // ── POST /api/admin/legal/documents ─────────────────────────────────────────
  app.post("/api/admin/legal/documents", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = createDocSchema.parse(req.body);
      const adminId = (req as any).user?.id;

      const existing = await pool.query("SELECT id FROM legal_documents WHERE slug = $1", [data.slug]);
      if (existing.rows.length) return res.status(409).json({ error: "A document with this slug already exists" });

      const { rows } = await pool.query(`
        INSERT INTO legal_documents (slug, title, description, doc_type, target_roles, country_code, is_required, requires_reacceptance, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9)
        RETURNING *
      `, [data.slug, data.title, data.description ?? null, data.docType, data.targetRoles, data.countryCode ?? null, data.isRequired, data.requiresReacceptance, adminId]);

      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      console.error("[legal] create document:", err.message);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  // ── GET /api/admin/legal/documents/:id ──────────────────────────────────────
  app.get("/api/admin/legal/documents/:id", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT d.*,
               v.version AS current_version, v.content AS current_content,
               v.effective_date, v.published_at, v.status AS version_status
          FROM legal_documents d
     LEFT JOIN legal_document_versions v ON v.id = d.current_version_id
         WHERE d.id = $1
      `, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "Document not found" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // ── PATCH /api/admin/legal/documents/:id ────────────────────────────────────
  app.patch("/api/admin/legal/documents/:id", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = updateDocSchema.parse(req.body);
      const { id } = req.params;

      const existing = await pool.query("SELECT id FROM legal_documents WHERE id = $1", [id]);
      if (!existing.rows.length) return res.status(404).json({ error: "Document not found" });

      const sets: string[] = [];
      const params: any[] = [];
      let p = 1;

      if (data.title !== undefined)               { sets.push(`title = $${p++}`);                params.push(data.title); }
      if (data.description !== undefined)          { sets.push(`description = $${p++}`);          params.push(data.description); }
      if (data.docType !== undefined)              { sets.push(`doc_type = $${p++}`);             params.push(data.docType); }
      if (data.targetRoles !== undefined)          { sets.push(`target_roles = $${p++}`);         params.push(data.targetRoles); }
      if (data.countryCode !== undefined)          { sets.push(`country_code = $${p++}`);         params.push(data.countryCode); }
      if (data.isRequired !== undefined)           { sets.push(`is_required = $${p++}`);          params.push(data.isRequired); }
      if (data.requiresReacceptance !== undefined) { sets.push(`requires_reacceptance = $${p++}`); params.push(data.requiresReacceptance); }

      if (!sets.length) return res.status(400).json({ error: "No fields to update" });
      sets.push(`updated_at = NOW()`);
      params.push(id);

      const { rows } = await pool.query(`UPDATE legal_documents SET ${sets.join(", ")} WHERE id = $${p} RETURNING *`, params);
      res.json(rows[0]);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  // ── DELETE /api/admin/legal/documents/:id (archive) ─────────────────────────
  app.delete("/api/admin/legal/documents/:id", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        "UPDATE legal_documents SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING id, status",
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: "Document not found" });
      res.json({ message: "Document archived", id: rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to archive document" });
    }
  });

  // ── GET /api/admin/legal/documents/:id/versions ─────────────────────────────
  app.get("/api/admin/legal/documents/:id/versions", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT v.*,
               u.first_name || ' ' || u.last_name AS published_by_name,
               (SELECT COUNT(*)::int FROM legal_acceptances la WHERE la.version_id = v.id) AS acceptance_count
          FROM legal_document_versions v
     LEFT JOIN users u ON u.id = v.published_by
         WHERE v.document_id = $1
      ORDER BY v.created_at DESC
      `, [req.params.id]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });

  // ── POST /api/admin/legal/documents/:id/versions ────────────────────────────
  app.post("/api/admin/legal/documents/:id/versions", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = createVersionSchema.parse(req.body);
      const { id } = req.params;

      const doc = await pool.query("SELECT id, status FROM legal_documents WHERE id = $1", [id]);
      if (!doc.rows.length) return res.status(404).json({ error: "Document not found" });
      if (doc.rows[0].status === "archived") return res.status(400).json({ error: "Cannot create version for archived document" });

      const dup = await pool.query("SELECT id FROM legal_document_versions WHERE document_id = $1 AND version = $2", [id, data.version]);
      if (dup.rows.length) return res.status(409).json({ error: `Version ${data.version} already exists` });

      const { rows } = await pool.query(`
        INSERT INTO legal_document_versions (document_id, version, content, changelog, effective_date, expires_at, status)
        VALUES ($1,$2,$3,$4,$5,$6,'draft')
        RETURNING *
      `, [id, data.version, data.content, data.changelog ?? null, data.effectiveDate ?? null, data.expiresAt ?? null]);

      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      res.status(500).json({ error: "Failed to create version" });
    }
  });

  // ── PATCH /api/admin/legal/documents/:id/versions/:versionId ────────────────
  app.patch("/api/admin/legal/documents/:id/versions/:versionId", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = updateVersionSchema.parse(req.body);
      const { versionId } = req.params;

      const ver = await pool.query("SELECT status FROM legal_document_versions WHERE id = $1", [versionId]);
      if (!ver.rows.length) return res.status(404).json({ error: "Version not found" });
      if (ver.rows[0].status === "published") return res.status(400).json({ error: "Published versions cannot be edited. Create a new version instead." });

      const sets: string[] = [];
      const params: any[] = [];
      let p = 1;

      if (data.content !== undefined)      { sets.push(`content = $${p++}`);       params.push(data.content); }
      if (data.changelog !== undefined)    { sets.push(`changelog = $${p++}`);     params.push(data.changelog); }
      if (data.effectiveDate !== undefined){ sets.push(`effective_date = $${p++}`); params.push(data.effectiveDate); }
      if (data.expiresAt !== undefined)    { sets.push(`expires_at = $${p++}`);    params.push(data.expiresAt); }

      if (!sets.length) return res.status(400).json({ error: "No fields to update" });
      params.push(versionId);

      const { rows } = await pool.query(`UPDATE legal_document_versions SET ${sets.join(", ")} WHERE id = $${p} RETURNING *`, params);
      res.json(rows[0]);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      res.status(500).json({ error: "Failed to update version" });
    }
  });

  // ── POST /api/admin/legal/documents/:id/versions/:versionId/publish ─────────
  app.post("/api/admin/legal/documents/:id/versions/:versionId/publish", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { id, versionId } = req.params;
      const adminId = (req as any).user?.id;

      const ver = await client.query("SELECT * FROM legal_document_versions WHERE id = $1 AND document_id = $2", [versionId, id]);
      if (!ver.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Version not found" }); }
      if (ver.rows[0].status === "published") { await client.query("ROLLBACK"); return res.status(400).json({ error: "Version already published" }); }

      // Archive previous published version
      await client.query(`
        UPDATE legal_document_versions SET status = 'archived'
         WHERE document_id = $1 AND status = 'published' AND id != $2
      `, [id, versionId]);

      // Publish the new version
      await client.query(`
        UPDATE legal_document_versions
           SET status = 'published', published_at = NOW(), published_by = $1
         WHERE id = $2
      `, [adminId, versionId]);

      // Point document at new current version and flip status to published
      const requiresReacceptance = req.body?.requiresReacceptance ?? false;
      await client.query(`
        UPDATE legal_documents
           SET status = 'published', current_version_id = $1,
               requires_reacceptance = $2, updated_at = NOW()
         WHERE id = $3
      `, [versionId, requiresReacceptance, id]);

      await client.query("COMMIT");
      res.json({ message: "Version published", versionId, requiresReacceptance });
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[legal] publish version:", err.message);
      res.status(500).json({ error: "Failed to publish version" });
    } finally {
      client.release();
    }
  });

  // ── POST /api/admin/legal/documents/:id/versions/:versionId/archive ─────────
  app.post("/api/admin/legal/documents/:id/versions/:versionId/archive", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { versionId } = req.params;
      const { rows } = await pool.query(
        "UPDATE legal_document_versions SET status = 'archived' WHERE id = $1 RETURNING id, status",
        [versionId]
      );
      if (!rows.length) return res.status(404).json({ error: "Version not found" });
      res.json({ message: "Version archived", id: rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to archive version" });
    }
  });

  // ── GET /api/admin/legal/documents/:id/acceptances ──────────────────────────
  app.get("/api/admin/legal/documents/:id/acceptances", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { search, source, limit = "50", offset = "0" } = req.query as Record<string, string>;
      const params: any[] = [req.params.id];
      let p = 2;
      const clauses: string[] = [];

      if (search) {
        clauses.push(`(u.email ILIKE $${p} OR u.first_name ILIKE $${p} OR u.last_name ILIKE $${p})`);
        params.push(`%${search}%`); p++;
      }
      if (source) { clauses.push(`la.source = $${p++}`); params.push(source); }

      const where = clauses.length ? "AND " + clauses.join(" AND ") : "";

      const { rows } = await pool.query(`
        SELECT la.*,
               u.email, u.first_name, u.last_name,
               v.version AS version_number
          FROM legal_acceptances la
          JOIN users u ON u.id = la.user_id
          JOIN legal_document_versions v ON v.id = la.version_id
         WHERE la.document_id = $1 ${where}
      ORDER BY la.accepted_at DESC
         LIMIT $${p} OFFSET $${p + 1}
      `, [...params, parseInt(limit), parseInt(offset)]);

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM legal_acceptances la JOIN users u ON u.id = la.user_id WHERE la.document_id = $1 ${where}`,
        params
      );

      res.json({ acceptances: rows, total: countRows[0]?.total ?? 0 });
    } catch (err: any) {
      console.error("[legal] acceptances:", err.message);
      res.status(500).json({ error: "Failed to fetch acceptances" });
    }
  });

  // ── GET /api/admin/legal/acceptances (global search) ────────────────────────
  app.get("/api/admin/legal/acceptances", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { search, documentId, source, limit = "50", offset = "0" } = req.query as Record<string, string>;
      const params: any[] = [];
      let p = 1;
      const clauses: string[] = [];

      if (search) {
        clauses.push(`(u.email ILIKE $${p} OR u.first_name ILIKE $${p} OR u.last_name ILIKE $${p})`);
        params.push(`%${search}%`); p++;
      }
      if (documentId) { clauses.push(`la.document_id = $${p++}`); params.push(documentId); }
      if (source)     { clauses.push(`la.source = $${p++}`);      params.push(source); }

      const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

      const { rows } = await pool.query(`
        SELECT la.*,
               u.email, u.first_name, u.last_name,
               d.title AS document_title, d.slug AS document_slug,
               v.version AS version_number
          FROM legal_acceptances la
          JOIN users u ON u.id = la.user_id
          JOIN legal_documents d ON d.id = la.document_id
          JOIN legal_document_versions v ON v.id = la.version_id
        ${where}
      ORDER BY la.accepted_at DESC
         LIMIT $${p} OFFSET $${p + 1}
      `, [...params, parseInt(limit), parseInt(offset)]);

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM legal_acceptances la JOIN users u ON u.id = la.user_id JOIN legal_documents d ON d.id = la.document_id ${where}`,
        params
      );

      res.json({ acceptances: rows, total: countRows[0]?.total ?? 0 });
    } catch (err: any) {
      console.error("[legal] global acceptances:", err.message);
      res.status(500).json({ error: "Failed to fetch acceptances" });
    }
  });

  // ── GET /api/admin/legal/pending-reacceptances ───────────────────────────────
  // Lists users who must re-accept a required document but haven't yet
  app.get("/api/admin/legal/pending-reacceptances", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT d.id AS document_id, d.title, d.slug, d.current_version_id,
               v.version AS current_version,
               COUNT(DISTINCT u.id)::int AS users_pending
          FROM legal_documents d
          JOIN legal_document_versions v ON v.id = d.current_version_id
          JOIN users u ON u.is_deleted IS NOT TRUE AND u.role IN ('patient','provider')
         WHERE d.status = 'published'
           AND d.requires_reacceptance = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM legal_acceptances la
              WHERE la.document_id = d.id
                AND la.version_id  = d.current_version_id
                AND la.user_id     = u.id
           )
      GROUP BY d.id, d.title, d.slug, d.current_version_id, v.version
      ORDER BY users_pending DESC
      `);
      res.json(rows);
    } catch (err: any) {
      console.error("[legal] pending reacceptances:", err.message);
      res.status(500).json({ error: "Failed to fetch pending re-acceptances" });
    }
  });
}
