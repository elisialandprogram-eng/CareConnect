import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export async function uploadAvatarImage(
  buffer: Buffer,
  mimetype: string
): Promise<CloudinaryUploadResult> {
  return uploadGalleryImage(buffer, mimetype, "avatars");
}

export async function uploadGalleryImage(
  buffer: Buffer,
  mimetype: string,
  folder = "provider_gallery"
): Promise<CloudinaryUploadResult> {
  const ext = mimetype.split("/")[1]?.toLowerCase().replace("jpeg", "jpg");
  if (!ext || !ALLOWED_FORMATS.includes(ext)) {
    throw new Error(`Unsupported format: ${mimetype}. Allowed: jpg, png, webp`);
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("Image exceeds 5 MB limit");
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        allowed_formats: ALLOWED_FORMATS,
        transformation: [
          { quality: "auto:good", fetch_format: "auto" },
        ],
        eager: [
          { width: 400, height: 400, crop: "fill", quality: "auto", fetch_format: "auto" },
        ],
        eager_async: false,
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        const thumb =
          (result.eager?.[0]?.secure_url as string | undefined) ??
          cloudinary.url(result.public_id, {
            width: 400,
            height: 400,
            crop: "fill",
            quality: "auto",
            fetch_format: "auto",
            secure: true,
          });
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          thumbnailUrl: thumb,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteCloudinaryImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (err) {
    console.warn("[cloudinary] failed to delete asset:", publicId, err);
  }
}

// ── Document / Credential uploads (PDF + images, 10 MB) ───────────────────────
const ALLOWED_DOC_FORMATS = ["jpg", "jpeg", "png", "webp", "pdf"];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

export interface CloudinaryDocResult {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
}

async function uploadRawFile(
  buffer: Buffer,
  mimetype: string,
  folder: string,
): Promise<CloudinaryDocResult> {
  const ext = mimetype.split("/")[1]?.toLowerCase().replace("jpeg", "jpg");
  if (!ext || !ALLOWED_DOC_FORMATS.includes(ext)) {
    throw new Error(`Unsupported format: ${mimetype}. Allowed: jpg, png, webp, pdf`);
  }
  if (buffer.byteLength > MAX_DOC_BYTES) {
    throw new Error("File exceeds 10 MB limit");
  }
  const resourceType = ext === "pdf" ? "raw" : "image";
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType as any, type: "authenticated" },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );
    stream.end(buffer);
  });
}

export async function uploadDocumentFile(buffer: Buffer, mimetype: string): Promise<CloudinaryDocResult> {
  return uploadRawFile(buffer, mimetype, "documents");
}

export async function uploadCredentialFile(buffer: Buffer, mimetype: string): Promise<CloudinaryDocResult> {
  return uploadRawFile(buffer, mimetype, "credentials");
}

// ── Chat attachment uploads (images, audio, PDF — 10 MB) ─────────────────────
const ALLOWED_CHAT_MIME_PREFIXES = ["image/", "audio/", "application/pdf"];

export interface CloudinaryChatResult {
  url: string;
  publicId: string;
  mimetype: string;
  bytes: number;
}

export async function uploadChatFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
): Promise<CloudinaryChatResult> {
  if (buffer.byteLength > MAX_DOC_BYTES) {
    throw new Error(`File too large (max ${MAX_DOC_BYTES / 1024 / 1024} MB)`);
  }
  if (!ALLOWED_CHAT_MIME_PREFIXES.some((p) => mimetype.startsWith(p))) {
    throw new Error(`File type not allowed: ${mimetype}`);
  }
  const isImage = mimetype.startsWith("image/");
  const resourceType = isImage ? "image" : "raw";
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "chat_attachments", resource_type: resourceType as any, type: "upload" },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary chat upload failed"));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          mimetype,
          bytes: result.bytes,
        });
      },
    );
    stream.end(buffer);
  });
}

/**
 * Generate a short-lived signed URL for a Cloudinary asset stored with
 * type "authenticated". Falls back to a signed "upload" (public) URL so the
 * function works with both legacy public assets and newly protected ones.
 *
 * @param publicId   Cloudinary public_id (no leading slash)
 * @param resourceType  "image" for photos, "raw" for PDFs
 * @param expiresInSeconds  How long the signed URL is valid (default 5 min)
 */
export function generateSignedDocumentUrl(
  publicId: string,
  resourceType: "image" | "raw" = "raw",
  expiresInSeconds = 300,
): string {
  const expiration = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return cloudinary.url(publicId, {
    type: "authenticated",
    resource_type: resourceType,
    sign_url: true,
    expires_at: expiration,
    secure: true,
  });
}

/**
 * Delete a file from Cloudinary. Tries `raw` first (PDFs), then `image` (photos).
 * Throws if Cloudinary reports an unexpected error on both attempts so callers get a 500.
 */
export async function deleteCloudinaryFile(publicId: string): Promise<void> {
  // Try raw (PDF) first, then image.
  for (const resourceType of ["raw", "image"] as const) {
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      // `result` is { result: "ok" } on success, { result: "not found" } if wrong type.
      if (result?.result === "ok") return;
    } catch (err) {
      // Network / auth error — rethrow after loop ends.
      console.warn(`[cloudinary] error deleting ${publicId} as ${resourceType}:`, err);
    }
  }
  // If we reach here the file was not deleted via either type.
  throw new Error(`Failed to delete Cloudinary file: ${publicId}`);
}
