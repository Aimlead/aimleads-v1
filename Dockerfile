# ─── Stage 1: build frontend (needs devDependencies for vite) ────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG BUILD_APP_VERSION=dev
ARG BUILD_APP_BUILD_TIME=unknown
ARG BUILD_APP_COMMIT_SHA=local

# Vite inlines these into the frontend bundle at build time
ENV VITE_APP_VERSION=${BUILD_APP_VERSION} \
    VITE_APP_BUILD_TIME=${BUILD_APP_BUILD_TIME} \
    VITE_APP_COMMIT_SHA=${BUILD_APP_COMMIT_SHA}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: production node_modules only ────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ARG BUILD_APP_VERSION=dev
ARG BUILD_APP_BUILD_TIME=unknown
ARG BUILD_APP_COMMIT_SHA=local

LABEL org.opencontainers.image.title="AimLeads"
LABEL org.opencontainers.image.version=$BUILD_APP_VERSION
LABEL org.opencontainers.image.revision=$BUILD_APP_COMMIT_SHA
LABEL org.opencontainers.image.created=$BUILD_APP_BUILD_TIME

ENV NODE_ENV=production \
    APP_VERSION=${BUILD_APP_VERSION} \
    APP_BUILD_TIME=${BUILD_APP_BUILD_TIME} \
    APP_COMMIT_SHA=${BUILD_APP_COMMIT_SHA}

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3010/api/health || exit 1

USER node

CMD ["node", "server/index.js"]
