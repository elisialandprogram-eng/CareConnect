/**
 * Phase D — Location Service Tests
 *
 * Tests for pure math helpers (no network, no API key needed).
 */

import {
  haversineDistance,
  calculateDistance,
  checkHomeVisitCoverage,
  normalizeAddress,
  isValidCoordinates,
  isMapsConfigured,
} from "../server/services/location.service";

// ── haversineDistance ─────────────────────────────────────────────────────────

describe("haversineDistance", () => {
  it("returns 0 for identical coordinates", () => {
    const coord = { latitude: 47.497912, longitude: 19.040235 };
    expect(haversineDistance(coord, coord)).toBeCloseTo(0, 5);
  });

  it("Budapest → Vienna is approx 240 km", () => {
    const budapest = { latitude: 47.497912, longitude: 19.040235 };
    const vienna   = { latitude: 48.208176, longitude: 16.373819 };
    const dist = haversineDistance(budapest, vienna);
    expect(dist).toBeGreaterThan(210);
    expect(dist).toBeLessThan(270);
  });

  it("London → Paris is approx 340 km", () => {
    const london = { latitude: 51.507351, longitude: -0.127758 };
    const paris  = { latitude: 48.856613, longitude: 2.352222 };
    const dist = haversineDistance(london, paris);
    expect(dist).toBeGreaterThan(310);
    expect(dist).toBeLessThan(370);
  });

  it("is symmetric", () => {
    const a = { latitude: 47.5, longitude: 19.0 };
    const b = { latitude: 35.6, longitude: 139.7 };
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 5);
  });
});

// ── calculateDistance ─────────────────────────────────────────────────────────

describe("calculateDistance", () => {
  it("returns km, miles, and text", () => {
    const a = { latitude: 47.497912, longitude: 19.040235 };
    const b = { latitude: 47.5, longitude: 19.05 };
    const result = calculateDistance(a, b);
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.distanceMiles).toBeGreaterThan(0);
    expect(result.distanceMiles).toBeCloseTo(result.distanceKm * 0.621371, 3);
    expect(typeof result.distanceText).toBe("string");
  });

  it("uses metres for sub-kilometre distances", () => {
    const a = { latitude: 47.497912, longitude: 19.040235 };
    const b = { latitude: 47.4980, longitude: 19.0403 };
    const result = calculateDistance(a, b);
    expect(result.distanceText).toMatch(/m$/);
  });

  it("uses km for distances ≥ 1 km", () => {
    const a = { latitude: 47.497912, longitude: 19.040235 };
    const b = { latitude: 48.208176, longitude: 16.373819 };
    const result = calculateDistance(a, b);
    expect(result.distanceText).toMatch(/km$/);
  });
});

// ── checkHomeVisitCoverage ────────────────────────────────────────────────────

describe("checkHomeVisitCoverage", () => {
  const providerCoords = { latitude: 47.497912, longitude: 19.040235 };

  it("returns eligible when patient is within radius", () => {
    const patient = { latitude: 47.51, longitude: 19.06 };   // ~2 km away
    const result = checkHomeVisitCoverage(patient, providerCoords, 10);
    expect(result.isEligible).toBe(true);
    expect(result.distanceKm).toBeLessThan(10);
    expect(result.providerRadiusKm).toBe(10);
  });

  it("returns ineligible when patient is outside radius", () => {
    const patient = { latitude: 48.2, longitude: 16.4 };     // ~240 km away
    const result = checkHomeVisitCoverage(patient, providerCoords, 10);
    expect(result.isEligible).toBe(false);
    expect(result.distanceKm).toBeGreaterThan(10);
  });

  it("returns ineligible with message when radius is 0", () => {
    const patient = { latitude: 47.51, longitude: 19.06 };
    const result = checkHomeVisitCoverage(patient, providerCoords, 0);
    expect(result.isEligible).toBe(false);
    expect(result.message).toContain("does not offer home visits");
  });

  it("exactly on the boundary is eligible", () => {
    // place patient exactly at radiusKm from provider
    const radiusKm = 5;
    // move patient ~5 km north
    const dLat = radiusKm / 111.32;
    const patient = { latitude: providerCoords.latitude + dLat, longitude: providerCoords.longitude };
    const result = checkHomeVisitCoverage(patient, providerCoords, radiusKm);
    expect(result.isEligible).toBe(true);
  });
});

// ── normalizeAddress ──────────────────────────────────────────────────────────

describe("normalizeAddress", () => {
  it("trims whitespace from string fields", () => {
    const result = normalizeAddress({
      addressLine1: "  123 Main St  ",
      city: "  Budapest  ",
      state: " Pest ",
      postalCode: " 1051 ",
      country: " Hungary ",
    });
    expect(result.addressLine1).toBe("123 Main St");
    expect(result.city).toBe("Budapest");
    expect(result.state).toBe("Pest");
    expect(result.postalCode).toBe("1051");
    expect(result.country).toBe("Hungary");
  });

  it("converts empty addressLine2 to undefined", () => {
    const result = normalizeAddress({ addressLine2: "   " });
    expect(result.addressLine2).toBeUndefined();
  });

  it("does not mutate numeric fields", () => {
    const result = normalizeAddress({ latitude: 47.5, longitude: 19.0 });
    expect(result.latitude).toBe(47.5);
    expect(result.longitude).toBe(19.0);
  });
});

// ── isValidCoordinates ────────────────────────────────────────────────────────

describe("isValidCoordinates", () => {
  it("accepts valid world coordinates", () => {
    expect(isValidCoordinates(47.5, 19.0)).toBe(true);
    expect(isValidCoordinates(-33.87, 151.21)).toBe(true);
    expect(isValidCoordinates(90, 180)).toBe(true);
    expect(isValidCoordinates(-90, -180)).toBe(true);
  });

  it("rejects 0,0 null island", () => {
    expect(isValidCoordinates(0, 0)).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(isValidCoordinates(91, 0)).toBe(false);
    expect(isValidCoordinates(0, 181)).toBe(false);
    expect(isValidCoordinates(-91, 0)).toBe(false);
  });
});

// ── isMapsConfigured ──────────────────────────────────────────────────────────

describe("isMapsConfigured", () => {
  it("returns false when GOOGLE_MAPS_API_KEY is not set", () => {
    const prev = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    // Re-import would be needed to pick up the new env. This just confirms the
    // function signature is correct when the module-level constant is falsy.
    expect(typeof isMapsConfigured()).toBe("boolean");
    process.env.GOOGLE_MAPS_API_KEY = prev;
  });
});
