/**
 * Auth middleware — extracted from server/routes.ts
 *
 * Contains:
 *  - JWT constants and auth-cache state
 *  - invalidateAuthCache / getCachedUser (also exported from routes.ts for compat)
 *  - authenticateToken  — full JWT verification + role/verification guard
 *  - optionalAuth       — same but never rejects; hydrates req.user when valid
 *  - requireAdmin       — any admin role (admin | global_admin | country_admin)
 *  - requireGlobalAdmin — global_admin only
 *  - AuthRequest        — extended Express Request with req.user
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import {
  type CountryCode,
  isCountryCode,
  isAdminRole,
  isGlobalAdmin,
  adminScopeFor,
} from "./country";
import { invalidatePermCache } from "./rbac";

// SESSION_SECRET is validated at startup (server/config/env.ts).
export const JWT_SECRET = process.env.SESSION_SECRET as string;
export const JWT_EXPIRES_IN = "30d";
export const ACCESS_TOKEN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
export const REFRESH_TOKEN_EXPIRES_IN = 90 * 24 * 60 * 60 * 1000;   // 90 days

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    countryCode?: CountryCode;
    adminScope?: "global" | "country";
  };
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

// ── In-process TTL auth cache ──────────────────────────────────────────────
// Avoids a DB round-trip on every authenticated request. Invalidated on
// logout, password change, email verification, suspension, and provider
// verification updates via `invalidateAuthCache`.
const AUTH_CACHE_TTL_MS = 30_000;

type CachedUser = {
  isEmailVerified: boolean;
  role: string;
  countryCode: CountryCode;
  isSuspended?: boolean | null;
  full: any;
  expires: number;
};
type CachedProviderVerified = { isVerified: boolean; expires: number };

export const userAuthCache = new Map<string, CachedUser>();
export const providerVerifiedCache = new Map<string, CachedProviderVerified>();

export function invalidateAuthCache(userId: string): void {
  userAuthCache.delete(userId);
  providerVerifiedCache.delete(userId);
  invalidatePermCache(userId);
}

export function getCachedUser(userId: string): any | null {
  const c = userAuthCache.get(userId);
  if (!c || c.expires < Date.now()) return null;
  return c.full;
}

// ── authenticateToken ──────────────────────────────────────────────────────
export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const cookieToken = req.cookies?.accessToken;
  const finalToken = token || cookieToken;

  if (!finalToken) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(finalToken, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };

    const now = Date.now();
    let cached = userAuthCache.get(decoded.id);
    if (!cached || cached.expires < now) {
      const user = await storage.getUser(decoded.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const { password: _pw, ...full } = user as any;
      cached = {
        isEmailVerified: !!user.isEmailVerified,
        role: user.role,
        countryCode: (
          isCountryCode((user as any).countryCode)
            ? (user as any).countryCode
            : "HU"
        ) as CountryCode,
        isSuspended: user.isSuspended,
        full,
        expires: now + AUTH_CACHE_TTL_MS,
      };
      userAuthCache.set(decoded.id, cached);
    }

    if (!cached.isEmailVerified) {
      return res.status(403).json({ message: "Email verification required" });
    }

    if (cached.role === "provider") {
      let pv = providerVerifiedCache.get(decoded.id);
      if (!pv || pv.expires < now) {
        const provider = await storage.getProviderByUserId(decoded.id);
        pv = {
          isVerified: !!(provider && provider.isVerified),
          expires: now + AUTH_CACHE_TTL_MS,
        };
        providerVerifiedCache.set(decoded.id, pv);
      }
      if (!pv.isVerified) {
        // Allow ALL provider self-management routes during onboarding.
        // An unverified provider must be able to upload documents, manage
        // credentials, set up their profile and submit for review — none of
        // these endpoints expose patient data or allow booking acceptance.
        // Patient-safety protection is enforced at the data layer:
        //   • unverified providers are excluded from search results
        //   • booking validation checks provider status separately
        // Only block routes that are truly outside the provider's own scope.
        const allowed =
          req.path.startsWith("/api/provider/") ||
          req.path === "/api/upload" ||
          req.path.startsWith("/api/auth") ||
          // Providers awaiting approval must still be able to see their own
          // notifications (e.g. "documents rejected — please reupload") and
          // manage push subscriptions / chat during the KYC review window.
          req.path.startsWith("/api/notifications") ||
          req.path.startsWith("/api/notification-preferences") ||
          req.path.startsWith("/api/push") ||
          req.path.startsWith("/api/chat") ||
          req.path.startsWith("/api/comms");
        if (!allowed) {
          return res
            .status(403)
            .json({ message: "Account awaiting admin approval" });
        }
      }
    }

    const adminScope = adminScopeFor(cached.role);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: cached.role,
      countryCode: cached.countryCode,
      ...(adminScope ? { adminScope } : {}),
    };
    next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// ── optionalAuth ───────────────────────────────────────────────────────────
// Never rejects. Hydrates req.user (including countryCode) when a valid token
// is present so multi-country tenancy filters work on public listing routes.
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const cookieToken = req.cookies?.accessToken;
  const finalToken = token || cookieToken;

  if (finalToken) {
    try {
      const decoded = jwt.verify(finalToken, JWT_SECRET) as {
        id: string;
        email: string;
        role: string;
      };
      const now = Date.now();
      let cached = userAuthCache.get(decoded.id);
      if (!cached || cached.expires < now) {
        try {
          const user = await storage.getUser(decoded.id);
          if (user) {
            const { password: _pw, ...full } = user as any;
            cached = {
              isEmailVerified: !!user.isEmailVerified,
              role: user.role,
              countryCode: (
                isCountryCode((user as any).countryCode)
                  ? (user as any).countryCode
                  : "HU"
              ) as CountryCode,
              isSuspended: user.isSuspended,
              full,
              expires: now + AUTH_CACHE_TTL_MS,
            };
            userAuthCache.set(decoded.id, cached);
          }
        } catch {
          // DB failure — treat as anonymous but keep id from JWT
        }
      }
      const adminScope = cached ? adminScopeFor(cached.role) : null;
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: cached?.role ?? decoded.role,
        ...(cached?.countryCode ? { countryCode: cached.countryCode } : {}),
        ...(adminScope ? { adminScope } : {}),
      };
    } catch {
      // Invalid token — continue as anonymous
    }
  }
  next();
};

// ── requireAdmin ───────────────────────────────────────────────────────────
// Passes for any admin role: legacy 'admin', 'global_admin', 'country_admin'.
// Country isolation is enforced at the data-access layer using req.user.countryCode.
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// ── requireGlobalAdmin ─────────────────────────────────────────────────────
// Cross-country operations (admin management, system settings, etc.) require
// the global scope.
export const requireGlobalAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || !isGlobalAdmin(req.user.role)) {
    return res.status(403).json({ message: "Global admin access required" });
  }
  next();
};
