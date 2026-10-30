# ==========================================
# 1. Build Stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules if needed
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci

COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# ==========================================
# 2. Production Runner Stage
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/tv_corporativa.db
ENV MEDIA_PATH=/app/media

# Create persistent storage directories
RUN mkdir -p /app/data /app/media && chown -R node:node /app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled files from builder
COPY --from=builder /app/dist ./dist

# Copy public static frontend assets
COPY public/ ./public/

# Copy sample media files into default media folder
COPY media/ ./media/

# Expose HTTP & WebSocket port
EXPOSE 8080

USER node

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# Persistent volumes for database and media uploads
VOLUME ["/app/data", "/app/media"]

CMD ["node", "dist/server.js"]
