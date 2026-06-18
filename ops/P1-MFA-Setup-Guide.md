# P1 — Admin MFA/2FA Setup Guide
**Sprint:** P1 Launch Blockers | **Workstream:** 1 — Admin MFA/2FA  
**Status:** ✅ Implemented | **Date:** 2026-06-11

---

## Overview

GoldenLife now supports TOTP-based two-factor authentication (2FA) for all admin and provider accounts. The implementation uses industry-standard RFC 6238 TOTP via `otplib`.

---

## Architecture

### Backend

| Component | Location |
|-----------|----------|
| TOTP service | `server/services/mfa.service.ts` |
| MFA routes | `server/routes/mfa.routes.ts` |
| DB tables | `mfa_secrets`, `mfa_recovery_codes` (via startup migration) |
| Login intercept | `server/routes/auth.routes.ts` → `POST /api/auth/login` |

### Database Tables

**`mfa_secrets`**
```sql
user_id             VARCHAR PK  (FK → users.id)
secret              TEXT        (TOTP secret — stored plaintext; future: encrypt at rest)
enabled             BOOLEAN     (default false; true after TOTP verification)
setup_completed     BOOLEAN
backup_codes_generated BOOLEAN
created_at / updated_at
```

**`mfa_recovery_codes`**
```sql
id          VARCHAR PK (gen_random_uuid)
user_id     VARCHAR (FK → users.id)
code_hash   TEXT       (SHA-256 hash of the 10-character code)
used        BOOLEAN
used_at     TIMESTAMPTZ
```

### TOTP Configuration

- **Library:** `otplib` (authenticator module)
- **Algorithm:** HMAC-SHA1 (RFC 6238)
- **Step:** 30 seconds
- **Window:** ±1 step (allows clock drift up to 30 seconds)
- **Secret length:** 32 characters (Base32 encoded)
- **Issuer:** `GoldenLife`

---

## Authentication Flow

### Setup Flow (User)
1. `GET /api/auth/mfa/status` — check if MFA already enabled
2. `POST /api/auth/mfa/setup` → returns `{ secret, qrCodeDataUrl, otpauthUrl }`
3. User scans QR code with authenticator app
4. `POST /api/auth/mfa/verify` with 6-digit code → enables MFA + returns 10 recovery codes
5. User saves recovery codes offline

### Login Flow (with MFA enabled)
1. `POST /api/auth/login` → returns `{ mfa_required: true, mfa_token: "<15min JWT>" }`
2. Frontend shows TOTP input screen (`MfaChallengeScreen` in login.tsx)
3. `POST /api/auth/mfa/challenge` with `{ mfa_token, code }` → issues full `accessToken + refreshToken`
4. Recovery code path: `POST /api/auth/mfa/recovery` with `{ mfa_token, recovery_code }`

### MFA Token (Short-lived)
- Signed with `SESSION_SECRET`
- 15-minute expiry
- Payload: `{ mfa_challenge: true, userId }`
- Prevents login replay or token reuse

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/mfa/status` | Bearer | Current MFA state for user |
| POST | `/api/auth/mfa/setup` | Bearer | Generate secret + QR code |
| POST | `/api/auth/mfa/verify` | Bearer | Verify TOTP → enable MFA |
| POST | `/api/auth/mfa/challenge` | None | Complete login with TOTP |
| POST | `/api/auth/mfa/recovery` | None | Login with recovery code |
| POST | `/api/auth/mfa/disable` | Bearer | Disable MFA (needs TOTP + password) |
| POST | `/api/auth/mfa/recovery-codes/regenerate` | Bearer | Regenerate 10 new recovery codes |
| GET | `/api/auth/mfa/recovery-codes` | Bearer | Count of remaining codes |
| GET | `/api/admin/mfa/status` | global_admin | All admins + MFA compliance |

---

## Recovery Codes

- **Count:** 10 per user
- **Format:** `XXXXX-XXXXX` (10 hex uppercase characters with dash separator)
- **Storage:** SHA-256 hash stored in DB (plaintext never stored)
- **Usage:** Single-use (marked `used = true` after consumption)
- **Audit:** Every use logged to `audit_logs`

---

## Admin Monitoring

Access via `GET /api/admin/mfa/status` (global_admin only):
```json
{
  "summary": {
    "total": 5,
    "enabled": 3,
    "disabled": 2,
    "complianceRate": 60
  },
  "admins": [...]
}
```

---

## Rollout Recommendation

1. **Phase 1 (Now):** Enable for all `global_admin` accounts — mandatory
2. **Phase 2 (Week 2):** Enable for `admin` and `country_admin` — mandatory
3. **Phase 3 (Week 4):** Enable for provider accounts — optional but encouraged

The `requireMfaVerified` middleware in `mfa.routes.ts` is ready to gate sensitive routes once rollout period ends.

---

## Security Notes

- MFA token has 15-minute TTL — expired tokens return 401 with "Please log in again"
- Failed TOTP challenges are logged to `audit_logs` with IP address
- Recovery code use is logged and triggers admin notification (future: push notification)
- TOTP secrets are stored as plaintext — **recommend encrypting at rest using AES-256 before GA**
- Rate limiting via `authLimiter` applies to the `/api/auth/mfa/challenge` path (inherited)
