---
name: Google Maps integration pattern
description: How Google Maps API is integrated — env vars, script loading, TypeScript, component locations
---

## Rule
Use `VITE_GOOGLE_MAPS_API_KEY` (frontend) + `GOOGLE_MAPS_API_KEY` (server). Both are optional — all features degrade gracefully.

**Why:** `VITE_` prefix required for Vite to expose env vars in the browser bundle. Server key is only used for geocoding/reverse-geocode API calls, never sent to the client.

**How to apply:**
- Frontend script loader is in `client/src/components/location/PlacesAutocomplete.tsx` — loads once per session via deduped module-level flag `mapsLoaded`.
- Server geocoding lives in `server/services/location.service.ts`.
- TypeScript: declare `interface Window { google: any }` globally in PlacesAutocomplete.tsx to avoid TS2503 "Cannot find namespace 'google'". All `google.maps.*` type references use `any`.
- Location routes registered via `registerLocationRoutes(app)` in `server/routes.ts`.
- Saved addresses table: `saved_addresses` (Phase D migration in `server/db.ts`).
- `SavedAddressesPicker` component at `client/src/components/location/SavedAddressesPicker.tsx`.
