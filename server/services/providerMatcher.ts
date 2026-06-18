/**
 * providerMatcher.ts — Rule-based weighted scoring engine for provider recommendations.
 *
 * Weights (total 100):
 *   service/sub-service match   25
 *   city match                  15
 *   language overlap            10
 *   rating                      15
 *   pricing fit                  5
 *   past bookings with them     10
 *   service mode match          10   ← NEW (home_visit / clinic / online)
 *   availability signal         10   ← NEW (has open slots on desired date)
 *
 * Country isolation: any provider whose countryCode differs from the
 * patient's countryCode gets a score of 0 and is excluded.
 */

export interface PatientContext {
  countryCode: string;
  city?: string | null;
  languages?: string[];
  preferredLanguage?: string | null;
  budgetHint?: number | null;
  desiredCategory?: string | null;
  desiredSubServiceId?: string | null;
  pastProviderIds?: string[];
  desiredMode?: string | null;          // "home_visit" | "clinic" | "online"
}

export interface ProviderCandidate {
  id: string;
  countryCode: string;
  city?: string | null;
  languages?: string[];
  rating?: string | number | null;
  /** Minimum service price in USD (from services table). Replaces legacy provider-level fee fields. */
  minServicePrice?: string | number | null;
  providerType?: string | null;
  subServiceIds?: string[];
  isVerified?: boolean | null;
  totalReviews?: number | null;
  offeredModes?: string[];              // e.g. ["home_visit", "clinic"]
  hasAvailability?: boolean | null;     // pre-checked by caller for desired date
}

export interface ScoreResult {
  providerId: string;
  score: number;        // 0-100
  reasons: string[];
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(n, max));
}

export function scoreProvider(
  patient: PatientContext,
  provider: ProviderCandidate,
): ScoreResult {
  if (provider.countryCode !== patient.countryCode) {
    return { providerId: provider.id, score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];

  // ── 1. Service / category match (max 25) ────────────────────────────────
  if (patient.desiredSubServiceId && provider.subServiceIds?.includes(patient.desiredSubServiceId)) {
    score += 25;
    reasons.push("Offers the exact service you need");
  } else if (patient.desiredCategory && provider.providerType === patient.desiredCategory) {
    score += 17;
    reasons.push(`Specialises in ${patient.desiredCategory}`);
  }

  // ── 2. City match (max 15) ───────────────────────────────────────────────
  if (patient.city && provider.city) {
    const pCity = patient.city.toLowerCase().trim();
    const rCity = provider.city.toLowerCase().trim();
    if (rCity === pCity) {
      score += 15;
      reasons.push("Located in your city");
    } else if (rCity.includes(pCity) || pCity.includes(rCity)) {
      score += 8;
      reasons.push("Located near your area");
    }
  }

  // ── 3. Language overlap (max 10) ────────────────────────────────────────
  const patientLangs = new Set([
    ...(patient.languages ?? []).map(l => l.toLowerCase()),
    ...(patient.preferredLanguage ? [patient.preferredLanguage.toLowerCase()] : []),
  ]);
  const providerLangs = (provider.languages ?? []).map(l => l.toLowerCase());
  if (patientLangs.size > 0 && providerLangs.length > 0) {
    const overlap = providerLangs.filter(l => patientLangs.has(l));
    if (overlap.length > 0) {
      score += 10;
      reasons.push(`Speaks your language (${overlap[0]})`);
    }
  }

  // ── 4. Rating (max 15, normalized 0-5 → 0-15) ───────────────────────────
  const rating = parseFloat(String(provider.rating ?? 0)) || 0;
  if (rating > 0) {
    const ratingScore = clamp(Math.round((rating / 5) * 15), 15);
    score += ratingScore;
    if (rating >= 4.5) reasons.push("Highly rated by patients");
    else if (rating >= 4.0) reasons.push("Well-reviewed provider");
  }

  // ── 5. Pricing fit (max 5) ──────────────────────────────────────────────
  if (patient.budgetHint && patient.budgetHint > 0) {
    const fee = parseFloat(String(provider.minServicePrice ?? 0)) || 0;
    if (fee > 0) {
      if (fee <= patient.budgetHint) {
        score += 5;
        reasons.push("Within your budget");
      } else if (fee <= patient.budgetHint * 1.25) {
        score += 2;
        reasons.push("Close to your budget");
      }
    }
  } else {
    score += 2;
  }

  // ── 6. Past bookings (max 10) ────────────────────────────────────────────
  if (patient.pastProviderIds?.includes(provider.id)) {
    score += 10;
    reasons.push("You've booked with them before");
  }

  // ── 7. Service mode match (max 10) ──────────────────────────────────────
  if (patient.desiredMode && provider.offeredModes && provider.offeredModes.length > 0) {
    if (provider.offeredModes.includes(patient.desiredMode)) {
      score += 10;
      const modeLabel: Record<string, string> = {
        home_visit: "Offers home visits",
        clinic: "Available at clinic",
        online: "Available online",
      };
      reasons.push(modeLabel[patient.desiredMode] ?? "Offers your preferred service mode");
    } else {
      // Partial: provider offers at least some mode
      score += 3;
    }
  } else if (!patient.desiredMode) {
    // No preference — award neutral points
    score += 5;
  }

  // ── 8. Availability signal (max 10) ─────────────────────────────────────
  if (provider.hasAvailability === true) {
    score += 10;
    reasons.push("Has open slots available");
  } else if (provider.hasAvailability === false) {
    // Penalise unavailable providers so waitlist providers rank lower
    score = Math.max(0, score - 5);
  }
  // null/undefined = unknown — no adjustment

  // ── Verified bonus (tie-breaker note only) ────────────────────────────
  if (provider.isVerified) {
    reasons.push("Verified provider");
  }

  return {
    providerId: provider.id,
    score: clamp(Math.round(score), 100),
    reasons,
  };
}

export interface RankResult {
  providers: Array<ProviderCandidate & ScoreResult>;
  fallbackUsed: boolean;
}

export function rankProviders(
  patient: PatientContext,
  providers: ProviderCandidate[],
  opts: { minResults?: number; minScore?: number } = {},
): RankResult {
  const { minResults = 3, minScore = 10 } = opts;

  const scored = providers
    .map(p => ({ ...p, ...scoreProvider(patient, p) }))
    .filter(p => p.countryCode === patient.countryCode)
    .sort((a, b) => b.score - a.score);

  const qualified = scored.filter(p => p.score >= minScore);

  if (qualified.length >= minResults) {
    return { providers: qualified, fallbackUsed: false };
  }

  const qualifiedIds = new Set(qualified.map(p => p.id));
  const fallback = scored
    .filter(p => !qualifiedIds.has(p.id) && p.isVerified)
    .sort((a, b) => {
      const ra = parseFloat(String(a.rating ?? 0));
      const rb = parseFloat(String(b.rating ?? 0));
      return rb - ra;
    })
    .slice(0, minResults - qualified.length);

  return {
    providers: [...qualified, ...fallback],
    fallbackUsed: fallback.length > 0,
  };
}
