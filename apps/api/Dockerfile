# Multi-stage build for the container deployment path (docs/DEPLOYMENT.md
# Option B). This is entirely optional for a Vercel deployment (Option A)
# and exists so the API can move to Railway/Render/Fly/any Docker host with
# zero code changes (docs/ADR/007-deployment-strategy.md).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
# pnpm needs every workspace member's package.json present to correctly
# resolve --filter against the (already-generated) lockfile, even for
# members outside the filter — otherwise it can't tell what's a workspace
# dependency vs. what needs fetching, and falls back to over-fetching the
# whole graph. Copying every manifest is cheap; only @arthiq/api's actual
# dependency closure gets installed below.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/classification/package.json packages/classification/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN pnpm install --frozen-lockfile --filter @arthiq/api...

FROM base AS build
COPY --from=deps /repo /repo
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @arthiq/database db:generate
RUN pnpm --filter @arthiq/api build
# `pnpm deploy` (not a plain node_modules copy) is required here: pnpm's
# default node-linker is "isolated" (symlinks into a shared
# content-addressable store), so apps/api/node_modules is full of symlinks
# that only resolve inside this build context. `deploy` produces a
# self-contained directory with real files — the actually-supported way to
# hand a pnpm workspace package to a plain `COPY` into a slim runtime image.
RUN pnpm --filter @arthiq/api deploy --prod /out

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out ./
EXPOSE 4000
CMD ["node", "dist/server.js"]
