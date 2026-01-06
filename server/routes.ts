import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { loginSchema, registerSchema, insertProviderSchema, insertAppointmentSchema, insertReviewSchema } from "@shared/schema";
import crypto from 'crypto'; // Import crypto module for randomUUID
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
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

  // ============ AUTH ROUTES ============

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
      res.status(201).json({ user: userWithoutPassword, accessToken });
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

      if (!user.isEmailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email before logging in",
          isEmailVerified: false,
          userId: user.id 
        });
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
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: user.email,
          subject: "Your email is verified 🎉",
          text: "Congratulations! Your GoldenLife account is now fully verified.",
        });
      } catch (e) { console.error("Verify confirmation email error", e); }

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

      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: "Your GoldenLife verification code",
        text: `Your new verification code is: ${otp}. It expires in 5 minutes.`,
      });

      res.json({ message: "OTP sent successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to resend OTP" });
    }
  });

  // Update user profile
  app.patch("/api/auth/profile", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { firstName, lastName, phone, address } = req.body;
      
      const user = await storage.updateUser(req.user!.id, {
        firstName,
        lastName,
        phone,
        address,
      });

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

  // ============ PROVIDER ROUTES ============

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

  // Setup provider profile
  app.post("/api/provider/setup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { type, specialization, bio, yearsExperience, education, consultationFee, homeVisitFee, city, languages, availableDays } = req.body;

      // Update user city
      await storage.updateUser(req.user!.id, { city });

      // Create provider profile
      const provider = await storage.createProvider({
        userId: req.user!.id,
        type,
        specialization,
        bio,
        yearsExperience,
        education,
        consultationFee: consultationFee.toString(),
        homeVisitFee: homeVisitFee ? homeVisitFee.toString() : null,
        languages,
        availableDays,
        isVerified: false,
        isActive: true,
      });

      // Update user role to provider if not already
      await storage.updateUser(req.user!.id, { role: "provider" });

      res.status(201).json(provider);
    } catch (error) {
      console.error("Provider setup error:", error);
      res.status(500).json({ message: "Failed to setup provider profile" });
    }
  });

  // ============ APPOINTMENT ROUTES ============

  // Create appointment
  app.post("/api/appointments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { providerId, serviceId, date, startTime, endTime, visitType, paymentMethod, notes, patientAddress, totalAmount } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.isEmailVerified) {
        return res.status(403).json({ message: "Email verification required to book" });
      }

      // Get provider to calculate fee if not provided
      const provider = await storage.getProvider(providerId);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }

      const fee = totalAmount || (visitType === "home" && provider.homeVisitFee
        ? provider.homeVisitFee
        : provider.consultationFee);

      // Create appointment
      const appointment = await storage.createAppointment({
        patientId: userId,
        providerId,
        serviceId: serviceId || null,
        date,
        startTime,
        endTime,
        visitType: visitType || "online",
        status: "pending",
        notes: notes || null,
        patientAddress: patientAddress || null,
        totalAmount: fee.toString(),
      });

      // Create payment record with payment method
      await storage.createPayment({
        appointmentId: appointment.id,
        patientId: userId,
        amount: fee.toString(),
        paymentMethod: paymentMethod || "card",
        status: paymentMethod === "cash" ? "pending" : "pending",
      });

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
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update appointment" });
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

  // Admin: Create provider directly
  app.post("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const {
        email, password, firstName, lastName, phone, city,
        type, specialization, bio, yearsExperience, education,
        consultationFee, homeVisitFee, languages, availableDays
      } = req.body;

      // Check if user exists
      let user = await storage.getUserByEmail(email);

      if (!user) {
        // Create user account
        const hashedPassword = await bcrypt.hash(password, 10);
        user = await storage.createUser({
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone: phone || "",
          role: "provider",
          city,
        });
      } else {
        // Update existing user to provider role
        await storage.updateUser(user.id, { role: "provider", city });
      }

      // Check if provider profile already exists
      const existingProvider = await storage.getProviderByUserId(user.id);
      if (existingProvider) {
        return res.status(400).json({ message: "Provider profile already exists for this user" });
      }

      // Create provider profile
      const provider = await storage.createProvider({
        userId: user.id,
        type,
        specialization,
        bio,
        yearsExperience,
        education,
        consultationFee: consultationFee.toString(),
        homeVisitFee: homeVisitFee ? homeVisitFee.toString() : null,
        languages,
        availableDays,
        isVerified: true,
        isActive: true,
      });

      res.status(201).json({ provider, user });
    } catch (error) {
      console.error("Admin create provider error:", error);
      res.status(500).json({ message: "Failed to create provider" });
    }
  });

  // Admin: Get all users
  app.get("/api/admin/users", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  // Admin: Promo code management
  app.get("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const promoCodes = await storage.getAllPromoCodes();
      res.json(promoCodes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get promo codes" });
    }
  });

  app.post("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { code, description, discountType, discountValue, maxUses, validFrom, validUntil, applicableProviders, minAmount } = req.body;
      
      const promoCode = await storage.createPromoCode({
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue: discountValue.toString(),
        maxUses: maxUses || null,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
        applicableProviders: applicableProviders || null,
        minAmount: minAmount ? minAmount.toString() : null,
        isActive: true,
      });

      res.status(201).json(promoCode);
    } catch (error) {
      console.error("Create promo code error:", error);
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  app.patch("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const updated = await storage.updatePromoCode(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Promo code not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update promo code" });
    }
  });

  app.delete("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deletePromoCode(req.params.id);
      res.json({ message: "Promo code deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete promo code" });
    }
  });

  // Admin: Provider pricing override management
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
      const { providerId, consultationFee, homeVisitFee, discountPercentage, notes } = req.body;
      
      const override = await storage.createProviderPricingOverride({
        providerId,
        consultationFee: consultationFee ? consultationFee.toString() : null,
        homeVisitFee: homeVisitFee ? homeVisitFee.toString() : null,
        discountPercentage: discountPercentage ? discountPercentage.toString() : null,
        notes: notes || null,
        isActive: true,
      });

      res.status(201).json(override);
    } catch (error) {
      console.error("Create pricing override error:", error);
      res.status(500).json({ message: "Failed to create pricing override" });
    }
  });

  app.patch("/api/admin/pricing-overrides/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const updated = await storage.updateProviderPricingOverride(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Pricing override not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update pricing override" });
    }
  });

  app.delete("/api/admin/pricing-overrides/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteProviderPricingOverride(req.params.id);
      res.json({ message: "Pricing override deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete pricing override" });
    }
  });

  // ============ ADMIN ANALYTICS ============

  // Admin: Get dashboard analytics
  app.get("/api/admin/analytics", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await storage.getAnalyticsStats();
      res.json(stats);
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // User Notifications
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
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Messaging
  app.get("/api/chat/conversations", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const conversations = await storage.getChatConversations(req.user!.id, req.user!.role);
      res.json(conversations);
    } catch (error) {
      console.error("Get conversations error:", error);
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });

  app.get("/api/chat/messages/:conversationId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const messages = await storage.getChatMessages(req.params.conversationId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.post("/api/chat/messages", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { conversationId, content } = req.body;
      const message = await storage.createChatMessage({
        conversationId,
        senderId: req.user!.id,
        content,
        isRead: false
      });
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/admin/bookings", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== "admin") return res.sendStatus(403);
    try {
      const bookings = await storage.getAllAppointments();
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get bookings" });
    }
  });

  // Admin: Update booking
  app.patch("/api/admin/bookings/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { status, date, startTime, endTime, notes } = req.body;
      const booking = await storage.updateAppointment(req.params.id, {
        status,
        date,
        startTime,
        endTime,
        notes,
      });
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entityType: "booking",
        entityId: req.params.id,
        details: JSON.stringify(req.body),
        ipAddress: req.ip || null,
      });

      res.json(booking);
    } catch (error) {
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  // ============ ADMIN USER MANAGEMENT ============

  // Admin: Get single user
  app.get("/api/admin/users/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Admin: Update user
  app.patch("/api/admin/users/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { firstName, lastName, phone, role, city, address } = req.body;
      const user = await storage.updateUser(req.params.id, {
        firstName,
        lastName,
        phone,
        role,
        city,
        address,
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entityType: "user",
        entityId: req.params.id,
        details: JSON.stringify(req.body),
        ipAddress: req.ip || null,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Admin: Delete user
  app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteUser(req.params.id);

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entityType: "user",
        entityId: req.params.id,
        details: null,
        ipAddress: req.ip || null,
      });

      res.json({ message: "User deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // ============ ADMIN PROVIDER MANAGEMENT ============

  // Admin: Get all providers (including inactive)
  app.get("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const providers = await storage.getAllProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get providers" });
    }
  });

  // Admin: Get single provider
  app.get("/api/admin/providers/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderWithServices(req.params.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider" });
    }
  });

  // Admin: Update provider
  app.patch("/api/admin/providers/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { type, specialization, bio, yearsExperience, education, consultationFee, homeVisitFee, languages, availableDays, isVerified, isActive } = req.body;
      const provider = await storage.updateProvider(req.params.id, {
        type,
        specialization,
        bio,
        yearsExperience,
        education,
        consultationFee: consultationFee?.toString(),
        homeVisitFee: homeVisitFee?.toString(),
        languages,
        availableDays,
        isVerified,
        isActive,
      });
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entityType: "provider",
        entityId: req.params.id,
        details: JSON.stringify(req.body),
        ipAddress: req.ip || null,
      });

      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  // Admin: Delete provider
  app.delete("/api/admin/providers/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteProvider(req.params.id);

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entityType: "provider",
        entityId: req.params.id,
        details: null,
        ipAddress: req.ip || null,
      });

      res.json({ message: "Provider deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete provider" });
    }
  });

  // ============ ADMIN FINANCIAL ============

  // Admin: Get all payments/financial data
  app.get("/api/admin/financial", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const payments = await storage.getAllPayments();
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get financial data" });
    }
  });

  // ============ ADMIN CONTENT MANAGEMENT ============

  // Content Blocks
  app.get("/api/admin/content-blocks", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const blocks = await storage.getAllContentBlocks();
      res.json(blocks);
    } catch (error) {
      res.status(500).json({ message: "Failed to get content blocks" });
    }
  });

  app.post("/api/admin/content-blocks", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { key, title, content, contentType, isPublished } = req.body;
      const block = await storage.createContentBlock({
        key,
        title,
        content,
        contentType: contentType || "text",
        isPublished: isPublished ?? true,
      });
      res.status(201).json(block);
    } catch (error) {
      res.status(500).json({ message: "Failed to create content block" });
    }
  });

  app.patch("/api/admin/content-blocks/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const block = await storage.updateContentBlock(req.params.id, req.body);
      if (!block) {
        return res.status(404).json({ message: "Content block not found" });
      }
      res.json(block);
    } catch (error) {
      res.status(500).json({ message: "Failed to update content block" });
    }
  });

  app.delete("/api/admin/content-blocks/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteContentBlock(req.params.id);
      res.json({ message: "Content block deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete content block" });
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
      const { question, answer, category, sortOrder, isPublished } = req.body;
      const faq = await storage.createFaq({
        question,
        answer,
        category: category || null,
        sortOrder: sortOrder || 0,
        isPublished: isPublished ?? true,
      });
      res.status(201).json(faq);
    } catch (error) {
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  app.patch("/api/admin/faqs/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const faq = await storage.updateFaq(req.params.id, req.body);
      if (!faq) {
        return res.status(404).json({ message: "FAQ not found" });
      }
      res.json(faq);
    } catch (error) {
      res.status(500).json({ message: "Failed to update FAQ" });
    }
  });

  app.delete("/api/admin/faqs/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteFaq(req.params.id);
      res.json({ message: "FAQ deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete FAQ" });
    }
  });

  // Blog Posts
  app.get("/api/admin/blog-posts", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const posts = await storage.getAllBlogPosts();
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get blog posts" });
    }
  });

  app.post("/api/admin/blog-posts", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { title, slug, content, excerpt, featuredImage, tags, isPublished } = req.body;
      const post = await storage.createBlogPost({
        title,
        slug,
        content,
        excerpt: excerpt || null,
        featuredImage: featuredImage || null,
        authorId: req.user!.id,
        tags: tags || null,
        isPublished: isPublished ?? false,
        publishedAt: isPublished ? new Date() : null,
      });
      res.status(201).json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to create blog post" });
    }
  });

  app.patch("/api/admin/blog-posts/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const post = await storage.updateBlogPost(req.params.id, req.body);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to update blog post" });
    }
  });

  app.delete("/api/admin/blog-posts/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteBlogPost(req.params.id);
      res.json({ message: "Blog post deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete blog post" });
    }
  });

  // ============ ADMIN ANNOUNCEMENTS ============

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
      const { title, content, type, targetAudience, startsAt, endsAt, isActive } = req.body;
      const announcement = await storage.createAnnouncement({
        title,
        content,
        type: type || "info",
        targetAudience: targetAudience || "all",
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        isActive: isActive ?? true,
      });
      res.status(201).json(announcement);
    } catch (error) {
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.patch("/api/admin/announcements/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const announcement = await storage.updateAnnouncement(req.params.id, req.body);
      if (!announcement) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      res.json(announcement);
    } catch (error) {
      res.status(500).json({ message: "Failed to update announcement" });
    }
  });

  app.delete("/api/admin/announcements/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteAnnouncement(req.params.id);
      res.json({ message: "Announcement deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  // ============ ADMIN EMAIL TEMPLATES ============

  app.get("/api/admin/email-templates", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templates = await storage.getAllEmailTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to get email templates" });
    }
  });

  app.post("/api/admin/email-templates", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, subject, htmlContent, textContent, variables } = req.body;
      const template = await storage.createEmailTemplate({
        name,
        subject,
        htmlContent,
        textContent: textContent || null,
        variables: variables || null,
      });
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to create email template" });
    }
  });

  app.patch("/api/admin/email-templates/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const template = await storage.updateEmailTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  app.delete("/api/admin/email-templates/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteEmailTemplate(req.params.id);
      res.json({ message: "Email template deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete email template" });
    }
  });

  // ============ ADMIN NOTIFICATIONS ============

  app.get("/api/admin/notifications", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const notifications = await storage.getAllNotifications();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.post("/api/admin/notifications", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { userId, type, subject, content, scheduledAt } = req.body;
      const notification = await storage.createNotification({
        userId,
        type: type || "email",
        subject,
        content,
        status: "pending",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      });
      res.status(201).json(notification);
    } catch (error) {
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  // ============ ADMIN PLATFORM SETTINGS ============

  app.get("/api/admin/settings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getAllPlatformSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get settings" });
    }
  });

  app.post("/api/admin/settings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { key, value, category, description } = req.body;
      const setting = await storage.createPlatformSetting({
        key,
        value,
        category: category || "general",
        description: description || null,
      });
      res.status(201).json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to create setting" });
    }
  });

  app.patch("/api/admin/settings/:key", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { value } = req.body;
      const setting = await storage.updatePlatformSetting(req.params.key, value);
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // ============ ADMIN SERVICE CATEGORIES ============

  app.get("/api/admin/service-categories", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const categories = await storage.getAllServiceCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to get service categories" });
    }
  });

  app.post("/api/admin/service-categories", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, icon, sortOrder, isActive } = req.body;
      const category = await storage.createServiceCategory({
        name,
        description: description || null,
        icon: icon || null,
        sortOrder: sortOrder || 0,
        isActive: isActive ?? true,
      });
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ message: "Failed to create service category" });
    }
  });

  app.patch("/api/admin/service-categories/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const category = await storage.updateServiceCategory(req.params.id, req.body);
      if (!category) {
        return res.status(404).json({ message: "Service category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ message: "Failed to update service category" });
    }
  });

  app.delete("/api/admin/service-categories/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteServiceCategory(req.params.id);
      res.json({ message: "Service category deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete service category" });
    }
  });

  // ============ ADMIN LOCATIONS ============

  app.get("/api/admin/locations", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get locations" });
    }
  });

  app.post("/api/admin/locations", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, city, state, country, isActive } = req.body;
      const location = await storage.createLocation({
        name,
        city,
        state: state || null,
        country: country || "Pakistan",
        isActive: isActive ?? true,
      });
      res.status(201).json(location);
    } catch (error) {
      res.status(500).json({ message: "Failed to create location" });
    }
  });

  app.patch("/api/admin/locations/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const location = await storage.updateLocation(req.params.id, req.body);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.delete("/api/admin/locations/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteLocation(req.params.id);
      res.json({ message: "Location deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  // ============ ADMIN AUDIT LOGS ============

  app.get("/api/admin/audit-logs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const logs = await storage.getAllAuditLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // ============ ADMIN SUPPORT TICKETS ============

  app.get("/api/admin/support-tickets", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tickets = await storage.getAllSupportTickets();
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ message: "Failed to get support tickets" });
    }
  });

  app.get("/api/admin/support-tickets/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({ message: "Support ticket not found" });
      }
      const messages = await storage.getTicketMessages(req.params.id);
      res.json({ ticket, messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to get support ticket" });
    }
  });

  app.post("/api/admin/support-tickets", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { userId, subject, description, priority, category } = req.body;
      const ticket = await storage.createSupportTicket({
        userId,
        subject,
        description,
        status: "open",
        priority: priority || "medium",
        category: category || null,
      });
      res.status(201).json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  app.patch("/api/admin/support-tickets/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { status, priority, assignedTo } = req.body;
      const ticket = await storage.updateSupportTicket(req.params.id, {
        status,
        priority,
        assignedTo,
        resolvedAt: status === "resolved" ? new Date() : undefined,
      });
      if (!ticket) {
        return res.status(404).json({ message: "Support ticket not found" });
      }
      res.json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to update support ticket" });
    }
  });

  app.delete("/api/admin/support-tickets/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteSupportTicket(req.params.id);
      res.json({ message: "Support ticket deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete support ticket" });
    }
  });

  // Support ticket messages
  app.post("/api/admin/support-tickets/:id/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { content, isInternal } = req.body;
      const message = await storage.createTicketMessage({
        ticketId: req.params.id,
        senderId: req.user!.id,
        content,
        isInternal: isInternal ?? false,
      });
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to create ticket message" });
    }
  });

  // ============ PUBLIC CONTENT ROUTES ============

  // Public FAQs
  app.get("/api/faqs", async (req: Request, res: Response) => {
    try {
      const faqs = await storage.getAllFaqs();
      res.json(faqs.filter(f => f.isPublished));
    } catch (error) {
      res.status(500).json({ message: "Failed to get FAQs" });
    }
  });

  // Public Announcements
  app.get("/api/announcements", async (req: Request, res: Response) => {
    try {
      const announcements = await storage.getActiveAnnouncements();
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ message: "Failed to get announcements" });
    }
  });

  // Public Blog Posts
  app.get("/api/blog-posts", async (req: Request, res: Response) => {
    try {
      const posts = await storage.getAllBlogPosts();
      res.json(posts.filter(p => p.isPublished));
    } catch (error) {
      res.status(500).json({ message: "Failed to get blog posts" });
    }
  });

  app.get("/api/blog-posts/:slug", async (req: Request, res: Response) => {
    try {
      const post = await storage.getBlogPostBySlug(req.params.slug);
      if (!post || !post.isPublished) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to get blog post" });
    }
  });

  // User support tickets
  app.post("/api/support-tickets", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { subject, description, category } = req.body;
      const ticket = await storage.createSupportTicket({
        userId: req.user!.id,
        subject,
        description,
        status: "open",
        priority: "medium",
        category: category || null,
      });
      res.status(201).json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // ============ SERVICE ROUTES ============

  // Get provider services
  app.get("/api/providers/:id/services", async (req: Request, res: Response) => {
    try {
      const services = await storage.getServicesByProvider(req.params.id);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to get services" });
    }
  });

  // Create service (for providers)
  app.post("/api/services", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(403).json({ message: "Only providers can create services" });
      }

      const { name, description, duration, price } = req.body;
      const service = await storage.createService({
        providerId: provider.id,
        name,
        description,
        duration,
        price: price.toString(),
      });

      res.status(201).json(service);
    } catch (error) {
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  return httpServer;
}