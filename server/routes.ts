import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { 
  loginSchema, 
  registerSchema, 
  insertProviderSchema, 
  insertAppointmentSchema, 
  insertReviewSchema,
  insertSupportTicketSchema,
  insertSubServiceSchema,
  insertTaxSettingSchema,
  insertPatientConsentSchema,
  insertPractitionerSchema,
  insertServicePractitionerSchema
} from "@shared/schema";
import crypto from 'crypto'; // Import crypto module for randomUUID
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = "GoldenLife <no-reply@goldenlife.health>";

// Helper to hash OTP
const hashOtp = (otp: string) => createHash('sha256').update(otp).digest('hex');

// Helper to generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Rate limiting map (simple in-memory)
const otpRateLimit = new Map<string, number>();
const OTP_COOLDOWN = 60 * 1000; // 60 seconds
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";

const JWT_SECRET = process.env.SESSION_SECRET || "careconnect-jwt-secret-key";
const JWT_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

  // Middleware to verify JWT token
  const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    // Also check cookies
    const cookieToken = req.cookies?.accessToken;
    const finalToken = token || cookieToken;

    if (!finalToken) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const decoded = jwt.verify(finalToken, JWT_SECRET) as { id: string; email: string; role: string };
      
      // Check if user exists and is verified
      const user = await storage.getUser(decoded.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      if (!user.isEmailVerified) {
        return res.status(403).json({ message: "Email verification required" });
      }

      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (provider && !provider.isVerified) {
          // Allow access to setup page but not other provider routes
          if (req.path !== "/api/provider/setup" && !req.path.startsWith("/api/auth")) {
             return res.status(403).json({ message: "Account awaiting admin approval" });
          }
        }
      }

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
  };

// Optional auth - doesn't fail if no token
const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const cookieToken = req.cookies?.accessToken;
  const finalToken = token || cookieToken;

  if (finalToken) {
    try {
      const decoded = jwt.verify(finalToken, JWT_SECRET) as { id: string; email: string; role: string };
      req.user = decoded;
    } catch {
      // Token invalid, but continue without user
    }
  }
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register AI integrations routes
  registerChatRoutes(app);
  registerImageRoutes(app);

  // Cookie parser middleware
  const cookieParser = await import("cookie-parser");
  app.use(cookieParser.default());

  // ============ PATIENT CONSENT ROUTES ============
  app.post("/api/consents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertPatientConsentSchema.parse({
        ...req.body,
        userId: req.user!.id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });
      const consent = await storage.createPatientConsent(data);
      res.status(201).json(consent);
    } catch (error) {
      console.error("Consent submission error:", error);
      res.status(400).json({ message: "Invalid consent data" });
    }
  });

  app.get("/api/consents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const consents = await storage.getPatientConsents(req.user!.id);
      res.json(consents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch consents" });
    }
  });

  app.get("/api/admin/tax-settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const settings = await storage.getAllTaxSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get tax settings" });
    }
  });

  app.post("/api/admin/tax-settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const data = insertTaxSettingSchema.parse(req.body);
      const setting = await storage.createTaxSetting(data);
      res.json(setting);
    } catch (error) {
      res.status(400).json({ message: "Invalid tax setting data" });
    }
  });

  app.patch("/api/admin/tax-settings/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const setting = await storage.updateTaxSetting(req.params.id, req.body);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tax setting" });
    }
  });

  app.delete("/api/admin/tax-settings/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      await storage.deleteTaxSetting(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete tax setting" });
    }
  });

  // Admin User/Provider Management
  app.patch("/api/admin/providers/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const provider = await storage.updateProvider(req.params.id, req.body);
      res.json(provider);
    } catch (error) {
      console.error("Failed to update provider:", error);
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  app.delete("/api/admin/users/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      await storage.deleteUser(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.delete("/api/admin/providers/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      await storage.deleteProvider(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete provider" });
    }
  });

  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, role } = req.body;

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role: role || "patient",
        isEmailVerified: false,
      });

      // Generate OTP
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await storage.updateUserOtp(user.id, {
        emailOtpHash: otpHash,
        emailOtpExpiresAt: expiresAt,
        otpAttempts: 0,
        lastOtpSentAt: new Date(),
      });

      // Send verification email
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
      res.status(201).json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.isSuspended) {
        return res.status(403).json({ 
          message: `Your account has been suspended. Reason: ${user.suspensionReason || "No reason provided"}` 
        });
      }

      if (!user.isEmailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email before logging in",
          isEmailVerified: false,
          userId: user.id 
        });
      }

      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (provider && provider.status !== "active") {
          return res.status(403).json({ 
            message: provider.status === "pending" 
              ? "Your provider profile is awaiting admin approval. Please check back later." 
              : `Your account has been ${provider.status}.`
          });
        }
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const refreshToken = randomBytes(64).toString("hex");
      await storage.createRefreshToken({
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
      });

      // Set cookies
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRES_IN,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accessToken });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        await storage.deleteRefreshToken(refreshToken);
      }

      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Refresh token
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ message: "Refresh token required" });
      }

      const storedToken = await storage.getRefreshToken(refreshToken);
      if (!storedToken || new Date(storedToken.expiresAt) < new Date()) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
      }

      const user = await storage.getUser(storedToken.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Generate new access token
      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.json({ accessToken });
    } catch (error) {
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  // Get current user
  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Verify Email OTP
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { userId, otp } = req.body;
      if (!userId || !otp) return res.status(400).json({ message: "Missing data" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

      // Check expiry and attempts
      if (!user.emailOtpExpiresAt || new Date(user.emailOtpExpiresAt) < new Date()) {
        return res.status(400).json({ message: "OTP expired" });
      }
      if (user.otpAttempts >= 5) {
        return res.status(400).json({ message: "Too many attempts. Please resend." });
      }

      // Verify OTP
      if (user.emailOtpHash !== hashOtp(otp)) {
        await storage.updateUserOtp(userId, {
          emailOtpHash: user.emailOtpHash,
          emailOtpExpiresAt: user.emailOtpExpiresAt,
          otpAttempts: user.otpAttempts + 1
        });
        return res.status(400).json({ message: "Invalid OTP" });
      }

      // Success
      await storage.verifyUserEmail(userId);

      // Send confirmation email
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

      // Clear OTP cooldown/attempts on success
      otpRateLimit.delete(user.email);

      res.json({ message: "Email verified successfully" });
    } catch (error) {
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Resend Email OTP
  app.post("/api/auth/resend-email-otp", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "User ID required" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

      // Rate limit check
      const lastSent = user.lastOtpSentAt ? new Date(user.lastOtpSentAt).getTime() : 0;
      if (Date.now() - lastSent < OTP_COOLDOWN) {
        return res.status(429).json({ message: "Please wait 60s before resending" });
      }

      const otp = generateOtp();
      await storage.updateUserOtp(userId, {
        emailOtpHash: hashOtp(otp),
        emailOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        otpAttempts: 0,
        lastOtpSentAt: new Date()
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
    } catch (error) {
      res.status(500).json({ message: "Failed to resend OTP" });
    }
  });

  // Reset password (authenticated - change password)
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
    } catch (error) {
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Forgot password
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.json({ message: "If an account exists with this email, you will receive a reset link." });
      }

      // Generate a secure 6-digit code for reset
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
        console.log(`Password reset code for ${user.email}: ${resetCode}`);
      }

      res.json({ message: "If an account exists with this email, you will receive a reset link." });
    } catch (error) {
      res.status(500).json({ message: "Failed to process forgot password request" });
    }
  });

  // Complete Password Reset (Verify Code & New Password)
  app.post("/api/auth/complete-reset-password", async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check expiry and attempts
      if (!user.emailOtpExpiresAt || new Date(user.emailOtpExpiresAt) < new Date()) {
        return res.status(400).json({ message: "Reset code expired" });
      }
      if (user.otpAttempts >= 5) {
        return res.status(400).json({ message: "Too many attempts. Please request a new code." });
      }

      // Verify Code
      if (user.emailOtpHash !== hashOtp(code)) {
        await storage.updateUserOtp(user.id, {
          emailOtpHash: user.emailOtpHash,
          emailOtpExpiresAt: user.emailOtpExpiresAt,
          otpAttempts: user.otpAttempts + 1
        });
        return res.status(400).json({ message: "Invalid reset code" });
      }

      // Success - Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { 
        password: hashedPassword,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        otpAttempts: 0
      });

      res.json({ message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
      console.error("Complete password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Sub-services management
  app.get("/api/admin/sub-services", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const subServices = await storage.getAllSubServices();
    res.json(subServices);
  });

  app.post("/api/admin/sub-services", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const data = insertSubServiceSchema.parse(req.body);
      const subService = await storage.createSubService(data);
      res.json(subService);
    } catch (error) {
      res.status(400).json({ message: "Invalid sub-service data" });
    }
  });

  app.patch("/api/admin/sub-services/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const subService = await storage.updateSubService(req.params.id, req.body);
    res.json(subService);
  });

  app.delete("/api/admin/sub-services/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    await storage.deleteSubService(req.params.id);
    res.status(204).end();
  });

  // Practitioners
  app.get("/api/providers/:providerId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getPractitionersByProvider(req.params.providerId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.post("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const practitioner = await storage.createPractitioner({
        ...req.body,
        providerId: req.params.providerId
      });
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.get("/api/providers/:providerId/services/:serviceId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.post("/api/admin/services/:serviceId/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const sp = await storage.addPractitionerToService({
        ...req.body,
        serviceId: req.params.serviceId
      });
      res.status(201).json(sp);
    } catch (error) {
      res.status(400).json({ message: "Failed to add practitioner to service" });
    }
  });

  // Booking
  app.post("/api/booking", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const appointment = await storage.createAppointment({
        ...req.body,
        patientId: req.user!.id,
        status: "pending"
      });
      res.status(201).json(appointment);
    } catch (error) {
      res.status(400).json({ message: "Booking failed" });
    }
  });
  app.get("/api/providers/:id/with-fees", async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderWithServices(req.params.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      
      const subServices = await storage.getAllSubServices();
      const enrichedServices = provider.services.map(service => {
        const providerType = (provider as any).providerType;
        const matched = subServices.find(ss => ss.name === service.name && ss.category === providerType);
        return {
          ...service,
          platformFee: matched ? matched.platformFee : "0.00"
        };
      });

      res.json({
        ...provider,
        services: enrichedServices
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider details" });
    }
  });

  // Get patient appointments
  app.get("/api/appointments/patient", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      
      // Check for reviews for each appointment
      const appointmentsWithReviewStatus = await Promise.all(appointments.map(async (apt) => {
        const review = await storage.getReviewByAppointment(apt.id);
        return { ...apt, hasReview: !!review };
      }));
      
      res.json(appointmentsWithReviewStatus);
    } catch (error) {
      console.error("Get patient appointments error:", error);
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Create a review
  app.post("/api/reviews", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { appointmentId, providerId, rating, comment } = req.body;
      
      // Validate appointment ownership and status
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || appointment.patientId !== req.user!.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      if (appointment.status !== "completed") {
        return res.status(400).json({ message: "Can only review completed appointments" });
      }

      // Check if already reviewed
      const existingReview = await storage.getReviewByAppointment(appointmentId);
      if (existingReview) {
        return res.status(400).json({ message: "Review already exists for this appointment" });
      }

      const review = await storage.createReview({
        appointmentId,
        patientId: req.user!.id,
        providerId,
        rating,
        comment,
      });

      res.status(201).json(review);
    } catch (error) {
      console.error("Create review error:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // Get provider appointments
  app.get("/api/appointments/provider", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const appointments = await storage.getAppointmentsByProvider(provider.id);
      res.json(appointments);
    } catch (error) {
      console.error("Get provider appointments error:", error);
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  app.patch("/api/auth/profile", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { firstName, lastName, phone, address, avatarUrl, bloodGroup, knownAllergies, medicalConditions, currentMedications, pastSurgeries } = req.body;
      
      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup;
      if (knownAllergies !== undefined) updateData.knownAllergies = knownAllergies;
      if (medicalConditions !== undefined) updateData.medicalConditions = medicalConditions;
      if (currentMedications !== undefined) updateData.currentMedications = currentMedications;
      if (pastSurgeries !== undefined) updateData.pastSurgeries = pastSurgeries;

      if (Object.keys(updateData).length === 0) {
        const user = await storage.getUser(req.user!.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        const { password: _, ...userWithoutPassword } = user;
        return res.json({ user: userWithoutPassword });
      }

      const user = await storage.updateUser(req.user!.id, updateData);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Simple base64 image upload (mock/internal storage)
  app.post("/api/upload", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { image } = req.body; // Expecting base64
      if (!image) return res.status(400).json({ message: "No image provided" });
      
      res.json({ url: image });
    } catch (error) {
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // ============ REAL-TIME CHAT ROUTES ============
  app.get("/api/chat/conversations", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const convs = await storage.getRealtimeConversations(req.user!.id);
      res.json(convs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });

  app.get("/api/chat/messages/:conversationId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const msgs = await storage.getRealtimeMessages(req.params.conversationId);
      res.json(msgs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.post("/api/chat/conversations", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { participantId } = req.body;
      const conv = await storage.getOrCreateConversation(req.user!.id, participantId);
      res.json(conv);
    } catch (error) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Get all providers
  app.get("/api/providers", async (req: Request, res: Response) => {
    try {
      const providers = await storage.getAllProviders();
      res.json(providers);
    } catch (error) {
      console.error("Get providers error:", error);
      res.status(500).json({ message: "Failed to get providers" });
    }
  });

  // Get provider by ID
  app.get("/api/providers/:id", async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderWithServices(req.params.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      res.json(provider);
    } catch (error) {
      console.error("Get provider error:", error);
      res.status(500).json({ message: "Failed to get provider" });
    }
  });

  // Get provider reviews
  app.get("/api/providers/:id/reviews", async (req: Request, res: Response) => {
    try {
      const reviews = await storage.getReviewsByProvider(req.params.id);
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to get reviews" });
    }
  });

  // Create support ticket
  app.post("/api/support/tickets", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = insertSupportTicketSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid ticket data", errors: result.error.errors });
      }

      const ticket = await storage.createSupportTicket({
        ...result.data,
        userId: req.user?.id || null,
        status: "open",
      });
      res.status(201).json(ticket);
    } catch (error) {
      console.error("Create ticket error:", error);
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // Update user suspension status
  app.patch("/api/admin/users/:id/suspend", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { isSuspended, suspensionReason } = req.body;
      const user = await storage.updateUser(req.params.id, {
        isSuspended,
        suspensionReason: isSuspended ? suspensionReason : null
      });
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // Get all users (Admin)
  app.get("/api/admin/users", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  // Get current provider (for logged in provider)
  app.get("/api/provider/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider" });
    }
  });

  app.patch("/api/services/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const service = await storage.updateService(req.params.id, req.body);
      res.json(service);
    } catch (error) {
      res.status(400).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/services/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete service" });
    }
  });

  app.patch("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const practitioner = await storage.updatePractitioner(req.params.id, req.body);
      res.json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Failed to update practitioner" });
    }
  });

  app.delete("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deletePractitioner(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete practitioner" });
    }
  });

  app.patch("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const updates: any = {};
      if (req.body.fee !== undefined) updates.fee = req.body.fee;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      
      const sp = await storage.updateServicePractitionerFee(req.params.id, updates.fee);
      
      if (updates.isActive !== undefined) {
        await db.update(servicePractitioners).set({ isActive: updates.isActive }).where(eq(servicePractitioners.id, req.params.id));
      }
      
      res.json(sp);
    } catch (error) {
      res.status(400).json({ message: "Failed to update assignment" });
    }
  });

  app.delete("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.removePractitionerFromService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to remove assignment" });
    }
  });

  // Notifications
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const notifications = await storage.getUserNotifications(req.user!.id);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Setup provider profile
  app.post("/api/provider/setup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { practitioners, ...providerData } = req.body;
      const userId = req.user!.id;

      const existingProvider = await storage.getProviderByUserId(userId);
      if (existingProvider) {
        return res.status(400).json({ message: "Provider profile already exists" });
      }

      // Explicitly format date for database
      if (providerData.licenseExpiryDate) {
        providerData.licenseExpiryDate = new Date(providerData.licenseExpiryDate).toISOString();
      }

      // Create provider profile
      const provider = await storage.createProvider({
        ...providerData,
        userId,
        status: "pending",
        isVerified: false,
        isActive: true,
      });

      // Update user role to provider
      await storage.updateUser(userId, { role: "provider" });

      // Create practitioners if provided
      if (practitioners && Array.isArray(practitioners)) {
        for (const p of practitioners) {
          await storage.createMedicalPractitioner({
            ...p,
            providerId: provider.id,
          });
        }
      }

      res.status(201).json(provider);
    } catch (error: any) {
      console.error("Provider setup error:", error);
      res.status(500).json({ message: error.message || "Failed to setup provider profile" });
    }
  });

  // Get platform settings
  app.get("/api/admin/settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const settings = await storage.getAllPlatformSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get platform settings" });
    }
  });

  // Get provider with booking statistics for admin
  app.get("/api/admin/providers/:id/stats", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const providerId = req.params.id;
      const appointments = await storage.getAppointmentsByProvider(providerId);
      
      const stats = {
        total: appointments.length,
        pending: appointments.filter(a => a.status === "pending").length,
        confirmed: appointments.filter(a => a.status === "confirmed").length,
        completed: appointments.filter(a => a.status === "completed").length,
        cancelled: appointments.filter(a => a.status === "cancelled").length,
        bookings: appointments.map(a => ({
          id: a.id,
          date: a.date,
          startTime: a.startTime,
          status: a.status,
          patientName: `${a.patient.firstName} ${a.patient.lastName}`,
          amount: a.totalAmount
        }))
      };
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider statistics" });
    }
  });

  // Update provider detail (including dates and status)
  app.patch("/api/admin/providers/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const provider = await storage.updateProvider(req.params.id, req.body);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  // Update platform settings
  app.post("/api/admin/settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { key, value } = req.body;
      if (key === undefined || value === undefined) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      const setting = await storage.updatePlatformSetting(key, String(value));
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Failed to update platform setting" });
    }
  });

  // ============ PROVIDER SERVICES & PRACTITIONERS ============
  app.get("/api/providers/:providerId/services", async (req, res) => {
    try {
      const providerServices = await storage.getServicesByProvider(req.params.providerId);
      res.json(providerServices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/providers/:providerId/practitioners", async (req, res) => {
    try {
      const providerPractitioners = await storage.getPractitionersByProvider(req.params.providerId);
      res.json(providerPractitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.get("/api/services/:serviceId/practitioners", async (req, res) => {
    try {
      const servicePractitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(servicePractitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.post("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider || provider.id !== req.params.providerId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      const data = insertPractitionerSchema.parse({ ...req.body, providerId: provider.id });
      const practitioner = await storage.createPractitioner(data);
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.post("/api/services/:serviceId/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const service = await storage.getService(req.params.serviceId);
      if (!service) return res.status(404).json({ message: "Service not found" });
      
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider || provider.id !== service.providerId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const data = insertServicePractitionerSchema.parse(req.body);
      const result = await storage.addPractitionerToService(data);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: "Invalid assignment data" });
    }
  });

  // Services & Practitioners
  app.get("/api/providers/:providerId/services", async (req, res) => {
    try {
      const services = await storage.getServicesByProvider(req.params.providerId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/services/:serviceId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.post("/api/services", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const data = insertServiceSchema.parse({ ...req.body, providerId: provider.id });
      const service = await storage.createService(data);
      res.status(201).json(service);
    } catch (error) {
      res.status(400).json({ message: "Invalid service data" });
    }
  });

  app.post("/api/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const data = insertPractitionerSchema.parse({ ...req.body, providerId: provider.id });
      const practitioner = await storage.createPractitioner(data);
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.post("/api/service-practitioners", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const data = insertServicePractitionerSchema.parse(req.body);
      const sp = await storage.addPractitionerToService(data);
      res.status(201).json(sp);
    } catch (error) {
      res.status(400).json({ message: "Invalid service practitioner data" });
    }
  });

  // Create appointment
  app.post("/api/appointments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { providerId, serviceId, practitionerId, date, startTime, endTime, visitType, paymentMethod, notes, patientAddress, totalAmount } = req.body;
      const userId = req.user?.id;

      // Log appointment request for debugging but keep it concise to avoid large base64 strings
      console.log(`Received appointment request for provider ${providerId} on ${date}`);

      if (!userId) {
        console.log("Booking failed: User not authenticated");
        return res.status(401).json({ message: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.isEmailVerified) {
        console.log("Booking failed: Email not verified for user", userId);
        return res.status(403).json({ message: "Email verification required to book" });
      }

      // Get provider to calculate fee if not provided
      const provider = await storage.getProvider(providerId);
      if (!provider) {
        console.log("Booking failed: Provider not found", providerId);
        return res.status(404).json({ message: "Provider not found" });
      }

      // Validate practitioner and fee if provided
      let fee = totalAmount;
      if (serviceId && practitionerId) {
        const servicePractitioners = await storage.getServicePractitioners(serviceId);
        const sp = servicePractitioners.find(p => p.practitionerId === practitionerId);
        if (!sp) {
          return res.status(400).json({ message: "Practitioner not assigned to this service" });
        }
        fee = sp.fee;
      } else if (!totalAmount) {
        fee = visitType === "home" && provider.homeVisitFee
          ? provider.homeVisitFee
          : provider.consultationFee;
      }

      // Create appointment
      console.log("Creating appointment with data:", {
        patientId: userId,
        providerId,
        serviceId,
        practitionerId,
        date,
        startTime,
        endTime,
        visitType,
        totalAmount: fee.toString()
      });

      const appointment = await storage.createAppointment({
        patientId: userId,
        providerId,
        serviceId: serviceId || null,
        practitionerId: practitionerId || null,
        date,
        startTime,
        endTime,
        visitType: visitType || "online",
        status: "pending",
        notes: notes || null,
        patientAddress: patientAddress || null,
        totalAmount: fee.toString(),
      });

      console.log("Appointment created:", appointment.id);

      // Create payment record with payment method
      const payment = await storage.createPayment({
        appointmentId: appointment.id,
        patientId: userId,
        amount: fee.toString(),
        paymentMethod: paymentMethod || "card",
        status: "pending",
      });

      console.log("Payment record created:", payment.id);

      // Create notifications for both patient and provider
      try {
        const providerWithUser = await storage.getProviderWithUser(providerId);
        
        // Notification for Patient
        await storage.createUserNotification({
          userId: userId,
          type: "appointment",
          title: "Booking Confirmed",
          message: `Your appointment with ${providerWithUser?.user.firstName} ${providerWithUser?.user.lastName} has been successfully booked for ${date} at ${startTime}.`,
          isRead: false,
        });

        // Notification for Provider
        await storage.createUserNotification({
          userId: providerWithUser!.userId,
          type: "appointment",
          title: "New Booking Received",
          message: `You have a new booking from ${user.firstName} ${user.lastName} for ${date} at ${startTime}.`,
          isRead: false,
        });
      } catch (notifyError) {
        console.error("Failed to create booking notifications:", notifyError);
      }

      // Send booking confirmation email
      if (resend) {
        try {
          const providerWithUser = await storage.getProviderWithUser(providerId);
          const service = serviceId ? await storage.getService(serviceId) : null;
          
          console.log(`Attempting to send booking confirmation to ${user.email}`);
          
          const emailResult = await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Booking Confirmation - GoldenLife",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a;">Booking Confirmed!</h2>
                <p>Hello ${user.firstName},</p>
                <p>Your appointment with <strong>${providerWithUser?.user.firstName} ${providerWithUser?.user.lastName}</strong> has been successfully booked.</p>
                
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #1e293b;">Appointment Details</h3>
                  <p style="margin: 5px 0;"><strong>Date:</strong> ${date}</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
                  ${service ? `<p style="margin: 5px 0;"><strong>Service:</strong> ${service.name}</p>` : ''}
                  <p style="margin: 5px 0;"><strong>Visit Type:</strong> ${visitType === 'home' ? 'Home Visit' : 'Online Consultation'}</p>
                  <p style="margin: 5px 0;"><strong>Total Amount:</strong> $${fee}</p>
                </div>

                <p>You can view and manage your appointment in your patient dashboard.</p>
                <p style="color: #64748b; font-size: 0.875rem; margin-top: 30px;">
                  Thank you for choosing GoldenLife.<br>
                  <em>This is an automated message, please do not reply.</em>
                </p>
              </div>
            `,
          });
          console.log("Email send result:", emailResult);
        } catch (emailError) {
          console.error("Failed to send booking confirmation email:", emailError);
        }
      }

      res.status(201).json(appointment);
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  app.get("/api/appointments/patient", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Get provider appointments
  app.get("/api/appointments/provider", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }

      const appointments = await storage.getAppointmentsByProvider(provider.id);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Update appointment status
  app.patch("/api/appointments/:id/status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body;
      const appointment = await storage.updateAppointment(req.params.id, { status });
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Create notification for patient about status change
      try {
        const patientId = appointment.patientId;
        const statusMessages: Record<string, string> = {
          confirmed: "Your appointment has been confirmed by the provider.",
          cancelled: "Your appointment has been cancelled.",
          completed: "Your appointment has been marked as completed. Please leave a review!",
          rescheduled: "Your appointment has been rescheduled."
        };

        if (statusMessages[status]) {
          await storage.createUserNotification({
            userId: patientId,
            type: "appointment",
            title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            message: statusMessages[status],
            isRead: false,
          });
        }
      } catch (notifyError) {
        console.error("Failed to create status update notification:", notifyError);
      }

      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update appointment status" });
    }
  });

  // Auto-cancel past appointments
  // ============ MEDICAL RECORDS ROUTES ============

  // Get prescriptions for a patient
  app.get("/api/prescriptions/patient/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const prescriptions = await storage.getPrescriptionsByPatient(req.params.id);
      res.json(prescriptions);
    } catch (error) {
      console.error("Get prescriptions error:", error);
      res.status(500).json({ message: "Failed to get prescriptions" });
    }
  });

  // Get medical history for a patient
  app.get("/api/medical-history/patient/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const history = await storage.getMedicalHistoryByPatient(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Get medical history error:", error);
      res.status(500).json({ message: "Failed to get medical history" });
    }
  });

  app.post("/api/appointments/cleanup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      const now = new Date();
      
      for (const apt of appointments) {
        const aptDate = new Date(apt.date);
        const [hours, minutes] = apt.startTime.split(':');
        aptDate.setHours(parseInt(hours), parseInt(minutes));
        
        if (aptDate < now && apt.status === 'pending') {
          await storage.updateAppointment(apt.id, { status: 'cancelled' });
        }
      }
      res.json({ message: "Past appointments cleaned up" });
    } catch (error) {
      res.status(500).json({ message: "Failed to cleanup appointments" });
    }
  });

  // Cancel appointment
  app.patch("/api/appointments/:id/cancel", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointment = await storage.updateAppointment(req.params.id, { status: "cancelled" });
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel appointment" });
    }
  });

  // ============ REVIEW ROUTES ============

  // Create review
  app.post("/api/reviews", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { appointmentId, providerId, rating, comment } = req.body;

      const review = await storage.createReview({
        appointmentId,
        patientId: req.user!.id,
        providerId,
        rating,
        comment,
      });

      res.status(201).json(review);
    } catch (error) {
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // ============ ADMIN ROUTES ============

  // Middleware to check admin role
  const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  app.post("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, ...providerData } = req.body;
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user first
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone: phone || "",
        role: "provider",
        isEmailVerified: true,
      });

      // Then create provider profile
      const provider = await storage.createProvider({
        ...providerData,
        userId: user.id,
        consultationFee: providerData.consultationFee.toString(),
        homeVisitFee: providerData.homeVisitFee ? providerData.homeVisitFee.toString() : null,
        isVerified: true,
        isActive: true,
      });

      res.status(201).json(provider);
    } catch (error: any) {
      console.error("Admin provider creation error:", error);
      res.status(500).json({ message: error.message || "Failed to create provider" });
    }
  });

  // FAQs
  app.get("/api/admin/faqs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const faqs = await storage.getAllFaqs();
      res.json(faqs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get FAQs" });
    }
  });

  app.post("/api/admin/faqs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const faq = await storage.createFaq(req.body);
      res.status(201).json(faq);
    } catch (error) {
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  app.delete("/api/admin/faqs/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteFaq(req.params.id);
      res.json({ message: "FAQ deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete FAQ" });
    }
  });

  // Announcements
  app.get("/api/admin/announcements", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const announcements = await storage.getAllAnnouncements();
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ message: "Failed to get announcements" });
    }
  });

  app.post("/api/admin/announcements", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const announcement = await storage.createAnnouncement(req.body);
      res.status(201).json(announcement);
    } catch (error) {
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.delete("/api/admin/announcements/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteAnnouncement(req.params.id);
      res.json({ message: "Announcement deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  // Support Tickets
  app.get("/api/admin/support-tickets", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tickets = await storage.getAllSupportTickets();
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ message: "Failed to get support tickets" });
    }
  });

  app.get("/api/admin/support-tickets/:id/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const messages = await storage.getTicketMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get ticket messages" });
    }
  });

  app.patch("/api/admin/support-tickets/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await storage.updateSupportTicket(req.params.id, req.body);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      res.json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  app.post("/api/admin/support-tickets/:id/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const message = await storage.createTicketMessage({
        ticketId: req.params.id,
        userId: req.user!.id,
        message: req.body.message,
        isInternal: true,
      });
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Analytics
  app.get("/api/admin/analytics", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await storage.getAnalyticsStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // Bookings/Appointments
  app.get("/api/admin/bookings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAllAppointments();
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get bookings" });
    }
  });

  app.patch("/api/admin/bookings/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const appointment = await storage.updateAppointment(req.params.id, req.body);
      if (!appointment) return res.status(404).json({ message: "Booking not found" });
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  // Audit Logs
  app.get("/api/admin/audit-logs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const logs = await storage.getAllAuditLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // Users
  app.get("/api/admin/users", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  // Pricing Overrides
  app.get("/api/admin/pricing-overrides", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const overrides = await storage.getAllPricingOverrides();
      res.json(overrides);
    } catch (error) {
      res.status(500).json({ message: "Failed to get pricing overrides" });
    }
  });

  app.post("/api/admin/pricing-overrides", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const override = await storage.createProviderPricingOverride(req.body);
      res.status(201).json(override);
    } catch (error) {
      res.status(500).json({ message: "Failed to create pricing override" });
    }
  });

  app.patch("/api/admin/pricing-overrides/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const override = await storage.updateProviderPricingOverride(req.params.id, req.body);
      if (!override) return res.status(404).json({ message: "Override not found" });
      res.json(override);
    } catch (error) {
      res.status(500).json({ message: "Failed to update pricing override" });
    }
  });

  app.delete("/api/admin/pricing-overrides/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteProviderPricingOverride(req.params.id);
      res.json({ message: "Override deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete pricing override" });
    }
  });

  // Promo Codes
  app.get("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const codes = await storage.getAllPromoCodes();
      res.json(codes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get promo codes" });
    }
  });

  app.post("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const code = await storage.createPromoCode(req.body);
      res.status(201).json(code);
    } catch (error) {
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  app.patch("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const code = await storage.updatePromoCode(req.params.id, req.body);
      if (!code) return res.status(404).json({ message: "Promo code not found" });
      res.json(code);
    } catch (error) {
      res.status(500).json({ message: "Failed to update promo code" });
    }
  });

  app.delete("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deletePromoCode(req.params.id);
      res.json({ message: "Promo code deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete promo code" });
    }
  });

  // Providers Management
  app.get("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const providers = await storage.getAllProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get providers" });
    }
  });

  app.patch("/api/admin/providers/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.updateProvider(req.params.id, req.body);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  app.get("/api/admin/providers/:id/services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const services = await storage.getServicesByProvider(req.params.id);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider services" });
    }
  });

  app.post("/api/admin/providers/:id/services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const service = await storage.createService({
        ...req.body,
        providerId: req.params.id
      });
      res.status(201).json(service);
    } catch (error) {
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  app.patch("/api/admin/services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const service = await storage.updateService(req.params.id, req.body);
      if (!service) return res.status(404).json({ message: "Service not found" });
      res.json(service);
    } catch (error) {
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/admin/services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  app.get("/api/admin/providers/:id/revenue", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByProvider(req.params.id);
      const totalRevenue = appointments
        .filter(a => a.status === 'completed')
        .reduce((sum, a) => sum + parseFloat(a.totalAmount), 0);
      res.json({ totalRevenue: totalRevenue.toFixed(2) });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate revenue" });
    }
  });

  // Practitioners management
  app.get("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioners = await storage.getPractitionersByProvider(req.params.providerId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.post("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertPractitionerSchema.parse({
        ...req.body,
        providerId: req.params.providerId
      });
      const practitioner = await storage.createPractitioner(data);
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.patch("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioner = await storage.updatePractitioner(req.params.id, req.body);
      res.json(practitioner);
    } catch (error) {
      res.status(500).json({ message: "Failed to update practitioner" });
    }
  });

  app.delete("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deletePractitioner(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete practitioner" });
    }
  });

  // Service Practitioners management
  app.get("/api/services/:serviceId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.post("/api/services/:serviceId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertServicePractitionerSchema.parse({
        ...req.body,
        serviceId: req.params.serviceId
      });
      const result = await storage.addPractitionerToService(data);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: "Invalid service practitioner data" });
    }
  });

  app.patch("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await storage.updateServicePractitionerFee(req.params.id, req.body.fee);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to update service practitioner fee" });
    }
  });

  app.delete("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.removePractitionerFromService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove practitioner from service" });
    }
  });

  // Default return
  return httpServer;
}
