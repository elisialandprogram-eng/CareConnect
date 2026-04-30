/**
 * Multi-country tenancy helpers.
 *
 * Every authenticated request carries a `countryCode` (HU or IR). All listing,
 * search, and write endpoints that operate on tenant data must enforce that
 * the caller can only see / mutate rows in their own country. The single
 * exception is `global_admin`, which has cross-country access.
 */
import type { Request, Response, NextFunction } from "express";

export type CountryCode = "HU" | "IR";
export const SUPPORTED_COUNTRIES: readonly CountryCode[] = ["HU", "IR"] as const;
export const DEFAULT_COUNTRY: CountryCode = "HU";

export function isCountryCode(v: unknown): v is CountryCode {
  return typeof v === "string" && (SUPPORTED_COUNTRIES as readonly string[]).includes(v);
}

/** Normalise free-text country input ("Hungary", "iran", "hu") to a code. */
export function normalizeCountry(input: unknown): CountryCode | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (s === "hu" || s === "hun" || s === "hungary" || s === "magyarország" || s === "magyarorszag") return "HU";
  if (s === "ir" || s === "irn" || s === "iran" || s === "islamic republic of iran" || s === "ایران") return "IR";
  return null;
}

/** Adminstrative roles. */
export type AdminScope = "global" | "country" | null;

export function isAdminRole(role: string | undefined | null): boolean {
  return role === "admin" || role === "global_admin" || role === "country_admin";
}

export function adminScopeFor(role: string | undefined | null): AdminScope {
  if (role === "global_admin" || role === "admin") return "global"; // legacy "admin" treated as global
  if (role === "country_admin") return "country";
  return null;
}

/** Convenience: does this user have unrestricted cross-country access? */
export function isGlobalAdmin(role: string | undefined | null): boolean {
  return adminScopeFor(role) === "global";
}

/**
 * Returns true when `user` is allowed to read/write a row whose tenancy is
 * `target`. Global admins always pass; everyone else must match their own
 * country.
 */
export function canAccessCountry(
  user: { role?: string | null; countryCode?: CountryCode | null } | undefined,
  target: CountryCode | null | undefined,
): boolean {
  if (!user) return false;
  if (isGlobalAdmin(user.role)) return true;
  if (!target || !user.countryCode) return false;
  return user.countryCode === target;
}

/**
 * Express middleware factory: 403s the request if the caller cannot access
 * the supplied country. Useful as a one-liner inside route handlers:
 *
 *   if (!canAccessCountry(req.user, target)) return res.status(403)...
 */
export function assertCanAccessCountry(
  req: Request & { user?: any },
  res: Response,
  targetCountry: CountryCode | null | undefined,
): boolean {
  if (canAccessCountry(req.user, targetCountry)) return true;
  res.status(403).json({ message: "Cross-country access denied" });
  return false;
}

/**
 * Returns the country to filter a listing by. Behaviour:
 *   - country_admin / patient / provider: locked to their own country
 *   - global_admin: defaults to no filter (`null`), but may opt into a single
 *     country via `?country=HU` or `?country=IR`.
 */
export function listingCountryFilter(
  user: { role?: string | null; countryCode?: CountryCode | null } | undefined,
  query: Record<string, unknown> | undefined,
): CountryCode | null {
  if (!user) return null;
  if (isGlobalAdmin(user.role)) {
    const q = query?.country;
    if (typeof q === "string") {
      const c = q.toUpperCase();
      if (c === "ALL") return null;
      if (isCountryCode(c)) return c;
    }
    return null;
  }
  return (user.countryCode as CountryCode | undefined) ?? DEFAULT_COUNTRY;
}

/**
 * Lightweight middleware that only validates `req.user.countryCode` exists
 * for authenticated requests. Mounted after `authenticateToken`.
 */
export function requireCountryContext(req: Request & { user?: any }, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Authentication required" });
  if (!isCountryCode(req.user.countryCode)) {
    return res.status(500).json({ message: "User has no country assigned" });
  }
  next();
}
