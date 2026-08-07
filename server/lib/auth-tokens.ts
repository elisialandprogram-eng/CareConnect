import type { Response } from "express";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { storage } from "../storage";
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} from "./auth-config";

const JWT_SECRET = process.env.SESSION_SECRET as string;

export type TokenUser = {
  id: string;
  email: string;
  role: string;
};

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The only access/refresh token issuance path. MFA completion and password
 * login both use this so cookie flags, claims, and refresh-token persistence
 * cannot drift between authentication flows.
 */
export async function issueAuthTokens(
  res: Response,
  user: TokenUser,
  options: { mfaVerified?: boolean } = {},
): Promise<{ accessToken: string }> {
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(options.mfaVerified ? { mfa_verified: true } : {}),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
  const refreshToken = randomBytes(64).toString("hex");

  await storage.createRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
  });
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_EXPIRES_IN,
  });

  return { accessToken };
}