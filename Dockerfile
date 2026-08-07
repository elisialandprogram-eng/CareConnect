# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY .npmrc package*.json ./
RUN npm ci --registry=https://registry.npmjs.org/

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

ENV NODE_ENV=production
ENV PORT=5000

# Install only production dependencies
COPY .npmrc package*.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org/ && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Minimal public assets (if any are served from disk)
# COPY --from=builder /app/public ./public

USER nodejs

EXPOSE 5000

# Healthcheck — uses the /health endpoint added in routes.ts
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "dist/index.cjs"]
