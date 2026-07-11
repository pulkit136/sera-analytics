# ==============================================================================
# Build Stage
# ==============================================================================
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@9.4.0

# Copy root configs and lockfiles
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json turbo.json biome.json ./

# Copy packages and apps metadata
COPY packages/shared/package.json ./packages/shared/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/
COPY apps/indexer/package.json ./apps/indexer/

# Install dependencies (only dev and workspace dependencies first)
RUN pnpm install --frozen-lockfile

# Copy actual source files
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/contracts/src ./packages/contracts/src
COPY packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/database/src ./packages/database/src
COPY packages/database/tsconfig.json ./packages/database/
COPY apps/indexer/src ./apps/indexer/src
COPY apps/indexer/tsconfig.json ./apps/indexer/

# Build project packages using Turborepo
RUN pnpm run build

# Remove development dependencies to keep final image clean
RUN pnpm prune --prod --no-optional

# ==============================================================================
# Production Runner Stage
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy node modules and built folders
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/apps/indexer/dist ./apps/indexer/dist
COPY --from=builder /app/apps/indexer/package.json ./apps/indexer/package.json

# Run service
CMD ["node", "apps/indexer/dist/index.js"]
