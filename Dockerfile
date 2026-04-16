FROM node:20-alpine

WORKDIR /app

ARG BUILD_APP_VERSION=dev
ARG BUILD_APP_BUILD_TIME=unknown
ARG BUILD_APP_COMMIT_SHA=local

LABEL org.opencontainers.image.title="AimLeads"
LABEL org.opencontainers.image.version=$BUILD_APP_VERSION
LABEL org.opencontainers.image.revision=$BUILD_APP_COMMIT_SHA
LABEL org.opencontainers.image.created=$BUILD_APP_BUILD_TIME

ENV VITE_APP_VERSION=${BUILD_APP_VERSION}
ENV VITE_APP_BUILD_TIME=${BUILD_APP_BUILD_TIME}
ENV VITE_APP_COMMIT_SHA=${BUILD_APP_COMMIT_SHA}
ENV APP_VERSION=${BUILD_APP_VERSION}
ENV APP_BUILD_TIME=${BUILD_APP_BUILD_TIME}
ENV APP_COMMIT_SHA=${BUILD_APP_COMMIT_SHA}

# Install ALL dependencies (including devDependencies for vite build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Expose API port
EXPOSE 3010

# Health check — lightweight DB ping
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3010/api/health || exit 1

# Start Express server
CMD ["node", "server/index.js"]
