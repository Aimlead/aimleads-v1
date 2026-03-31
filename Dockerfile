FROM node:20-alpine

WORKDIR /app

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
