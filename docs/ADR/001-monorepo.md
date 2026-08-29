# ADR 001: Monorepo with pnpm workspaces + Turborepo

## Status
Accepted

## Context
The product spans three deployables (web dashboard, backend API, Android mobile app) plus shared domain logic (types, validation schemas, the classification engine) that must stay in sync — e.g. the `TransactionType` enum and Zod validators need to be identical across API, web, and mobile. Three separate repos would fragment this and risk drift.

## Decision
Use a single repository with **pnpm workspaces** for package linking and **Turborepo** for task orchestration/caching (`build`, `test`, `lint`, `typecheck` pipelines with dependency-aware ordering).

Structure:
```
apps/
  web/            Next.js dashboard
  api/            Fastify backend
  mobile/         React Native (Expo prebuild) Android app
packages/
  database/       Prisma schema, migrations, generated client, seed script
  types/          Shared TS domain types & enums (TransactionType, ClassificationSource, ...)
  validation/     Zod schemas shared by API request validation and web/mobile forms
  classification/ The classification engine (pure TS, framework-agnostic)
  config/         Shared eslint/tsconfig/prettier base configs
```
`packages/database` is the single source of truth for the schema; `packages/types` re-exports Prisma-derived types plus hand-written enums so mobile (which cannot depend on Prisma directly) can still share types.

No `packages/ui` — a shared component package was considered but rejected (see "Rejected Alternatives") because the web app (Tailwind + shadcn/ui, which vendors components into the consuming app by design) and the mobile app (React Native primitives) don't share a component runtime; a cross-platform UI package would be architectural theatre for a two-surface V1.

## Consequences
- Single `pnpm install` at the root sets up everything.
- Turborepo caches build/test/lint outputs, keeping CI and local iteration fast as the codebase grows.
- Mobile app cannot import `packages/database` (Prisma client is Node-only); it depends only on `packages/types` and `packages/validation`.
- Adds minor tooling overhead (workspace protocol, turbo.json) versus a single app, justified by the 3-deployable + shared-domain-logic shape of this product.

## Rejected Alternatives
- **Polyrepo** (web/api/mobile as separate repos): rejected — would require publishing shared types as a versioned package, adding release overhead disproportionate to a single-developer V1.
- **Nx**: comparable to Turborepo; Turborepo chosen for lighter configuration and first-class Vercel support (same vendor as the web deployment target).
- **Shared UI package**: rejected for now (see Decision); revisit only if a second web-like surface appears.
