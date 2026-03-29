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

# Start Express server
CMD ["node", "server/index.js"]
