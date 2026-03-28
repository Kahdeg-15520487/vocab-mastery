# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files (workspace config)
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

# Install ALL dependencies (workspace-aware)
RUN npm ci --workspaces --include-workspace-root

# Copy backend source
COPY apps/backend ./apps/backend

# Generate Prisma client
RUN cd apps/backend && npx prisma generate

# Build TypeScript
RUN cd apps/backend && npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install PostgreSQL client for entrypoint health check
RUN apk add --no-cache postgresql-client

# Copy package files for production install
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

# Install production dependencies only (include tsx for seed scripts)
RUN npm ci --omit=dev --workspaces --include-workspace-root && \
    cd apps/backend && npm install tsx

# Copy built files from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy entrypoint script
COPY apps/backend/docker-entrypoint.sh ./apps/backend/
RUN chmod +x ./apps/backend/docker-entrypoint.sh

# Expose port
EXPOSE 7101

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=7101

# Working directory for entrypoint
WORKDIR /app/apps/backend

# Entrypoint
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
