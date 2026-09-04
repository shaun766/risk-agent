# syntax=docker/dockerfile:1
FROM node:22-slim AS base
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
RUN pnpm --filter @flowmoney/shared-types build
# next.config.mjs's rewrites() destination is compiled into
# .next/routes-manifest.json at build time — `next start` reads that manifest
# rather than re-evaluating the config, so API_INTERNAL_URL has to be correct
# *now*, not just set on `docker run`. For docker-compose that means it has to
# be the in-network service name (http://api:4000), not localhost.
ARG API_INTERNAL_URL=http://localhost:4000
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_APP_NAME="FlowMoney AI"
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
RUN pnpm --filter @flowmoney/web build

FROM node:22-slim AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages/shared-types ./packages/shared-types

WORKDIR /app/apps/web
EXPOSE 3000
# pnpm's hoisted node_modules puts .bin at the workspace root, not per-package.
CMD ["/app/node_modules/.bin/next", "start", "-p", "3000"]
