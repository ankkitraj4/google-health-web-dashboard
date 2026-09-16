# syntax=docker/dockerfile:1
#
# Single-image build: compiles the frontend (Vite) and backend (Express)
# separately, then ships only the backend's production deps plus both
# builds' output. The runtime server serves the built frontend itself (see
# STATIC_DIR handling in server/src/index.ts) so one container is enough —
# no separate nginx/static host needed.

ARG NODE_VERSION=24-alpine

# ---- frontend build -------------------------------------------------------
FROM node:${NODE_VERSION} AS frontend-build
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN pnpm build

# ---- backend build ----------------------------------------------------
FROM node:${NODE_VERSION} AS server-build
WORKDIR /app/server
RUN npm install -g pnpm@10
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/tsconfig.json ./
COPY server/src ./src
RUN pnpm build

# ---- runtime ------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
RUN npm install -g pnpm@10
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=server-build /app/server/dist ./dist
COPY --from=frontend-build /app/dist ./public

# No NODE_ENV=production here on purpose: server/src/session.ts marks the
# session cookie Secure only when NODE_ENV=production, which browsers then
# refuse to send over plain HTTP. Leave it unset for a plain `docker run`
# on localhost/LAN; set NODE_ENV=production yourself once you've put a TLS
# reverse proxy in front (see README).
ENV PORT=8787
ENV STATIC_DIR=/app/public
ENV DATABASE_PATH=/app/data/dev.sqlite3

# GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI, FRONTEND_ORIGIN,
# TOKEN_ENCRYPTION_KEY, and WEBHOOK_AUTH_TOKEN are secrets/deployment-specific
# and are intentionally NOT set here — pass them with `docker run --env-file`
# or `docker compose` (see server/.env.example and docker-compose.yml).

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8787
CMD ["node", "dist/index.js"]
