# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Sahamology — multi-stage Docker build for the Next.js app
#
# Stage deps:      full dependency install for the build
# Stage builder:   compile the Next.js app (standalone output)
# Stage prod-deps: production-only dependency install for the runtime image
# Stage runner:    minimal production image: migrations + server.js
# ---------------------------------------------------------------------------

FROM node:20-alpine AS deps
WORKDIR /app

# Python + build toolchain are required to build some transitive native deps.
RUN apk add --no-cache python3 make g++

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------

FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------------------------------------------------------------------------

FROM node:20-alpine AS prod-deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone server bundle + static assets + public files.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migration runner + SQL migrations (deliberately copied: they are not part of
# the Next.js import graph so standalone tracing does not include them).
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/supabase ./supabase

# Production runtime dependencies (includes `pg` used by scripts/run-migrations.js).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json

USER nextjs

EXPOSE 3000

# Run migrations first; fail fast and stop the container if they fail.
CMD ["sh", "-c", "node scripts/run-migrations.js && node server.js"]
