// Shared token configuration. Kept independent from middleware so token
// issuance cannot create a middleware ↔ route import cycle.
export const JWT_EXPIRES_IN = "30d";
export const ACCESS_TOKEN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_EXPIRES_IN = 90 * 24 * 60 * 60 * 1000;