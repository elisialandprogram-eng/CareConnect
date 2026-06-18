/**
 * Group sessions, categories, sub-services — extracted from DatabaseStorage
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


/** Normalize raw SQL snake_case sub_service row to camelCase SubService shape */
function normalizeSubServiceRow(row: Record<string, any>): Record<string, any> {
  return {
    ...row,
    isActive: row.isActive ?? row.is_active,
    deletedAt: row.deletedAt ?? row.deleted_at,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
    basePrice: row.basePrice ?? row.base_price,
    platformFee: row.platformFee ?? row.platform_fee,
    durationMinutes: row.durationMinutes ?? row.duration_minutes,
    taxPercentage: row.taxPercentage ?? row.tax_percentage,
    pricingType: row.pricingType ?? row.pricing_type,
    subGroup: row.subGroup ?? row.sub_group,
    nameEn: row.nameEn ?? row.name_en,
    nameHu: row.nameHu ?? row.name_hu,
    nameFa: row.nameFa ?? row.name_fa,
    descriptionEn: row.descriptionEn ?? row.description_en,
    descriptionHu: row.descriptionHu ?? row.description_hu,
    descriptionFa: row.descriptionFa ?? row.description_fa,
    minPrice: row.minPrice ?? row.min_price,
    maxPrice: row.maxPrice ?? row.max_price,
    suggestedMinPrice: row.suggestedMinPrice ?? row.suggested_min_price,
    suggestedMaxPrice: row.suggestedMaxPrice ?? row.suggested_max_price,
    bufferBefore: row.bufferBefore ?? row.buffer_before,
    bufferAfter: row.bufferAfter ?? row.buffer_after,
    catalogServiceId: row.catalogServiceId ?? row.catalog_service_id,
  };
}

export abstract class GroupSessionsMixin {
  // ─── Group sessions ──────────────────────────────────────────────────────
  async createGroupSession(data: InsertGroupSession): Promise<GroupSession> {
    if (!(data.endTime > data.startTime)) {
      throw new Error("endTime must be after startTime");
    }
    if (!(data.maxParticipants > 0)) {
      throw new Error("maxParticipants must be > 0");
    }
    const [row] = await db.insert(groupSessions).values(data as any).returning();
    return row;
  }

  async listGroupSessionsByCountry(country: string, opts: { onlyUpcoming?: boolean } = {}) {
    const result = await db.execute(sql`
      SELECT gs.*, COALESCE(p.cnt, 0)::int AS participant_count
      FROM group_sessions gs
      LEFT JOIN (
        SELECT session_id, COUNT(*) AS cnt
        FROM group_session_participants
        WHERE payment_status IN ('pending','completed')
        GROUP BY session_id
      ) p ON p.session_id = gs.id
      WHERE gs.country_code = ${country}::country_code
        AND gs.status IN ('scheduled','live')
        ${opts.onlyUpcoming ? sql`AND gs.end_time > NOW()` : sql``}
      ORDER BY gs.start_time ASC
    `);
    const rows = ((result as any).rows ?? result) as any[];
    return rows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      serviceId: r.service_id,
      title: r.title,
      description: r.description,
      startTime: new Date(r.start_time),
      endTime: new Date(r.end_time),
      maxParticipants: r.max_participants,
      pricePerUser: r.price_per_user,
      status: r.status,
      meetingLink: r.meeting_link,
      countryCode: r.country_code,
      createdAt: r.created_at ? new Date(r.created_at) : null,
      updatedAt: r.updated_at ? new Date(r.updated_at) : null,
      participantCount: Number(r.participant_count) || 0,
    })) as Array<GroupSession & { participantCount: number }>;
  }

  async listGroupSessionsByProvider(providerId: string) {
    const result = await db.execute(sql`
      SELECT gs.*, COALESCE(p.cnt, 0)::int AS participant_count
      FROM group_sessions gs
      LEFT JOIN (
        SELECT session_id, COUNT(*) AS cnt
        FROM group_session_participants
        WHERE payment_status IN ('pending','completed')
        GROUP BY session_id
      ) p ON p.session_id = gs.id
      WHERE gs.provider_id = ${providerId}
      ORDER BY gs.start_time DESC
    `);
    const rows = ((result as any).rows ?? result) as any[];
    return rows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      serviceId: r.service_id,
      title: r.title,
      description: r.description,
      startTime: new Date(r.start_time),
      endTime: new Date(r.end_time),
      maxParticipants: r.max_participants,
      pricePerUser: r.price_per_user,
      status: r.status,
      meetingLink: r.meeting_link,
      countryCode: r.country_code,
      createdAt: r.created_at ? new Date(r.created_at) : null,
      updatedAt: r.updated_at ? new Date(r.updated_at) : null,
      participantCount: Number(r.participant_count) || 0,
    })) as Array<GroupSession & { participantCount: number }>;
  }

  async getGroupSession(id: string): Promise<GroupSession | undefined> {
    const [row] = await db.select().from(groupSessions).where(eq(groupSessions.id, id)).limit(1);
    return row;
  }

  async getGroupSessionWithParticipants(id: string) {
    const session = await this.getGroupSession(id);
    if (!session) return undefined;
    const result = await db.execute(sql`
      SELECT p.*, u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM group_session_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.session_id = ${id}
      ORDER BY p.created_at ASC
    `);
    const rows = ((result as any).rows ?? result) as any[];
    const participants = rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      userId: r.user_id,
      paymentStatus: r.payment_status,
      attendanceStatus: r.attendance_status,
      amountPaid: r.amount_paid,
      paymentMethod: r.payment_method,
      joinedAt: r.joined_at ? new Date(r.joined_at) : null,
      refundedAt: r.refunded_at ? new Date(r.refunded_at) : null,
      countryCode: r.country_code,
      createdAt: r.created_at ? new Date(r.created_at) : null,
      userEmail: r.user_email,
      userFirstName: r.user_first_name,
      userLastName: r.user_last_name,
    }));
    return { session, participants };
  }

  async updateGroupSession(id: string, data: Partial<GroupSession>): Promise<GroupSession | undefined> {
    const [row] = await db.update(groupSessions).set({ ...data, updatedAt: new Date() } as any).where(eq(groupSessions.id, id)).returning();
    return row;
  }

  // Books a patient into a group session, debiting their wallet atomically.
  // Capacity is checked under SELECT FOR UPDATE on the session row so two
  // concurrent bookings for the last seat cannot both win.
  async bookGroupSessionWithWallet(opts: { sessionId: string; userId: string }) {
    const { sessionId, userId } = opts;
    return db.transaction(async (tx) => {
      const sRows = await tx.execute(sql`
        SELECT id, provider_id, max_participants, price_per_user, status, country_code, start_time, end_time
        FROM group_sessions WHERE id = ${sessionId} FOR UPDATE
      `);
      const sArr = ((sRows as any).rows ?? sRows) as any[];
      if (sArr.length === 0) throw new Error("Session not found");
      const s = sArr[0];
      if (s.status === "cancelled") throw new Error("Session is cancelled");
      if (s.status === "completed") throw new Error("Session has ended");
      if (new Date(s.end_time).getTime() <= Date.now()) throw new Error("Session has ended");

      // Tenancy: patient country must match session country.
      const uRows = await tx.execute(sql`SELECT country_code FROM users WHERE id = ${userId}`);
      const uArr = ((uRows as any).rows ?? uRows) as any[];
      if (uArr.length === 0) throw new Error("User not found");
      if (uArr[0].country_code !== s.country_code) throw new Error("Country mismatch");

      // Already booked?
      const dup = await tx.execute(sql`
        SELECT id, payment_status FROM group_session_participants
        WHERE session_id = ${sessionId} AND user_id = ${userId}
      `);
      const dupArr = ((dup as any).rows ?? dup) as any[];
      if (dupArr.length > 0 && dupArr[0].payment_status !== "refunded") {
        throw new Error("Already booked");
      }

      // Capacity check — count seats currently taken (paid or pending).
      const cnt = await tx.execute(sql`
        SELECT COUNT(*)::int AS c FROM group_session_participants
        WHERE session_id = ${sessionId} AND payment_status IN ('pending','completed')
      `);
      const cntArr = ((cnt as any).rows ?? cnt) as any[];
      const taken = Number(cntArr[0]?.c) || 0;
      if (taken >= Number(s.max_participants)) throw new Error("Session is full");

      const priceNative = Number(s.price_per_user);
      // P-FINAL: price_per_user is stored in the session's native currency (HUF/IRR/USD).
      // Wallets are always denominated in USD — convert before comparing or debiting.
      const _gsRates = await getRates();
      const _gsCurrency = countryCurrency(s.country_code as CountryCode);
      const _gsRateVal = _gsRates[_gsCurrency] ?? 1;
      const price = _gsCurrency === "USD"
        ? priceNative
        : parseFloat((priceNative / _gsRateVal).toFixed(2)); // USD equivalent

      // Debit wallet for paid sessions. We use a deterministic idempotency
      // key so a retried booking can never double-charge.
      if (priceNative > 0) {
        const idem = `group_book_${sessionId}_${userId}`;
        // Idempotency short-circuit — if a previous successful debit exists,
        // skip charging again (the participant row will still be upserted).
        const prior = await tx.execute(sql`SELECT id FROM wallet_transactions WHERE idempotency_key = ${idem}`);
        const priorArr = ((prior as any).rows ?? prior) as any[];
        if (priorArr.length === 0) {
          // Get-or-create wallet, then row-lock it.
          await tx.execute(sql`INSERT INTO wallets (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`);
          const wRows = await tx.execute(sql`SELECT id, balance, currency, is_frozen FROM wallets WHERE user_id = ${userId} FOR UPDATE`);
          const wArr = ((wRows as any).rows ?? wRows) as any[];
          if (wArr.length === 0) throw new Error("Wallet missing");
          const w = wArr[0];
          if (w.is_frozen) throw new Error("Wallet is frozen");
          const balanceCents = Math.round(Number(w.balance) * 100);
          const priceCents = Math.round(price * 100); // USD cents
          if (balanceCents < priceCents) throw new Error("Insufficient wallet balance");
          const nextCents = balanceCents - priceCents;
          const nextBal = (nextCents / 100).toFixed(2);
          await tx.execute(sql`UPDATE wallets SET balance = ${nextBal}, updated_at = NOW() WHERE id = ${w.id}`);
          await tx.execute(sql`
            INSERT INTO wallet_transactions
              (wallet_id, user_id, type, status, amount, balance_after, currency, description, reference_type, reference_id, idempotency_key)
            VALUES
              (${w.id}, ${userId}, 'debit', 'completed', ${(-price).toFixed(2)}, ${nextBal}, ${w.currency}, ${'Group session booking: ' + sessionId}, 'group_session', ${sessionId}, ${idem})
          `);
        }
      }

      // Insert or revive the participant row.
      // amount_paid is stored in USD (matches wallet denomination) so refunds can
      // directly credit the wallet without a second currency conversion.
      let participant: GroupSessionParticipant;
      if (dupArr.length > 0) {
        const upd = await tx.execute(sql`
          UPDATE group_session_participants
          SET payment_status = 'completed', attendance_status = 'registered',
              amount_paid = ${price}, payment_method = 'wallet', refunded_at = NULL,
              country_code = ${s.country_code}::country_code
          WHERE id = ${dupArr[0].id}
          RETURNING *
        `);
        participant = (((upd as any).rows ?? upd) as any[])[0];
      } else {
        const ins = await tx.execute(sql`
          INSERT INTO group_session_participants
            (session_id, user_id, payment_status, attendance_status, amount_paid, payment_method, country_code)
          VALUES (${sessionId}, ${userId}, 'completed', 'registered', ${price}, 'wallet', ${s.country_code}::country_code)
          RETURNING *
        `);
        participant = (((ins as any).rows ?? ins) as any[])[0];
      }

      return { participant, sessionStatus: s.status as string };
    });
  }

  // Cancels a group session and refunds every paid participant via wallet
  // using a deterministic idempotency key so a double-cancel is a no-op.
  async cancelGroupSessionAndRefund(sessionId: string, performedBy: string) {
    return db.transaction(async (tx) => {
      const sRows = await tx.execute(sql`
        SELECT id, status FROM group_sessions WHERE id = ${sessionId} FOR UPDATE
      `);
      const sArr = ((sRows as any).rows ?? sRows) as any[];
      if (sArr.length === 0) throw new Error("Session not found");
      if (sArr[0].status === "cancelled") return { refundedCount: 0, refundedTotal: 0 };
      if (sArr[0].status === "completed") throw new Error("Session already completed");

      const pRows = await tx.execute(sql`
        SELECT id, user_id, amount_paid FROM group_session_participants
        WHERE session_id = ${sessionId} AND payment_status = 'completed'
      `);
      const participants = ((pRows as any).rows ?? pRows) as any[];

      let refundedTotal = 0;
      for (const p of participants) {
        const amt = Number(p.amount_paid);
        if (amt > 0) {
          const idem = `group_refund_${sessionId}_${p.user_id}`;
          const prior = await tx.execute(sql`SELECT id FROM wallet_transactions WHERE idempotency_key = ${idem}`);
          const priorArr = ((prior as any).rows ?? prior) as any[];
          if (priorArr.length === 0) {
            await tx.execute(sql`INSERT INTO wallets (user_id) VALUES (${p.user_id}) ON CONFLICT (user_id) DO NOTHING`);
            const wRows = await tx.execute(sql`SELECT id, balance, currency FROM wallets WHERE user_id = ${p.user_id} FOR UPDATE`);
            const w = (((wRows as any).rows ?? wRows) as any[])[0];
            const nextCents = Math.round(Number(w.balance) * 100) + Math.round(amt * 100);
            const nextBal = (nextCents / 100).toFixed(2);
            await tx.execute(sql`UPDATE wallets SET balance = ${nextBal}, updated_at = NOW() WHERE id = ${w.id}`);
            await tx.execute(sql`
              INSERT INTO wallet_transactions
                (wallet_id, user_id, type, status, amount, balance_after, currency, description, reference_type, reference_id, idempotency_key, created_by_id)
              VALUES
                (${w.id}, ${p.user_id}, 'refund', 'completed', ${amt.toFixed(2)}, ${nextBal}, ${w.currency}, ${'Group session cancelled: ' + sessionId}, 'group_session', ${sessionId}, ${idem}, ${performedBy})
            `);
          }
          refundedTotal += amt;
        }
        await tx.execute(sql`
          UPDATE group_session_participants
          SET payment_status = 'refunded', refunded_at = NOW()
          WHERE id = ${p.id}
        `);
      }

      await tx.execute(sql`
        UPDATE group_sessions SET status = 'cancelled', updated_at = NOW() WHERE id = ${sessionId}
      `);

      return { refundedCount: participants.length, refundedTotal };
    });
  }

  async markGroupParticipantAttendance(participantId: string, status: "registered" | "joined" | "no_show", providerUserId: string) {
    // Authorization: the participant's session must belong to a provider
    // owned by `providerUserId`. We do this in the SQL filter so a wrong
    // provider can't update other providers' attendance even by guessing
    // the participant id.
    const result = await db.execute(sql`
      UPDATE group_session_participants
      SET attendance_status = ${status}::group_attendance,
          joined_at = CASE WHEN ${status} = 'joined' THEN COALESCE(joined_at, NOW()) ELSE joined_at END
      WHERE id = ${participantId}
        AND session_id IN (
          SELECT gs.id FROM group_sessions gs
          JOIN providers p ON p.id = gs.provider_id
          WHERE p.user_id = ${providerUserId}
        )
      RETURNING *
    `);
    const rows = ((result as any).rows ?? result) as any[];
    if (rows.length === 0) throw new Error("Participant not found or not authorized");
    return rows[0] as GroupSessionParticipant;
  }

  // Patient-side join: only allowed if paid + within the join window
  // (15 min before start until 30 min after end). Records `joined_at`.
  async recordGroupSessionJoin(sessionId: string, userId: string): Promise<GroupSessionParticipant | undefined> {
    const result = await db.execute(sql`
      UPDATE group_session_participants p
      SET attendance_status = 'joined', joined_at = COALESCE(p.joined_at, NOW())
      FROM group_sessions s
      WHERE p.session_id = s.id
        AND p.session_id = ${sessionId}
        AND p.user_id = ${userId}
        AND p.payment_status = 'completed'
        AND s.status IN ('scheduled','live')
        AND NOW() BETWEEN s.start_time - INTERVAL '15 minutes' AND s.end_time + INTERVAL '30 minutes'
      RETURNING p.*
    `);
    const rows = ((result as any).rows ?? result) as any[];
    return rows[0];
  }

  async listMyGroupBookings(userId: string) {
    const result = await db.execute(sql`
      SELECT p.*, s.id AS s_id, s.title AS s_title, s.start_time AS s_start, s.end_time AS s_end,
             s.meeting_link AS s_link, s.status AS s_status, s.price_per_user AS s_price,
             s.provider_id AS s_provider, s.country_code AS s_country, s.max_participants AS s_max
      FROM group_session_participants p
      JOIN group_sessions s ON s.id = p.session_id
      WHERE p.user_id = ${userId}
      ORDER BY s.start_time DESC
    `);
    const rows = ((result as any).rows ?? result) as any[];
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      userId: r.user_id,
      paymentStatus: r.payment_status,
      attendanceStatus: r.attendance_status,
      amountPaid: r.amount_paid,
      paymentMethod: r.payment_method,
      joinedAt: r.joined_at ? new Date(r.joined_at) : null,
      refundedAt: r.refunded_at ? new Date(r.refunded_at) : null,
      countryCode: r.country_code,
      createdAt: r.created_at ? new Date(r.created_at) : null,
      session: {
        id: r.s_id,
        providerId: r.s_provider,
        serviceId: null,
        title: r.s_title,
        description: null,
        startTime: new Date(r.s_start),
        endTime: new Date(r.s_end),
        maxParticipants: r.s_max,
        pricePerUser: r.s_price,
        status: r.s_status,
        meetingLink: r.s_link,
        countryCode: r.s_country,
        createdAt: null,
        updatedAt: null,
      } as GroupSession,
    }));
  }

  // Auto-status: scheduled→live when now ≥ start_time, live→completed when
  // now > end_time. Idempotent. Called from the existing reminder cron.
  async tickGroupSessionStatuses() {
    const liveRes = await db.execute(sql`
      UPDATE group_sessions SET status = 'live', updated_at = NOW()
      WHERE status = 'scheduled' AND NOW() >= start_time AND NOW() <= end_time
    `);
    const doneRes = await db.execute(sql`
      UPDATE group_sessions SET status = 'completed', updated_at = NOW()
      WHERE status IN ('scheduled','live') AND NOW() > end_time
    `);
    return {
      toLive: (liveRes as any).rowCount ?? 0,
      toCompleted: (doneRes as any).rowCount ?? 0,
    };
  }

  // Support Tickets
  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [t] = await db.insert(supportTickets).values(data).returning();
    return t;
  }

  async getSupportTicket(id: string): Promise<SupportTicket | undefined> {
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return t || undefined;
  }

  async getAllSupportTickets(): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  }

  async updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const [t] = await db.update(supportTickets).set(data).where(eq(supportTickets.id, id)).returning();
    return t || undefined;
  }

  async deleteSupportTicket(id: string): Promise<void> {
    await db.delete(supportTickets).where(eq(supportTickets.id, id));
  }

  // Ticket Messages
  async createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
    const [m] = await db.insert(ticketMessages).values(data).returning();
    return m;
  }

  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    return db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticketId)).orderBy(asc(ticketMessages.createdAt));
  }

  // FAQs
  async createFaq(data: InsertFaq): Promise<Faq> {
    const [f] = await db.insert(faqs).values(data).returning();
    return f;
  }

  async getFaq(id: string): Promise<Faq | undefined> {
    const [f] = await db.select().from(faqs).where(eq(faqs.id, id));
    return f || undefined;
  }

  async getAllFaqs(): Promise<Faq[]> {
    return db.select().from(faqs).orderBy(asc(faqs.sortOrder));
  }

  async updateFaq(id: string, data: Partial<Faq>): Promise<Faq | undefined> {
    const [f] = await db.update(faqs).set(data).where(eq(faqs.id, id)).returning();
    return f || undefined;
  }

  async deleteFaq(id: string): Promise<void> {
    await db.delete(faqs).where(eq(faqs.id, id));
  }

  // Announcements
  async createAnnouncement(data: InsertAnnouncement): Promise<Announcement> {
    const [a] = await db.insert(announcements).values(data).returning();
    return a;
  }

  async getAnnouncement(id: string): Promise<Announcement | undefined> {
    const [a] = await db.select().from(announcements).where(eq(announcements.id, id));
    return a || undefined;
  }

  async getAllAnnouncements(opts?: { countryCode?: string }): Promise<Announcement[]> {
    const conditions: any[] = [];
    if (opts?.countryCode) conditions.push(eq((announcements as any).countryCode, opts.countryCode));
    return db.select().from(announcements)
      .where(conditions.length ? conditions[0] : undefined)
      .orderBy(desc(announcements.createdAt));
  }

  async getActiveAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements).where(eq(announcements.isActive, true)).orderBy(desc(announcements.createdAt));
  }

  async updateAnnouncement(id: string, data: Partial<Announcement>): Promise<Announcement | undefined> {
    const [a] = await db.update(announcements).set(data).where(eq(announcements.id, id)).returning();
    return a || undefined;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  // Email Templates
  async createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const [t] = await db.insert(emailTemplates).values(data).returning();
    return t;
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate | undefined> {
    const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return t || undefined;
  }

  async getEmailTemplateByName(name: string): Promise<EmailTemplate | undefined> {
    const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
    return t || undefined;
  }

  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    return db.select().from(emailTemplates).orderBy(asc(emailTemplates.name));
  }

  async updateEmailTemplate(id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
    const [t] = await db.update(emailTemplates).set(data).where(eq(emailTemplates.id, id)).returning();
    return t || undefined;
  }

  async deleteEmailTemplate(id: string): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  // Service Requests (provider → admin approval workflow)
  async createServiceRequest(data: InsertServiceRequest): Promise<ServiceRequest> {
    const [r] = await db.insert(serviceRequests).values(data).returning();
    return r;
  }

  async getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const [r] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    return r || undefined;
  }

  async listServiceRequestsByProvider(providerId: string): Promise<ServiceRequest[]> {
    return db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.providerId, providerId))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async listAllServiceRequests(): Promise<ServiceRequestWithProvider[]> {
    const rows = await db
      .select()
      .from(serviceRequests)
      .leftJoin(providers, eq(serviceRequests.providerId, providers.id))
      .leftJoin(users, eq(providers.userId, users.id))
      .orderBy(desc(serviceRequests.createdAt));
    return rows
      .filter((r) => r.providers && r.users)
      .map((r) => ({
        ...(r.service_requests as ServiceRequest),
        provider: { ...(r.providers as Provider), user: r.users as User },
      }));
  }

  async findPendingServiceRequest(providerId: string, serviceName: string): Promise<ServiceRequest | undefined> {
    const [r] = await db
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.providerId, providerId),
          eq(serviceRequests.serviceName, serviceName),
          eq(serviceRequests.status, "pending_review"),
        ),
      );
    return r || undefined;
  }

  async updateServiceRequest(id: string, data: Partial<ServiceRequest>): Promise<ServiceRequest | undefined> {
    const [r] = await db
      .update(serviceRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(serviceRequests.id, id))
      .returning();
    return r || undefined;
  }

  // Notifications
  async createNotification(data: InsertNotification): Promise<Notification> {
    const [n] = await db.insert(notificationQueue).values(data).returning();
    return n;
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [n] = await db.select().from(notificationQueue).where(eq(notificationQueue.id, id));
    return n || undefined;
  }

  async getAllNotifications(): Promise<Notification[]> {
    return db.select().from(notificationQueue).orderBy(desc(notificationQueue.createdAt));
  }

  async getPendingNotifications(): Promise<Notification[]> {
    return db.select().from(notificationQueue).where(eq(notificationQueue.status, "pending")).orderBy(asc(notificationQueue.createdAt));
  }

  async updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined> {
    const [n] = await db.update(notificationQueue).set(data).where(eq(notificationQueue.id, id)).returning();
    return n || undefined;
  }

  // Platform Settings
  async createPlatformSetting(data: InsertPlatformSetting): Promise<PlatformSetting> {
    const [s] = await db.insert(platformSettings).values(data).returning();
    return s;
  }

  async getPlatformSetting(key: string): Promise<PlatformSetting | undefined> {
    const [s] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    return s || undefined;
  }

  async getAllPlatformSettings(): Promise<PlatformSetting[]> {
    return db.select().from(platformSettings).orderBy(asc(platformSettings.key));
  }

  async getPlatformSettingsByCategory(category: string): Promise<PlatformSetting[]> {
    return db.select().from(platformSettings).where(eq(platformSettings.category, category)).orderBy(asc(platformSettings.key));
  }

  async updatePlatformSetting(key: string, value: string): Promise<PlatformSetting | undefined> {
    const [s] = await db.update(platformSettings).set({ value, updatedAt: new Date() }).where(eq(platformSettings.key, key)).returning();
    return s || undefined;
  }

  async deletePlatformSetting(id: string): Promise<void> {
    await db.delete(platformSettings).where(eq(platformSettings.id, id));
  }

  // Locations
  async createLocation(data: InsertLocation): Promise<Location> {
    const [l] = await db.insert(locations).values(data).returning();
    return l;
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [l] = await db.select().from(locations).where(eq(locations.id, id));
    return l || undefined;
  }

  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations).orderBy(asc(locations.name));
  }

  async updateLocation(id: string, data: Partial<Location>): Promise<Location | undefined> {
    const [l] = await db.update(locations).set(data).where(eq(locations.id, id)).returning();
    return l || undefined;
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  // Daily Metrics
  async createDailyMetric(data: InsertDailyMetric): Promise<DailyMetric> {
    const [m] = await db.insert(dailyMetrics).values(data).returning();
    return m;
  }

  async getDailyMetricByDate(date: string): Promise<DailyMetric | undefined> {
    const [m] = await db.select().from(dailyMetrics).where(eq(dailyMetrics.date, date));
    return m || undefined;
  }

  async getDailyMetrics(startDate: string, endDate: string): Promise<DailyMetric[]> {
    return db.select().from(dailyMetrics).orderBy(asc(dailyMetrics.date));
  }

  async updateDailyMetric(id: string, data: Partial<DailyMetric>): Promise<DailyMetric | undefined> {
    const [m] = await db.update(dailyMetrics).set(data).where(eq(dailyMetrics.id, id)).returning();
    return m || undefined;
  }

  // User Notifications
  async getUserNotifications(userId: string): Promise<UserNotification[]> {
    return db.select().from(userNotifications).where(eq(userNotifications.userId, userId)).orderBy(desc(userNotifications.createdAt));
  }

  async createUserNotification(data: InsertUserNotification): Promise<UserNotification> {
    const [n] = await db.insert(userNotifications).values(data).returning();
    return n;
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    // Scope the UPDATE to both id AND the authenticated user's id so the
    // read-state is always committed to the correct row. Without the user_id
    // guard the UPDATE can silently no-op if the id doesn't belong to this
    // user (Zombie Notification Bug fix).
    await db
      .update(userNotifications)
      .set({ isRead: true })
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)));
  }

  // Messaging (New)
  async getChatConversations(userId: string, role: string): Promise<any[]> {
    const result = await db
      .select()
      .from(chatConversations)
      .where(or(eq(chatConversations.patientId, userId), eq(chatConversations.providerId, userId)))
      .orderBy(desc(chatConversations.lastMessageAt));
    return result;
  }

  async getChatMessages(conversationId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(asc(chatMessages.createdAt));
  }

  async createChatMessage(data: InsertChatMessage): Promise<ChatMessage> {
    const [m] = await db.insert(chatMessages).values(data).returning();
    await db.update(chatConversations).set({ lastMessage: data.content, lastMessageAt: new Date() }).where(eq(chatConversations.id, data.conversationId));
    return m;
  }

  async getOrCreateConversation(patientId: string, providerId: string): Promise<ChatConversation> {
    const [existing] = await db.select().from(chatConversations).where(and(eq(chatConversations.patientId, patientId), eq(chatConversations.providerId, providerId)));
    if (existing) return existing;
    const [created] = await db.insert(chatConversations).values({ patientId, providerId }).returning();
    return created;
  }

  // Sub-services
  async getAllSubServices(): Promise<SubService[]> {
    const { rows } = await pool.query(
      `SELECT * FROM sub_services WHERE deleted_at IS NULL AND is_active = true ORDER BY name`
    );
    return rows.map(normalizeSubServiceRow) as unknown as SubService[];
  }

  async getSubServicesByCategory(category: string): Promise<SubService[]> {
    // category is a PG enum — cast both sides to text to avoid type-mismatch.
    const { rows } = await pool.query(
      `SELECT * FROM sub_services
       WHERE category::text = $1::text
         AND deleted_at IS NULL AND is_active = true
       ORDER BY name`,
      [category]
    );
    return rows.map(normalizeSubServiceRow) as unknown as SubService[];
  }

  async getSubServicesByProviderCategory(providerCategory: string): Promise<SubService[]> {
    const { rows } = await pool.query(
      `SELECT * FROM sub_services
       WHERE category::text = $1::text
         AND deleted_at IS NULL AND is_active = true
       ORDER BY name`,
      [providerCategory]
    );
    return rows.map(normalizeSubServiceRow) as unknown as SubService[];
  }

  async getSubService(id: string): Promise<SubService | undefined> {
    const [s] = await db.select().from(subServices).where(eq(subServices.id, id));
    return s || undefined;
  }

  async createSubService(data: InsertSubService): Promise<SubService> {
    const [s] = await db.insert(subServices).values(data).returning();
    return s;
  }

  async updateSubService(id: string, data: Partial<SubService>): Promise<SubService | undefined> {
    const [s] = await db.update(subServices).set(data).where(eq(subServices.id, id)).returning();
    return s || undefined;
  }

  async deleteSubService(id: string, opts?: { force?: boolean }): Promise<{ ok: true; soft: boolean } | { ok: false; reason: string; serviceCount: number; appointmentCount: number }> {
    const inUseSvcs = await db.select({ id: services.id }).from(services).where(eq(services.subServiceId, id));
    const svcIds = inUseSvcs.map(s => s.id);
    let apptCount = 0;
    if (svcIds.length) {
      const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(appointments).where(inArray(appointments.serviceId, svcIds));
      apptCount = Number(r?.c || 0);
    }
    if ((svcIds.length > 0 || apptCount > 0) && !opts?.force) {
      await db.update(subServices).set({ isActive: false, deletedAt: new Date() } as any).where(eq(subServices.id, id));
      return { ok: true, soft: true };
    }
    try {
      await db.delete(subServices).where(eq(subServices.id, id));
      return { ok: true, soft: false };
    } catch {
      await db.update(subServices).set({ isActive: false, deletedAt: new Date() } as any).where(eq(subServices.id, id));
      return { ok: true, soft: true };
    }
  }

  async restoreSubService(id: string): Promise<SubService | undefined> {
    const [s] = await db.update(subServices).set({ isActive: true, deletedAt: null } as any).where(eq(subServices.id, id)).returning();
    return s || undefined;
  }

  // Categories
  async getAllCategories(includeInactive = false): Promise<Category[]> {
    const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
    return includeInactive ? rows : rows.filter((c: any) => c.isActive !== false && !c.deletedAt);
  }

  async getCategory(id: string): Promise<Category | undefined> {
    const [c] = await db.select().from(categories).where(eq(categories.id, id));
    return c || undefined;
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [c] = await db.select().from(categories).where(
      and(eq(categories.slug, slug), isNull(categories.deletedAt))
    );
    return c || undefined;
  }

  async createCategory(data: InsertCategory): Promise<Category> {
    const [c] = await db.insert(categories).values(data).returning();
    return c;
  }

  async updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined> {
    const [c] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
    return c || undefined;
  }

  async deleteCategory(id: string, opts?: { force?: boolean }): Promise<{ ok: true; soft: boolean } | { ok: false; reason: string }> {
    const cat = await this.getCategory(id);
    if (!cat) return { ok: true, soft: false };
    const inUseSubs = await db.select({ id: subServices.id }).from(subServices).where(eq(subServices.category, cat.slug as any));
    const PROTECTED_TYPES = ["physician","mental_health","nutrition","rehabilitation","dental","alternative_medicine","nursing"];
    if ((inUseSubs.length > 0 || PROTECTED_TYPES.includes(cat.slug)) && !opts?.force) {
      await db.update(categories).set({ isActive: false, deletedAt: new Date() } as any).where(eq(categories.id, id));
      return { ok: true, soft: true };
    }
    try {
      await db.delete(categories).where(eq(categories.id, id));
      return { ok: true, soft: false };
    } catch {
      await db.update(categories).set({ isActive: false, deletedAt: new Date() } as any).where(eq(categories.id, id));
      return { ok: true, soft: true };
    }
  }

  async restoreCategory(id: string): Promise<Category | undefined> {
    const [c] = await db.update(categories).set({ isActive: true, deletedAt: null } as any).where(eq(categories.id, id)).returning();
    return c || undefined;
  }

  async ensureDefaultCategories(): Promise<void> {
    const existing = await db.select().from(categories).where(isNull(categories.deletedAt));
    if (existing.length > 0) return;
    const defaults: InsertCategory[] = [
      { slug: "physician",            name: "Medical Doctors & Specialists",               sortOrder: 1, isActive: true } as any,
      { slug: "mental_health",        name: "Mental Health & Behavioral Professionals",    sortOrder: 2, isActive: true } as any,
      { slug: "nutrition",            name: "Nutrition, Dietetics & Metabolic Wellness",   sortOrder: 3, isActive: true } as any,
      { slug: "rehabilitation",       name: "Physical Therapy & Rehabilitation",            sortOrder: 4, isActive: true } as any,
      { slug: "dental",               name: "Dental Care Professionals",                   sortOrder: 5, isActive: true } as any,
      { slug: "alternative_medicine", name: "Alternative, Holistic & Integrative Medicine",sortOrder: 6, isActive: true } as any,
      { slug: "nursing",              name: "Maternal, Nursing & Allied Health Support",   sortOrder: 7, isActive: true } as any,
    ];
    await db.insert(categories).values(defaults).onConflictDoNothing();
  }

  // Catalog Services (middle tier: Category → CatalogService → SubService)
  async getAllCatalogServices(includeInactive = false): Promise<CatalogService[]> {
    const rows = await db.select().from(catalogServices)
      .where(isNull(catalogServices.deletedAt))
      .orderBy(asc(catalogServices.sortOrder), asc(catalogServices.name));
    return includeInactive ? rows : rows.filter((r: any) => r.isActive !== false);
  }

  async getCatalogServicesByCategory(categoryId: string): Promise<CatalogService[]> {
    return db.select().from(catalogServices)
      .where(and(eq(catalogServices.categoryId, categoryId), isNull(catalogServices.deletedAt), eq(catalogServices.isActive, true)))
      .orderBy(asc(catalogServices.sortOrder), asc(catalogServices.name));
  }

  async getCatalogService(id: string): Promise<CatalogService | undefined> {
    const [r] = await db.select().from(catalogServices).where(eq(catalogServices.id, id));
    return r || undefined;
  }

  async createCatalogService(data: InsertCatalogService): Promise<CatalogService> {
    const [r] = await db.insert(catalogServices).values(data as any).returning();
    return r;
  }

  async updateCatalogService(id: string, data: Partial<CatalogService>): Promise<CatalogService | undefined> {
    const [r] = await db.update(catalogServices).set(data as any).where(eq(catalogServices.id, id)).returning();
    return r || undefined;
  }

  async deleteCatalogService(id: string): Promise<void> {
    try {
      await db.delete(catalogServices).where(eq(catalogServices.id, id));
    } catch {
      await db.update(catalogServices).set({ isActive: false, deletedAt: new Date() } as any).where(eq(catalogServices.id, id));
    }
  }

  // Medical Data
  async getPrescription(id: string): Promise<Prescription | undefined> {
    const [p] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    return p || undefined;
  }

  async getPrescriptionsByPatient(patientId: string): Promise<Prescription[]> {
    return db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.issuedAt));
  }

  async createPrescription(data: InsertPrescription): Promise<Prescription> {
    const [p] = await db.insert(prescriptions).values(data).returning();
    return p;
  }

  async getMedicalHistoryByPatient(patientId: string): Promise<MedicalHistory[]> {
    return db.select().from(medicalHistory).where(eq(medicalHistory.patientId, patientId)).orderBy(desc(medicalHistory.date));
  }

  async createMedicalHistory(data: InsertMedicalHistory): Promise<MedicalHistory> {
    const [h] = await db.insert(medicalHistory).values(data).returning();
    return h;
  }

  async getHealthMetricsByPatient(patientId: string, limit = 200): Promise<HealthMetric[]> {
    return db
      .select()
      .from(healthMetrics)
      .where(eq(healthMetrics.patientId, patientId))
      .orderBy(desc(healthMetrics.measuredAt))
      .limit(limit);
  }

  async createHealthMetric(data: InsertHealthMetric): Promise<HealthMetric> {
    const [m] = await db.insert(healthMetrics).values(data).returning();
    return m;
  }

  async deleteHealthMetric(id: string, patientId: string): Promise<boolean> {
    const result = await db
      .delete(healthMetrics)
      .where(and(eq(healthMetrics.id, id), eq(healthMetrics.patientId, patientId)))
      .returning();
    return result.length > 0;
  }

  // Family Members
  async getFamilyMembersByUser(primaryUserId: string): Promise<FamilyMember[]> {
    return db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.primaryUserId, primaryUserId))
      .orderBy(desc(familyMembers.createdAt));
  }

  async getFamilyMember(id: string): Promise<FamilyMember | undefined> {
    const [m] = await db.select().from(familyMembers).where(eq(familyMembers.id, id));
    return m || undefined;
  }

  async createFamilyMember(primaryUserId: string, data: InsertFamilyMember): Promise<FamilyMember> {
    const [m] = await db
      .insert(familyMembers)
      .values({ ...data, primaryUserId })
      .returning();
    return m;
  }

  async updateFamilyMember(
    id: string,
    primaryUserId: string,
    data: Partial<InsertFamilyMember>,
  ): Promise<FamilyMember | undefined> {
    const [m] = await db
      .update(familyMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(familyMembers.id, id), eq(familyMembers.primaryUserId, primaryUserId)))
      .returning();
    return m || undefined;
  }

  async deleteFamilyMember(id: string, primaryUserId: string): Promise<boolean> {
    const result = await db
      .delete(familyMembers)
      .where(and(eq(familyMembers.id, id), eq(familyMembers.primaryUserId, primaryUserId)))
      .returning();
    return result.length > 0;
  }

  // Medications
  async getMedicationsByUser(userId: string): Promise<Medication[]> {
    return db
      .select()
      .from(medications)
      .where(eq(medications.userId, userId))
      .orderBy(desc(medications.createdAt));
  }

  async getMedication(id: string): Promise<Medication | undefined> {
    const [m] = await db.select().from(medications).where(eq(medications.id, id));
    return m;
  }

  async createMedication(userId: string, data: InsertMedication): Promise<Medication> {
    const [result] = await db
      .insert(medications)
      .values({ ...data, userId } as any)
      .returning();
    return result;
  }

  async updateMedication(
    id: string,
    userId: string,
    data: Partial<InsertMedication>,
  ): Promise<Medication | undefined> {
    const [updated] = await db
      .update(medications)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(medications.id, id), eq(medications.userId, userId)))
      .returning();
    return updated;
  }

  async deleteMedication(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(medications)
      .where(and(eq(medications.id, id), eq(medications.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getMedicationLogs(
    userId: string,
    opts?: { medicationId?: string; from?: string; to?: string },
  ): Promise<MedicationLog[]> {
    const conds: any[] = [eq(medicationLogs.userId, userId)];
    if (opts?.medicationId) conds.push(eq(medicationLogs.medicationId, opts.medicationId));
    if (opts?.from) conds.push(gte(medicationLogs.scheduledDate, opts.from));
    if (opts?.to) conds.push(lte(medicationLogs.scheduledDate, opts.to));
    return db
      .select()
      .from(medicationLogs)
      .where(and(...conds))
      .orderBy(desc(medicationLogs.takenAt));
  }

  async logMedicationDose(userId: string, data: InsertMedicationLog): Promise<MedicationLog> {
    const [result] = await db
      .insert(medicationLogs)
      .values({ ...data, userId } as any)
      .returning();
    return result;
  }

  async deleteMedicationLog(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(medicationLogs)
      .where(and(eq(medicationLogs.id, id), eq(medicationLogs.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // Tax Settings
  async getAllTaxSettings(): Promise<TaxSetting[]> {
    try {
      return await db.select().from(taxSettings).orderBy(asc(taxSettings.country));
    } catch (error) {
      console.error("Storage: Error fetching tax settings:", error);
      return [];
    }
  }

  async getTaxSettingByCountry(country: string): Promise<TaxSetting | undefined> {
    const currentYear = new Date().getFullYear();
    // Prefer the active setting for the current year; fall back to any active setting
    const [currentYearSetting] = await db
      .select()
      .from(taxSettings)
      .where(and(eq(taxSettings.country, country), eq(taxSettings.isActive, true), eq(taxSettings.year, currentYear)));
    if (currentYearSetting) return currentYearSetting;
    const [fallback] = await db
      .select()
      .from(taxSettings)
      .where(and(eq(taxSettings.country, country), eq(taxSettings.isActive, true)))
      .orderBy(desc(taxSettings.year));
    return fallback || undefined;
  }

  async createTaxSetting(data: InsertTaxSetting): Promise<TaxSetting> {
    const [setting] = await db.insert(taxSettings).values(data).returning();
    return setting;
  }

  async updateTaxSetting(id: string, data: Partial<TaxSetting>): Promise<TaxSetting | undefined> {
    const [setting] = await db.update(taxSettings).set(data).where(eq(taxSettings.id, id)).returning();
    return setting || undefined;
  }

  async deleteTaxSetting(id: string): Promise<void> {
    await db.delete(taxSettings).where(eq(taxSettings.id, id));
  }

  // Patient Consents
  async createPatientConsent(data: InsertPatientConsent): Promise<PatientConsent> {
    const [consent] = await db.insert(patientConsents).values(data).returning();
    return consent;
  }

  async getPatientConsents(userId: string): Promise<PatientConsent[]> {
    return db.select().from(patientConsents).where(eq(patientConsents.userId, userId)).orderBy(desc(patientConsents.acceptedAt));
  }

  // Admin Analytics
  async getAnalyticsStats(countryCode?: string): Promise<{
    totalUsers: number;
    totalProviders: number;
    totalBookings: number;
    totalRevenue: string;
    pendingBookings: number;
    completedBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    recentPayments: any[];
    revenueSeries: { name: string; revenue: number; bookings: number }[];
    platformFees: string;
    providerPayouts: string;
    avgBookingValue: string;
    revenueToday: string;
    revenueThisMonth: string;
    revenueLastMonth: string;
    revenueGrowthPct: number;
    activeProviders: number;
  }> {
    // ── Single SQL path — no in-memory table scans ────────────────────────────
    // All monetary amounts in appointments.total_amount are stored in USD.
    // We use payment_status='completed' consistently for ALL revenue metrics
    // (the old code used status='completed' for platform fees and
    // paymentStatus='completed' for revenue — those two sets can differ).
    // Country filter uses the same parameterised cast pattern as the rest of admin routes.
    const cc = countryCode ?? null;
    const client = await pool.connect();

    try {
      // ── Counts ──────────────────────────────────────────────────────────────
      const userRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM users
         WHERE role = 'patient'
           AND ($1::text IS NULL OR country_code::text = $1)`,
        [cc],
      );
      const providerRes = await client.query<{ total: string; active: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status IN ('active','approved')) AS active
         FROM providers
         WHERE ($1::text IS NULL OR country_code::text = $1)`,
        [cc],
      );
      const bookingRes = await client.query<{ total: string; pending: string; completed: string; confirmed: string; cancelled: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'pending') AS pending,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
           COUNT(*) FILTER (WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider')) AS cancelled
         FROM appointments
         WHERE ($1::text IS NULL OR country_code::text = $1)`,
        [cc],
      );

      // ── Revenue (single consistent filter: payment_status='completed') ──────
      const revenueRes = await client.query<{
        total_revenue: string; platform_fees: string;
        revenue_today: string; revenue_this_month: string;
        revenue_last_month: string; paid_count: string;
      }>(
        `SELECT
           COALESCE(SUM(total_amount::numeric), 0) AS total_revenue,
           COALESCE(SUM(platform_fee_amount::numeric), 0) AS platform_fees,
           COALESCE(SUM(total_amount::numeric)
             FILTER (WHERE date::date = CURRENT_DATE), 0) AS revenue_today,
           COALESCE(SUM(total_amount::numeric)
             FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())), 0) AS revenue_this_month,
           COALESCE(SUM(total_amount::numeric)
             FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
                      AND created_at <  DATE_TRUNC('month', NOW())), 0) AS revenue_last_month,
           COUNT(*) AS paid_count
         FROM appointments
         WHERE payment_status = 'completed'
           AND ($1::text IS NULL OR country_code::text = $1)`,
        [cc],
      );

      // ── 12-month revenue + total-bookings series (gap-filled) ───────────────
      const seriesRes = await client.query<{
        yr: string; mo: string; revenue: string; bookings: string;
      }>(
        `WITH months AS (
           SELECT generate_series(
             DATE_TRUNC('month', NOW()) - INTERVAL '11 months',
             DATE_TRUNC('month', NOW()),
             INTERVAL '1 month'
           ) AS month_start
         ),
         rev AS (
           SELECT
             DATE_TRUNC('month', created_at) AS month_start,
             COALESCE(SUM(total_amount::numeric), 0) AS revenue
           FROM appointments
           WHERE payment_status = 'completed'
             AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
             AND ($1::text IS NULL OR country_code::text = $1)
           GROUP BY 1
         ),
         bk AS (
           SELECT
             DATE_TRUNC('month', created_at) AS month_start,
             COUNT(*) AS bookings
           FROM appointments
           WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
             AND ($1::text IS NULL OR country_code::text = $1)
           GROUP BY 1
         )
         SELECT
           EXTRACT(YEAR  FROM m.month_start)::text AS yr,
           EXTRACT(MONTH FROM m.month_start)::text AS mo,
           COALESCE(r.revenue,  0)::text AS revenue,
           COALESCE(b.bookings, 0)::text AS bookings
         FROM months m
         LEFT JOIN rev r ON r.month_start = m.month_start
         LEFT JOIN bk  b ON b.month_start = m.month_start
         ORDER BY m.month_start`,
        [cc],
      );

      // ── Actual paid-out amounts from payout_requests ────────────────────────
      const payoutsRes = await client.query<{ total_paid: string }>(
        `SELECT COALESCE(SUM(pr.amount::numeric), 0) AS total_paid
         FROM payout_requests pr
         JOIN providers p ON p.id = pr.provider_id
         WHERE pr.status = 'paid'
           AND ($1::text IS NULL OR p.country_code::text = $1)`,
        [cc],
      );

      // ── Recent payments (country-scoped) ────────────────────────────────────
      const paymentsRes = await client.query(
        `SELECT p.*
         FROM payments p
         JOIN appointments a ON a.id = p.appointment_id
         WHERE ($1::text IS NULL OR a.country_code::text = $1)
         ORDER BY p.created_at DESC LIMIT 10`,
        [cc],
      );

      // ── Assemble result ──────────────────────────────────────────────────────
      const rev   = revenueRes.rows[0];
      const bk    = bookingRes.rows[0];
      const pr    = providerRes.rows[0];

      const totalRevenue     = Number(rev.total_revenue);
      const platformFees     = Number(rev.platform_fees);
      const revenueThisMonth = Number(rev.revenue_this_month);
      const revenueLastMonth = Number(rev.revenue_last_month);
      const paidCount        = Number(rev.paid_count);

      const revenueGrowthPct = revenueLastMonth > 0
        ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 1000) / 10
        : (revenueThisMonth > 0 ? 100 : 0);

      const monthLabelFn = (yr: number, mo: number) => {
        const d = new Date(Date.UTC(yr, mo - 1, 1));
        return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d);
      };

      const revenueSeries = seriesRes.rows.map(r => ({
        name: monthLabelFn(Number(r.yr), Number(r.mo)),
        revenue: Math.round(Number(r.revenue) * 100) / 100,
        bookings: Number(r.bookings),
      }));

      return {
        totalUsers:        Number(userRes.rows[0].cnt),
        totalProviders:    Number(pr.total),
        totalBookings:     Number(bk.total),
        totalRevenue:      Math.round(totalRevenue * 100) / 100,
        pendingBookings:   Number(bk.pending),
        completedBookings: Number(bk.completed),
        confirmedBookings: Number(bk.confirmed),
        cancelledBookings: Number(bk.cancelled),
        recentPayments:    paymentsRes.rows,
        revenueSeries,
        platformFees:      Math.round(platformFees * 100) / 100,
        providerPayouts:   Math.round(Number(payoutsRes.rows[0]?.total_paid ?? 0) * 100) / 100,
        avgBookingValue:   Math.round((paidCount > 0 ? totalRevenue / paidCount : 0) * 100) / 100,
        revenueToday:      Math.round(Number(rev.revenue_today) * 100) / 100,
        revenueThisMonth:  Math.round(revenueThisMonth * 100) / 100,
        revenueLastMonth:  Math.round(revenueLastMonth * 100) / 100,
        revenueGrowthPct,
        activeProviders:   Number(pr.active),
      };
    } finally {
      client.release();
    }
  }

  // Invoices
  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice || undefined;
  }

  async getInvoiceByAppointment(appointmentId: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.appointmentId, appointmentId));
    return invoice || undefined;
  }

  async getInvoicesByPatient(patientId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.patientId, patientId)).orderBy(desc(invoices.issueDate));
  }

  async getInvoicesByProvider(providerId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.providerId, providerId)).orderBy(desc(invoices.issueDate));
  }

  async getAllInvoices(): Promise<Invoice[]> {
    try {
      return await db.select().from(invoices).orderBy(desc(invoices.issueDate));
    } catch (error) {
      console.error("Storage: Error fetching all invoices:", error);
      return [];
    }
  }

  async createInvoice(invoice: InsertInvoice, items: InsertInvoiceItem[]): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      const [newInvoice] = await tx.insert(invoices).values(invoice).returning();
      if (items.length > 0) {
        await tx.insert(invoiceItems).values(
          items.map(item => ({ ...item, invoiceId: newInvoice.id }))
        );
      }
      await tx.update(appointments)
        .set({ invoiceGenerated: true })
        .where(eq(appointments.id, invoice.appointmentId));
      return newInvoice;
    });
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async getPendingInvoiceAppointments(): Promise<any[]> {
    return db.select().from(appointments)
      .where(and(eq(appointments.status, "completed"), eq(appointments.invoiceGenerated, false)));
  }

}
