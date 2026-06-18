/**
 * Location Service — Phase D Location Intelligence Foundation
 *
 * Provides:
 *  - Haversine distance calculation (pure math, no API key needed)
 *  - Google Geocoding API wrapper (optional — requires GOOGLE_MAPS_API_KEY)
 *  - Address normalization
 *  - Home visit coverage validation
 *  - Place details lookup
 *
 * All Google Maps API calls are centralised here.
 * Never call Google APIs directly from routes or components.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface StructuredAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  placeId?: string;
}

export interface GeocodeResult extends StructuredAddress {
  formattedAddress: string;
}

export interface DistanceResult {
  distanceKm: number;
  distanceMiles: number;
  distanceText: string;
}

export interface CoverageResult {
  isEligible: boolean;
  distanceKm: number;
  providerRadiusKm: number;
  message: string;
}

// ── Distance Calculations ─────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine formula — great-circle distance between two coordinate pairs.
 * Returns distance in kilometres. No API key required.
 */
export function haversineDistance(
  from: Coordinates,
  to: Coordinates,
): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Returns a human-readable distance string and both km / miles.
 */
export function calculateDistance(
  from: Coordinates,
  to: Coordinates,
): DistanceResult {
  const distanceKm = haversineDistance(from, to);
  const distanceMiles = distanceKm * 0.621371;
  const distanceText =
    distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1)} km`;

  return { distanceKm, distanceMiles, distanceText };
}

/**
 * Checks whether a patient location is within a provider's service radius.
 * Uses the provider's serviceRadiusKm (legacy) or maxTravelDistanceKm (Phase D).
 */
export function checkHomeVisitCoverage(
  patientCoords: Coordinates,
  providerCoords: Coordinates,
  radiusKm: number,
): CoverageResult {
  const distanceKm = haversineDistance(patientCoords, providerCoords);

  if (radiusKm <= 0) {
    return {
      isEligible: false,
      distanceKm,
      providerRadiusKm: radiusKm,
      message: "This provider does not offer home visits.",
    };
  }

  const isEligible = distanceKm <= radiusKm;
  return {
    isEligible,
    distanceKm,
    providerRadiusKm: radiusKm,
    message: isEligible
      ? `Within service area (${distanceKm.toFixed(1)} km away, radius ${radiusKm} km).`
      : `Outside service area. You are ${distanceKm.toFixed(1)} km away, but this provider only covers up to ${radiusKm} km.`,
  };
}

// ── Google Geocoding API ───────────────────────────────────────────────────────

interface GoogleGeocodingResult {
  geometry: { location: { lat: number; lng: number } };
  formatted_address: string;
  place_id: string;
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

interface GoogleGeocodingResponse {
  status: string;
  results: GoogleGeocodingResult[];
}

/**
 * Geocode a free-text address string.
 * Returns null when no API key is configured or the request fails.
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("[location] GOOGLE_MAPS_API_KEY not set — geocoding disabled");
    return null;
  }

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json",
    );
    url.searchParams.set("address", address);
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const resp = await fetch(url.toString());
    if (!resp.ok) return null;

    const data = (await resp.json()) as GoogleGeocodingResponse;
    if (data.status !== "OK" || !data.results.length) return null;

    const result = data.results[0];
    return parseGeocodeResult(result);
  } catch (err) {
    console.error("[location] geocodeAddress error:", err);
    return null;
  }
}

/**
 * Reverse geocode a lat/lng pair to a structured address.
 */
export async function reverseGeocode(
  coords: Coordinates,
): Promise<GeocodeResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json",
    );
    url.searchParams.set("latlng", `${coords.latitude},${coords.longitude}`);
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const resp = await fetch(url.toString());
    if (!resp.ok) return null;

    const data = (await resp.json()) as GoogleGeocodingResponse;
    if (data.status !== "OK" || !data.results.length) return null;

    return parseGeocodeResult(data.results[0]);
  } catch (err) {
    console.error("[location] reverseGeocode error:", err);
    return null;
  }
}

/**
 * Look up a place by its Google Place ID.
 */
export async function getPlaceDetails(
  placeId: string,
): Promise<GeocodeResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json",
    );
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const resp = await fetch(url.toString());
    if (!resp.ok) return null;

    const data = (await resp.json()) as GoogleGeocodingResponse;
    if (data.status !== "OK" || !data.results.length) return null;

    return parseGeocodeResult(data.results[0]);
  } catch (err) {
    console.error("[location] getPlaceDetails error:", err);
    return null;
  }
}

// ── Address parsing ────────────────────────────────────────────────────────────

function parseGeocodeResult(result: GoogleGeocodingResult): GeocodeResult {
  const components = result.address_components;

  const getComponent = (types: string[]): string =>
    components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ??
    "";
  const getShort = (types: string[]): string =>
    components.find((c) => types.some((t) => c.types.includes(t)))?.short_name ??
    "";

  const streetNumber = getComponent(["street_number"]);
  const route = getComponent(["route"]);
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ") || undefined;

  return {
    addressLine1,
    city:
      getComponent(["locality", "postal_town", "sublocality_level_1"]) ||
      undefined,
    state: getComponent(["administrative_area_level_1"]) || undefined,
    postalCode: getShort(["postal_code"]) || undefined,
    country: getComponent(["country"]) || undefined,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
  };
}

/**
 * Normalise a free-text address: trim whitespace, title-case city.
 */
export function normalizeAddress(addr: Partial<StructuredAddress>): Partial<StructuredAddress> {
  return {
    ...addr,
    addressLine1: addr.addressLine1?.trim(),
    addressLine2: addr.addressLine2?.trim() || undefined,
    city: addr.city?.trim(),
    state: addr.state?.trim(),
    postalCode: addr.postalCode?.trim(),
    country: addr.country?.trim(),
  };
}

/**
 * Validate that a coordinate pair is plausible (non-zero, within world bounds).
 */
export function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Return true when the server has a GOOGLE_MAPS_API_KEY configured.
 */
export function isMapsConfigured(): boolean {
  return Boolean(GOOGLE_MAPS_API_KEY);
}
