/**
 * Location Routes — Phase D Location Intelligence Foundation
 *
 * GET    /api/locations/saved-addresses          — list user's saved addresses
 * POST   /api/locations/saved-addresses          — create saved address
 * PUT    /api/locations/saved-addresses/:id      — update saved address
 * DELETE /api/locations/saved-addresses/:id      — delete saved address
 * POST   /api/locations/saved-addresses/:id/set-default  — set as default
 *
 * POST   /api/locations/geocode                  — server-side geocode (requires key)
 * GET    /api/locations/distance                 — compute patient↔provider distance
 * GET    /api/locations/check-coverage           — home visit eligibility check
 * GET    /api/locations/maps-status              — whether Google Maps API is configured
 */

import type { Express, Response } from "express";
import { pool } from "../db";
import { authenticateToken, type AuthRequest } from "../middleware/auth";
import {
  calculateDistance,
  checkHomeVisitCoverage,
  geocodeAddress,
  isMapsConfigured,
  isValidCoordinates,
  normalizeAddress,
} from "../services/location.service";

/** Convert a single snake_case DB row to camelCase for the frontend. */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function rowToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[snakeToCamel(key)] = row[key];
  }
  return out;
}

export function registerLocationRoutes(app: Express): void {

  // ── GET /api/locations/maps-status ─────────────────────────────────────────
  // Returns whether Google Maps API is configured on the server.
  app.get("/api/locations/maps-status", authenticateToken, (_req, res) => {
    res.json({ configured: isMapsConfigured() });
  });

  // ── GET /api/locations/saved-addresses ─────────────────────────────────────
  app.get(
    "/api/locations/saved-addresses",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const result = await pool.query(
          `SELECT * FROM saved_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC`,
          [req.user!.id],
        );
        res.json(result.rows.map(rowToCamel));
      } catch (err: any) {
        console.error("GET saved-addresses error:", err);
        res.status(500).json({ message: "Failed to load saved addresses" });
      }
    },
  );

  // ── POST /api/locations/saved-addresses ────────────────────────────────────
  app.post(
    "/api/locations/saved-addresses",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          nickname = "Home",
          addressLine1,
          addressLine2,
          city,
          state,
          postalCode,
          country,
          latitude,
          longitude,
          formattedAddress,
          placeId,
          isDefault = false,
        } = req.body;

        if (!nickname?.trim()) {
          return res.status(400).json({ message: "nickname is required" });
        }

        const normalized = normalizeAddress({
          addressLine1, addressLine2, city, state, postalCode, country,
        });

        await pool.query("BEGIN");

        if (isDefault) {
          await pool.query(
            `UPDATE saved_addresses SET is_default = FALSE WHERE user_id = $1`,
            [req.user!.id],
          );
        }

        const insertResult = await pool.query(
          `INSERT INTO saved_addresses
             (user_id, nickname, address_line1, address_line2, city, state,
              postal_code, country, latitude, longitude, formatted_address,
              place_id, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING *`,
          [
            req.user!.id,
            nickname.trim(),
            normalized.addressLine1 ?? null,
            normalized.addressLine2 ?? null,
            normalized.city ?? null,
            normalized.state ?? null,
            normalized.postalCode ?? null,
            normalized.country ?? null,
            latitude ?? null,
            longitude ?? null,
            formattedAddress ?? null,
            placeId ?? null,
            isDefault,
          ],
        );

        await pool.query("COMMIT");
        res.status(201).json(rowToCamel(insertResult.rows[0]));
      } catch (err: any) {
        await pool.query("ROLLBACK").catch(() => {});
        console.error("POST saved-addresses error:", err);
        res.status(500).json({ message: "Failed to save address" });
      }
    },
  );

  // ── PUT /api/locations/saved-addresses/:id ─────────────────────────────────
  app.put(
    "/api/locations/saved-addresses/:id",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const existing = await pool.query(
          `SELECT * FROM saved_addresses WHERE id = $1 AND user_id = $2`,
          [id, req.user!.id],
        );
        if (!existing.rows.length) {
          return res.status(404).json({ message: "Address not found" });
        }

        const {
          nickname,
          addressLine1,
          addressLine2,
          city,
          state,
          postalCode,
          country,
          latitude,
          longitude,
          formattedAddress,
          placeId,
          isDefault,
        } = req.body;

        const normalized = normalizeAddress({
          addressLine1, addressLine2, city, state, postalCode, country,
        });

        await pool.query("BEGIN");

        if (isDefault) {
          await pool.query(
            `UPDATE saved_addresses SET is_default = FALSE WHERE user_id = $1 AND id != $2`,
            [req.user!.id, id],
          );
        }

        const updated = await pool.query(
          `UPDATE saved_addresses SET
             nickname         = COALESCE($1, nickname),
             address_line1    = $2,
             address_line2    = $3,
             city             = $4,
             state            = $5,
             postal_code      = $6,
             country          = $7,
             latitude         = $8,
             longitude        = $9,
             formatted_address = $10,
             place_id         = $11,
             is_default       = COALESCE($12, is_default),
             updated_at       = NOW()
           WHERE id = $13 AND user_id = $14
           RETURNING *`,
          [
            nickname?.trim() ?? null,
            normalized.addressLine1 ?? null,
            normalized.addressLine2 ?? null,
            normalized.city ?? null,
            normalized.state ?? null,
            normalized.postalCode ?? null,
            normalized.country ?? null,
            latitude ?? null,
            longitude ?? null,
            formattedAddress ?? null,
            placeId ?? null,
            isDefault ?? null,
            id,
            req.user!.id,
          ],
        );

        await pool.query("COMMIT");
        res.json(rowToCamel(updated.rows[0]));
      } catch (err: any) {
        await pool.query("ROLLBACK").catch(() => {});
        console.error("PUT saved-addresses error:", err);
        res.status(500).json({ message: "Failed to update address" });
      }
    },
  );

  // ── DELETE /api/locations/saved-addresses/:id ──────────────────────────────
  app.delete(
    "/api/locations/saved-addresses/:id",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const result = await pool.query(
          `DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
          [req.params.id, req.user!.id],
        );
        if (!result.rows.length) {
          return res.status(404).json({ message: "Address not found" });
        }
        res.json({ ok: true });
      } catch (err: any) {
        console.error("DELETE saved-addresses error:", err);
        res.status(500).json({ message: "Failed to delete address" });
      }
    },
  );

  // ── POST /api/locations/saved-addresses/:id/set-default ───────────────────
  app.post(
    "/api/locations/saved-addresses/:id/set-default",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        await pool.query("BEGIN");
        await pool.query(
          `UPDATE saved_addresses SET is_default = FALSE WHERE user_id = $1`,
          [req.user!.id],
        );
        const result = await pool.query(
          `UPDATE saved_addresses SET is_default = TRUE, updated_at = NOW()
           WHERE id = $1 AND user_id = $2 RETURNING *`,
          [req.params.id, req.user!.id],
        );
        if (!result.rows.length) {
          await pool.query("ROLLBACK");
          return res.status(404).json({ message: "Address not found" });
        }
        await pool.query("COMMIT");
        res.json(rowToCamel(result.rows[0]));
      } catch (err: any) {
        await pool.query("ROLLBACK").catch(() => {});
        console.error("set-default error:", err);
        res.status(500).json({ message: "Failed to set default address" });
      }
    },
  );

  // ── POST /api/locations/geocode ─────────────────────────────────────────────
  // Server-side geocoding — returns structured address. Requires GOOGLE_MAPS_API_KEY.
  app.post(
    "/api/locations/geocode",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { address } = req.body;
        if (!address?.trim()) {
          return res.status(400).json({ message: "address is required" });
        }
        const result = await geocodeAddress(address.trim());
        if (!result) {
          return res
            .status(422)
            .json({ message: "Could not geocode address — check GOOGLE_MAPS_API_KEY" });
        }
        res.json(result);
      } catch (err: any) {
        console.error("geocode error:", err);
        res.status(500).json({ message: "Geocoding failed" });
      }
    },
  );

  // ── GET /api/locations/distance ────────────────────────────────────────────
  // Compute distance between a patient location and a provider.
  // Query params: providerId, patientLat, patientLng
  app.get(
    "/api/locations/distance",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { providerId, patientLat, patientLng } = req.query as Record<string, string>;

        if (!providerId || !patientLat || !patientLng) {
          return res.status(400).json({
            message: "providerId, patientLat, and patientLng are required",
          });
        }

        const pLat = parseFloat(patientLat);
        const pLng = parseFloat(patientLng);

        if (!isValidCoordinates(pLat, pLng)) {
          return res.status(400).json({ message: "Invalid patient coordinates" });
        }

        const provResult = await pool.query(
          `SELECT latitude, longitude, city, primary_service_location
           FROM providers WHERE id = $1`,
          [providerId],
        );
        if (!provResult.rows.length) {
          return res.status(404).json({ message: "Provider not found" });
        }

        const prov = provResult.rows[0];
        const provLat = parseFloat(prov.latitude);
        const provLng = parseFloat(prov.longitude);

        if (!isValidCoordinates(provLat, provLng)) {
          return res.status(422).json({
            message: "Provider has no coordinates set. Contact them to update their location.",
          });
        }

        const distance = calculateDistance(
          { latitude: pLat, longitude: pLng },
          { latitude: provLat, longitude: provLng },
        );

        res.json({
          distanceKm: distance.distanceKm,
          distanceMiles: distance.distanceMiles,
          distanceText: distance.distanceText,
          providerLocation: prov.city || prov.primary_service_location || "Unknown",
        });
      } catch (err: any) {
        console.error("distance error:", err);
        res.status(500).json({ message: "Distance calculation failed" });
      }
    },
  );

  // ── GET /api/locations/check-coverage ─────────────────────────────────────
  // Home visit eligibility check.
  // Query: providerId, patientLat, patientLng
  app.get(
    "/api/locations/check-coverage",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { providerId, patientLat, patientLng } = req.query as Record<string, string>;

        if (!providerId || !patientLat || !patientLng) {
          return res.status(400).json({
            message: "providerId, patientLat, and patientLng are required",
          });
        }

        const pLat = parseFloat(patientLat);
        const pLng = parseFloat(patientLng);

        if (!isValidCoordinates(pLat, pLng)) {
          return res.status(400).json({ message: "Invalid patient coordinates" });
        }

        const provResult = await pool.query(
          `SELECT latitude, longitude, service_radius_km, max_travel_distance_km,
                  home_visit_enabled, city, primary_service_location
           FROM providers WHERE id = $1`,
          [providerId],
        );
        if (!provResult.rows.length) {
          return res.status(404).json({ message: "Provider not found" });
        }

        const prov = provResult.rows[0];

        if (!prov.home_visit_enabled) {
          return res.json({
            isEligible: false,
            distanceKm: 0,
            providerRadiusKm: 0,
            message: "This provider does not offer home visits.",
          });
        }

        const provLat = parseFloat(prov.latitude);
        const provLng = parseFloat(prov.longitude);

        if (!isValidCoordinates(provLat, provLng)) {
          return res.json({
            isEligible: true,
            distanceKm: 0,
            providerRadiusKm: 0,
            message: "Provider location not set — coverage cannot be verified. Booking allowed.",
          });
        }

        const radiusKm =
          parseInt(prov.max_travel_distance_km ?? "0") ||
          parseInt(prov.service_radius_km ?? "0") ||
          0;

        // No radius set means no coverage restriction — booking is allowed.
        // This is the correct behaviour: a provider who enables home visits
        // without specifying a radius accepts all home visits regardless of distance.
        if (radiusKm === 0) {
          const distanceKm = isValidCoordinates(provLat, provLng)
            ? (await import("../services/location.service").then(m => m.haversineDistance(
                { latitude: pLat, longitude: pLng },
                { latitude: provLat, longitude: provLng },
              )))
            : 0;
          return res.json({
            isEligible: true,
            distanceKm,
            providerRadiusKm: 0,
            message: "Provider has not set a coverage radius — booking allowed.",
          });
        }

        const coverage = checkHomeVisitCoverage(
          { latitude: pLat, longitude: pLng },
          { latitude: provLat, longitude: provLng },
          radiusKm,
        );

        res.json(coverage);
      } catch (err: any) {
        console.error("check-coverage error:", err);
        res.status(500).json({ message: "Coverage check failed" });
      }
    },
  );

  // ── GET /api/admin/analytics/location ─────────────────────────────────────
  // Location analytics for admin: bookings by city, provider distribution.
  app.get(
    "/api/admin/analytics/location",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const role = req.user!.role as string;
        if (!["admin", "global_admin", "country_admin"].includes(role)) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const countryFilter =
          role === "global_admin"
            ? ""
            : `WHERE a.country_code::text = '${req.user!.countryCode}'`;

        const bookingsByCity = await pool.query(`
          SELECT
            COALESCE(u.city, 'Unknown') AS city,
            a.country_code,
            COUNT(*) AS booking_count,
            SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
          FROM appointments a
          LEFT JOIN users u ON u.id = a.patient_id
          ${countryFilter}
          GROUP BY COALESCE(u.city, 'Unknown'), a.country_code
          ORDER BY booking_count DESC
          LIMIT 20
        `);

        const providerDistribution = await pool.query(`
          SELECT
            COALESCE(p.city, 'Unknown') AS city,
            p.country_code,
            COUNT(*) AS provider_count,
            SUM(CASE WHEN p.home_visit_enabled THEN 1 ELSE 0 END) AS home_visit_count
          FROM providers p
          ${role !== "global_admin" ? `WHERE p.country_code::text = '${req.user!.countryCode}'` : ""}
          GROUP BY COALESCE(p.city, 'Unknown'), p.country_code
          ORDER BY provider_count DESC
          LIMIT 20
        `);

        const homeVisitStats = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE visit_type = 'home') AS home_visit_bookings,
            COUNT(*) FILTER (WHERE visit_type = 'clinic') AS clinic_bookings,
            COUNT(*) FILTER (WHERE visit_type = 'online') AS online_bookings,
            COUNT(*) AS total_bookings
          FROM appointments
          ${countryFilter}
        `);

        res.json({
          bookingsByCity: bookingsByCity.rows,
          providerDistribution: providerDistribution.rows,
          homeVisitStats: homeVisitStats.rows[0] ?? {},
        });
      } catch (err: any) {
        console.error("location analytics error:", err);
        res.status(500).json({ message: "Failed to load location analytics" });
      }
    },
  );
}
