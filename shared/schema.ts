import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, pgEnum, serial, doublePrecision, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["patient", "provider", "admin", "global_admin", "country_admin"]);
export const countryCodeEnum = pgEnum("country_code", ["HU", "IR"]);
export const providerTypeEnum = pgEnum("provider_type", [
  // ── 7 canonical categories — the ONLY valid provider categories ──
  "physician",           // Medical Doctors & Specialists
  "mental_health",       // Mental Health & Behavioral Professionals
  "nutrition",           // Nutrition, Dietetics & Metabolic Wellness
  "rehabilitation",      // Physical Therapy & Rehabilitation
  "dental",              // Dental Care Professionals
  "alternative_medicine",// Alternative, Holistic & Integrative Medicine
  "nursing",             // Maternal, Nursing & Allied Health Support
]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  // Legacy values (kept for backward compat)
  "pending", "approved", "confirmed", "in_progress", "completed", "cancelled", "rejected", "rescheduled", "no_show",
  // New standardized values
  "cancelled_by_patient", "cancelled_by_provider", "reschedule_requested", "reschedule_proposed", "expired",
]);
export const visitTypeEnum = pgEnum("visit_type", ["online", "home", "clinic"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "refunded", "failed"]);
export const paymentMethodEnum = pgEnum("payment_method", ["card", "crypto", "cash", "bank_transfer"]);
export const groupSessionStatusEnum = pgEnum("group_session_status", ["scheduled", "live", "completed", "cancelled"]);
export const groupAttendanceEnum = pgEnum("group_attendance", ["registered", "joined", "no_show"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "in_progress", "resolved", "closed"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "medium", "high", "urgent"]);
export const auditActionEnum = pgEnum("audit_action", [
  "create", "update", "delete", "login", "logout", "view", "export",
  "approve", "reject", "refund", "role_change", "document_verify",
  "payment_action", "suspend", "verify",
]);
export const systemEventTypeEnum = pgEnum("system_event_type", [
  "api_error", "payment_failure", "notification_failure",
  "slow_endpoint", "failed_job", "auth_failure",
]);
export const systemEventSeverityEnum = pgEnum("system_event_severity", [
  "info", "warning", "error", "critical",
]);
export const appointmentActionEnum = pgEnum("appointment_action", [
  "book",
  "cancel", "reschedule", "no_show",
  "approve", "confirm", "start", "complete", "reject",
  "outcome_updated",
]);
export const contentTypeEnum = pgEnum("content_type", ["homepage", "about", "terms", "privacy", "faq", "blog"]);
export const announcementTypeEnum = pgEnum("announcement_type", ["info", "warning", "success", "error"]);
export const medicalHistoryTypeEnum = pgEnum("medical_history_type", ["diagnosis", "procedure", "lab_result", "vaccination", "allergy"]);
export const walletTxTypeEnum = pgEnum("wallet_tx_type", ["topup", "debit", "refund", "adjustment", "reversal"]);
export const walletTxStatusEnum = pgEnum("wallet_tx_status", ["pending", "completed", "failed", "reversed"]);
export const pricingTypeEnum = pgEnum("pricing_type", ["fixed", "hourly", "session"]);

// Tables
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  mobileNumber: text("mobile_number"),
  role: userRoleEnum("role").notNull().default("patient"),
  avatarUrl: text("avatar_url"),
  profileImageUrl: text("profile_image_url"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  savedLatitude: doublePrecision("saved_latitude"),
  savedLongitude: doublePrecision("saved_longitude"),
  placeId: text("place_id"),
  formattedAddress: text("formatted_address"),
  gender: text("gender"),
  dateOfBirth: timestamp("date_of_birth"),
  preferredPronouns: text("preferred_pronouns"),
  occupation: text("occupation"),
  maritalStatus: text("marital_status"),
  socialNumber: text("social_number"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelation: text("emergency_contact_relation"),
  bloodGroup: text("blood_group"),
  heightCm: integer("height_cm"),
  weightKg: decimal("weight_kg", { precision: 5, scale: 2 }),
  knownAllergies: text("known_allergies"),
  medicalConditions: text("medical_conditions"),
  currentMedications: text("current_medications"),
  pastSurgeries: text("past_surgeries"),
  insuranceProvider: text("insurance_provider"),
  insurancePolicyNumber: text("insurance_policy_number"),
  primaryCarePhysician: text("primary_care_physician"),
  googleCalendarId: text("google_calendar_id"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspensionReason: text("suspension_reason"),
  emailOtpHash: text("email_otp_hash"),
  emailOtpExpiresAt: timestamp("email_otp_expires_at"),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  lastOtpSentAt: timestamp("last_otp_sent_at"),
  mobileVerified: boolean("mobile_verified").notNull().default(false),
  mobileVerifiedAt: timestamp("mobile_verified_at"),
  mobileVerificationStatus: text("mobile_verification_status").default("unverified"),
  mobileVerificationAttempts: integer("mobile_verification_attempts").notNull().default(0),
  languagePreference: text("language_preference").default("en"),
  preferredCurrency: text("preferred_currency"),
  timezone: text("timezone"),
  // Multi-country tenancy. Determines which country's data the user can see/use.
  // For country_admin, this is the country they administer.
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  // ── Referral program ──
  // Auto-generated unique short code shared by this user to invite friends.
  // Lazily created on first GET /api/referrals/me to avoid backfill churn.
  referralCode: text("referral_code").unique(),
  // If this user signed up using someone else's referral code, the referrer's
  // user id is recorded here so we can credit them when this user qualifies
  // (currently: completes their first paid appointment).
  referredByUserId: varchar("referred_by_user_id"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_users_country_code").on(t.countryCode),
]);

export const providers = pgTable("providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  providerType: text("provider_type").notNull().default("physician"),
  professionalTitle: text("professional_title"),
  specialization: text("specialization"),
  providerCategory: text("provider_category"),
  providerSubcategory: text("provider_subcategory"),
  secondarySpecialties: text("secondary_specialties").array().notNull().default(sql`'{}'::text[]`),
  bio: text("bio"),
  yearsExperience: integer("years_experience").default(0),
  education: text("education"),
  certifications: text("certifications").array().notNull().default(sql`'{}'::text[]`),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  licenseNumber: text("license_number"),
  licensingAuthority: text("licensing_authority"),
  licenseExpiryDate: timestamp("license_expiry_date"),
  licenseDocumentUrl: text("license_document_url"),
  nationalProviderId: text("national_provider_id"),
  qualifications: text("qualifications"),
  availableDays: text("available_days").array().notNull().default(sql`'{}'::text[]`),
  availableTimeSlots: text("available_time_slots").array().notNull().default(sql`'{}'::text[]`),
  workingHoursStart: text("working_hours_start").default("09:00"),
  workingHoursEnd: text("working_hours_end").default("18:00"),
  maxPatientsPerDay: integer("max_patients_per_day"),
  primaryServiceLocation: text("primary_service_location"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  // Multi-country tenancy: which country this provider operates in.
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  serviceRadiusKm: integer("service_radius_km"),
  multipleServiceAreas: boolean("multiple_service_areas").default(false),
  googleMapsLocation: text("google_maps_location"),
  /**
   * @deprecated Provider-level fee columns. Per-service fees on the `services` table
   * (homeVisitFee, clinicFee, telemedicineFee, emergencyFee) are the canonical source
   * of truth. These columns are retained for the surge-pricing base-fee UI in
   * ProviderTimeEngine and for backward-compat reads only. Do NOT use in new
   * pricing, filtering, matching, or booking logic. Removal tracked in P9 cleanup.
   */
  consultationFee: decimal("consultation_fee", { precision: 10, scale: 2 }),
  homeVisitFee: decimal("home_visit_fee", { precision: 10, scale: 2 }),
  telemedicineFee: decimal("telemedicine_fee", { precision: 10, scale: 2 }),
  emergencyCareFee: decimal("emergency_care_fee", { precision: 10, scale: 2 }),
  insuranceAccepted: text("insurance_accepted").array().notNull().default(sql`'{}'::text[]`),
  paymentMethods: text("payment_methods").array().notNull().default(sql`'{}'::text[]`),
  backgroundCheckStatus: text("background_check_status").default("pending"),
  identityVerificationStatus: text("identity_verification_status").default("pending"),
  malpracticeCoverage: text("malpractice_coverage"),
  complianceApprovalStatus: text("compliance_approval_status").default("pending"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  preferredContactMethod: text("preferred_contact_method"),
  providerAgreementAccepted: boolean("provider_agreement_accepted").default(false),
  dataProcessingAgreementAccepted: boolean("data_processing_agreement_accepted").default(false),
  telemedicineAgreementAccepted: boolean("telemedicine_agreement_accepted").default(false),
  codeOfConductAccepted: boolean("code_of_conduct_accepted").default(false),
  affiliatedHospital: text("affiliated_hospital"),
  onCallAvailability: boolean("on_call_availability").default(false),
  emergencyContact: text("emergency_contact"),
  internalNotes: text("internal_notes"),
  isVerified: boolean("is_verified").default(false),
  isActive: boolean("is_active").default(true),
  riskScore: integer("risk_score").default(0),
  bookingsEnabled: boolean("bookings_enabled").default(true),
  // Onboarding lifecycle:
  //   draft            — provider record created but setup not yet submitted
  //   pending_approval — provider submitted setup form, awaiting admin review
  //   approved         — admin approved; provider gets full dashboard access
  //   rejected         — admin rejected; provider sees reason and can edit & resubmit
  // Legacy values still present in the DB: "pending" (≡ pending_approval), "active" (≡ approved)
  status: text("status").notNull().default("draft"),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  lastResubmittedAt: timestamp("last_resubmitted_at"),
  profileUpdatedAfterSubmission: boolean("profile_updated_after_submission").default(false),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  paymentRail: text("payment_rail"),
  routingNumber: text("routing_number"),
  ibanNumber: text("iban_number"),
  swiftCode: text("swift_code"),
  accountNumber: text("account_number"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("0"),
  totalReviews: integer("total_reviews").default(0),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  clinicAddressLine1: text("clinic_address_line1"),
  clinicAddressLine2: text("clinic_address_line2"),
  clinicPostalCode: text("clinic_postal_code"),
  clinicFormattedAddress: text("clinic_formatted_address"),
  clinicPlaceId: text("clinic_place_id"),
  homeVisitEnabled: boolean("home_visit_enabled").notNull().default(false),
  maxTravelDistanceKm: integer("max_travel_distance_km"),
  gallery: text("gallery").array().notNull().default(sql`'{}'::text[]`),
  // ── Account type & clinic / organization fields ──
  // 'individual' (single practitioner) or 'clinic' (organization with many practitioners).
  // Defaults to 'individual' so existing rows stay backwards compatible.
  accountType: text("account_type").notNull().default("individual"),
  clinicName: text("clinic_name"),
  clinicRegistrationNumber: text("clinic_registration_number"),
  contactPersonName: text("contact_person_name"),
  businessAddress: text("business_address"),
  // ── Permanent / legal address (separate from service / clinic address) ──
  // Used for invoicing, legal verification, and compliance purposes.
  // Does NOT affect booking locations, home visit radius, or search results.
  permanentAddressLine1: text("permanent_address_line1"),
  permanentAddressLine2: text("permanent_address_line2"),
  permanentCity: text("permanent_city"),
  permanentStateRegion: text("permanent_state_region"),
  permanentPostalCode: text("permanent_postal_code"),
  permanentCountry: text("permanent_country"),
  supportEmail: text("support_email"),
  supportPhone: text("support_phone"),
  // Where services are delivered: online, home_visit, clinic_visit (multi-select).
  serviceModes: text("service_modes").array().notNull().default(sql`'{}'::text[]`),
  displayTitle: text("display_title"),
  // ── Professional title system ──────────────────────────────────────────────
  // primary_title: the provider's main selected title from the catalog
  // secondary_titles: additional titles from the catalog
  // display_title (above): which title is shown publicly on the provider card
  // requested_title / title_request_*: change-request flow for verified providers
  primaryTitle: text("primary_title"),
  secondaryTitles: text("secondary_titles").array().notNull().default(sql`'{}'::text[]`),
  requestedTitle: text("requested_title"),
  titleRequestReason: text("title_request_reason"),
  titleRequestStatus: text("title_request_status").default("none"),
  titleReviewedBy: varchar("title_reviewed_by"),
  titleReviewedAt: timestamp("title_reviewed_at"),
  // Cancellation policy: fee is charged when patient cancels within this many hours.
  cancellationPolicyHours: integer("cancellation_policy_hours").default(0),
  cancellationFeePercent: decimal("cancellation_fee_percent", { precision: 5, scale: 2 }).default("0.00"),
  // Scheduling constraints
  minimumNoticeMinutes: integer("minimum_notice_minutes").default(60),
  maximumBookingDays: integer("maximum_booking_days").default(90),
  availabilityVersion: integer("availability_version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_providers_country_code").on(t.countryCode),
]);

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Middle tier: named service groups within a category (e.g. "Sports Rehab" under "Physiotherapy")
export const catalogServices = pgTable("catalog_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_catalog_services_category_id").on(t.categoryId),
]);

export const subServices = pgTable("sub_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: providerTypeEnum("category").notNull(),
  catalogServiceId: varchar("catalog_service_id").references(() => catalogServices.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0.00"),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).default("0.00"),
  durationMinutes: integer("duration_minutes").default(30),
  bufferBefore: integer("buffer_before").default(0),
  bufferAfter: integer("buffer_after").default(0),
  taxPercentage: decimal("tax_percentage", { precision: 5, scale: 2 }).default("0.00"),
  pricingType: pricingTypeEnum("pricing_type").default("fixed"),
  isActive: boolean("is_active").default(true),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  unq: sql`UNIQUE(${table.name}, ${table.category})`
}));

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  subServiceId: varchar("sub_service_id").references(() => subServices.id),
  name: text("name").notNull(),
  description: text("description"),
  duration: integer("duration").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  adminPriceOverride: decimal("admin_price_override", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  calendarColor: text("calendar_color").default("#10b981"),
  enableDeposit: boolean("enable_deposit").default(false),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).default("0.00"),
  timeSlotLength: integer("time_slot_length"),
  bufferBefore: integer("buffer_before").default(0),
  bufferAfter: integer("buffer_after").default(0),
  customDuration: boolean("custom_duration").default(false),
  hidePrice: boolean("hide_price").default(false),
  hideDuration: boolean("hide_duration").default(false),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  platformFeeOverride: decimal("platform_fee_override", { precision: 10, scale: 2 }),
  homeVisitFee: decimal("home_visit_fee", { precision: 10, scale: 2 }).default("0.00"),
  clinicFee: decimal("clinic_fee", { precision: 10, scale: 2 }).default("0.00"),
  telemedicineFee: decimal("telemedicine_fee", { precision: 10, scale: 2 }).default("0.00"),
  emergencyFee: decimal("emergency_fee", { precision: 10, scale: 2 }).default("0.00"),
  // PRICE-DRIFT-FIX: prices are stored in this native currency (HUF/IRR/USD).
  // Never store as USD and convert on display — that introduces exchange-rate drift.
  currency: text("currency").notNull().default("USD"),
  maxPatientsPerDay: integer("max_patients_per_day"),
  // Where the service can be delivered. 'clinic_only' restricts patients to
  // in-clinic visits, 'home_only' to home visits, 'both' allows either.
  // Telemedicine availability is governed separately by telemedicineFee > 0.
  locationMode: text("location_mode").notNull().default("both"),
  // Multi-country tenancy: inherited from provider on insert; used for fast filtering.
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  // Provider-staged edits awaiting admin approval. While
  // pendingChangeStatus = 'pending', the service is NOT bookable. On approval
  // the staged values from pendingChanges are merged into this row and these
  // fields are cleared.
  pendingChanges: jsonb("pending_changes"),
  pendingChangeStatus: text("pending_change_status"), // 'pending' | 'approved' | 'rejected' | null
  pendingChangeSubmittedBy: varchar("pending_change_submitted_by"),
  pendingChangeSubmittedAt: timestamp("pending_change_submitted_at"),
  pendingChangeReviewedBy: varchar("pending_change_reviewed_by"),
  pendingChangeReviewedAt: timestamp("pending_change_reviewed_at"),
  pendingChangeReason: text("pending_change_reason"),
  // Per-service availability hours override (JSONB).
  // Shape: { clinic?: {start: "HH:MM", end: "HH:MM"}, home?: {...}, online?: {...} }
  // When set, the slot engine uses these start/end times for that visit type on any
  // day the provider is already available (provider weekly schedule still controls which
  // days are enabled).
  availabilityHours: jsonb("availability_hours"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_services_provider_id").on(t.providerId),
  index("idx_services_is_active").on(t.isActive),
  index("idx_services_sub_service_id").on(t.subServiceId),
  index("idx_services_country_code").on(t.countryCode),
  index("idx_services_pending_change_status").on(t.pendingChangeStatus),
]);

export const servicePriceHistory = pgTable("service_price_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  homeVisitFee: decimal("home_visit_fee", { precision: 10, scale: 2 }).default("0.00"),
  clinicFee: decimal("clinic_fee", { precision: 10, scale: 2 }).default("0.00"),
  telemedicineFee: decimal("telemedicine_fee", { precision: 10, scale: 2 }).default("0.00"),
  emergencyFee: decimal("emergency_fee", { precision: 10, scale: 2 }).default("0.00"),
  platformFeeOverride: decimal("platform_fee_override", { precision: 10, scale: 2 }),
  changedBy: varchar("changed_by").references(() => users.id),
  reason: text("reason"),
  changedAt: timestamp("changed_at").defaultNow(),
});

export const servicePackages = pgTable("service_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const packageServices = pgTable("package_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("package_id").notNull().references(() => servicePackages.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").default(0),
});

export const practitioners = pgTable("practitioners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  name: text("name").notNull(),
  title: text("title"),
  specialization: text("specialization"),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  businessName: text("business_name"),
  yearsExperience: integer("years_experience").default(0),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  // Approval lifecycle: pending → approved (visible for booking) | rejected
  status: text("status").notNull().default("pending"),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const servicePractitioners = pgTable("service_practitioners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  practitionerId: varchar("practitioner_id").notNull().references(() => practitioners.id),
  fee: decimal("fee", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Per-practitioner weekly schedule.
 * One active row per practitioner. weeklySchedule is JSONB in the same format
 * as provider office_hours.weeklySchedule:
 *   { mon: { enabled: bool, start: "HH:MM", end: "HH:MM", windows?: [...] }, ... }
 * When a practitioner has a schedule it is intersected with the provider's
 * schedule to determine the bookable slots exposed to patients.
 */
export const practitionerSchedules = pgTable("practitioner_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  practitionerId: varchar("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  weeklySchedule: jsonb("weekly_schedule").notNull().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timeSlots = pgTable("time_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isBooked: boolean("is_booked").default(false),
  isBlocked: boolean("is_blocked").default(false),
}, (t) => [
  index("idx_time_slots_provider_id").on(t.providerId),
  index("idx_time_slots_date").on(t.date),
  index("idx_time_slots_provider_date").on(t.providerId, t.date),
  index("idx_time_slots_is_booked").on(t.isBooked),
]);

export const providerTimeOff = pgTable("provider_time_off", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_provider_time_off_provider_id").on(t.providerId),
  index("idx_provider_time_off_dates").on(t.providerId, t.startDate, t.endDate),
]);

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentNumber: text("appointment_number").unique(),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  familyMemberId: varchar("family_member_id"),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").references(() => services.id, { onDelete: "set null" }),
  practitionerId: varchar("practitioner_id").references(() => practitioners.id),
  timeSlotId: varchar("time_slot_id").references(() => timeSlots.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  visitType: visitTypeEnum("visit_type").notNull(),
  status: appointmentStatusEnum("status").notNull().default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  notes: text("notes"),
  privateNote: text("private_note"),
  patientAddress: text("patient_address"),
  patientLatitude: doublePrecision("patient_latitude"),
  patientLongitude: doublePrecision("patient_longitude"),
  contactPerson: text("contact_person"),
  contactMobile: text("contact_mobile"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }).default("0.00"),
  // Snapshot of the base service price at the moment of booking — never changes after creation.
  // Used for invoice display and price consistency checks.
  servicePriceSnapshot: decimal("service_price_snapshot", { precision: 10, scale: 2 }),
  promoCode: text("promo_code"),
  promoDiscount: decimal("promo_discount", { precision: 10, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  // Full pricing breakdown stored as JSONB at booking time so the confirmation
  // page never has to reconstruct it from stale live-service data.
  // Shape: { lines: [{label:string, amount:number}], total:number, base:number,
  //          platformFee:number, visitTypeFee:number, surge:number,
  //          emergencyFee:number, tax:number, discount:number,
  //          taxableSubtotal:number, sessions:number, currency:string }
  pricingBreakdown: jsonb("pricing_breakdown"),
  invoiceGenerated: boolean("invoice_generated").default(false),
  parentAppointmentId: varchar("parent_appointment_id"),
  isRescheduled: boolean("is_rescheduled").default(false),
  googleCalendarEventId: text("google_calendar_event_id"),
  // Cancellation tracking
  cancelledBy: text("cancelled_by"),      // "patient" | "provider" | "admin"
  cancelledAt: timestamp("cancelled_at"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).default("0.00"),
  refundStatus: text("refund_status"),    // "none" | "pending" | "processed"
  // Currency display snapshot: what the patient saw at booking time.
  displayCurrency: text("display_currency"),
  displayAmount: decimal("display_amount", { precision: 14, scale: 2 }),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 16, scale: 6 }),
  // ── Authoritative UTC scheduling timestamps (TZ Hardening Sprint) ──────────
  // provider_timezone: IANA timezone of the provider at booking time (e.g. "Europe/Budapest")
  // start_at / end_at: absolute UTC instants — single source of truth for all time logic
  // date / start_time / end_time remain as provider wall-clock display values only.
  providerTimezone: text("provider_timezone"),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  // Multi-country tenancy. Must match patient's, provider's, and service's countryCode.
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  // ── Clinical Workspace columns (added via runStartupMigrations) ──────────
  outcomeNote: text("outcome_note"),
  followUpRecommended: boolean("follow_up_recommended").default(false),
  referralNeeded: boolean("referral_needed").default(false),
  followUpRecommendedAt: timestamp("follow_up_recommended_at"),
  intakeResponses: jsonb("intake_responses"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_appointments_patient_id").on(t.patientId),
  index("idx_appointments_provider_id").on(t.providerId),
  index("idx_appointments_status").on(t.status),
  index("idx_appointments_date").on(t.date),
  index("idx_appointments_created_at").on(t.createdAt),
  index("idx_appointments_country_code").on(t.countryCode),
]);

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  issueDate: timestamp("issue_date").defaultNow().notNull(),
  dueDate: timestamp("due_date").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("paid"), // Assuming payment is handled before completion
  pdfUrl: text("pdf_url"),
  // Overdue-reminder bookkeeping. `lastReminderAt` is set after each successful
  // reminder dispatch; `reminderCount` is incremented in lockstep. The cron
  // honors a per-invoice cooldown so we never spam the patient.
  lastReminderAt: timestamp("last_reminder_at"),
  reminderCount: integer("reminder_count").notNull().default(0),
  // Multi-country tenancy: copied from appointment on insert.
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_invoices_country_code").on(t.countryCode),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  practitionerId: varchar("practitioner_id").references(() => practitioners.id),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

export const earningStatusEnum = pgEnum("earning_status", ["pending", "paid"]);

export const providerEarnings = pgTable("provider_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  appointmentId: varchar("appointment_id").notNull().unique().references(() => appointments.id, { onDelete: "cascade" }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
  providerEarning: decimal("provider_earning", { precision: 10, scale: 2 }).notNull(),
  status: earningStatusEnum("status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  paidByUserId: varchar("paid_by_user_id").references(() => users.id),
  payoutReference: text("payout_reference"),
  // Currency display snapshot: stored in USD, display columns show local equivalent.
  displayCurrency: text("display_currency"),
  displayAmount: decimal("display_amount", { precision: 14, scale: 2 }),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 16, scale: 6 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_provider_earnings_provider_id").on(t.providerId),
  index("idx_provider_earnings_status").on(t.status),
  index("idx_provider_earnings_created_at").on(t.createdAt),
]);

export const insertProviderEarningSchema = createInsertSchema(providerEarnings).omit({
  id: true,
  createdAt: true,
  paidAt: true,
  paidByUserId: true,
  payoutReference: true,
});
export type ProviderEarning = typeof providerEarnings.$inferSelect;
export type InsertProviderEarning = z.infer<typeof insertProviderEarningSchema>;


export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().unique().references(() => appointments.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  providerReply: text("provider_reply"),
  providerReplyAt: timestamp("provider_reply_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_reviews_patient_id").on(t.patientId),
  index("idx_reviews_provider_created").on(t.providerId, t.createdAt),
]);

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }).default("0.00"),
  currency: text("currency").default("USD"),
  paymentMethod: text("payment_method").notNull().default("card"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  stripePaymentId: text("stripe_payment_id"),
  stripeSessionId: text("stripe_session_id"),
  stripeRefundId: text("stripe_refund_id"),
  refundStatus: text("refund_status"),          // "none" | "pending" | "processed"
  // Currency display snapshot: what the patient saw at payment time.
  displayCurrency: text("display_currency"),
  displayAmount: decimal("display_amount", { precision: 14, scale: 2 }),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 16, scale: 6 }),
  // Multi-country tenancy: copied from appointment on insert.
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_payments_appointment_id").on(t.appointmentId),
  index("idx_payments_patient_id").on(t.patientId),
  index("idx_payments_status").on(t.status),
  index("idx_payments_country_code").on(t.countryCode),
]);

// ─── Group sessions (1 provider → many patients in one slot) ──────────────
// Payment is tracked on the participant row directly (not in `payments`)
// because `payments.appointment_id` is NOT NULL and there is no 1:1
// appointment for these. Refunds go through wallet using a deterministic
// idempotency key so a double-cancel never double-credits.
export const groupSessions = pgTable("group_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").references(() => services.id),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  maxParticipants: integer("max_participants").notNull(),
  pricePerUser: decimal("price_per_user", { precision: 10, scale: 2 }).notNull(),
  status: groupSessionStatusEnum("status").notNull().default("scheduled"),
  meetingLink: text("meeting_link"),
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_group_sessions_provider_id").on(t.providerId),
  index("idx_group_sessions_status").on(t.status),
  index("idx_group_sessions_start_time").on(t.startTime),
  index("idx_group_sessions_country_code").on(t.countryCode),
]);

export const groupSessionParticipants = pgTable("group_session_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => groupSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  attendanceStatus: groupAttendanceEnum("attendance_status").notNull().default("registered"),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull().default("0.00"),
  paymentMethod: text("payment_method"), // "wallet" today; "card" reserved
  joinedAt: timestamp("joined_at"),
  refundedAt: timestamp("refunded_at"),
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  uniqueIndex("uq_group_participant_session_user").on(t.sessionId, t.userId),
  index("idx_group_participants_user_id").on(t.userId),
  index("idx_group_participants_session_id").on(t.sessionId),
  index("idx_group_participants_country_code").on(t.countryCode),
]);

// ── Chat tables: three overlapping implementations ────────────────────────────
// This codebase has three chat/messaging implementations that evolved
// independently and serve overlapping roles:
//
//  1. chatConversations / chatMessages (below) — original patient↔provider
//     1:1 chat. Still referenced by some legacy routes.
//
//  2. conversations / messages (line ~673) — a second, newer schema introduced
//     for the booking-context chat feature. Uses integer PKs instead of UUIDs.
//
//  3. realtimeConversations / realtimeMessages (line ~1030) — the WebSocket-
//     backed realtime chat powered by the ws server in server/chat/ws.ts.
//     This is the active implementation used by the frontend chat UI.
//
// CAUTION: Do not remove chatConversations or conversations without first
// auditing which routes still reference them. A future cleanup task should
// consolidate to realtimeConversations only and migrate any remaining data.
// ─────────────────────────────────────────────────────────────────────────────
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => users.id),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").unique(),          // legacy plaintext — nullable; new tokens use tokenHash only
  tokenHash: text("token_hash").unique(), // SHA-256(rawToken) hex — canonical from Sprint 2 onward
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull(),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  isActive: boolean("is_active").default(true),
  applicableProviders: text("applicable_providers").array(),
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const providerPricingOverrides = pgTable("provider_pricing_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  consultationFee: decimal("consultation_fee", { precision: 10, scale: 2 }),
  homeVisitFee: decimal("home_visit_fee", { precision: 10, scale: 2 }),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const appointmentEvents = pgTable("appointment_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  action: appointmentActionEnum("action").notNull(),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  actorRole: userRoleEnum("actor_role"),
  fromStatus: appointmentStatusEnum("from_status"),
  toStatus: appointmentStatusEnum("to_status"),
  reason: text("reason"),
  reasonCode: text("reason_code"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).default("0.00"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_appt_events_appointment_id").on(t.appointmentId),
  index("idx_appt_events_action").on(t.action),
  index("idx_appt_events_created_at").on(t.createdAt),
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  payload: jsonb("payload"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const systemEvents = pgTable("system_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: systemEventTypeEnum("event_type").notNull(),
  severity: systemEventSeverityEnum("severity").notNull().default("error"),
  source: text("source").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  countryCode: text("country_code"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  assignedTo: varchar("assigned_to").references(() => users.id),
  name: text("name"),
  mobileNumber: text("mobile_number"),
  location: text("location"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: ticketStatusEnum("status").notNull().default("open"),
  priority: ticketPriorityEnum("priority").notNull().default("medium"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const faqs = pgTable("faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"),
  sortOrder: integer("sort_order").default(0),
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: announcementTypeEnum("type").notNull().default("info"),
  targetAudience: text("target_audience").default("all"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  variables: text("variables").array(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationQueue = pgTable("notification_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Provider-submitted requests for new services that admins must review.
// Lifecycle: pending_review → approved | rejected (admin can edit before approving).
export const serviceRequests = pgTable("service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  serviceName: text("service_name").notNull(),
  subServiceName: text("sub_service_name").notNull(),
  suggestedPrice: decimal("suggested_price", { precision: 10, scale: 2 }),
  description: text("description"),
  // Provider's preferred delivery mode for the service (admin can override).
  locationMode: text("location_mode").notNull().default("both"),
  status: text("status").notNull().default("pending_review"),
  adminNotes: text("admin_notes"),
  rejectionReason: text("rejection_reason"),
  createdServiceId: varchar("created_service_id").references(() => services.id, { onDelete: "set null" }),
  // Multi-country tenancy: copied from provider on insert. A country admin only
  // sees and approves requests for their own country.
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_service_requests_provider_id").on(t.providerId),
  index("idx_service_requests_status").on(t.status),
  index("idx_service_requests_country_code").on(t.countryCode),
]);

export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  category: text("category").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailyMetrics = pgTable("daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull().unique(),
  newUsers: integer("new_users").default(0),
  newProviders: integer("new_providers").default(0),
  totalAppointments: integer("total_appointments").default(0),
  completedAppointments: integer("completed_appointments").default(0),
  revenue: decimal("revenue", { precision: 12, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const prescriptions = pgTable("prescriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  duration: text("duration").notNull(),
  instructions: text("instructions"),
  attachments: text("attachments").array(),
  issuedAt: timestamp("issued_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
});

export const familyMembers = pgTable("family_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  primaryUserId: varchar("primary_user_id").notNull().references(() => users.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  relationship: text("relationship").notNull(),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  phone: text("phone"),
  email: text("email"),
  bloodType: text("blood_type"),
  allergies: text("allergies"),
  medicalConditions: text("medical_conditions"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  formattedAddress: text("formatted_address"),
  placeId: text("place_id"),
  useParentAddress: boolean("use_parent_address").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const savedAddresses = pgTable("saved_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull().default("Home"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  formattedAddress: text("formatted_address"),
  placeId: text("place_id"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSavedAddressSchema = createInsertSchema(savedAddresses).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const medications = pgTable("medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  familyMemberId: varchar("family_member_id").references(() => familyMembers.id),
  name: text("name").notNull(),
  dosage: text("dosage"),
  frequency: text("frequency"),
  timesOfDay: text("times_of_day").array(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  instructions: text("instructions"),
  prescriptionId: varchar("prescription_id").references(() => prescriptions.id),
  reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  color: text("color"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const medicationLogs = pgTable("medication_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  medicationId: varchar("medication_id").notNull().references(() => medications.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status").notNull().default("taken"),
  takenAt: timestamp("taken_at").defaultNow(),
  notes: text("notes"),
});

export const healthMetrics = pgTable("health_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  measuredAt: timestamp("measured_at").notNull().defaultNow(),
  weightKg: decimal("weight_kg", { precision: 5, scale: 2 }),
  heightCm: integer("height_cm"),
  systolic: integer("systolic"),
  diastolic: integer("diastolic"),
  heartRate: integer("heart_rate"),
  bloodGlucose: decimal("blood_glucose", { precision: 5, scale: 2 }),
  temperatureC: decimal("temperature_c", { precision: 4, scale: 2 }),
  oxygenSaturation: integer("oxygen_saturation"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const medicalHistory = pgTable("medical_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").references(() => providers.id),
  type: medicalHistoryTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  attachments: text("attachments").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userNotifications = pgTable("user_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  type: text("type"),
  data: text("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const realtimeConversations = pgTable("realtime_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  participant1Id: varchar("participant1_id").notNull().references(() => users.id),
  participant2Id: varchar("participant2_id").notNull().references(() => users.id),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  mutedBy: text("muted_by").array().notNull().default(sql`'{}'::text[]`),
  pinnedBy: text("pinned_by").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
  appointmentId: varchar("appointment_id"),
  contextType: text("context_type").notNull().default("general"),
  lockedAt: timestamp("locked_at"),
});

export const realtimeMessages = pgTable("realtime_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => realtimeConversations.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  attachmentUrl: text("attachment_url"),
  attachmentType: text("attachment_type"),
  attachmentName: text("attachment_name"),
  voiceNoteUrl: text("voice_note_url"),
  voiceDurationSec: integer("voice_duration_sec"),
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messageEditHistory = pgTable("message_edit_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => realtimeMessages.id, { onDelete: "cascade" }),
  previousContent: text("previous_content").notNull(),
  editedBy: varchar("edited_by").notNull().references(() => users.id),
  editedAt: timestamp("edited_at").defaultNow(),
});

export const taxSettings = pgTable("tax_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  country: text("country").notNull(),
  taxName: text("tax_name").notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  year: integer("year"),
});

export const patientConsents = pgTable("patient_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  familyMemberId: varchar("family_member_id").references(() => familyMembers.id, { onDelete: "cascade" }),
  consentType: text("consent_type").notNull(),
  isAccepted: boolean("is_accepted").notNull(),
  consentVersion: text("consent_version").default("1.0"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at").defaultNow(),
});

export const savedProviders = pgTable("saved_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  unq: sql`UNIQUE(${table.patientId}, ${table.providerId})`,
}));

// ──────────────── Communications additions ────────────────

// Per-user, per-event, per-channel notification preferences + quiet hours
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  // channel master toggles
  emailEnabled: boolean("email_enabled").notNull().default(true),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  // per-event toggles (JSON map { eventKey: { email, sms, whatsapp, push, inApp } })
  eventOverrides: text("event_overrides"),
  // quiet hours (24h, "HH:mm", user local). If set, suppress non-urgent notifications.
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  // email digest cadence: off | daily | weekly
  emailDigest: text("email_digest").notNull().default("off"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Web Push subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  authKey: text("auth_key").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Telemedicine video sessions per appointment
export const videoSessions = pgTable("video_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id).unique(),
  // provider key for the room (e.g. "daily.co", "twilio_video", "jitsi", "stub")
  provider: text("provider").notNull().default("stub"),
  roomUrl: text("room_url").notNull(),
  roomName: text("room_name"),
  patientToken: text("patient_token"),
  providerToken: text("provider_token"),
  expiresAt: timestamp("expires_at"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Provider office hours and auto-reply config
export const providerOfficeHours = pgTable("provider_office_hours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerUserId: varchar("provider_user_id").notNull().references(() => users.id).unique(),
  // Normalised FK to providers.id — populated via startup migration from providerUserId
  providerId: varchar("provider_id").references(() => providers.id),
  // JSON map { mon: { start, end }, tue: ... } in 24h "HH:mm"
  weeklySchedule: text("weekly_schedule"),
  timezone: text("timezone").default("UTC"),
  // toggle and templates
  autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
  autoReplyMessage: text("auto_reply_message").default(
    "Thanks for your message. I'm currently outside my office hours and will reply as soon as possible."
  ),
  emergencyContact: text("emergency_contact"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Delivery tracking across channels (admin visibility into what was sent)
export const notificationDeliveryLogs = pgTable("notification_delivery_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventKey: text("event_key").notNull(),
  channel: text("channel").notNull(), // email | sms | whatsapp | push | in_app
  status: text("status").notNull(), // queued | sent | delivered | failed | skipped
  externalId: text("external_id"),
  errorMessage: text("error_message"),
  payload: text("payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ──────────────── Internal wallet (patient credit balance) ────────────────

// One wallet per user. `balance` is always non-negative and is the source of
// truth — never compute it on the fly. Mutations always go through the
// `walletTransactions` ledger inside a DB transaction with `SELECT ... FOR
// UPDATE` to prevent double-spending and race conditions.
export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  balance: decimal("balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  currency: text("currency").notNull().default("USD"),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Append-only ledger of wallet movements. `balanceAfter` snapshots the balance
// right after this transaction was applied, so we can audit any drift.
export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: varchar("wallet_id").notNull().references(() => wallets.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: walletTxTypeEnum("type").notNull(),
  status: walletTxStatusEnum("status").notNull().default("completed"),
  // Signed amount: positive for credits (topup/refund/adjustment+),
  // negative for debits/reversals. Always recorded with two decimals.
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  description: text("description"),
  // What this entry is tied to: "appointment" | "stripe_session" | "admin" | "manual"
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  // Idempotency: any external identifier we want to dedupe on (e.g. stripe
  // checkout session id). Unique when present so retries can't double-credit.
  idempotencyKey: text("idempotency_key").unique(),
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  // USD canonical amount and rate used for conversion (amount col is always USD).
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 16, scale: 6 }),
});

// Admin broadcasts (track who fired, audience filter, summary)
export const adminBroadcasts = pgTable("admin_broadcasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  audience: text("audience").notNull().default("all"), // all | patients | providers | role:xx
  channels: text("channels").array().notNull().default(sql`'{in_app}'::text[]`), // any of email,sms,push,in_app,whatsapp
  recipientCount: integer("recipient_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Configurable refund policy rules ─────────────────────────────────────────
// One row per (scenario, countryCode) pair. Admin can tune thresholds per
// country or use countryCode="all" as the global default.
export const refundRules = pgTable("refund_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scenario: text("scenario").notNull(), // patient_cancel|provider_cancel|no_show|late_cancel|service_failure
  countryCode: text("country_code").notNull().default("all"),
  fullRefundHours: integer("full_refund_hours").notNull().default(24),
  partialRefundHours: integer("partial_refund_hours").notNull().default(6),
  partialRefundPercent: integer("partial_refund_percent").notNull().default(50), // 0–100
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  updatedById: varchar("updated_by_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type RefundRule = typeof refundRules.$inferSelect;

// ─────────────────── Referral program ───────────────────
//
// One row per (referrerUserId, referredUserId) pair, created the moment a new
// user signs up with someone else's referral code. The row is "pending" until
// the referred user qualifies (currently: completes their first paid
// appointment), at which point the cron-or-handler upgrades it to "qualified"
// and credits both wallets via `topUpWallet`. The unique index on
// referredUserId guarantees we never double-credit for the same friend.
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerUserId: varchar("referrer_user_id").notNull().references(() => users.id),
  referredUserId: varchar("referred_user_id").notNull().unique().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending | qualified
  rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  rewardCurrency: text("reward_currency").notNull().default("USD"),
  qualifyingAppointmentId: varchar("qualifying_appointment_id"),
  qualifiedAt: timestamp("qualified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Availability exceptions (provider blocks specific dates) ──
export const availabilityExceptions = pgTable("availability_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Patient notes (provider private notes per patient) ──
export const patientNotes = pgTable("patient_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  appointmentId: varchar("appointment_id"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Gift cards ──
export const giftCards = pgTable("gift_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  purchaserUserId: varchar("purchaser_user_id").references(() => users.id),
  recipientEmail: text("recipient_email"),
  initialAmount: decimal("initial_amount", { precision: 10, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  redeemedByUserId: varchar("redeemed_by_user_id").references(() => users.id),
  redeemedAt: timestamp("redeemed_at"),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Disputes ──
export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull(),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  description: text("description"),
  // open | under_review | resolved | closed
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  resolvedByUserId: varchar("resolved_by_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  refundIssued: boolean("refund_issued").default(false),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).default("0.00"),
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Slot waitlist ──
//
// Patients can join a waitlist for a fully-booked provider on a specific date
// (and optionally a preferred time window). When ANY slot for that provider
// frees up via cancellation, the cancellation handler walks the active
// waitlist in FIFO order and notifies the top N patients so the slot does
// not sit empty if the first one doesn't react. Status transitions:
//   active   → patient is still waiting
//   notified → we sent them a "slot available" alert (cooldown so we don't spam)
//   fulfilled→ patient ended up booking ANY slot for this provider+date
//   cancelled→ patient withdrew themselves
//   expired  → preferredDate has passed without a fulfillment
export const waitlistEntries = pgTable("waitlist_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  serviceId: varchar("service_id").references(() => services.id),
  // YYYY-MM-DD; null means "any date" (rarely used; kept for flexibility)
  preferredDate: text("preferred_date"),
  // HH:MM (24h) — earliest acceptable start time on the preferred date
  preferredStartTime: text("preferred_start_time"),
  // HH:MM (24h) — latest acceptable start time
  preferredEndTime: text("preferred_end_time"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  status: true,
  rewardAmount: true,
  rewardCurrency: true,
  qualifyingAppointmentId: true,
  qualifiedAt: true,
  createdAt: true,
});
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries).omit({
  id: true,
  status: true,
  notifiedAt: true,
  createdAt: true,
});
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistEntrySchema>;

export const insertAvailabilityExceptionSchema = createInsertSchema(availabilityExceptions).omit({ id: true, createdAt: true });
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;
export type InsertAvailabilityException = z.infer<typeof insertAvailabilityExceptionSchema>;

export const insertPatientNoteSchema = createInsertSchema(patientNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type PatientNote = typeof patientNotes.$inferSelect;
export type InsertPatientNote = z.infer<typeof insertPatientNoteSchema>;

export const insertGiftCardSchema = createInsertSchema(giftCards).omit({ id: true, createdAt: true, redeemedAt: true, redeemedByUserId: true });
export type GiftCard = typeof giftCards.$inferSelect;
export type InsertGiftCard = z.infer<typeof insertGiftCardSchema>;

export const insertDisputeSchema = createInsertSchema(disputes).omit({ id: true, createdAt: true, updatedAt: true, status: true, resolution: true, resolvedByUserId: true, resolvedAt: true, refundIssued: true, refundAmount: true });
export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export const insertSavedProviderSchema = createInsertSchema(savedProviders).omit({ id: true, createdAt: true });
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true, rating: true, totalReviews: true });
export const insertServiceSchema = createInsertSchema(services)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    bufferBefore: z.number().int().min(0, "bufferBefore must be ≥ 0").max(240, "bufferBefore must be ≤ 240").optional().default(0),
    bufferAfter:  z.number().int().min(0, "bufferAfter must be ≥ 0").max(240, "bufferAfter must be ≤ 240").optional().default(0),
    duration:     z.number().int().min(1, "duration must be > 0"),
  });
export const updateServiceSchema = insertServiceSchema.partial();
export const insertServicePackageSchema = createInsertSchema(servicePackages).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackageServiceSchema = createInsertSchema(packageServices).omit({ id: true });
export const insertPractitionerSchema = createInsertSchema(practitioners).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServicePractitionerSchema = createInsertSchema(servicePractitioners).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPractitionerScheduleSchema = createInsertSchema(practitionerSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export type PractitionerSchedule = typeof practitionerSchedules.$inferSelect;
export type InsertPractitionerSchedule = z.infer<typeof insertPractitionerScheduleSchema>;
export const insertTimeSlotSchema = createInsertSchema(timeSlots).omit({ id: true });
export const insertProviderTimeOffSchema = createInsertSchema(providerTimeOff).omit({ id: true, createdAt: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, appointmentNumber: true, createdAt: true, updatedAt: true });
export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({ id: true, createdAt: true });
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, createdAt: true, usedCount: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertSystemEventSchema = createInsertSchema(systemEvents).omit({ id: true, createdAt: true, resolvedAt: true, resolvedBy: true });
export const insertAppointmentEventSchema = createInsertSchema(appointmentEvents).omit({ id: true, createdAt: true });
export const insertProviderPricingOverrideSchema = createInsertSchema(providerPricingOverrides).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({ id: true, createdAt: true });
export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true });
export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({ id: true, createdAt: true });
export const insertFaqSchema = createInsertSchema(faqs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationSchema = createInsertSchema(notificationQueue).omit({ id: true, createdAt: true, sentAt: true });
export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({ id: true, updatedAt: true });
export const insertCatalogServiceSchema = createInsertSchema(catalogServices).omit({ id: true, createdAt: true, deletedAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export const insertDailyMetricSchema = createInsertSchema(dailyMetrics).omit({ id: true, createdAt: true });
export const insertPrescriptionSchema = createInsertSchema(prescriptions).omit({ id: true, issuedAt: true });
export const insertMedicalHistorySchema = createInsertSchema(medicalHistory).omit({ id: true, createdAt: true });
// Decimal columns become strings via drizzle-zod. Coerce numbers/strings into
// strings so the frontend can send raw numbers without 400s.
const decimalFromAny = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : undefined;
  return v;
}, z.string().optional());

export const insertHealthMetricSchema = createInsertSchema(healthMetrics)
  .omit({ id: true, createdAt: true })
  .extend({
    weightKg: decimalFromAny,
    bloodGlucose: decimalFromAny,
    temperatureC: decimalFromAny,
  });

export const insertMedicationSchema = createInsertSchema(medications).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMedicationLogSchema = createInsertSchema(medicationLogs).omit({
  id: true,
  userId: true,
  takenAt: true,
});
export const insertFamilyMemberSchema = createInsertSchema(familyMembers).omit({
  id: true,
  primaryUserId: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSubServiceSchema = createInsertSchema(subServices).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertTaxSettingSchema = createInsertSchema(taxSettings).omit({ id: true });
export const insertPatientConsentSchema = createInsertSchema(patientConsents).omit({ id: true, acceptedAt: true });
export const insertRealtimeConversationSchema = createInsertSchema(realtimeConversations).omit({ id: true, createdAt: true });
export const insertRealtimeMessageSchema = createInsertSchema(realtimeMessages).omit({ id: true, createdAt: true });
export const insertMessageEditHistorySchema = createInsertSchema(messageEditHistory).omit({ id: true, editedAt: true });
export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ id: true, updatedAt: true });
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export const insertVideoSessionSchema = createInsertSchema(videoSessions).omit({ id: true, createdAt: true });
export const insertProviderOfficeHoursSchema = createInsertSchema(providerOfficeHours).omit({ id: true, updatedAt: true });
export const insertNotificationDeliveryLogSchema = createInsertSchema(notificationDeliveryLogs).omit({ id: true, createdAt: true });
export const insertAdminBroadcastSchema = createInsertSchema(adminBroadcasts).omit({ id: true, createdAt: true, recipientCount: true });
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({ id: true, createdAt: true });

// Group sessions — insert schemas. We accept startTime/endTime as ISO strings
// from the client and coerce to Date in the route.
export const insertGroupSessionSchema = createInsertSchema(groupSessions, {
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  pricePerUser: z.union([z.number().nonnegative(), z.string()]).transform((v) => String(v)),
}).omit({ id: true, createdAt: true, updatedAt: true, status: true });
export const insertGroupSessionParticipantSchema = createInsertSchema(groupSessionParticipants).omit({
  id: true, createdAt: true, joinedAt: true, refundedAt: true,
});

// ── Provider Gallery ──────────────────────────────────────────────────────────
export const providerGallery = pgTable("provider_gallery", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  publicId: text("public_id"),
  caption: text("caption"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  galleryProviderIdx: index("idx_provider_gallery_provider_id").on(t.providerId),
  gallerySortIdx: index("idx_provider_gallery_sort_order").on(t.sortOrder),
}));

export const insertProviderGallerySchema = createInsertSchema(providerGallery).omit({ id: true, createdAt: true });

// ── Patient Gallery (private media — medical uploads, progress photos) ─────────
export const patientGallery = pgTable("patient_gallery", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  publicId: text("public_id"),
  caption: text("caption"),
  fileType: text("file_type").default("image"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  patientGalleryUserIdx: index("idx_patient_gallery_user_id").on(t.userId),
  patientGalleryCreatedIdx: index("idx_patient_gallery_created_at").on(t.createdAt),
}));
export const insertPatientGallerySchema = createInsertSchema(patientGallery).omit({ id: true, createdAt: true });
export type PatientGalleryImage = typeof patientGallery.$inferSelect;

// ── Provider Documents (private, admin-only verification docs) ────────────────
export const providerDocuments = pgTable("provider_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(), // id_card | insurance | police_clearance | other
  documentUrl: text("document_url").notNull(),
  cloudinaryPublicId: text("cloudinary_public_id"),
  fileName: text("file_name"),
  verificationStatus: text("verification_status").notNull().default("pending"), // pending | approved | rejected | reupload_requested | expired
  expiryDate: text("expiry_date"),
  expiryRequired: boolean("expiry_required").default(false),
  expiredAt: timestamp("expired_at"),
  reminderDaysBefore: integer("reminder_days_before").default(30),
  documentCriticality: text("document_criticality").default("optional"), // mandatory | optional | compliance-required
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  docsProviderIdx: index("idx_provider_documents_provider_id").on(t.providerId),
  docsStatusIdx: index("idx_provider_documents_verification_status").on(t.verificationStatus),
}));

export const insertProviderDocumentSchema = createInsertSchema(providerDocuments).omit({ id: true, createdAt: true, verificationStatus: true, adminNote: true });

// ── Provider Credentials (public when verified) ───────────────────────────────
export const providerCredentials = pgTable("provider_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  credentialType: text("credential_type").notNull(), // license | degree | certification | other
  title: text("title").notNull(),
  fileUrl: text("file_url"),
  cloudinaryPublicId: text("cloudinary_public_id"),
  licenseNumber: text("license_number"),
  issuingBody: text("issuing_body"),
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  credsProviderIdx: index("idx_provider_credentials_provider_id").on(t.providerId),
}));

export const insertProviderCredentialSchema = createInsertSchema(providerCredentials).omit({ id: true, createdAt: true, verified: true, verifiedAt: true, adminNote: true });

// ── Provider Category Permissions ─────────────────────────────────────────────
export const providerCategoryPermissions = pgTable("provider_category_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  categoryId: varchar("category").notNull().references(() => categories.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").default(true),
  assignedByAdmin: boolean("assigned_by_admin").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProviderCategoryPermissionSchema = createInsertSchema(providerCategoryPermissions).omit({ id: true, createdAt: true });

// ── RBAC: Admin Roles ──────────────────────────────────────────────────────────
// Named roles (super_admin, country_admin, operations_admin, finance_admin,
// support_admin, read_only_admin).  System roles (is_system=true) cannot be
// deleted via the UI — only deactivated.
export const adminRoles = pgTable("admin_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminRoleSchema = createInsertSchema(adminRoles).omit({ id: true, createdAt: true });

// ── RBAC: Permissions ──────────────────────────────────────────────────────────
// Fine-grained capability keys of the form "module:action".
export const rbacPermissions = pgTable("rbac_permissions", {
  key: text("key").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  description: text("description"),
});

// ── RBAC: Role → Permission mapping ───────────────────────────────────────────
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => adminRoles.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull().references(() => rbacPermissions.key, { onDelete: "cascade" }),
}, (t) => [
  uniqueIndex("uq_role_permission").on(t.roleId, t.permissionKey),
]);

// ── RBAC: Admin Assignments ────────────────────────────────────────────────────
// Links a user to an admin role.  country_code=null means global scope (all
// countries).  country_admin roles have a non-null country_code restricting
// their data access to one country.
export const adminAssignments = pgTable("admin_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: varchar("role_id").notNull().references(() => adminRoles.id),
  countryCode: countryCodeEnum("country_code"),
  isActive: boolean("is_active").notNull().default(true),
  assignedBy: varchar("assigned_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_admin_assignments_user_id").on(t.userId),
  index("idx_admin_assignments_role_id").on(t.roleId),
]);

export const insertAdminAssignmentSchema = createInsertSchema(adminAssignments).omit({ id: true, createdAt: true, updatedAt: true });

// ── Provider Buffer Settings ───────────────────────────────────────────────────
// Per-provider (or per-practitioner) buffer/travel configuration used by the
// conflict engine.  If practitioner_id is set, the row overrides the provider-
// level defaults for that specific practitioner.
export const providerBufferSettings = pgTable("provider_buffer_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  practitionerId: varchar("practitioner_id").references(() => practitioners.id, { onDelete: "cascade" }),
  clinicBufferBefore: integer("clinic_buffer_before").notNull().default(0),
  clinicBufferAfter: integer("clinic_buffer_after").notNull().default(0),
  homeBufferBefore: integer("home_buffer_before").notNull().default(15),
  homeBufferAfter: integer("home_buffer_after").notNull().default(15),
  onlineBufferBefore: integer("online_buffer_before").notNull().default(0),
  onlineBufferAfter: integer("online_buffer_after").notNull().default(0),
  travelRadiusKm: decimal("travel_radius_km", { precision: 6, scale: 2 }).default("0.00"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_pbs_provider_id").on(t.providerId),
]);

export const insertProviderBufferSettingsSchema = createInsertSchema(providerBufferSettings).omit({ id: true, updatedAt: true });

// ── Provider Blocks ────────────────────────────────────────────────────────────
// Manual blocks created by a provider (or admin) for vacation, leave, or breaks.
// The conflict engine treats any active block as fully occupied time.
export const blockTypeEnum = pgEnum("block_type", ["vacation", "leave", "break", "other"]);

export const providerBlocks = pgTable("provider_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  practitionerId: varchar("practitioner_id").references(() => practitioners.id, { onDelete: "cascade" }),
  blockType: blockTypeEnum("block_type").notNull().default("other"),
  startDatetime: timestamp("start_datetime").notNull(),
  endDatetime: timestamp("end_datetime").notNull(),
  reason: text("reason"),
  createdBy: varchar("created_by").references(() => users.id),
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_provider_blocks_provider_id").on(t.providerId),
  index("idx_provider_blocks_start").on(t.providerId, t.startDatetime),
]);

export const insertProviderBlockSchema = createInsertSchema(providerBlocks).omit({ id: true, createdAt: true });

// ── Appointment Slot Holds ─────────────────────────────────────────────────────
// Short-lived holds (10 minutes) placed when a patient starts the checkout
// flow.  The conflict engine checks active holds before confirming bookings.
export const appointmentSlotHolds = pgTable("appointment_slot_holds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  practitionerId: varchar("practitioner_id").references(() => practitioners.id, { onDelete: "cascade" }),
  patientId: varchar("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  visitType: visitTypeEnum("visit_type").notNull().default("clinic"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_slot_holds_provider_date").on(t.providerId, t.date),
  index("idx_slot_holds_expires").on(t.expiresAt),
]);

export const insertAppointmentSlotHoldSchema = createInsertSchema(appointmentSlotHolds).omit({ id: true, createdAt: true });

// ── Membership Packages ────────────────────────────────────────────────────────
// Admin-configurable packages available for purchase by patients or providers.
export const packageTargetEnum = pgEnum("package_target", ["patient", "provider", "both"]);
export const packageStatusEnum  = pgEnum("package_status",  ["pending", "active", "expired", "cancelled", "paused"]);

export const packages = pgTable("packages", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name:           text("name").notNull(),
  description:    text("description"),
  countryCode:    countryCodeEnum("country_code"),        // null = global
  durationDays:   integer("duration_days").notNull().default(30),
  price:          decimal("price",    { precision: 10, scale: 2 }).notNull().default("0.00"),
  currency:       text("currency").notNull().default("USD"),
  targetUserType: packageTargetEnum("target_user_type").notNull().default("patient"),
  isActive:       boolean("is_active").notNull().default(true),
  maxPurchases:   integer("max_purchases"),               // null = unlimited
  sortOrder:      integer("sort_order").notNull().default(0),
  createdBy:      varchar("created_by").references(() => users.id),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_packages_country").on(t.countryCode),
  index("idx_packages_active").on(t.isActive),
]);

export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true, updatedAt: true });

// ── Package Benefits ────────────────────────────────────────────────────────────
// Each benefit row is a key→value pair attached to a package.
export const benefitKeyEnum = pgEnum("benefit_key", [
  "service_discount_percent",
  "platform_fee_discount",
  "wallet_bonus",
  "featured_provider",
  "reduced_commission",
  "priority_support",
  "free_cancellations",
]);

export const packageBenefits = pgTable("package_benefits", {
  id:           varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId:    varchar("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  benefitKey:   benefitKeyEnum("benefit_key").notNull(),
  benefitValue: decimal("benefit_value", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  notes:        text("notes"),
}, (t) => [
  index("idx_package_benefits_pkg").on(t.packageId),
]);

export const insertPackageBenefitSchema = createInsertSchema(packageBenefits).omit({ id: true });

// ── User Packages ──────────────────────────────────────────────────────────────
// Tracks each user's purchased/active packages.
export const userPackages = pgTable("user_packages", {
  id:                   varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:               varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  packageId:            varchar("package_id").notNull().references(() => packages.id),
  status:               packageStatusEnum("status").notNull().default("pending"),
  paymentId:            varchar("payment_id"),
  pricePaid:            decimal("price_paid", { precision: 10, scale: 2 }).notNull().default("0.00"),
  purchasedAt:          timestamp("purchased_at").defaultNow(),
  activatedAt:          timestamp("activated_at"),
  expiresAt:            timestamp("expires_at"),
  countryCode:          countryCodeEnum("country_code").notNull().default("HU"),
  autoRenew:            boolean("auto_renew").notNull().default(false),
  pausedAt:             timestamp("paused_at"),
  gracePeriodEndsAt:    timestamp("grace_period_ends_at"),
  renewalNotifiedAt:    timestamp("renewal_notified_at"),
  cancelledAt:          timestamp("cancelled_at"),
  createdAt:            timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_user_packages_user").on(t.userId, t.status),
  index("idx_user_packages_pkg").on(t.packageId),
]);

export const insertUserPackageSchema = createInsertSchema(userPackages).omit({ id: true, createdAt: true });

// ── Membership Benefit Usage ───────────────────────────────────────────────────
// Append-only log of every time a membership benefit is consumed.
// Used to power the benefits tracker and usage history UI.
export const membershipBenefitUsage = pgTable("membership_benefit_usage", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  userPackageId:  varchar("user_package_id").notNull().references(() => userPackages.id, { onDelete: "cascade" }),
  benefitId:      varchar("benefit_id").references(() => packageBenefits.id, { onDelete: "set null" }),
  benefitType:    varchar("benefit_type", { length: 100 }),
  quantity:       integer("quantity").notNull().default(1),
  description:    text("description"),
  appointmentId:  varchar("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  createdAt:      timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_benefit_usage_pkg").on(t.userPackageId),
]);

export const insertMembershipBenefitUsageSchema = createInsertSchema(membershipBenefitUsage).omit({ id: true, createdAt: true });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = insertUserSchema.extend({
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Practitioner = typeof practitioners.$inferSelect;
export type InsertPractitioner = z.infer<typeof insertPractitionerSchema>;
export type ServicePractitioner = typeof servicePractitioners.$inferSelect;
export type InsertServicePractitioner = z.infer<typeof insertServicePractitionerSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type ServicePackage = typeof servicePackages.$inferSelect;
export type InsertServicePackage = z.infer<typeof insertServicePackageSchema>;
export type PackageService = typeof packageServices.$inferSelect;
export type ServicePackageWithServices = ServicePackage & { services: Service[] };
export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertTimeSlot = z.infer<typeof insertTimeSlotSchema>;
export type ProviderTimeOff = typeof providerTimeOff.$inferSelect;
export type InsertProviderTimeOff = z.infer<typeof insertProviderTimeOffSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type AppointmentEvent = typeof appointmentEvents.$inferSelect;
export type InsertAppointmentEvent = z.infer<typeof insertAppointmentEventSchema>;
export type AppointmentEventWithActor = AppointmentEvent & { actorName: string | null };
export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type ProviderPricingOverride = typeof providerPricingOverrides.$inferSelect;
export type InsertProviderPricingOverride = z.infer<typeof insertProviderPricingOverrideSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type SystemEvent = typeof systemEvents.$inferSelect;
export type InsertSystemEvent = z.infer<typeof insertSystemEventSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type Faq = typeof faqs.$inferSelect;
export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type Notification = typeof notificationQueue.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  adminNotes: true,
  rejectionReason: true,
  createdServiceId: true,
});
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequestWithProvider = ServiceRequest & {
  provider: Provider & { user: User };
};
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type InsertDailyMetric = z.infer<typeof insertDailyMetricSchema>;
export type Prescription = typeof prescriptions.$inferSelect;
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type MedicalHistory = typeof medicalHistory.$inferSelect;
export type InsertMedicalHistory = z.infer<typeof insertMedicalHistorySchema>;
export type HealthMetric = typeof healthMetrics.$inferSelect;
export type InsertHealthMetric = z.infer<typeof insertHealthMetricSchema>;

export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;

export type Medication = typeof medications.$inferSelect;
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type MedicationLog = typeof medicationLogs.$inferSelect;
export type InsertMedicationLog = z.infer<typeof insertMedicationLogSchema>;
export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type RealtimeConversation = typeof realtimeConversations.$inferSelect;
export type RealtimeMessage = typeof realtimeMessages.$inferSelect;
export type MessageEditHistory = typeof messageEditHistory.$inferSelect;
export type SubService = typeof subServices.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertSubService = z.infer<typeof insertSubServiceSchema>;
export type CatalogService = typeof catalogServices.$inferSelect;
export type InsertCatalogService = z.infer<typeof insertCatalogServiceSchema>;
export type TaxSetting = typeof taxSettings.$inferSelect;
export type InsertTaxSetting = z.infer<typeof insertTaxSettingSchema>;
export type PatientConsent = typeof patientConsents.$inferSelect;
export type InsertPatientConsent = z.infer<typeof insertPatientConsentSchema>;
export type SavedProvider = typeof savedProviders.$inferSelect;
export type InsertSavedProvider = z.infer<typeof insertSavedProviderSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type VideoSession = typeof videoSessions.$inferSelect;
export type InsertVideoSession = z.infer<typeof insertVideoSessionSchema>;
export type ProviderOfficeHours = typeof providerOfficeHours.$inferSelect;
export type InsertProviderOfficeHours = z.infer<typeof insertProviderOfficeHoursSchema>;
export type NotificationDeliveryLog = typeof notificationDeliveryLogs.$inferSelect;
export type InsertNotificationDeliveryLog = z.infer<typeof insertNotificationDeliveryLogSchema>;
export type AdminBroadcast = typeof adminBroadcasts.$inferSelect;
export type InsertAdminBroadcast = z.infer<typeof insertAdminBroadcastSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type GroupSession = typeof groupSessions.$inferSelect;
export type InsertGroupSession = z.infer<typeof insertGroupSessionSchema>;
export type GroupSessionParticipant = typeof groupSessionParticipants.$inferSelect;
export type InsertGroupSessionParticipant = z.infer<typeof insertGroupSessionParticipantSchema>;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type ProviderGalleryImage = typeof providerGallery.$inferSelect;
export type InsertProviderGalleryImage = z.infer<typeof insertProviderGallerySchema>;
export type ProviderDocument = typeof providerDocuments.$inferSelect;
export type InsertProviderDocument = z.infer<typeof insertProviderDocumentSchema>;
export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type InsertProviderCredential = z.infer<typeof insertProviderCredentialSchema>;
export type ProviderCategoryPermission = typeof providerCategoryPermissions.$inferSelect;
export type InsertProviderCategoryPermission = z.infer<typeof insertProviderCategoryPermissionSchema>;
export type ProviderBufferSettings = typeof providerBufferSettings.$inferSelect;
export type InsertProviderBufferSettings = z.infer<typeof insertProviderBufferSettingsSchema>;
export type ProviderBlock = typeof providerBlocks.$inferSelect;
export type InsertProviderBlock = z.infer<typeof insertProviderBlockSchema>;
export type AppointmentSlotHold = typeof appointmentSlotHolds.$inferSelect;
export type InsertAppointmentSlotHold = z.infer<typeof insertAppointmentSlotHoldSchema>;
export type AdminRole = typeof adminRoles.$inferSelect;
export type InsertAdminRole = z.infer<typeof insertAdminRoleSchema>;
export type RbacPermission = typeof rbacPermissions.$inferSelect;
export type AdminAssignment = typeof adminAssignments.$inferSelect;
export type InsertAdminAssignment = z.infer<typeof insertAdminAssignmentSchema>;

export type Package = typeof packages.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type PackageBenefit = typeof packageBenefits.$inferSelect;
export type InsertPackageBenefit = z.infer<typeof insertPackageBenefitSchema>;
export type UserPackage = typeof userPackages.$inferSelect;
export type InsertUserPackage = z.infer<typeof insertUserPackageSchema>;
export type PackageWithBenefits = Package & { benefits: PackageBenefit[] };
export type UserPackageWithDetails = UserPackage & { package: PackageWithBenefits };
export type MembershipBenefitUsage = typeof membershipBenefitUsage.$inferSelect;
export type InsertMembershipBenefitUsage = z.infer<typeof insertMembershipBenefitUsageSchema>;

export type ProviderWithUser = Provider & { user: User };
export type ProviderWithServices = ProviderWithUser & { 
  services: Service[];
};
export type AppointmentWithDetails = Appointment & { 
  patient: User; 
  provider: Provider & { user: User }; 
  service?: Service; 
  practitioner?: Practitioner;
  timeSlot?: TimeSlot;
  payment?: Payment;
};
export type ReviewWithPatient = Review & { patient: User };

// ── Provider Payout Requests ───────────────────────────────────────────────
// Providers request a withdrawal of their available earnings. Admin reviews,
// approves, processes the payment, then marks it paid with a reference.
export const payoutRequests = pgTable("payout_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  displayCurrency: text("display_currency"),
  displayAmount: decimal("display_amount", { precision: 14, scale: 2 }),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 16, scale: 6 }),
  method: text("method").notNull().default("bank_transfer"), // bank_transfer | manual | future_gateway
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  accountNumberMasked: text("account_number_masked"), // store only last 4 digits
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | paid
  adminNote: text("admin_note"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  paidAt: timestamp("paid_at"),
  paymentReference: text("payment_reference"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPayoutRequestSchema = createInsertSchema(payoutRequests).omit({
  id: true, createdAt: true, updatedAt: true,
  status: true, adminNote: true, reviewedBy: true, reviewedAt: true, paidAt: true, paymentReference: true,
});
export type PayoutRequest = typeof payoutRequests.$inferSelect;
export type InsertPayoutRequest = z.infer<typeof insertPayoutRequestSchema>;

// ── Provider Wallets ───────────────────────────────────────────────────────────
// One wallet per provider. Maintains a real-time balance snapshot updated
// atomically on every earning, payout, and adjustment event.
// Source of truth for fast balance reads; provider_ledger holds the full audit trail.
export const providerWallets = pgTable("provider_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().unique().references(() => providers.id, { onDelete: "cascade" }),
  availableBalance: decimal("available_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  pendingBalance: decimal("pending_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  heldBalance: decimal("held_balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  lifetimeEarnings: decimal("lifetime_earnings", { precision: 14, scale: 2 }).notNull().default("0.00"),
  currency: text("currency").notNull().default("USD"),
  isFrozen: boolean("is_frozen").notNull().default(false),
  frozenReason: text("frozen_reason"),
  lastPayoutDate: timestamp("last_payout_date"),
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProviderWalletSchema = createInsertSchema(providerWallets).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ProviderWallet = typeof providerWallets.$inferSelect;
export type InsertProviderWallet = z.infer<typeof insertProviderWalletSchema>;

// ── Provider Ledger ────────────────────────────────────────────────────────────
// Append-only financial event log for every balance-affecting action.
// entryType: booking_income | refund_deduction | platform_fee_deduction |
//   commission_deduction | tax_deduction | wallet_adjustment | payout_held |
//   payout_deduction | payout_returned | manual_correction | membership_charge | package_charge
export const providerLedger = pgTable("provider_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(), // positive = credit, negative = debit
  entryType: text("entry_type").notNull(),
  referenceId: text("reference_id"),   // appointmentId, payoutRequestId, etc.
  description: text("description"),
  actorId: varchar("actor_id").references(() => users.id),
  balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }),
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Canonical USD storage + display audit trail.
  currency: text("currency").default("USD"),
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 16, scale: 6 }),
}, (t) => [
  index("idx_provider_ledger_provider_id").on(t.providerId),
  index("idx_provider_ledger_created_at").on(t.createdAt),
  index("idx_provider_ledger_entry_type").on(t.entryType),
]);

export const insertProviderLedgerSchema = createInsertSchema(providerLedger).omit({
  id: true, createdAt: true,
});
export type ProviderLedger = typeof providerLedger.$inferSelect;
export type InsertProviderLedger = z.infer<typeof insertProviderLedgerSchema>;

// ── Patient Documents ──
// Patients can upload their own medical documents (reports, test results, etc.)
// and optionally share them with specific providers they have appointments with.
export const patientDocuments = pgTable("patient_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  familyMemberId: varchar("family_member_id").references(() => familyMembers.id, { onDelete: "cascade" }),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  documentType: text("document_type").notNull().default("other"),
  // medical_report | test_result | referral | prescription | insurance | other
  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(),
  cloudinaryPublicId: text("cloudinary_public_id"),
  mimeType: text("mime_type"),
  fileSizeBytes: integer("file_size_bytes"),
  // private = only patient sees it; shared_with_providers = listed providers can read
  visibility: text("visibility").notNull().default("private"),
  sharedWithProviderIds: text("shared_with_provider_ids").array().default(sql`'{}'::text[]`),
  countryCode: text("country_code").notNull().default("HU"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPatientDocumentSchema = createInsertSchema(patientDocuments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatientDocument = z.infer<typeof insertPatientDocumentSchema>;

// ── Platform Events (Module 7 — Analytics Foundation) ──────────────────────
//
// Lightweight event log for funnel analysis. Tracks searches, bookings,
// cancellations, waitlist joins, package purchases, and provider onboarding.
//
// Rules:
//  - Never store sensitive health content (diagnosis, notes, medication detail).
//  - Only store country, provider category, service mode — no free-text health data.
//  - Retention: pruned after 365 days via the retention cron job.
// ── Bug Reports ─────────────────────────────────────────────────────────────
export const bugCategoryEnum = pgEnum("bug_category", [
  "bug", "feature_request", "payment_issue", "booking_issue",
  "account_issue", "service_issue", "ui_issue", "performance_issue", "other",
]);
export const bugSeverityEnum = pgEnum("bug_severity", ["low", "medium", "high", "critical"]);
export const bugPriorityEnum = pgEnum("bug_priority", ["low", "medium", "high", "urgent"]);
export const bugStatusEnum = pgEnum("bug_status", [
  "new", "triaged", "in_progress", "waiting_for_user",
  "resolved", "closed", "duplicate", "rejected",
]);

export const bugReports = pgTable("bug_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: countryCodeEnum("country_code").notNull().default("HU"),
  reportedByUserId: varchar("reported_by_user_id").notNull().references(() => users.id),
  reporterRole: text("reporter_role"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  stepsToReproduce: text("steps_to_reproduce"),
  category: bugCategoryEnum("category").notNull().default("bug"),
  severity: bugSeverityEnum("severity").notNull().default("medium"),
  priority: bugPriorityEnum("priority").notNull().default("medium"),
  status: bugStatusEnum("status").notNull().default("new"),
  pageUrl: text("page_url"),
  browserInfo: text("browser_info"),
  deviceInfo: text("device_info"),
  correlationId: text("correlation_id"),
  screenshotUrl: text("screenshot_url"),
  screenshotPublicId: text("screenshot_public_id"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  adminNotes: text("admin_notes"),
  includeDiagnostics: boolean("include_diagnostics").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  softDeleted: boolean("soft_deleted").default(false),
});

export const insertBugReportSchema = createInsertSchema(bugReports).omit({
  id: true, createdAt: true, updatedAt: true, resolvedAt: true, closedAt: true, lastActivityAt: true,
});
export type BugReport = typeof bugReports.$inferSelect;
export type InsertBugReport = z.infer<typeof insertBugReportSchema>;

export const bugReportComments = pgTable("bug_report_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bugReportId: varchar("bug_report_id").notNull().references(() => bugReports.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: text("role"),
  message: text("message").notNull(),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBugReportCommentSchema = createInsertSchema(bugReportComments).omit({ id: true, createdAt: true });
export type BugReportComment = typeof bugReportComments.$inferSelect;
export type InsertBugReportComment = z.infer<typeof insertBugReportCommentSchema>;

// ── Platform Events (Module 7 — Analytics Foundation) ──────────────────────
//
// Lightweight event log for funnel analysis. Tracks searches, bookings,
// cancellations, waitlist joins, package purchases, and provider onboarding.
//
// Rules:
//  - Never store sensitive health content (diagnosis, notes, medication detail).
//  - Only store country, provider category, service mode — no free-text health data.
//  - Retention: pruned after 365 days via the retention cron job.
export const platformEvents = pgTable("platform_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(),
  // "search" | "booking_started" | "booking_completed" | "booking_cancelled"
  // | "waitlist_joined" | "waitlist_fulfilled" | "package_purchased"
  // | "provider_onboarded" | "provider_verified" | "refund_issued"
  // | "review_submitted" | "profile_viewed"
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  countryCode: text("country_code"),
  providerId: varchar("provider_id").references(() => providers.id, { onDelete: "set null" }),
  serviceCategory: text("service_category"),  // e.g. "physician", "rehabilitation"
  serviceMode: text("service_mode"),          // "home_visit" | "clinic" | "online"
  metadata: text("metadata"),                 // JSON blob — never health data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Provider Schedule Templates (Part 1 — Smart Recurring Template Engine) ────
// Stores a provider's weekly base template: one row per (provider, day-of-week)
// pairing. The rolling-schedule cron reads these to auto-generate time_slots
// 30 days ahead, respecting provider_time_off and availability_exceptions.
export const providerScheduleTemplates = pgTable("provider_schedule_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),  // 0 = Sun … 6 = Sat
  startTime: text("start_time").notNull(),       // "HH:MM" 24-hour
  endTime: text("end_time").notNull(),           // "HH:MM" 24-hour
  slotDurationMins: integer("slot_duration_mins").default(30),
  bufferBeforeMins: integer("buffer_before_mins").default(0),
  bufferAfterMins: integer("buffer_after_mins").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_sched_tmpl_provider").on(t.providerId),
  index("idx_sched_tmpl_provider_day").on(t.providerId, t.dayOfWeek),
]);

export const insertProviderScheduleTemplateSchema = createInsertSchema(providerScheduleTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ProviderScheduleTemplate = typeof providerScheduleTemplates.$inferSelect;
export type InsertProviderScheduleTemplate = z.infer<typeof insertProviderScheduleTemplateSchema>;

// ── Marketplace Ledger (Double-Entry Financial Engine) ───────────────────────
//
// Immutable append-only ledger recording every fund movement across the
// marketplace. Amounts stored as integer cents to prevent rounding drift.
// Accounts: CLIENT_FUNDING → PLATFORM_ESCROW → PROVIDER_WITHDRAWABLE | PLATFORM_REVENUE
export const marketplaceLedger = pgTable("marketplace_ledger", {
  id: serial("id").primaryKey(),
  appointmentId: varchar("appointment_id"),
  sourceAccount: varchar("source_account", { length: 64 }).notNull(),
  destinationAccount: varchar("destination_account", { length: 64 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  transactionType: varchar("transaction_type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  currencyIso: varchar("currency_iso", { length: 3 }).notNull().default("USD"),
  countryCode: varchar("country_code", { length: 2 }).notNull().default("HU"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_mkt_ledger_appointment").on(t.appointmentId),
  index("idx_mkt_ledger_status").on(t.status),
  index("idx_mkt_ledger_dest").on(t.destinationAccount),
  index("idx_mkt_ledger_created").on(t.createdAt),
]);

export const insertMarketplaceLedgerSchema = createInsertSchema(marketplaceLedger).omit({ id: true, createdAt: true });
export type MarketplaceLedger = typeof marketplaceLedger.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// REVENUE & BILLING CENTER — Unified Rule Engine Tables
// Sprint: Revenue-Billing Architecture Migration
// All fee, commission, payment, travel, payout, and revenue-sharing logic
// is stored here so that no business logic is hardcoded anywhere in the app.
// ════════════════════════════════════════════════════════════════════════════

// ── Platform Fee Rules ───────────────────────────────────────────────────────
// feeType: "percent" | "fixed" | "hybrid"  (hybrid = percent + fixed together)
// targetScope: "global" | "country" | "category" | "provider_type" | "modality"
export const platformFeeRules = pgTable("platform_fee_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  feeType: text("fee_type").notNull().default("percent"),
  percentValue: decimal("percent_value", { precision: 8, scale: 4 }).default("0"),
  fixedAmount: decimal("fixed_amount", { precision: 10, scale: 2 }).default("0"),
  minFee: decimal("min_fee", { precision: 10, scale: 2 }),
  maxFee: decimal("max_fee", { precision: 10, scale: 2 }),
  targetScope: text("target_scope").notNull().default("global"),
  countryCode: text("country_code"),
  providerType: text("provider_type"),
  serviceCategory: text("service_category"),
  modality: text("modality"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertPlatformFeeRuleSchema = createInsertSchema(platformFeeRules).omit({ id: true, createdAt: true, updatedAt: true });
export type PlatformFeeRule = typeof platformFeeRules.$inferSelect;
export type InsertPlatformFeeRule = z.infer<typeof insertPlatformFeeRuleSchema>;

// ── Commission Rules ─────────────────────────────────────────────────────────
// commissionType: "global" | "tier" | "provider_specific" | "category_specific" | "promotional"
export const commissionRules = pgTable("commission_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  commissionType: text("commission_type").notNull().default("global"),
  commissionPercent: decimal("commission_percent", { precision: 8, scale: 4 }).notNull().default("10"),
  fixedAmount: decimal("fixed_amount", { precision: 10, scale: 2 }).default("0"),
  providerId: varchar("provider_id"),
  providerType: text("provider_type"),
  serviceCategory: text("service_category"),
  tier: text("tier"),
  countryCode: text("country_code"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertCommissionRuleSchema = createInsertSchema(commissionRules).omit({ id: true, createdAt: true, updatedAt: true });
export type CommissionRule = typeof commissionRules.$inferSelect;
export type InsertCommissionRule = z.infer<typeof insertCommissionRuleSchema>;

// ── Payment Method Rules ─────────────────────────────────────────────────────
// surchargeType / discountType: "none" | "percent" | "fixed"
export const paymentMethodRules = pgTable("payment_method_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentMethod: text("payment_method").notNull().unique(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  surchargeType: text("surcharge_type").notNull().default("none"),
  surchargeValue: decimal("surcharge_value", { precision: 8, scale: 4 }).default("0"),
  discountType: text("discount_type").notNull().default("none"),
  discountValue: decimal("discount_value", { precision: 8, scale: 4 }).default("0"),
  allowedCountries: text("allowed_countries").array(),
  allowedCurrencies: text("allowed_currencies").array(),
  priority: integer("priority").notNull().default(100),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertPaymentMethodRuleSchema = createInsertSchema(paymentMethodRules).omit({ id: true, createdAt: true, updatedAt: true });
export type PaymentMethodRule = typeof paymentMethodRules.$inferSelect;
export type InsertPaymentMethodRule = z.infer<typeof insertPaymentMethodRuleSchema>;

// ── Travel & Home Visit Fee Rules ────────────────────────────────────────────
// feeType: "flat" | "distance" | "zone" | "radius" | "provider_defined" | "platform_defined"
export const travelFeeRules = pgTable("travel_fee_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  feeType: text("fee_type").notNull().default("flat"),
  flatAmount: decimal("flat_amount", { precision: 10, scale: 2 }).default("0"),
  perKmRate: decimal("per_km_rate", { precision: 8, scale: 4 }).default("0"),
  minDistanceKm: decimal("min_distance_km", { precision: 8, scale: 2 }),
  maxDistanceKm: decimal("max_distance_km", { precision: 8, scale: 2 }),
  radiusKm: decimal("radius_km", { precision: 8, scale: 2 }),
  zoneDefinition: jsonb("zone_definition"),
  countryCode: text("country_code"),
  providerType: text("provider_type"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertTravelFeeRuleSchema = createInsertSchema(travelFeeRules).omit({ id: true, createdAt: true, updatedAt: true });
export type TravelFeeRule = typeof travelFeeRules.$inferSelect;
export type InsertTravelFeeRule = z.infer<typeof insertTravelFeeRuleSchema>;

// ── Payout Configuration ─────────────────────────────────────────────────────
// schedule: "instant" | "manual" | "weekly" | "biweekly" | "monthly"
export const payoutConfig = pgTable("payout_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  schedule: text("schedule").notNull().default("weekly"),
  reservePercent: decimal("reserve_percent", { precision: 8, scale: 4 }).default("0"),
  holdbackPercent: decimal("holdback_percent", { precision: 8, scale: 4 }).default("0"),
  refundProtectionPercent: decimal("refund_protection_percent", { precision: 8, scale: 4 }).default("5"),
  minPayoutAmount: decimal("min_payout_amount", { precision: 10, scale: 2 }).default("10"),
  maxPayoutAmount: decimal("max_payout_amount", { precision: 10, scale: 2 }),
  countryCode: text("country_code"),
  providerType: text("provider_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertPayoutConfigSchema = createInsertSchema(payoutConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type PayoutConfig = typeof payoutConfig.$inferSelect;
export type InsertPayoutConfig = z.infer<typeof insertPayoutConfigSchema>;

// ── Revenue Share Rules ──────────────────────────────────────────────────────
// participantType: "provider" | "clinic" | "franchise" | "partner" | "referral_partner" | "platform"
export const revenueShareRules = pgTable("revenue_share_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  participantType: text("participant_type").notNull().default("platform"),
  sharePercent: decimal("share_percent", { precision: 8, scale: 4 }).notNull().default("0"),
  fixedAmount: decimal("fixed_amount", { precision: 10, scale: 2 }).default("0"),
  countryCode: text("country_code"),
  providerType: text("provider_type"),
  serviceCategory: text("service_category"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertRevenueShareRuleSchema = createInsertSchema(revenueShareRules).omit({ id: true, createdAt: true, updatedAt: true });
export type RevenueShareRule = typeof revenueShareRules.$inferSelect;
export type InsertRevenueShareRule = z.infer<typeof insertRevenueShareRuleSchema>;

// ── Wallet Rules ─────────────────────────────────────────────────────────────
// creditType: "wallet_credit" | "gift_card" | "referral_credit" | "refund_credit" | "promotional_credit"
export const walletRules = pgTable("wallet_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditType: text("credit_type").notNull().unique(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  maxBalanceUsd: decimal("max_balance_usd", { precision: 10, scale: 2 }),
  expiryDays: integer("expiry_days"),
  canCombineWithPromo: boolean("can_combine_with_promo").notNull().default(true),
  canCombineWithMembership: boolean("can_combine_with_membership").notNull().default(true),
  minTransactionAmount: decimal("min_transaction_amount", { precision: 10, scale: 2 }).default("0"),
  countryCode: text("country_code"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertWalletRuleSchema = createInsertSchema(walletRules).omit({ id: true, createdAt: true, updatedAt: true });
export type WalletRule = typeof walletRules.$inferSelect;
export type InsertWalletRule = z.infer<typeof insertWalletRuleSchema>;
export type InsertMarketplaceLedger = z.infer<typeof insertMarketplaceLedgerSchema>;

// ──────────────── P7: Legal, Consent & Compliance Framework ────────────────

export const legalDocuments = pgTable("legal_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  docType: text("doc_type").notNull(),
  targetRoles: text("target_roles").array().notNull().default(sql`ARRAY[]::text[]`),
  countryCode: text("country_code"),
  isRequired: boolean("is_required").notNull().default(true),
  requiresReacceptance: boolean("requires_reacceptance").notNull().default(false),
  status: text("status").notNull().default("draft"),
  currentVersionId: varchar("current_version_id"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertLegalDocumentSchema = createInsertSchema(legalDocuments).omit({ id: true, createdAt: true, updatedAt: true, currentVersionId: true });
export type LegalDocument = typeof legalDocuments.$inferSelect;
export type InsertLegalDocument = z.infer<typeof insertLegalDocumentSchema>;

export const legalDocumentVersions = pgTable("legal_document_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => legalDocuments.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  content: text("content").notNull().default(""),
  changelog: text("changelog"),
  status: text("status").notNull().default("draft"),
  effectiveDate: timestamp("effective_date"),
  expiresAt: timestamp("expires_at"),
  publishedAt: timestamp("published_at"),
  publishedBy: varchar("published_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertLegalDocumentVersionSchema = createInsertSchema(legalDocumentVersions).omit({ id: true, createdAt: true, publishedAt: true, publishedBy: true });
export type LegalDocumentVersion = typeof legalDocumentVersions.$inferSelect;
export type InsertLegalDocumentVersion = z.infer<typeof insertLegalDocumentVersionSchema>;

export const legalAcceptances = pgTable("legal_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentId: varchar("document_id").notNull().references(() => legalDocuments.id),
  versionId: varchar("version_id").notNull().references(() => legalDocumentVersions.id),
  roleSnapshot: text("role_snapshot").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  source: text("source").notNull().default("unknown"),
  metadata: jsonb("metadata"),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
});
export const insertLegalAcceptanceSchema = createInsertSchema(legalAcceptances).omit({ id: true, acceptedAt: true });
export type LegalAcceptance = typeof legalAcceptances.$inferSelect;
export type InsertLegalAcceptance = z.infer<typeof insertLegalAcceptanceSchema>;
