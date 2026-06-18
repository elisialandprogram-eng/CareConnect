# GoldenLife — Deployment Guide

**Last updated:** 2026-06-09  
**Stack:** Node.js 20 + Express + Vite + PostgreSQL (Supabase)

---

## Quick Reference

| Platform | Build command | Start command | Notes |
|---|---|---|---|
| Replit | `npm run build` | `npm run start` | Dev: `npm run dev` |
| Render | `npm ci && npm run build` | `node dist/index.cjs` | render.yaml provided |
| Railway | `npm ci && npm run build` | `node dist/index.cjs` | railway.json provided |
| Fly.io | Docker build | `node dist/index.cjs` | fly.toml provided |
| Docker | `docker build` | `docker run` | Dockerfile provided |
| Generic VPS | `npm ci && npm run build` | `NODE_ENV=production node dist/index.cjs` | Use PM2 or systemd |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

### Required (startup aborts if missing)

| Variable | Description |
|---|---|
| `SUPABASE_DATABASE_URL` or `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT signing key — minimum 32 random chars |

### Optional (features degrade gracefully)

| Variable | Feature degradation |
|---|---|
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Payments disabled |
| `RESEND_API_KEY` | Transactional email (OTP, confirmations) disabled |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | File/image uploads disabled |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN` | SMS/WhatsApp notifications disabled |
| `DAILY_API_KEY` + `DAILY_DOMAIN` | Video visits fall back to Jitsi |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | Browser push notifications disabled |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | AI chat assistant disabled |
| `GOOGLE_MAPS_API_KEY` | Location picker falls back to text input |

---

## Platform Guides

### Replit

```
# Development
npm run dev

# Production build
npm run build
npm run start
```

Replit Deployments picks up the `run` command from `.replit`. The app serves on port 5000.

### Render

A `render.yaml` is included at the project root. Either:

1. Connect your GitHub repo to Render and it auto-detects `render.yaml`, **or**
2. Set manually:
   - **Build command:** `npm ci --registry=https://registry.npmjs.org/ && npm run build`
   - **Start command:** `node dist/index.cjs`
   - **Health check path:** `/health`

### Railway

A `railway.json` is included at the project root. Either:

1. Connect your GitHub repo — Railway auto-detects and uses `railway.json`, **or**
2. Set the build/start commands manually in the Railway dashboard.

Railway health check is wired to `/health`.

### Fly.io

A `fly.toml` is included. Deploy with:

```bash
fly launch --config fly.toml
fly secrets set SESSION_SECRET=<your-secret>
fly secrets set DATABASE_URL=<your-postgres-url>
# ... set other required secrets
fly deploy
```

The `fly.toml` uses the multi-stage `Dockerfile`. Health checks hit `/health` every 30 seconds.

### Docker

```bash
# Build
docker build -t golden-life .

# Run
docker run -d \
  -p 5000:5000 \
  -e SESSION_SECRET=<your-secret> \
  -e DATABASE_URL=<your-postgres-url> \
  -e NODE_ENV=production \
  --name golden-life \
  golden-life
```

The container uses a multi-stage build (builder + runner) and runs as a non-root user (`nodejs`). A `HEALTHCHECK` directive is included; Docker will probe `/health` every 30 seconds.

#### Docker Compose example

```yaml
version: "3.9"
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      NODE_ENV: production
      SESSION_SECRET: ${SESSION_SECRET}
      DATABASE_URL: ${DATABASE_URL}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    restart: unless-stopped
```

### Generic VPS (Ubuntu/Debian)

```bash
# Clone and install
git clone <repo> golden-life && cd golden-life
npm ci --registry=https://registry.npmjs.org/
npm run build

# Set env vars (or use a .env file loaded by your process manager)
export SESSION_SECRET=<your-secret>
export DATABASE_URL=<your-postgres-url>
export NODE_ENV=production

# Start with PM2
npm install -g pm2
pm2 start dist/index.cjs --name golden-life
pm2 save
pm2 startup
```

#### Nginx reverse proxy (example)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Health Check

All deployment platforms should probe:

```
GET /health
```

**Response (200 OK — healthy):**
```json
{
  "status": "ok",
  "db": "ok",
  "dbLatencyMs": 5,
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "responseTimeMs": 8
}
```

**Response (503 — database unreachable):**
```json
{
  "status": "degraded",
  "db": "error",
  "dbLatencyMs": null,
  ...
}
```

The endpoint requires **no authentication** and is intentionally registered before all middleware.

---

## Build Pipeline

```
npm ci                         → installs dependencies (uses package-lock.json)
npm run build                  → runs script/build.ts:
  ├── vite build               → bundles client → dist/public/
  └── esbuild server/index.ts  → bundles server → dist/index.cjs
npm run start                  → NODE_ENV=production node dist/index.cjs
```

**Important:** `npm ci` must be used (not `npm install`) in CI/CD to guarantee the lockfile is respected. Always pass `--registry=https://registry.npmjs.org/` to avoid registry resolution issues outside Replit.

---

## Startup Sequence

1. `validateEnvironment()` — exits immediately if `SESSION_SECRET` or database URL is missing
2. `runStartupMigrations()` — fire-and-forget idempotent schema migrations (ALTER TABLE IF NOT EXISTS)
3. `httpServer.listen(PORT)` — app starts accepting traffic
4. Cron schedulers start (reminderCron, scheduler jobs)

Migrations are **fire-and-forget** — they do not block the listen call. On the very first boot against a fresh database, some requests may return 500 until migrations complete (typically < 2 seconds). Healthcheck `start_period` of 30 seconds accounts for this.

---

## Troubleshooting

### `npm ERR! getaddrinfo ENOTFOUND package-firewall.replit.local`

**Cause:** The `package-lock.json` was generated inside Replit and baked in Replit-internal mirror URLs.  
**Fix:** The lockfile was patched to use `https://registry.npmjs.org/` for all packages. Always run `npm ci --registry=https://registry.npmjs.org/` outside Replit.

### `SESSION_SECRET too short / missing`

The app will exit immediately with a clear error message listing the missing variable. Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Database connection fails on boot

Check that `SUPABASE_DATABASE_URL` (or `DATABASE_URL`) points to a reachable PostgreSQL instance. The `/health` endpoint reports `"db": "error"` with HTTP 503 when the DB is unreachable.

### Migrations fail silently

Each migration block is wrapped in its own `try/catch` — a failure in one block does not abort subsequent blocks. Check server logs for `[db] ... warning` lines on startup.

### WebSocket connections fail behind a proxy

Ensure your reverse proxy passes `Upgrade` and `Connection` headers (see the Nginx example above). The app uses WebSockets for real-time slot events and video lobby signalling.

---

## Remaining Deployment Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Supabase connection pooler transaction mode limits prepared statements | Medium | Pool configured in `server/db.ts` with `max: 20`; use `?pgbouncer=true` in connection string |
| Cold-start migration window (< 2 s) | Low | Healthcheck `start_period=30s` absorbs this |
| `tsx` is a devDependency | Low | Production start uses `node dist/index.cjs` (esbuild bundle); `tsx` is only needed for `npm run dev` |
| Large `node_modules` in Docker | Low | Multi-stage build: only production deps in runner image |
| VAPID keys must be stable across restarts | Medium | Set as persistent environment secrets (not regenerated on each deploy) |
