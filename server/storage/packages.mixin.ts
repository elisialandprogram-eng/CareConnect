/**
 * Package management, user packages, benefits — extracted from DatabaseStorage
 */

import {
  bugReports,
  bugReportComments,
  type BugReport,
  type InsertBugReport,
  type BugReportComment,
  type InsertBugReportComment,
  users,
  providers,
  services,
  timeSlots,
  providerTimeOff,
  appointments,
  reviews,
  payments,
  refreshTokens,
  promoCodes,
  providerPricingOverrides,
  auditLogs,
  supportTickets,
  ticketMessages,
  faqs,
  announcements,
  emailTemplates,
  notificationQueue,
  platformSettings,
  locations,
  dailyMetrics,
  prescriptions,
  medicalHistory,
  healthMetrics,
  familyMembers,
  medications,
  medicationLogs,
  userNotifications,
  chatConversations,
  patientDocuments,
  type PatientDocument,
  type InsertPatientDocument,
  chatMessages,
  realtimeConversations,
  realtimeMessages,
  subServices,
  categories,
  catalogServices,
  practitioners,
  practitionerSchedules,
  servicePractitioners,
  servicePackages,
  servicePriceHistory,
  serviceRequests,
  packageServices,
  taxSettings,
  patientConsents,
  invoices,
  invoiceItems,
  providerEarnings,
  appointmentEvents,
  type AppointmentEvent,
  type AppointmentEventWithActor,
  type InsertAppointmentEvent,
  type User,
  type InsertUser,
  type Provider,
  type InsertProvider,
  type Service,
  type InsertService,
  type TimeSlot,
  type InsertTimeSlot,
  type ProviderTimeOff,
  type InsertProviderTimeOff,
  type Appointment,
  type InsertAppointment,
  type Review,
  type InsertReview,
  type Payment,
  type InsertPayment,
  type RefreshToken,
  type InsertRefreshToken,
  type PromoCode,
  type InsertPromoCode,
  type ProviderPricingOverride,
  type InsertProviderPricingOverride,
  type AuditLog,
  type InsertAuditLog,
  type SupportTicket,
  type InsertSupportTicket,
  type TicketMessage,
  type InsertTicketMessage,
  type Faq,
  type InsertFaq,
  type Announcement,
  type InsertAnnouncement,
  type EmailTemplate,
  type InsertEmailTemplate,
  type Notification,
  type InsertNotification,
  type PlatformSetting,
  type InsertPlatformSetting,
  type CatalogService,
  type InsertCatalogService,
  type Location,
  type InsertLocation,
  type DailyMetric,
  type InsertDailyMetric,
  type Prescription,
  type InsertPrescription,
  type MedicalHistory,
  type InsertMedicalHistory,
  type HealthMetric,
  type InsertHealthMetric,
  type FamilyMember,
  type InsertFamilyMember,
  type Medication,
  type InsertMedication,
  type MedicationLog,
  type InsertMedicationLog,
  type UserNotification,
  type InsertUserNotification,
  type ChatConversation,
  type ChatMessage,
  type InsertChatMessage,
  type RealtimeConversation,
  type RealtimeMessage,
  type ProviderWithUser,
  type ProviderWithServices,
  type AppointmentWithDetails,
  type ReviewWithPatient,
  type SubService,
  type InsertSubService,
  type Category,
  type InsertCategory,
  type TaxSetting,
  type InsertTaxSetting,
  type PatientConsent,
  type InsertPatientConsent,
  type ServiceRequest,
  type InsertServiceRequest,
  type ServiceRequestWithProvider,
  savedProviders,
  type SavedProvider,
  type InsertSavedProvider,
  type Practitioner,
  type InsertPractitioner,
  type ServicePractitioner,
  type InsertServicePractitioner,
  type ServicePackage,
  type InsertServicePackage,
  type ServicePackageWithServices,
  type Invoice,
  type InsertInvoice,
  type InvoiceItem,
  type InsertInvoiceItem,
  type ProviderEarning,
  type InsertProviderEarning,
  notificationPreferences,
  pushSubscriptions,
  videoSessions,
  providerOfficeHours,
  notificationDeliveryLogs,
  adminBroadcasts,
  referrals,
  type Referral,
  type InsertReferral,
  waitlistEntries,
  type WaitlistEntry,
  type InsertWaitlistEntry,
  wallets,
  walletTransactions,
  groupSessions,
  groupSessionParticipants,
  type GroupSession,
  type InsertGroupSession,
  type GroupSessionParticipant,
  type Wallet,
  type WalletTransaction,
  type InsertWalletTransaction,
  type NotificationPreferences,
  type InsertNotificationPreferences,
  type PushSubscription,
  type InsertPushSubscription,
  type VideoSession,
  type ProviderOfficeHours,
  type InsertProviderOfficeHours,
  type NotificationDeliveryLog,
  type AdminBroadcast,
  type InsertAdminBroadcast,
  providerGallery,
  type ProviderGalleryImage,
  type InsertProviderGalleryImage,
  providerDocuments,
  type ProviderDocument,
  type InsertProviderDocument,
  providerCredentials,
  type ProviderCredential,
  type InsertProviderCredential,
  providerCategoryPermissions,
  type ProviderCategoryPermission,
  providerBufferSettings,
  type ProviderBufferSettings,
  type InsertProviderBufferSettings,
  providerBlocks,
  type ProviderBlock,
  type InsertProviderBlock,
  appointmentSlotHolds,
  type AppointmentSlotHold,
  type InsertAppointmentSlotHold,
  adminRoles,
  type AdminRole,
  type InsertAdminRole,
  rbacPermissions,
  type RbacPermission,
  rolePermissions,
  adminAssignments,
  type AdminAssignment,
  type InsertAdminAssignment,
  packages,
  type Package,
  type InsertPackage,
  packageBenefits,
  type PackageBenefit,
  type InsertPackageBenefit,
  userPackages,
  type UserPackage,
  type InsertUserPackage,
  type PackageWithBenefits,
  type UserPackageWithDetails,
  membershipBenefitUsage,
  type MembershipBenefitUsage,
  type InsertMembershipBenefitUsage,
  type PractitionerSchedule,
  type InsertPractitionerSchedule,
  systemEvents,
  type SystemEvent,
  type InsertSystemEvent,
  providerWallets,
  type ProviderWallet,
  providerLedger,
  type ProviderLedger,
  type InsertProviderLedger,
} from "@shared/schema";
import { db, pool } from "../db";
import { countryCurrency, type CountryCode } from "../middleware/country";
import { getRates, toUSDSync } from "../services/currency";
import { eq, and, desc, or, sql, count, asc, aliasedTable, inArray, gte, lte, lt, ilike, isNull, type SQL } from "drizzle-orm";

import { ProviderMediaMixin } from "./provider-media.mixin";

export abstract class PackagesMixin extends ProviderMediaMixin {
  // ── Packages ─────────────────────────────────────────────────────────────────

  private async loadBenefits(packageIds: string[]): Promise<Map<string, PackageBenefit[]>> {
    if (packageIds.length === 0) return new Map();
    const rows = await db.select().from(packageBenefits)
      .where(inArray(packageBenefits.packageId, packageIds));
    const map = new Map<string, PackageBenefit[]>();
    for (const r of rows) {
      if (!map.has(r.packageId)) map.set(r.packageId, []);
      map.get(r.packageId)!.push(r);
    }
    return map;
  }

  async getPackages(filters: { countryCode?: string; isActive?: boolean; targetUserType?: string } = {}): Promise<PackageWithBenefits[]> {
    const conditions = [];
    if (filters.isActive !== undefined) conditions.push(eq(packages.isActive, filters.isActive));
    if (filters.targetUserType) {
      conditions.push(
        or(
          eq(packages.targetUserType, filters.targetUserType as any),
          eq(packages.targetUserType, "both"),
        )!,
      );
    }
    if (filters.countryCode) {
      conditions.push(
        or(
          eq(packages.countryCode, filters.countryCode as any),
          isNull(packages.countryCode),
        )!,
      );
    }

    const rows = conditions.length > 0
      ? await db.select().from(packages).where(and(...conditions)).orderBy(asc(packages.sortOrder), asc(packages.createdAt))
      : await db.select().from(packages).orderBy(asc(packages.sortOrder), asc(packages.createdAt));

    const benefitsMap = await this.loadBenefits(rows.map(r => r.id));
    return rows.map(r => ({ ...r, benefits: benefitsMap.get(r.id) ?? [] }));
  }

  async getPackage(id: string): Promise<PackageWithBenefits | undefined> {
    const [row] = await db.select().from(packages).where(eq(packages.id, id)).limit(1);
    if (!row) return undefined;
    const benefits = await db.select().from(packageBenefits).where(eq(packageBenefits.packageId, id));
    return { ...row, benefits };
  }

  async createPackage(data: InsertPackage, benefits: Omit<InsertPackageBenefit, "packageId">[]): Promise<PackageWithBenefits> {
    const [pkg] = await db.insert(packages).values(data).returning();
    const insertedBenefits: PackageBenefit[] = [];
    for (const b of benefits) {
      const [ben] = await db.insert(packageBenefits).values({ ...b, packageId: pkg.id }).returning();
      insertedBenefits.push(ben);
    }
    return { ...pkg, benefits: insertedBenefits };
  }

  async updatePackage(id: string, data: Partial<InsertPackage>, benefits?: Omit<InsertPackageBenefit, "packageId">[]): Promise<PackageWithBenefits | undefined> {
    const [pkg] = await db.update(packages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(packages.id, id))
      .returning();
    if (!pkg) return undefined;

    if (benefits !== undefined) {
      await db.delete(packageBenefits).where(eq(packageBenefits.packageId, id));
      for (const b of benefits) {
        await db.insert(packageBenefits).values({ ...b, packageId: id });
      }
    }
    const updatedBenefits = await db.select().from(packageBenefits).where(eq(packageBenefits.packageId, id));
    return { ...pkg, benefits: updatedBenefits };
  }

  async deletePackage(id: string): Promise<void> {
    // Preserve existing user access — block hard-delete if anyone has purchased it
    const [row] = await db
      .select({ cnt: count() })
      .from(userPackages)
      .where(eq(userPackages.packageId, id));
    const purchaseCount = Number(row?.cnt ?? 0);
    if (purchaseCount > 0) {
      throw new Error(`SUBSCRIBERS:${purchaseCount}`);
    }
    // No purchases — safe to hard-delete (package_benefits cascades automatically)
    await db.delete(packages).where(eq(packages.id, id));
  }

  async clonePackage(id: string, overrides: Partial<InsertPackage> = {}): Promise<PackageWithBenefits> {
    const original = await this.getPackage(id);
    if (!original) throw new Error("Package not found");
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = original;
    const newData: InsertPackage = {
      ...rest,
      ...overrides,
      name: overrides.name ?? `${original.name} (copy)`,
      isActive: overrides.isActive ?? false,
    };
    const benefitsData = original.benefits.map(b => ({
      benefitKey: b.benefitKey,
      benefitValue: b.benefitValue,
      notes: b.notes,
    }));
    return this.createPackage(newData, benefitsData);
  }

  async getUserPackages(userId: string, status?: string): Promise<UserPackageWithDetails[]> {
    const conditions = [eq(userPackages.userId, userId)];
    if (status) conditions.push(eq(userPackages.status, status as any));
    const rows = await db.select().from(userPackages)
      .where(and(...conditions))
      .orderBy(desc(userPackages.createdAt));

    if (rows.length === 0) return [];
    const packageIds = [...new Set(rows.map(r => r.packageId))];
    const pkgRows = await db.select().from(packages).where(inArray(packages.id, packageIds));
    const benefitsMap = await this.loadBenefits(packageIds);
    const pkgMap = new Map(pkgRows.map(p => [p.id, { ...p, benefits: benefitsMap.get(p.id) ?? [] }]));

    return rows
      .filter(r => pkgMap.has(r.packageId))
      .map(r => ({ ...r, package: pkgMap.get(r.packageId)! }));
  }

  async getActiveUserPackage(userId: string, countryCode?: string): Promise<(UserPackage & { benefits: PackageBenefit[] }) | undefined> {
    const conditions = [
      eq(userPackages.userId, userId),
      eq(userPackages.status, "active"),
    ];
    if (countryCode) {
      conditions.push(
        or(
          eq(userPackages.countryCode, countryCode as any),
        )!,
      );
    }
    const rows = await db.select().from(userPackages)
      .where(and(...conditions))
      .orderBy(desc(userPackages.activatedAt))
      .limit(1);

    const row = rows[0];
    if (!row) return undefined;

    // Check not expired at runtime (in case cron hasn't run)
    if (row.expiresAt && row.expiresAt < new Date()) {
      await db.update(userPackages).set({ status: "expired" }).where(eq(userPackages.id, row.id));
      return undefined;
    }

    const benefits = await db.select().from(packageBenefits).where(eq(packageBenefits.packageId, row.packageId));
    return { ...row, benefits };
  }

  async getUserPackage(id: string): Promise<UserPackage | undefined> {
    const [row] = await db.select().from(userPackages).where(eq(userPackages.id, id)).limit(1);
    return row;
  }

  async createUserPackage(data: InsertUserPackage): Promise<UserPackage> {
    const [row] = await db.insert(userPackages).values(data).returning();
    return row;
  }

  async activateUserPackage(id: string): Promise<UserPackage | undefined> {
    const up = await this.getUserPackage(id);
    if (!up) return undefined;
    const pkg = await this.getPackage(up.packageId);
    const durationDays = pkg?.durationDays ?? 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 86400_000);
    const [row] = await db.update(userPackages)
      .set({ status: "active", activatedAt: now, expiresAt })
      .where(eq(userPackages.id, id))
      .returning();
    return row;
  }

  async expireStaleUserPackages(): Promise<number> {
    const result = await db.execute(sql`
      UPDATE user_packages
      SET status = 'expired'
      WHERE status = 'active' AND expires_at < NOW()
    `);
    return (result as any).rowCount ?? 0;
  }

  async updateUserPackage(id: string, data: Partial<InsertUserPackage>): Promise<UserPackage | undefined> {
    const [row] = await db.update(userPackages).set(data as any).where(eq(userPackages.id, id)).returning();
    return row;
  }

  async pauseUserPackage(id: string, userId: string): Promise<UserPackage | undefined> {
    const [row] = await db.update(userPackages)
      .set({ status: "paused", pausedAt: new Date() } as any)
      .where(and(eq(userPackages.id, id), eq(userPackages.userId, userId)))
      .returning();
    return row;
  }

  async resumeUserPackage(id: string, userId: string): Promise<UserPackage | undefined> {
    const up = await this.getUserPackage(id);
    if (!up) return undefined;
    const pkg = await this.getPackage(up.packageId);
    const pausedAtMs = ((up as any).pausedAt as Date | null)?.getTime() ?? 0;
    const remainingMs = up.expiresAt ? Math.max(0, new Date(up.expiresAt).getTime() - pausedAtMs) : (pkg?.durationDays ?? 30) * 86400_000;
    const newExpiry = new Date(Date.now() + remainingMs);
    const [row] = await db.update(userPackages)
      .set({ status: "active", pausedAt: null, expiresAt: newExpiry } as any)
      .where(and(eq(userPackages.id, id), eq(userPackages.userId, userId)))
      .returning();
    return row;
  }

  async cancelUserPackageRenewal(id: string, userId: string): Promise<UserPackage | undefined> {
    const [row] = await db.update(userPackages)
      .set({ status: "cancelled", cancelledAt: new Date(), autoRenew: false } as any)
      .where(and(eq(userPackages.id, id), eq(userPackages.userId, userId)))
      .returning();
    return row;
  }

  async toggleAutoRenew(id: string, userId: string, autoRenew: boolean): Promise<UserPackage | undefined> {
    const [row] = await db.update(userPackages)
      .set({ autoRenew } as any)
      .where(and(eq(userPackages.id, id), eq(userPackages.userId, userId)))
      .returning();
    return row;
  }

  async getBenefitUsage(userPackageId: string): Promise<MembershipBenefitUsage[]> {
    return db.select().from(membershipBenefitUsage)
      .where(eq(membershipBenefitUsage.userPackageId, userPackageId))
      .orderBy(desc(membershipBenefitUsage.createdAt));
  }

  async recordBenefitUsage(data: InsertMembershipBenefitUsage): Promise<MembershipBenefitUsage> {
    const [row] = await db.insert(membershipBenefitUsage).values(data).returning();
    return row;
  }

  async getFamilyMemberAppointments(familyMemberId: string, primaryUserId: string): Promise<any[]> {
    return db.execute(sql`
      SELECT a.*, p.first_name AS provider_first_name, p.last_name AS provider_last_name,
             s.name AS service_name, s.duration_minutes
      FROM appointments a
      LEFT JOIN providers pr ON pr.id = a.provider_id
      LEFT JOIN users p ON p.id = pr.user_id
      LEFT JOIN services sv ON sv.id = a.service_id
      LEFT JOIN sub_services s ON s.id = sv.sub_service_id
      WHERE a.family_member_id = ${familyMemberId}
        AND a.patient_id = ${primaryUserId}
      ORDER BY a.created_at DESC
      LIMIT 50
    `).then((r: any) => r.rows ?? []);
  }

  async getFamilyMemberDocuments(familyMemberId: string, primaryUserId: string): Promise<any[]> {
    return db.execute(sql`
      SELECT * FROM patient_documents
      WHERE family_member_id = ${familyMemberId}
        AND patient_id = ${primaryUserId}
      ORDER BY created_at DESC
    `).then((r: any) => r.rows ?? []);
  }

  async getFamilyMemberConsents(familyMemberId: string, primaryUserId: string): Promise<PatientConsent[]> {
    return db.select().from(patientConsents)
      .where(and(
        eq(patientConsents.familyMemberId, familyMemberId),
        eq(patientConsents.userId, primaryUserId),
      ))
      .orderBy(desc(patientConsents.acceptedAt));
  }

  async addFamilyMemberConsent(
    userId: string,
    familyMemberId: string,
    data: { consentType: string; isAccepted: boolean; consentVersion?: string; ipAddress?: string; userAgent?: string },
  ): Promise<PatientConsent> {
    const [row] = await db.insert(patientConsents).values({
      userId,
      familyMemberId,
      consentType: data.consentType,
      isAccepted: data.isAccepted,
      consentVersion: data.consentVersion ?? "1.0",
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    } as any).returning();
    return row;
  }

  async getPackagePurchaseCount(packageId: string): Promise<number> {
    const [row] = await db.select({ c: count() }).from(userPackages).where(eq(userPackages.packageId, packageId));
    return Number(row?.c ?? 0);
  }

  async getPackagePurchaseCounts(packageIds: string[]): Promise<Map<string, number>> {
    if (!packageIds.length) return new Map();
    const rows = await db.select({ packageId: userPackages.packageId, c: count() })
      .from(userPackages)
      .where(inArray(userPackages.packageId, packageIds))
      .groupBy(userPackages.packageId);
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.packageId, Number(r.c));
    return map;
  }

}
