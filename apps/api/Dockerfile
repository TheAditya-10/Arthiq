# Multi-stage build for the container deployment path (docs/DEPLOYMENT.md
# Option B). This is entirely optional for a Vercel deployment (Option A)
# and exists so the API can move to Railway/Render/Fly/any Docker host with
# zero code changes (docs/ADR/007-deployment-strategy.md).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/classification/package.json packages/classification/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @arthiq/api...

FROM base AS build
COPY --from=deps /repo /repo
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @arthiq/database db:generate
RUN pnpm --filter @arthiq/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/node_modules ./node_modules_root
EXPOSE 4000
CMD ["node", "dist/server.js"]
