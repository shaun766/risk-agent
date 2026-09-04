# syntax=docker/dockerfile:1
FROM node:22-slim AS base
# Prisma's query engine links against libssl; the slim base image doesn't
# ship it, which otherwise produces a silent version-detection fallback.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/financial-engine/package.json packages/financial-engine/package.json
COPY packages/ai-agents/package.json packages/ai-agents/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @flowmoney/database generate
RUN pnpm build:packages
RUN pnpm --filter @flowmoney/worker build

FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/packages ./packages

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
