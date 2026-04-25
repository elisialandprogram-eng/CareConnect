/**
 * Chat attachment / voice note uploads.
 *
 * Currently writes uploads to ./uploads/ (which is served as /uploads via
 * `server/static.ts`). For production swap this with Replit Object Storage,
 * S3, GCS, or another durable bucket and return a public URL.
 *
 * Allowed types and size limits are enforced here.
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const ROOT = path.resolve(process.cwd(), "uploads", "chat");
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_PREFIXES = ["image/", "audio/", "application/pdf"];

export interface SavedFile {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

export async function saveChatUpload(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
): Promise<SavedFile> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
  }
  if (!ALLOWED_PREFIXES.some((p) => mimetype === p || mimetype.startsWith(p))) {
    throw new Error(`File type not allowed: ${mimetype}`);
  }
  await fs.mkdir(ROOT, { recursive: true });
  const ext = path.extname(originalName) || mimeToExt(mimetype);
  const safeBase = crypto.randomBytes(8).toString("hex");
  const filename = `${Date.now()}-${safeBase}${ext}`;
  const full = path.join(ROOT, filename);
  await fs.writeFile(full, buffer);
  return {
    url: `/uploads/chat/${filename}`,
    filename: originalName,
    mimetype,
    size: buffer.byteLength,
  };
}

function mimeToExt(m: string) {
  if (m === "image/jpeg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  if (m === "audio/webm") return ".webm";
  if (m === "audio/mpeg") return ".mp3";
  if (m === "audio/wav") return ".wav";
  if (m === "audio/ogg") return ".ogg";
  if (m === "application/pdf") return ".pdf";
  return "";
}
