# ============================================
# Pickal Backend - Production Dockerfile
# Optimized for Google Cloud Run
# ============================================

# -----------------------------
# Stage 1: Build
# -----------------------------
FROM node:18-slim AS build

WORKDIR /app

# Install OpenSSL (required for Prisma)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Copy Prisma schema (needed for prisma generate)
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src/

# Build TypeScript
RUN npm run build

# -----------------------------
# Stage 2: Production
# -----------------------------
FROM node:18-slim AS production

WORKDIR /app

# Install OpenSSL and wget (required by Prisma and healthcheck)
RUN apt-get update && apt-get install -y openssl ca-certificates wget && rm -rf /var/lib/apt/lists/*

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy Prisma schema and regenerate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy compiled JavaScript
COPY --from=build /app/dist ./dist

# Cloud Run uses PORT environment variable (default 8080)
ENV PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Run the application
CMD ["node", "dist/index.js"]
