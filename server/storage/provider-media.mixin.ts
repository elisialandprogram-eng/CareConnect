/**
 * Provider gallery, documents, credentials, category permissions — extracted from DatabaseStorage
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

import { GroupSessionsMixin } from "./group-sessions.mixin";

export abstract class ProviderMediaMixin extends GroupSessionsMixin {
  // ── Provider Gallery ────────────────────────────────────────────────────────
  async getProviderGallery(providerId: string): Promise<ProviderGalleryImage[]> {
    return db.select().from(providerGallery)
      .where(eq(providerGallery.providerId, providerId))
      .orderBy(asc(providerGallery.sortOrder), asc(providerGallery.createdAt));
  }

  async addGalleryImage(data: InsertProviderGalleryImage & { publicId?: string }): Promise<ProviderGalleryImage> {
    const [row] = await db.insert(providerGallery).values(data as any).returning();
    return row;
  }

  async updateGalleryImage(id: string, providerId: string, data: Partial<Pick<ProviderGalleryImage, 'caption' | 'sortOrder'>>): Promise<ProviderGalleryImage | undefined> {
    const [row] = await db.update(providerGallery)
      .set(data)
      .where(and(eq(providerGallery.id, id), eq(providerGallery.providerId, providerId)))
      .returning();
    return row || undefined;
  }

  async getGalleryImage(id: string, providerId: string): Promise<ProviderGalleryImage | undefined> {
    const [row] = await db.select().from(providerGallery)
      .where(and(eq(providerGallery.id, id), eq(providerGallery.providerId, providerId)));
    return row ?? undefined;
  }

  async deleteGalleryImage(id: string, providerId: string): Promise<boolean> {
    await db.delete(providerGallery)
      .where(and(eq(providerGallery.id, id), eq(providerGallery.providerId, providerId)));
    return true;
  }

  async reorderGalleryImages(providerId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(providerGallery)
        .set({ sortOrder: i })
        .where(and(eq(providerGallery.id, orderedIds[i]), eq(providerGallery.providerId, providerId)));
    }
  }

  // ── Provider Documents ───────────────────────────────────────────────────────
  async createProviderDocument(data: Omit<ProviderDocument, 'id' | 'createdAt' | 'adminNote'> & { verificationStatus?: string }): Promise<ProviderDocument> {
    // New uploads start at "pending" — canonical initial status in the lifecycle
    const [row] = await db.insert(providerDocuments).values({ ...data, verificationStatus: "pending" } as any).returning();
    return row;
  }

  async getProviderDocuments(providerId: string): Promise<ProviderDocument[]> {
    const { rows } = await pool.query(
      `SELECT * FROM provider_documents WHERE provider_id = $1 AND (deleted_at IS NULL) ORDER BY created_at DESC`,
      [providerId],
    );
    return rows.map((r: any) => ({
      ...r,
      providerId: r.provider_id,
      documentType: r.document_type,
      documentUrl: r.document_url,
      cloudinaryPublicId: r.cloudinary_public_id,
      verificationStatus: r.verification_status,
      adminNote: r.admin_note,
      verifiedBy: r.verified_by,
      verifiedAt: r.verified_at,
      createdAt: r.created_at,
      expiryDate: r.expiry_date,
      deletedAt: r.deleted_at ?? null,
    }));
  }

  async getProviderDocument(id: string): Promise<ProviderDocument | undefined> {
    const [row] = await db.select().from(providerDocuments).where(eq(providerDocuments.id, id)).limit(1);
    return row ?? undefined;
  }

  async getAllProviderDocuments(filters?: { status?: string; countryCode?: string }): Promise<Array<ProviderDocument & { providerName: string; deletedAt?: Date | null }>> {
    const params: any[] = [];
    const conds: string[] = [];

    if (filters?.status) {
      if (filters.status === "pending") {
        conds.push(`pd.verification_status IN ('pending', 'under_review')`);
      } else {
        params.push(filters.status);
        conds.push(`pd.verification_status = $${params.length}`);
      }
    }
    if (filters?.countryCode) {
      params.push(filters.countryCode);
      conds.push(`p.country_code::text = $${params.length}`);
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const { rows } = await pool.query(`
      SELECT pd.*,
             pd.deleted_at,
             COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), 'Unknown') AS provider_name
      FROM provider_documents pd
      INNER JOIN providers p ON p.id = pd.provider_id
      INNER JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY pd.created_at DESC
    `, params);

    return rows.map((r: any) => ({
      ...r,
      providerId: r.provider_id,
      documentType: r.document_type,
      documentUrl: r.document_url,
      cloudinaryPublicId: r.cloudinary_public_id,
      verificationStatus: r.verification_status,
      adminNote: r.admin_note,
      verifiedBy: r.verified_by,
      verifiedAt: r.verified_at,
      createdAt: r.created_at,
      providerName: r.provider_name,
      deletedAt: r.deleted_at ?? null,
    }));
  }

  async updateProviderDocumentStatus(id: string, status: string, adminNote?: string, verifiedBy?: string): Promise<ProviderDocument | undefined> {
    const updateFields: Record<string, any> = { verificationStatus: status };
    if (adminNote !== undefined) updateFields.adminNote = adminNote;
    // Set verifiedAt + verifiedBy when moving to a terminal review state (canonical values only)
    if (["approved", "rejected", "reupload_required", "expired"].includes(status)) {
      updateFields.verifiedAt = new Date();
      if (verifiedBy) updateFields.verifiedBy = verifiedBy;
    } else {
      // Clear verification fields when reverting to pending
      updateFields.verifiedAt = null;
      updateFields.verifiedBy = null;
    }
    const [row] = await db.update(providerDocuments)
      .set(updateFields as any)
      .where(eq(providerDocuments.id, id))
      .returning();
    if (!row) return undefined;

    // Sync provider_credentials.verified so the provider dashboard badge reflects
    // the real approval state. Documents and credentials share the same type
    // namespace for credential docs (medical_license, degree, etc.) but KYC-only
    // docs (id_card, address_proof) have no matching credential — those updates
    // are silently ignored by the WHERE clause.
    const CRED_ALIASES: Record<string, string[]> = {
      medical_license: ["medical_license", "license"],
      license:         ["medical_license", "license"],
      specialization_certificate: ["specialization_certificate", "certification"],
      certification:   ["specialization_certificate", "certification"],
    };
    const credTypes = CRED_ALIASES[row.documentType] ?? [row.documentType];
    const credFields: Record<string, any> = { verified: status === "approved" };
    if (adminNote !== undefined) credFields.adminNote = adminNote;
    db.update(providerCredentials)
      .set(credFields)
      .where(and(
        eq(providerCredentials.providerId, row.providerId),
        inArray(providerCredentials.credentialType, credTypes),
      ))
      .execute()
      .catch((e: Error) => console.warn("[sync-cred-verified]", e.message));

    return row;
  }

  async deleteProviderDocument(id: string): Promise<void> {
    await pool.query(`UPDATE provider_documents SET deleted_at = NOW() WHERE id = $1`, [id]);
  }

  // ── Provider Credentials ─────────────────────────────────────────────────────
  async createProviderCredential(data: Omit<ProviderCredential, 'id' | 'createdAt' | 'verified' | 'verifiedAt' | 'adminNote'>): Promise<ProviderCredential> {
    const [row] = await db.insert(providerCredentials).values({ ...data, verified: false } as any).returning();
    return row;
  }

  async getProviderCredentials(providerId: string): Promise<ProviderCredential[]> {
    return db.select().from(providerCredentials)
      .where(eq(providerCredentials.providerId, providerId))
      .orderBy(desc(providerCredentials.createdAt));
  }

  async getPublicProviderCredentials(providerId: string): Promise<ProviderCredential[]> {
    return db.select().from(providerCredentials)
      .where(and(eq(providerCredentials.providerId, providerId), eq(providerCredentials.verified, true)))
      .orderBy(desc(providerCredentials.createdAt));
  }

  async getProviderCredential(id: string): Promise<ProviderCredential | undefined> {
    const [row] = await db.select().from(providerCredentials).where(eq(providerCredentials.id, id)).limit(1);
    return row ?? undefined;
  }

  async getAllProviderCredentials(filters?: { verified?: boolean; countryCode?: string }): Promise<Array<ProviderCredential & { providerName: string }>> {
    const conditions: any[] = [];
    if (filters?.verified !== undefined) conditions.push(eq(providerCredentials.verified, filters.verified));
    if (filters?.countryCode) conditions.push(eq(providers.countryCode as any, filters.countryCode));
    const rows = await db
      .select({
        cred: providerCredentials,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(providerCredentials)
      .innerJoin(providers, eq(providerCredentials.providerId, providers.id))
      .innerJoin(users, eq(providers.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(providerCredentials.createdAt));
    return rows.map(r => ({
      ...r.cred,
      providerName: `${r.firstName} ${r.lastName}`.trim(),
    }));
  }

  async updateProviderCredential(id: string, providerId: string, data: Partial<Pick<ProviderCredential, 'credentialType' | 'title' | 'licenseNumber' | 'issuingBody'>>): Promise<ProviderCredential | undefined> {
    const [row] = await db.update(providerCredentials)
      .set(data)
      .where(and(eq(providerCredentials.id, id), eq(providerCredentials.providerId, providerId)))
      .returning();
    return row ?? undefined;
  }

  async verifyProviderCredential(id: string, verified: boolean, adminNote?: string): Promise<ProviderCredential | undefined> {
    const [row] = await db.update(providerCredentials)
      .set({ verified, verifiedAt: verified ? new Date() : null, adminNote: adminNote ?? null })
      .where(eq(providerCredentials.id, id))
      .returning();
    return row ?? undefined;
  }

  async deleteProviderCredential(id: string): Promise<void> {
    await db.delete(providerCredentials).where(eq(providerCredentials.id, id));
  }

  // ── Provider Category Permissions ───────────────────────────────────────────
  async getProviderCategoryPermissions(providerId: string): Promise<ProviderCategoryPermission[]> {
    return db.select().from(providerCategoryPermissions)
      .where(eq(providerCategoryPermissions.providerId, providerId));
  }

  async setProviderCategoryPermissions(
    providerId: string,
    permissions: Array<{ categoryId: string; enabled: boolean }>,
  ): Promise<ProviderCategoryPermission[]> {
    // Delete existing and replace atomically
    await db.delete(providerCategoryPermissions)
      .where(eq(providerCategoryPermissions.providerId, providerId));
    if (permissions.length === 0) return [];
    const rows = await db.insert(providerCategoryPermissions)
      .values(permissions.map(p => ({
        providerId,
        categoryId: p.categoryId,
        enabled: p.enabled,
        assignedByAdmin: true,
      })))
      .returning();
    return rows;
  }

  async clearProviderCategoryPermissions(providerId: string): Promise<void> {
    await db.delete(providerCategoryPermissions)
      .where(eq(providerCategoryPermissions.providerId, providerId));
  }

}
