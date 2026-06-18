/**
 * Provider Media — gallery, documents, credentials
 * Extracted from provider.routes.ts
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { z } from "zod";
import { eq, and, desc, or, inArray, gte, lte, asc } from "drizzle-orm";
import {
  insertServiceSchema,
  updateServiceSchema,
  insertPractitionerSchema,
  insertServicePractitionerSchema,
  insertGroupSessionSchema,
  insertProviderTimeOffSchema,
  insertServicePackageSchema,
  services,
  practitioners,
  servicePractitioners,
  reviews,
  providers,
  users,
  providerDocuments,
} from "@shared/schema";
import {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireGlobalAdmin,
  type AuthRequest,
  invalidateAuthCache,
} from "../middleware/auth";
import {
  type CountryCode,
  SUPPORTED_COUNTRIES,
  isCountryCode,
  isAdminRole,
  isGlobalAdmin,
  adminScopeFor,
  canAccessCountry,
  listingCountryFilter,
  countryCurrency,
} from "../middleware/country";
import { dispatchNotification } from "../services/notification-dispatcher";
import { trackEvent } from "../services/analyticsTracker";
import { getRates, fromUSDSync, toUSDSync, formatSync } from "../services/currency";
import {
  uploadAvatarImage,
  uploadGalleryImage,
  deleteCloudinaryImage,
  deleteCloudinaryFile,
  isCloudinaryConfigured,
  uploadDocumentFile,
  uploadCredentialFile,
  generateSignedDocumentUrl,
} from "../services/cloudinary";
import {
  scoreProvider,
  rankProviders,
  type PatientContext,
  type ProviderCandidate,
} from "../services/providerMatcher";
import { providerListCache, providerSearchCache } from "../lib/cache";
import {
  sanitizeUser,
  sanitizeProviderWithUser,
  sanitizeProviderListItem,
} from "../utils/sanitize";
import { slog } from "../lib/logger";
import { requirePermission, PERMISSIONS } from "../middleware/rbac";
import {
  fireAdminNotification,
  sendAppointmentEmail,
} from "./shared/helpers";
import { checkConflict, getBufferSettings, BLOCKING_STATUSES } from "../conflictEngine";
import multer from "multer";
import { notify } from "../services/notification-dispatcher";

export function registerProviderMediaRoutes(app: Express): void {
  // ── Provider Gallery ─────────────────────────────────────────────────────────
  // All uploads go through Cloudinary (external storage). Only URLs + public_id
  // are stored in the DB. Server disk is never used for gallery images.

  const galleryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Unsupported format. Use jpg, png, or webp"));
      }
    },
  });

  app.get("/api/provider/gallery", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const images = await storage.getProviderGallery(provider.id);
      res.json(images);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch gallery" });
    }
  });

  // POST /api/provider/gallery/upload — multipart file upload → Cloudinary
  app.post(
    "/api/provider/gallery/upload",
    authenticateToken,
    galleryUpload.single("image"),
    async (req: AuthRequest, res: Response) => {
      try {
        if (!isCloudinaryConfigured()) {
          return res.status(503).json({ message: "Image storage not configured" });
        }
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider) return res.status(404).json({ message: "Provider not found" });

        const existing = await storage.getProviderGallery(provider.id);
        if (existing.length >= 10) {
          return res.status(400).json({ message: "Gallery limit is 10 images" });
        }

        if (!req.file) return res.status(400).json({ message: "No image file provided" });

        const caption = typeof req.body.caption === "string" ? req.body.caption.trim() : null;

        const uploaded = await uploadGalleryImage(
          req.file.buffer,
          req.file.mimetype,
          `provider_gallery/${provider.id}`
        );

        const image = await storage.addGalleryImage({
          providerId: provider.id,
          imageUrl: uploaded.secureUrl,
          publicId: uploaded.publicId,
          caption: caption || null,
          sortOrder: existing.length,
        });

        pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, 'gallery_upload', 'provider_gallery', $2, $3, $4)`,
          [req.user!.id, image.id, JSON.stringify({ publicId: uploaded.publicId }), (provider as any).countryCode ?? null]
        ).catch(() => {});

        res.status(201).json({ ...image, thumbnailUrl: uploaded.thumbnailUrl });
      } catch (err: any) {
        console.error("[gallery upload]", err);
        res.status(400).json({ message: err?.message ?? "Upload failed" });
      }
    }
  );

  app.patch("/api/provider/gallery/:imageId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const { caption } = req.body;
      const updated = await storage.updateGalleryImage(req.params.imageId, provider.id, { caption });
      if (!updated) return res.status(404).json({ message: "Image not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update gallery image" });
    }
  });

  app.delete("/api/provider/gallery/:imageId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      // Fetch before delete so we can clean up from Cloudinary
      const img = await storage.getGalleryImage(req.params.imageId, provider.id);
      if (!img) return res.status(404).json({ message: "Image not found" });
      await storage.deleteGalleryImage(req.params.imageId, provider.id);
      if (img.publicId) {
        await deleteCloudinaryImage(img.publicId);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete gallery image" });
    }
  });

  app.post("/api/provider/gallery/reorder", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) return res.status(400).json({ message: "orderedIds array required" });
      await storage.reorderGalleryImages(provider.id, orderedIds);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to reorder gallery" });
    }
  });

  // Public: get provider gallery
  app.get("/api/providers/:id/gallery", async (req: Request, res: Response) => {
    try {
      const images = await storage.getProviderGallery(req.params.id);
      res.json(images);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch gallery" });
    }
  });

  const docUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  // ── POST /api/provider/documents — JSON re-upload trigger ────────────────
  // Accepts JSON body (documentType) without a file. Redirects to the full
  // multipart upload at /api/provider/documents/upload. Exists so that the
  // KYC re-upload flow can reference a stable non-/upload path and so that
  // the endpoint returns 403/400 (not 404) for non-providers.
  app.post("/api/provider/documents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(403).json({ message: "Provider account required" });
      }
      // Actual file upload must go through /api/provider/documents/upload (multipart).
      return res.status(400).json({
        message: "File upload required. Use POST /api/provider/documents/upload with multipart/form-data",
        uploadUrl: "/api/provider/documents/upload",
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.get("/api/provider/documents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const docs = await storage.getProviderDocuments(provider.id);
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/provider/documents/upload", authenticateToken, docUpload.single("file"), async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      if (!req.file) return res.status(400).json({ message: "No file provided" });
      if (!isCloudinaryConfigured()) return res.status(503).json({ message: "File storage not configured" });

      const { documentType, expiryDate, expiryRequired, documentCriticality, reminderDaysBefore } = req.body;
      if (!documentType) return res.status(400).json({ message: "documentType is required" });

      // Orphan cleanup: if the provider has an existing document of this type
      // with a stored Cloudinary asset, delete it before writing the new file.
      // This prevents accumulation of orphaned files in the storage bucket.
      storage.getProviderDocuments(provider.id)
        .then((existingDocs) => {
          const oldDoc = existingDocs.find(
            (d) => d.documentType === documentType && d.cloudinaryPublicId,
          );
          if (oldDoc?.cloudinaryPublicId) {
            deleteCloudinaryFile(oldDoc.cloudinaryPublicId).catch(() => {});
          }
        })
        .catch(() => {});

      const uploaded = await uploadDocumentFile(req.file.buffer, req.file.mimetype);
      const doc = await storage.createProviderDocument({
        providerId: provider.id,
        documentType,
        documentUrl: uploaded.secureUrl,
        cloudinaryPublicId: uploaded.publicId,
        fileName: (req.file as any).originalname || null,
        verificationStatus: "pending",
        expiryDate: expiryDate || null,
        expiryRequired: expiryRequired === "true" || expiryRequired === true,
        documentCriticality: documentCriticality || "optional",
        reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : 30,
        expiredAt: null,
        verifiedBy: null,
        verifiedAt: null,
      });

      // Auto-promotion: if provider is in action_required state (docs were rejected),
      // re-uploading a document advances them back to submitted (fire-and-forget)
      pool.query(`SELECT status FROM providers WHERE id = $1`, [provider.id])
        .then(async (r) => {
          if (r.rows[0]?.status === "action_required") {
            await pool.query(
              `UPDATE providers SET status = 'submitted', updated_at = NOW() WHERE id = $1`,
              [provider.id],
            );
          }
        })
        .catch(() => {});

      // Fire admin notification (fire-and-forget — never blocks response)
      storage.getUser(req.user!.id).then((u) => {
        const name = u ? `${u.firstName} ${u.lastName}`.trim() : null;
        const crit = documentCriticality || "optional";
        fireAdminNotification(
          "document_uploaded",
          `Document uploaded: ${documentType.replace(/_/g, " ")}`,
          `${name || "A provider"} uploaded a ${documentType.replace(/_/g, " ")} document`,
          {
            providerId:   provider.id,
            providerName: name,
            countryCode:  (provider as any).countryCode ?? null,
            severity:     crit === "critical" ? "critical" : crit === "high" ? "warning" : "info",
            actionType:   "document_uploaded",
            metadata:     { documentType, docId: doc.id, criticality: crit },
          }
        );
        // Write to audit log for provider timeline
        pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, 'create', 'provider_document', $2, $3, $4)`,
          [req.user!.id, doc.id, JSON.stringify({ documentType, fileName: (req.file as any).originalname }), (provider as any).countryCode ?? null]
        ).catch(() => {});
      }).catch(() => {});
      res.status(201).json(doc);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Upload failed" });
    }
  });

  app.delete("/api/provider/documents/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const doc = await storage.getProviderDocument(req.params.id);
      if (!doc || doc.providerId !== provider.id) return res.status(404).json({ message: "Document not found" });
      await storage.deleteProviderDocument(doc.id);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code) VALUES ($1, 'delete', 'provider_document', $2, $3, $4)`,
        [req.user!.id, doc.id, JSON.stringify({ documentType: doc.documentType, softDeleted: true }), (provider as any).countryCode ?? null]
      ).catch(() => {});
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // ── Provider Credentials ─────────────────────────────────────────────────────
  app.get("/api/provider/credentials", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const creds = await storage.getProviderCredentials(provider.id);
      res.json(creds);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch credentials" });
    }
  });

  app.post("/api/provider/credentials/upload", authenticateToken, docUpload.single("file"), async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const { credentialType, title, licenseNumber, issuingBody } = req.body;
      if (!credentialType || !title) return res.status(400).json({ message: "credentialType and title are required" });

      let fileUrl: string | undefined;
      let cloudinaryPublicId: string | undefined;
      if (req.file) {
        if (!isCloudinaryConfigured()) return res.status(503).json({ message: "File storage not configured" });
        const uploaded = await uploadCredentialFile(req.file.buffer, req.file.mimetype);
        fileUrl = uploaded.secureUrl;
        cloudinaryPublicId = uploaded.publicId;
      }

      const cred = await storage.createProviderCredential({
        providerId: provider.id,
        credentialType,
        title,
        fileUrl: fileUrl ?? null,
        cloudinaryPublicId: cloudinaryPublicId ?? null,
        licenseNumber: licenseNumber || null,
        issuingBody: issuingBody || null,
      });
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'credential_upload', 'provider_credential', $2, $3, $4)`,
        [req.user!.id, cred.id, JSON.stringify({ credentialType, title }), (provider as any).countryCode ?? null]
      ).catch(() => {});
      res.status(201).json(cred);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Upload failed" });
    }
  });

  app.patch("/api/provider/credentials/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const { credentialType, title, licenseNumber, issuingBody } = req.body;
      const updated = await storage.updateProviderCredential(req.params.id, provider.id, { credentialType, title, licenseNumber, issuingBody });
      if (!updated) return res.status(404).json({ message: "Credential not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update credential" });
    }
  });

  app.delete("/api/provider/credentials/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const cred = await storage.getProviderCredential(req.params.id);
      if (!cred || cred.providerId !== provider.id) return res.status(404).json({ message: "Credential not found" });
      if (cred.cloudinaryPublicId) await deleteCloudinaryFile(cred.cloudinaryPublicId);
      await storage.deleteProviderCredential(cred.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });

  // ── Authenticated: provider credentials with ownership-aware access control ──
  // Provider self → all credentials (including unverified)
  // Admin         → all credentials
  // Any other authenticated user → verified credentials only (metadata, no file URLs)
  // Unauthenticated → 404
  app.get("/api/providers/:id/credentials", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(404).json({ message: "Not found" });

      const providerId = req.params.id;
      const isAdmin = isAdminRole(req.user.role);

      // Fetch provider for country check
      const provider = await storage.getProvider(providerId);
      if (!provider) return res.status(404).json({ message: "Not found" });

      // Country isolation: non-admins may only view providers in their own country
      if (!isAdmin && provider.countryCode !== req.user.countryCode) {
        return res.status(404).json({ message: "Not found" });
      }

      // Check if the requesting user is this provider
      const ownProvider = req.user.role === "provider"
        ? await storage.getProviderByUserId(req.user.id)
        : null;
      const isSelf = ownProvider?.id === providerId;

      if (isAdmin || isSelf) {
        const creds = await storage.getProviderCredentials(providerId);
        return res.json(creds.map(c => ({
          id: c.id,
          credentialType: c.credentialType,
          title: c.title,
          licenseNumber: c.licenseNumber,
          issuingBody: c.issuingBody,
          verified: c.verified,
          verifiedAt: c.verifiedAt,
        })));
      }

      // Authenticated non-owner: verified metadata only — no license number, no file URLs
      const creds = await storage.getPublicProviderCredentials(providerId);
      res.json(creds.map(c => ({
        id: c.id,
        credentialType: c.credentialType,
        title: c.title,
        issuingBody: c.issuingBody,
        verifiedAt: c.verifiedAt,
      })));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch credentials" });
    }
  });

  // ── Document proxy: generates a short-lived signed URL for a Cloudinary asset ─
  // Requires authentication. Access rules:
  //   Admin     → any asset by publicId
  //   Provider  → only assets from their own documents/credentials
  //   Patient   → only assets from their own patient documents
  //   Others    → 403
  app.get("/api/documents/signed-url", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      if (!isCloudinaryConfigured()) return res.status(503).json({ message: "Document storage not configured" });

      const publicId = (req.query.publicId as string | undefined)?.trim();
      const resourceType = req.query.resourceType === "image" ? "image" : "raw";
      if (!publicId) return res.status(400).json({ message: "publicId is required" });

      const isAdmin = isAdminRole(req.user.role);

      if (!isAdmin) {
        if (req.user.role === "provider") {
          // Validate provider owns the document or credential
          const provider = await storage.getProviderByUserId(req.user.id);
          if (!provider) return res.status(403).json({ message: "Access denied" });

          const [docs, creds] = await Promise.all([
            storage.getProviderDocuments(provider.id),
            storage.getProviderCredentials(provider.id),
          ]);
          const owned = [...docs, ...creds].some(
            (d: any) => d.cloudinaryPublicId === publicId
          );
          if (!owned) return res.status(403).json({ message: "Access denied" });
        } else if (req.user.role === "patient") {
          // Validate patient owns the document
          const patientDocs = await storage.getPatientDocuments(req.user.id);
          const owned = patientDocs.some((d: any) => d.cloudinaryPublicId === publicId);
          if (!owned) return res.status(403).json({ message: "Access denied" });
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const signedUrl = generateSignedDocumentUrl(publicId, resourceType);

      // Audit log: document access (best-effort, non-blocking)
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'view', 'document', $2, $3, $4, $5)`,
        [req.user.id, publicId, JSON.stringify({ resourceType, role: req.user.role }), req.ip ?? null, req.user.countryCode ?? null]
      ).catch(() => {});

      res.json({ url: signedUrl, expiresInSeconds: 300 });
    } catch (err) {
      res.status(500).json({ message: "Failed to generate document URL" });
    }
  });

}
