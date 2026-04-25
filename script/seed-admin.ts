
import { db } from "../server/db";
import { users, providers } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  try {
    console.log("Creating admin user and Elite Physiotherapists provider...");

    // Create admin user
    const adminEmail = "admin@goldenlife.com";
    const adminPassword = "admin123"; // Change this in production!

    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail));
    
    let adminUser;
    if (existingAdmin.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const [newAdmin] = await db.insert(users).values({
        email: adminEmail,
        password: hashedPassword,
        firstName: "Admin",
        lastName: "User",
        phone: "",
        role: "admin",
      }).returning();
      adminUser = newAdmin;
      console.log("✓ Admin user created:", adminEmail);
    } else {
      adminUser = existingAdmin[0];
      console.log("✓ Admin user already exists");
    }

    // Create Elite Physiotherapists provider
    const providerEmail = "elite@physiotherapists.hu";
    const providerPassword = "elite123";

    const existingProviderUser = await db.select().from(users).where(eq(users.email, providerEmail));
    
    let providerUser;
    if (existingProviderUser.length === 0) {
      const hashedPassword = await bcrypt.hash(providerPassword, 10);
      const [newProviderUser] = await db.insert(users).values({
        email: providerEmail,
        password: hashedPassword,
        firstName: "Elite",
        lastName: "Physiotherapists",
        phone: "+36-1-234-5678",
        role: "provider",
        city: "Budapest",
      }).returning();
      providerUser = newProviderUser;
      console.log("✓ Elite Physiotherapists user created");
    } else {
      providerUser = existingProviderUser[0];
      console.log("✓ Elite Physiotherapists user already exists");
    }

    // Check if provider profile exists
    const existingProvider = await db.select().from(providers).where(eq(providers.userId, providerUser.id));
    
    if (existingProvider.length === 0) {
      await db.insert(providers).values({
        userId: providerUser.id,
        type: "physiotherapist",
        specialization: "Sports Rehabilitation, Pain Management, Orthopedic Recovery",
        bio: "Elite Physiotherapists is Hungary's premier physiotherapy clinic, offering world-class rehabilitation services. Our team of certified physiotherapists specializes in sports injuries, chronic pain management, and post-operative recovery. With over 15 years of experience and state-of-the-art facilities in Budapest, we provide personalized treatment plans to help you achieve optimal health and mobility.",
        yearsExperience: 15,
        education: "MSc in Physiotherapy, Budapest University; Advanced Sports Medicine Certification",
        certifications: ["Certified Sports Physiotherapist", "Manual Therapy Specialist", "Orthopedic Rehabilitation Expert"],
        languages: ["english", "hungarian", "german"],
        consultationFee: "75.00",
        homeVisitFee: "120.00",
        isVerified: true,
        isActive: true,
        rating: "4.9",
        totalReviews: 0,
        availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
        workingHoursStart: "08:00",
        workingHoursEnd: "20:00",
      });
      console.log("✓ Elite Physiotherapists provider profile created");
    } else {
      console.log("✓ Elite Physiotherapists provider profile already exists");
    }

    console.log("\n=== Seed Complete ===");
    console.log("Admin and provider accounts created in Supabase database");
    console.log("\nDefault login credentials (stored securely in seed-admin.ts):");
    console.log("  Admin Email:", adminEmail);
    console.log("  Provider Email:", providerEmail);
    console.log("\nYou can now:");
    console.log("1. Login as admin at /login to manage providers");
    console.log("2. Visit /admin to access the admin dashboard");
    console.log("3. View Elite Physiotherapists at /providers");

    process.exit(0);
  } catch (error) {
    console.error("Error seeding admin:", error);
    process.exit(1);
  }
}

seedAdmin();
