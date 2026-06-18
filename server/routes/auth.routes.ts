/**
 * Authentication routes
 * Routes: 12 | Owner: auth | Auth: mixed (see each route) | Country isolation: N/A
 * Financial impact: no
 *
 * POST  /api/auth/register
 * POST  /api/auth/login
 * POST  /api/auth/logout
 * POST  /api/auth/refresh
 * GET   /api/auth/me
 * POST  /api/auth/verify-email
 * POST  /api/auth/lookup-pending
 * POST  /api/auth/resend-email-otp
 * POST  /api/auth/reset-password
 * POST  /api/auth/forgot-password
 * POST  /api/auth/complete-reset-password
 * PATCH /api/auth/profile
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { pool } from "../db";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter";
import { validatePasswordStrength } from "../lib/password-policy";
import {
  recordLoginAttempt,
  checkLoginLockout,
  clearLoginAttempts,
  getFailedAttemptCount,
} from "../lib/login-protection";
import {
  type CountryCode,
  isCountryCode,
  isAdminRole,
} from "../middleware/country";
import {
  authenticateToken,
  invalidateAuthCache,
  getCachedUser,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  ACCESS_TOKEN_COOKIE_MAX_AGE,
  REFRESH_TOKEN_EXPIRES_IN,
  type AuthRequest,
} from "../middleware/auth";
import {
  resend,
  FROM_EMAIL,
  hashOtp,
  hashToken,
  generateOtp,
  OTP_COOLDOWN,
} from "./shared/helpers";
import { isMfaRequired } from "../services/mfa.service";

const MFA_TOKEN_SECRET = process.env.SESSION_SECRET ?? "mfa-fallback-dev-secret";
function issueMfaToken(userId: string): string {
  return require("jsonwebtoken").sign(
    { mfa_challenge: true, userId },
    MFA_TOKEN_SECRET,
    { expiresIn: "15m" }
  );
}

// ── Zod schema for registration — backend-enforced minimum ────────────────
const registerSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["patient", "provider"]).optional().default("patient"),
  countryCode: z.enum(["HU", "IR"]).optional(),
  // pass-through fields — not validated strictly but forwarded to storage
  phone: z.string().optional(),
  referralCode: z.string().optional(),
});

export function registerAuthRoutes(app: Express): void {

  // ── POST /api/auth/register ─────────────────────────────────────────────
  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        return res.status(400).json({ message: firstError?.message || "Invalid input" });
      }
      const { email, password, firstName, lastName, phone, role, referralCode, countryCode } = parsed.data;

      // Section C — password policy enforcement
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        return res.status(400).json({ message: pwCheck.errors[0], passwordErrors: pwCheck.errors });
      }

      const resolvedCountry: CountryCode = (countryCode as CountryCode) || "HU";

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        if (existingUser.isEmailVerified) {
          return res.status(400).json({ message: "Email already registered" });
        }
        // Unverified account: regenerate OTP and redirect to verification.
        const otp = generateOtp();
        const otpHash = hashOtp(otp);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await storage.updateUserOtp(existingUser.id, {
          emailOtpHash: otpHash,
          emailOtpExpiresAt: expiresAt,
          otpAttempts: 0,
          lastOtpSentAt: new Date(),
        });
        if (resend) {
          try {
            await resend.emails.send({
              from: FROM_EMAIL,
              to: existingUser.email,
              subject: "Your GoldenLife verification code",
              text: `Your verification code is: ${otp}. This code expires in 5 minutes.`,
            });
          } catch (emailError) {
            console.error("Failed to resend verification email (case B):", emailError);
          }
        }
        return res.status(202).json({
          verification_required: true,
          userId: existingUser.id,
          email: existingUser.email,
          accountStatus: "pending_verification",
          message: "A new verification code has been sent. Please check your email.",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      let referrerUser: any = null;
      if (referralCode && typeof referralCode === "string" && referralCode.trim()) {
        try {
          referrerUser = await storage.getUserByReferralCode(referralCode);
        } catch {
          referrerUser = null;
        }
      }

      const safeRole = role === "provider" ? "provider" : "patient";
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role: safeRole,
        countryCode: resolvedCountry,
        isEmailVerified: false,
        referredByUserId: referrerUser ? referrerUser.id : null,
      } as any);

      if (referrerUser && referrerUser.id !== user.id) {
        try {
          await storage.createReferral({
            referrerUserId: referrerUser.id,
            referredUserId: user.id,
          } as any);
        } catch (e) {
          console.warn("[referral] could not create referral row:", (e as Error).message);
        }
      }

      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await storage.updateUserOtp(user.id, {
        emailOtpHash: otpHash,
        emailOtpExpiresAt: expiresAt,
        otpAttempts: 0,
        lastOtpSentAt: new Date(),
      });

      if (resend) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Your GoldenLife verification code",
            text: `Your verification code is: ${otp}. This code expires in 5 minutes.`,
          });
        } catch (emailError) {
          console.error("Failed to send verification email:", emailError);
        }
      }

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({ user: userWithoutPassword, accountStatus: "pending_verification" });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // ── POST /api/auth/login ────────────────────────────────────────────────
  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const clientIp = (req.ip ?? req.socket?.remoteAddress ?? "unknown").replace(/^::ffff:/, "");

      // Section B — brute-force lockout check (before any DB user lookup)
      const lockout = await checkLoginLockout(email, clientIp, pool);
      if (lockout.locked) {
        return res.status(429).json({
          code: "ACCOUNT_LOCKED",
          message: lockout.reason ?? "Too many failed attempts. Try again later.",
          retryAfterMs: lockout.retryAfterMs,
        });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Record failed attempt even for unknown email (prevents user enumeration via timing)
        await recordLoginAttempt(email, clientIp, false, pool);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        await recordLoginAttempt(email, clientIp, false, pool);
        const failCount = await getFailedAttemptCount(email, pool);
        const remaining = Math.max(0, 5 - failCount);
        return res.status(401).json({
          message: "Invalid email or password",
          attemptsRemaining: remaining > 0 ? remaining : undefined,
          willLockAfter: remaining === 0 ? "Account will be temporarily locked" : undefined,
        });
      }

      if (user.isSuspended) {
        await recordLoginAttempt(email, clientIp, false, pool);
        return res.status(403).json({
          code: "ACCOUNT_SUSPENDED",
          status: "suspended",
          reason: user.suspensionReason || null,
          message: `Your account has been suspended. Reason: ${user.suspensionReason || "No reason provided"}`,
        });
      }

      if (!user.isEmailVerified) {
        return res.status(403).json({
          message: "Please verify your email before logging in",
          isEmailVerified: false,
          userId: user.id,
        });
      }

      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (provider && provider.status === "suspended") {
          return res.status(403).json({
            code: "PROVIDER_SUSPENDED",
            status: "suspended",
            reason: (provider as any).suspensionReason || null,
            message: "Your provider account has been suspended.",
          });
        }
      }

      // Successful login — clear failure window and record success
      await clearLoginAttempts(email, pool);
      await recordLoginAttempt(email, clientIp, true, pool);

      // ── MFA challenge intercept ───────────────────────────────────────────
      const mfaEnabled = await isMfaRequired(user.id);
      if (mfaEnabled) {
        const mfaToken = issueMfaToken(user.id);
        return res.json({ mfa_required: true, mfa_token: mfaToken });
      }
      // ─────────────────────────────────────────────────────────────────────

      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // Section D — refresh token rotation always uses token_hash (no plaintext stored)
      const refreshToken = randomBytes(64).toString("hex");
      await storage.createRefreshToken({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
      });

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
      });
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRES_IN,
      });

      invalidateAuthCache(user.id);
      pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]).catch(() => null);

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accessToken });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ── POST /api/auth/logout ───────────────────────────────────────────────
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        await storage.deleteRefreshTokenByHash(hashToken(refreshToken));
      }
      try {
        const accessToken = req.cookies?.accessToken;
        if (accessToken) {
          const decoded = jwt.verify(accessToken, JWT_SECRET) as { id: string };
          if (decoded?.id) invalidateAuthCache(decoded.id);
        }
      } catch {
        // ignore — token may be expired/invalid
      }
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      res.json({ message: "Logged out successfully" });
    } catch {
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // ── POST /api/auth/refresh ──────────────────────────────────────────────
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ message: "Refresh token required" });
      }

      const tokenHash = hashToken(refreshToken);
      const storedToken = await storage.getRefreshTokenByHash(tokenHash);
      if (!storedToken || new Date(storedToken.expiresAt) < new Date()) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
      }

      const user = await storage.getUser(storedToken.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Rotate: delete used token and issue new one (replay-attack prevention)
      const newRawToken = randomBytes(64).toString("hex");
      await storage.deleteRefreshTokenByHash(tokenHash);
      await storage.createRefreshToken({
        userId: user.id,
        tokenHash: hashToken(newRawToken),
        expiresAt: new Date(storedToken.expiresAt),
      });
      res.cookie("refreshToken", newRawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRES_IN,
      });

      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
      });

      res.json({ accessToken });
    } catch {
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────
  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const cached = getCachedUser(req.user!.id);
      if (cached) return res.json({ user: cached });
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // ── POST /api/auth/verify-email ─────────────────────────────────────────
  app.post("/api/auth/verify-email", otpLimiter, async (req: Request, res: Response) => {
    try {
      const { userId, otp } = req.body;
      if (!userId || !otp) return res.status(400).json({ message: "Missing data" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

      if (!user.emailOtpExpiresAt || new Date(user.emailOtpExpiresAt) < new Date()) {
        return res.status(400).json({ message: "OTP expired" });
      }
      if (user.otpAttempts >= 5) {
        return res.status(400).json({ message: "Too many attempts. Please resend." });
      }

      if (user.emailOtpHash !== hashOtp(otp)) {
        await storage.updateUserOtp(userId, {
          emailOtpHash: user.emailOtpHash,
          emailOtpExpiresAt: user.emailOtpExpiresAt,
          otpAttempts: user.otpAttempts + 1,
        });
        return res.status(400).json({ message: "Invalid OTP" });
      }

      await storage.verifyUserEmail(userId);

      // Auto-seed a draft provider row so new providers land on the dashboard
      // immediately after verification instead of getting a 403 on /api/provider/me.
      if (user.role === "provider") {
        const existingProv = await storage.getProviderByUserId(userId);
        if (!existingProv) {
          try {
            await storage.createProvider({
              userId,
              status: "draft",
              isVerified: false,
              isActive: true,
              countryCode: user.countryCode || "HU",
            } as any);
          } catch (e) {
            console.warn("[verify-email] Failed to auto-seed provider draft row:", (e as Error).message);
          }
        }
      }

      invalidateAuthCache(userId);

      if (resend) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Your email is verified",
            text: "Congratulations! Your GoldenLife account is now fully verified.",
          });
        } catch (e) { console.error("Verify confirmation email error", e); }
      }

      res.json({ message: "Email verified successfully", accountStatus: "active" });
    } catch {
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // ── POST /api/auth/lookup-pending ───────────────────────────────────────
  app.post("/api/auth/lookup-pending", otpLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email required" });
      }
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user || user.isEmailVerified) {
        return res.status(404).json({ message: "No pending verification found for this email." });
      }
      return res.json({ userId: user.id, email: user.email });
    } catch {
      res.status(500).json({ message: "Lookup failed" });
    }
  });

  // ── POST /api/auth/resend-email-otp ────────────────────────────────────
  app.post("/api/auth/resend-email-otp", otpLimiter, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "User ID required" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

      const lastSent = user.lastOtpSentAt ? new Date(user.lastOtpSentAt).getTime() : 0;
      if (Date.now() - lastSent < OTP_COOLDOWN) {
        return res.status(429).json({ message: "Please wait 60s before resending" });
      }

      const otp = generateOtp();
      await storage.updateUserOtp(userId, {
        emailOtpHash: hashOtp(otp),
        emailOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        otpAttempts: 0,
        lastOtpSentAt: new Date(),
      });

      if (resend) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: user.email,
          subject: "Your GoldenLife verification code",
          text: `Your new verification code is: ${otp}. It expires in 5 minutes.`,
        });
      }

      res.json({ message: "OTP sent successfully" });
    } catch {
      res.status(500).json({ message: "Failed to resend OTP" });
    }
  });

  // ── POST /api/auth/reset-password ──────────────────────────────────────
  app.post("/api/auth/reset-password", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(400).json({ message: "Incorrect current password" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });
      res.json({ message: "Password updated successfully" });
    } catch {
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // ── POST /api/auth/forgot-password ─────────────────────────────────────
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const user = await storage.getUserByEmail(email);

      if (!user) {
        return res.json({ message: "If an account exists with this email, you will receive a reset link." });
      }

      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const resetHash = hashOtp(resetCode);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await storage.updateUserOtp(user.id, {
        emailOtpHash: resetHash,
        emailOtpExpiresAt: expiresAt,
        otpAttempts: 0,
        lastOtpSentAt: new Date(),
      });

      if (resend) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Reset your GoldenLife password",
            text: `You requested a password reset. Use this code to reset your password: ${resetCode}. This code expires in 15 minutes.`,
          });
        } catch (emailError) {
          console.error("Failed to send reset email:", emailError);
        }
      } else {
        // RESEND_API_KEY not configured — log a non-PII warning only (never log the code or email)
        console.warn("[auth] RESEND_API_KEY not set — password reset code not delivered via email");
      }

      res.json({ message: "If an account exists with this email, you will receive a reset link." });
    } catch {
      res.status(500).json({ message: "Failed to process forgot password request" });
    }
  });

  // ── POST /api/auth/complete-reset-password ──────────────────────────────
  app.post("/api/auth/complete-reset-password", async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!user.emailOtpExpiresAt || new Date(user.emailOtpExpiresAt) < new Date()) {
        return res.status(400).json({ message: "Reset code expired" });
      }
      if (user.otpAttempts >= 5) {
        return res.status(400).json({ message: "Too many attempts. Please request a new code." });
      }

      if (user.emailOtpHash !== hashOtp(code)) {
        await storage.updateUserOtp(user.id, {
          emailOtpHash: user.emailOtpHash,
          emailOtpExpiresAt: user.emailOtpExpiresAt,
          otpAttempts: user.otpAttempts + 1,
        });
        return res.status(400).json({ message: "Invalid reset code" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, {
        password: hashedPassword,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        otpAttempts: 0,
      });

      res.json({ message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
      console.error("Complete password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ── PATCH /api/auth/profile ─────────────────────────────────────────────
  app.patch("/api/auth/profile", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const allowedFields = [
        "firstName", "lastName", "phone", "mobileNumber",
        "address", "city", "state", "zipCode",
        "placeId", "formattedAddress", "savedLatitude", "savedLongitude",
        "avatarUrl", "gallery",
        "gender", "dateOfBirth", "preferredPronouns", "occupation", "maritalStatus",
        "socialNumber",
        "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation",
        "bloodGroup", "heightCm", "weightKg",
        "knownAllergies", "medicalConditions", "currentMedications", "pastSurgeries",
        "insuranceProvider", "insurancePolicyNumber", "primaryCarePhysician",
        "languagePreference",
        "preferredCurrency",
        "timezone",
        "countryCode",
      ] as const;

      if (req.body.countryCode !== undefined) {
        if (isAdminRole(req.user!.role)) {
          return res.status(403).json({ message: "Admins cannot change their own country" });
        }
        if (!isCountryCode(req.body.countryCode)) {
          return res.status(400).json({ message: "Invalid country" });
        }
        const currentUser = await storage.getUser(req.user!.id);
        const currentCountry = (currentUser as any)?.countryCode as CountryCode | undefined;
        if (currentCountry && req.body.countryCode !== currentCountry) {
          const [appts, invs, prov] = await Promise.all([
            storage.getAppointmentsByPatient(req.user!.id).catch(() => []),
            storage.getInvoicesByPatient(req.user!.id).catch(() => []),
            storage.getProviderByUserId(req.user!.id).catch(() => undefined),
          ]);
          if ((appts && appts.length > 0) || (invs && invs.length > 0) || prov) {
            return res.status(409).json({
              message:
                "Your country cannot be changed because your account already has appointments, invoices, or a provider profile. Please contact support.",
              code: "COUNTRY_CHANGE_BLOCKED",
            });
          }
        }
      }

      const updateData: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      if (typeof updateData.dateOfBirth === "string" && updateData.dateOfBirth) {
        updateData.dateOfBirth = new Date(updateData.dateOfBirth);
      } else if (updateData.dateOfBirth === "") {
        updateData.dateOfBirth = null;
      }
      if (updateData.heightCm !== undefined && updateData.heightCm !== null && updateData.heightCm !== "") {
        const n = Number(updateData.heightCm);
        updateData.heightCm = Number.isFinite(n) ? Math.round(n) : null;
      } else if (updateData.heightCm === "") {
        updateData.heightCm = null;
      }
      if (updateData.weightKg === "") updateData.weightKg = null;

      const ALLOWED_CURRENCIES = ["USD", "HUF", "IRR", "GBP", "EUR"] as const;
      if (
        updateData.preferredCurrency !== undefined &&
        updateData.preferredCurrency !== null &&
        updateData.preferredCurrency !== "" &&
        !ALLOWED_CURRENCIES.includes(updateData.preferredCurrency)
      ) {
        return res.status(400).json({
          message: `Invalid currency "${updateData.preferredCurrency}". Allowed values: ${ALLOWED_CURRENCIES.join(", ")}`,
          allowedValues: ALLOWED_CURRENCIES,
        });
      }
      // Normalise empty string → null (no preference set)
      if (updateData.preferredCurrency === "") updateData.preferredCurrency = null;

      if (Object.keys(updateData).length === 0) {
        const user = await storage.getUser(req.user!.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        const { password: _, ...userWithoutPassword } = user;
        return res.json({ user: userWithoutPassword });
      }

      const user = await storage.updateUser(req.user!.id, updateData);
      if (!user) return res.status(404).json({ message: "User not found" });

      invalidateAuthCache(req.user!.id);
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ── DEV-ONLY: get token without rate limit (never active in production) ──
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/dev/get-token", async (req: Request, res: Response) => {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "email + password required" });
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) return res.status(404).json({ message: "User not found" });
        const valid = await bcrypt.compare(password, user.password!);
        if (!valid) return res.status(401).json({ message: "Wrong password" });
        if (!user.isEmailVerified) return res.status(403).json({ message: "Email not verified" });
        const accessToken = jwt.sign(
          { id: user.id, email: user.email, role: user.role },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );
        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword, accessToken });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  }

  // ── DEV-ONLY: insert provider document by URL (never active in production) ─
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/dev/insert-document", async (req: Request, res: Response) => {
      const { userId, documentType, documentUrl, fileName } = req.body;
      if (!userId || !documentType || !documentUrl)
        return res.status(400).json({ message: "userId, documentType, documentUrl required" });
      try {
        const prov = await storage.getProviderByUserId(userId);
        if (!prov) return res.status(404).json({ message: "Provider not found for userId" });
        // Upsert: if same type exists, update; otherwise insert
        const { rows: existing } = await pool.query(
          `SELECT id FROM provider_documents WHERE provider_id = $1 AND document_type = $2 LIMIT 1`,
          [prov.id, documentType]
        );
        let doc;
        if (existing.length > 0) {
          const { rows } = await pool.query(
            `UPDATE provider_documents SET document_url=$1, file_name=$2, verification_status='pending', updated_at=NOW()
             WHERE id=$3 RETURNING *`,
            [documentUrl, fileName || null, existing[0].id]
          );
          doc = rows[0];
        } else {
          const { rows } = await pool.query(
            `INSERT INTO provider_documents (id, provider_id, document_type, document_url, file_name,
               verification_status, document_criticality, expiry_required, reminder_days_before, created_at)
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'pending', 'mandatory', true, 30, NOW())
             RETURNING *`,
            [prov.id, documentType, documentUrl, fileName || null]
          );
          doc = rows[0];
        }
        res.json({ ok: true, doc });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  }

  // ── DEV-ONLY: force verify email (never active in production) ────────────
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/dev/force-verify", async (req: Request, res: Response) => {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId required" });
      try {
        const user = await storage.getUser(userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        await storage.verifyUserEmail(userId);
        // Auto-seed provider draft row if needed
        if (user.role === "provider") {
          const existingProv = await storage.getProviderByUserId(userId);
          if (!existingProv) {
            try {
              await storage.createProvider({
                userId,
                status: "draft",
                isVerified: false,
                isActive: true,
                countryCode: user.countryCode || "HU",
              } as any);
            } catch (e) {
              console.warn("[dev/force-verify] provider draft seed:", (e as Error).message);
            }
          }
        }
        invalidateAuthCache(userId);
        res.json({ ok: true, userId, role: user.role });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  }
}
