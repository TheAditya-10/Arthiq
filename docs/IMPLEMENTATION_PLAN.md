# Implementation Plan

Phases follow the build specification's §35 sequence. Each phase ends with lint + typecheck + test + build passing, a commit, and an update to `docs/IMPLEMENTATION_STATUS.md`, per Rule 5/Rule 15.

## Phase 0 — Repository Inspection & Documentation ✅ (this phase)
Inspect repo, write `docs/PROJECT_STATUS.md` + all planning docs + ADRs + this plan.

## Phase 1 — Monorepo & Tooling Foundation
- Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`.
- `packages/config` (shared tsconfig, eslint, prettier).
- Empty-but-wired `apps/web`, `apps/api` skeletons that build and run ("hello world" level).
- `docker-compose.yml` for local Postgres.
- `.env.example`, `.gitignore`.
- Husky + lint-staged.
- CI-equivalent local check: `pnpm lint && pnpm typecheck && pnpm build`.

## Phase 2 — Database Schema & Migrations
- `packages/database`: Prisma schema per `docs/DATABASE_DESIGN.md`, initial migration, seed script skeleton, money helpers (`toMinor`/`fromMinor`).
- `packages/types`: enums mirrored for non-Prisma consumers (mobile).

## Phase 3 — Authentication
- `apps/api`: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`.
- scrypt password hashing, JWT access + rotating refresh tokens, `Session` table usage.
- Fastify auth plugin (`requireAuth` preHandler).
- Unit + integration tests for the full auth flow, including refresh rotation and tenant scoping.

## Phase 4 — Transaction/Account/Category APIs
- `packages/validation`: Zod schemas for all core entities.
- `apps/api`: accounts, buckets, sub-buckets, merchant-rules, events, people CRUD; transactions CRUD with per-type validation (ADR-004).
- Repository layer with mandatory `userId` scoping.
- Integration tests per entity + the type-validation matrix.

## Phase 5 — Transaction Classification Engine
- `packages/classification`: RuleClassifier, HistoricalClassifier, HeuristicClassifier (seed keyword dictionary), MockAIClassifier + AIClassifier interface, CompositeClassifier.
- Wire into transaction creation path in `apps/api`.
- Merchant normalization + `MerchantRule` upsert-on-correction wired into `PATCH /transactions/:id`.
- Full classification test suite per `docs/TESTING_STRATEGY.md`.

## Phase 6 — Web Transaction Ledger
- `apps/web`: auth pages (login/register), app shell/nav, Transactions ledger page (table, filters, search, sort, pagination, inline edit for category/event).
- shadcn/ui setup, Tailwind config.

## Phase 7 — Web Dashboard & Analytics
- `apps/api`: analytics endpoints (summary, by-bucket, trend, insights) — deterministic computation.
- `apps/web`: Dashboard page with Recharts (spend by bucket, daily/monthly trend, income vs expense), summary cards (vs. previous month, 3/6/12-month averages), insights list, event include/exclude control.

## Phase 8 — People Ledger
- `apps/api`: `/people`, `/people-ledger` endpoints; outstanding-balance computation.
- `apps/web`: People list + person detail page (history, record lending/borrowing/repayment).

## Phase 9 — Reconciliation
- `apps/api`: `/reconciliation` endpoints, expected-balance computation, candidate-cause heuristics.
- `apps/web`: Reconciliation page (run for account+period, show expected/actual/difference, candidate causes, resolution notes).

## Phase 10 — Android Mobile Application (scaffold)
- `apps/mobile`: Expo app scaffold, navigation shell (Home/Transactions/People/Add/Settings), auth screens, typed API client sharing `packages/types`/`packages/validation`.

## Phase 11 — NotificationListenerService
- `apps/mobile`: local Expo config plugin, Kotlin `ArthiqNotificationListenerService` + Expo Modules API bridge module, manifest wiring, on-device provider allow-list + settings screen.

## Phase 12 — Notification Parsers & Transaction Ingestion
- `apps/mobile`: GooglePayParser/PhonePeParser/PaytmParser/GenericUPIParser (TS, pattern-set based), local dedup cache, sync queue.
- `apps/api`: `/notifications/ingest`, `NotificationSource` audit rows, ingestion-time dedup (composite hash per `docs/RECONCILIATION_ENGINE.md`).
- Parser unit tests with recorded sample fixtures.

## Phase 13 — Real-Time Classification & Mobile Notification UX
- End-to-end: ingest → classify → local "Correct/Change" notification → correction flow updates `MerchantRule`.
- Mobile Transactions/Home screens reflect newly captured transactions.

## Phase 14 — CSV/Bank Statement Import
- `apps/api`: `/imports` upload → column-mapping preview → dedup-flagged commit.
- `apps/web`: Import wizard UI.

## Phase 15 — Testing & Hardening
- Fill any remaining gaps against `docs/TESTING_STRATEGY.md`'s full matrix.
- Security pass against `docs/SECURITY.md` (redaction, rate limiting, tenant-scoping audit).
- Playwright E2E for the full demo scenario (spec §44).

## Phase 16 — Deployment
- `apps/api` Vercel + container adapters wired and documented working; `apps/web` deployed to Vercel.
- `.env.example` finalized against everything actually used.

## Phase 17 — Documentation & Final QA
- Reconcile all docs against final implementation (this is a living plan — docs are updated throughout, not just at the end, but this phase is the final consistency pass).
- Final `docs/IMPLEMENTATION_STATUS.md` update, `README.md` polish.

## Sequencing Notes
- Phases 1–5 are strictly backend/shared-package foundation and must be solid before web (6–9) or mobile (10–13) begin, since both consume the same API/types/classification packages.
- Phase 14 (CSV import) is placed after the mobile notification path (10–13) because import's dedup logic reuses the same composite-hash engine exercised first by notification ingestion — but it does not have a hard technical dependency on mobile and could be reordered earlier if prioritized differently.
- Given the size of this build, phases are implemented and verified incrementally in separate work sessions/commits rather than as one continuous session — `docs/IMPLEMENTATION_STATUS.md` is the persistent record of exactly where things stand between sessions.
