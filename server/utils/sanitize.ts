const SENSITIVE_USER_FIELDS = [
  "password",
  "emailOtpHash",
  "emailOtpExpiresAt",
  "otpAttempts",
  "lastOtpSentAt",
  "googleAccessToken",
  "googleRefreshToken",
  "googleCalendarId",
  "socialNumber",
  "insurancePolicyNumber",
] as const;

const HEAVY_USER_FIELDS = [
  "knownAllergies",
  "medicalConditions",
  "currentMedications",
  "pastSurgeries",
  "primaryCarePhysician",
  "insuranceProvider",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "bloodGroup",
  "heightCm",
  "weightKg",
  "dateOfBirth",
  "preferredPronouns",
  "occupation",
  "maritalStatus",
] as const;

const MAX_INLINE_AVATAR_LENGTH = 2048;

function shrinkAvatar(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= MAX_INLINE_AVATAR_LENGTH) return value;
  if (value.startsWith("data:")) return null;
  return value;
}

export function sanitizeUser<T extends Record<string, any> | null | undefined>(
  user: T,
  options: { strip?: "sensitive" | "public" } = { strip: "sensitive" },
): T {
  if (!user) return user;
  const out: Record<string, any> = { ...user };
  for (const f of SENSITIVE_USER_FIELDS) delete out[f];
  if (options.strip === "public") {
    for (const f of HEAVY_USER_FIELDS) delete out[f];
  }
  if ("avatarUrl" in out) out.avatarUrl = shrinkAvatar(out.avatarUrl);
  return out as T;
}

export function sanitizeProviderWithUser<T extends { user?: any } | null | undefined>(
  provider: T,
  options: { strip?: "sensitive" | "public" } = { strip: "public" },
): T {
  if (!provider) return provider;
  return { ...provider, user: sanitizeUser(provider.user, options) } as T;
}

export function sanitizeProviderListItem<T extends { user?: any; gallery?: any } | null | undefined>(
  provider: T,
): T {
  if (!provider) return provider;
  const out: any = { ...provider, user: sanitizeUser(provider.user, { strip: "public" }) };
  if (Array.isArray(out.gallery) && out.gallery.length > 6) {
    out.gallery = out.gallery.slice(0, 6);
  }
  return out as T;
}
