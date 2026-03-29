FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Expose API port
EXPOSE 3010

# Start Express server
CMD ["node", "server/index.js"]
