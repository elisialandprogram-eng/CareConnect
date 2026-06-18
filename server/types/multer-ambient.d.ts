/**
 * Minimal ambient declaration for multer.
 *
 * Why this file exists:
 *   tsconfig.json pins `"types": ["node", "vite/client"]`. Any @types package
 *   NOT in that list is silently ignored by the compiler even when installed.
 *   @types/multer is excluded from that list (Vite/client bundle has no need
 *   for it). This file provides the exact types the server routes require,
 *   sourced from the official @types/multer definitions.
 *
 * IMPORTANT: This file must have NO top-level imports. Without imports it is
 * treated as a global script, which is required for `declare namespace Express`
 * to patch the global Express.Request interface and make `req.file` visible on
 * every Request-derived type (including AuthRequest).
 */

// ── 1. Patch Express.Request globally ────────────────────────────────────────
// multer middleware injects `file` (single upload) and `files` (multi-upload)
// onto every Request object after the multer middleware runs. Adding them here
// makes them visible on AuthRequest, which extends Request.
declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination?: string;
      filename?: string;
      path?: string;
      buffer: Buffer;
      stream?: NodeJS.ReadableStream;
    }
  }

  interface Request {
    file?: Multer.File;
    files?: Multer.File[] | { [fieldname: string]: Multer.File[] };
  }
}

// ── 2. Declare the "multer" module ────────────────────────────────────────────
declare module "multer" {
  type RequestHandler = import("express").RequestHandler;
  type Request        = import("express").Request;

  interface FileFilterCallback {
    (error: null, acceptFile: boolean): void;
    (error: Error): void;
  }

  interface StorageEngine {}

  interface Options {
    dest?: string;
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    preservePath?: boolean;
    fileFilter?: (
      req: Request,
      file: Express.Multer.File,
      callback: FileFilterCallback,
    ) => void;
  }

  interface Instance {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  function multer(options?: Options): Instance;

  namespace multer {
    function memoryStorage(): StorageEngine;
    function diskStorage(options: {
      destination?:
        | string
        | ((
            req: Request,
            file: Express.Multer.File,
            cb: (error: Error | null, destination: string) => void,
          ) => void);
      filename?: (
        req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, filename: string) => void,
      ) => void;
    }): StorageEngine;
  }

  export = multer;
}
