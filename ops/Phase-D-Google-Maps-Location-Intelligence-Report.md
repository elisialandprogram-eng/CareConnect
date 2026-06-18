# Phase D — Google Maps & Location Intelligence Foundation
**Status:** COMPLETE  
**Date:** 2026-06-09  
**Sprint:** D (Phase D)

---

## Objective

Build a complete, reusable location intelligence layer across GoldenLife:
- Saved addresses for patients
- Google Places Autocomplete (with graceful fallback)
- Provider clinic address + home visit radius settings
- Distance / coverage validation
- Admin location analytics
- Booking wizard integration

---

## Changes Delivered

### 1. Database Migrations (`server/db.ts` — `runStartupMigrations`)

| Table / Object | Changes |
|---|---|
| `users` | `+place_id TEXT`, `+formatted_address TEXT` |
| `providers` | `+clinic_address_line1`, `+clinic_address_line2`, `+clinic_postal_code`, `+clinic_formatted_address`, `+clinic_place_id`, `+home_visit_enabled BOOLEAN DEFAULT FALSE`, `+max_travel_distance_km INTEGER` |
| `family_members` | `+address_line1`, `+address_line2`, `+city`, `+state`, `+postal_code`, `+country`, `+latitude DOUBLE`, `+longitude DOUBLE`, `+formatted_address`, `+place_id`, `+use_parent_address BOOLEAN DEFAULT FALSE` |
| `saved_addresses` | NEW TABLE — `id, user_id, nickname, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, formatted_address, place_id, is_default` |
| `v_bookings_by_city` | NEW VIEW — aggregates booking counts by city |
| Indexes | `idx_saved_addresses_user_id`, `idx_saved_addresses_default` |

All migrations use `IF NOT EXISTS` / `IF NOT EXISTS` guards and are idempotent.

### 2. Schema (`shared/schema.ts`)

- `users` table Drizzle schema: added `placeId`, `formattedAddress`
- `providers` table: added 7 new clinic/home-visit columns
- `familyMembers` table: added 11 address + coordinate columns
- NEW `savedAddresses` table + `insertSavedAddressSchema`

### 3. Location Service (`server/services/location.service.ts`)

Pure-math helpers (no API key required):
- `haversineDistance(from, to)` — great-circle km
- `calculateDistance(from, to)` — returns `{ distanceKm, distanceMiles, distanceText }`
- `checkHomeVisitCoverage(patient, provider, radiusKm)` — eligibility + message
- `normalizeAddress(addr)` — trim whitespace
- `isValidCoordinates(lat, lng)` — rejects 0,0 and out-of-bounds

Optional Google Maps wrappers (require `GOOGLE_MAPS_API_KEY`):
- `geocodeAddress(address)` → `GeocodeResult | null`
- `reverseGeocode(coords)` → `GeocodeResult | null`
- `getPlaceDetails(placeId)` → `GeocodeResult | null`
- `isMapsConfigured()` — boolean

All Google calls fail gracefully and log warnings when key is absent.

### 4. Location Routes (`server/routes/location.routes.ts`)

Registered via `registerLocationRoutes(app)` in `server/routes.ts`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/locations/saved-addresses` | List user's saved addresses |
| POST | `/api/locations/saved-addresses` | Create saved address |
| PUT | `/api/locations/saved-addresses/:id` | Update saved address |
| DELETE | `/api/locations/saved-addresses/:id` | Delete saved address |
| POST | `/api/locations/saved-addresses/:id/set-default` | Set as default |
| POST | `/api/locations/geocode` | Server-side geocoding |
| GET | `/api/locations/distance` | Distance between patient and provider |
| GET | `/api/locations/check-coverage` | Home visit eligibility check |
| GET | `/api/locations/maps-status` | Whether Google Maps key is configured |
| GET | `/api/admin/analytics/location` | Admin location analytics |

### 5. Frontend Components

#### `PlacesAutocomplete` (`client/src/components/location/PlacesAutocomplete.tsx`)
- Loads Google Maps JS API lazily (single shared script tag, deduped)
- Uses `window.google.maps.places.Autocomplete`
- Falls back to plain `<Input>` when `VITE_GOOGLE_MAPS_API_KEY` is not set
- Returns structured address on place selection

#### `SavedAddressesPicker` (`client/src/components/location/SavedAddressesPicker.tsx`)
- Full CRUD for saved addresses (add/edit/delete/set-default)
- Nickname icons (Home, Work, Office, Family)
- Inline `PlacesAutocomplete` for address entry
- `showManageOnly` prop for profile tab usage

### 6. Patient Profile (`client/src/pages/profile.tsx`)

Address tab enhanced:
- Street address input → `PlacesAutocomplete` (auto-fills city/state/zip on selection)
- New "Saved Addresses" card with `SavedAddressesPicker`

### 7. Booking Wizard (`client/src/components/booking/booking-canvas.tsx`)

Home visit address input → `PlacesAutocomplete` with hint text.

### 8. Provider Setup (`client/src/pages/provider-setup.tsx`)

Section 3 (Practice Logistics) enhanced:
- Work address input → `PlacesAutocomplete` (auto-fills city/state)
- New "Home Visit Services" collapsible block:
  - Toggle to enable home visits
  - Max travel distance (km) field (shown only when enabled)

### 9. Admin Location Analytics Panel

- New component: `client/src/components/admin/dashboard/location-analytics.tsx`
- Added to admin dashboard nav under **Overview → Location Intelligence**
- Shows: visit-type breakdown (clinic/home/online totals), bookings by city bar chart, provider distribution by city

### 10. Tests (`tests/location.service.test.ts`)

Comprehensive pure-unit tests:
- `haversineDistance` — identical coords, Budapest→Vienna, London→Paris, symmetry
- `calculateDistance` — output shape, metre/km text formatting
- `checkHomeVisitCoverage` — within radius, outside radius, zero radius, boundary
- `normalizeAddress` — whitespace trim, empty line2→undefined
- `isValidCoordinates` — valid, null island, out of range

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Optional | Server-side geocoding, reverse geocode, place details |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional | Frontend Places Autocomplete script load |

Both are optional. All features degrade gracefully to plain text inputs when absent.

---

## Activating Full Maps Functionality

1. Obtain a Google Maps API key with **Places API**, **Geocoding API** enabled.
2. Add `GOOGLE_MAPS_API_KEY=<key>` to Replit Secrets.
3. Add `VITE_GOOGLE_MAPS_API_KEY=<key>` to Replit Secrets (or `.env`).
4. Restart the workflow — autocomplete and geocoding will activate automatically.

---

## Gotchas

- `VITE_GOOGLE_MAPS_API_KEY` must be prefixed `VITE_` to be accessible in the browser bundle.
- Google Maps JS API script is loaded once per page session (deduplicated via module-level `mapsLoaded` flag).
- `haversineDistance` returns 0 for identical coordinates; `isValidCoordinates` rejects `(0, 0)`.
- `saved_addresses.is_default` is enforced at app level (not DB constraint) — set-default route atomically clears all others first.
