# Implementation Status

_Update this file at the end of every phase (Rule 15)._

## Phase 0 — Repository Inspection & Documentation

- **Status**: Complete
- **Completed work**: Inspected repository (found it effectively empty — LICENSE only, git remote `TheAditya-10/Arthiq` on GitHub). Confirmed local toolchain (Node 22, installed pnpm 11 at user level, Java 21, Docker present, Android SDK/adb absent). Authored `docs/PROJECT_STATUS.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/SYSTEM_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, `docs/API_SPECIFICATION.md`, `docs/MOBILE_ARCHITECTURE.md`, `docs/CLASSIFICATION_ENGINE.md`, `docs/RECONCILIATION_ENGINE.md`, `docs/SECURITY.md`, `docs/TESTING_STRATEGY.md`, `docs/DEPLOYMENT.md`, `docs/ANDROID_SETUP.md`, `docs/MOTOROLA_SETUP.md`, `docs/DEVELOPMENT_GUIDE.md`, `docs/IMPLEMENTATION_PLAN.md`, and all 7 ADRs.
- **Remaining work**: None for this phase.
- **Known issues**: Android SDK/`adb` not installed in this dev environment — flagged in `docs/PROJECT_STATUS.md` §6 as a standing risk until the developer completes local Android SDK setup (`docs/DEVELOPMENT_GUIDE.md` §6) and verifies a build on real hardware.
- **Tests**: N/A (documentation-only phase).
- **Next action**: Begin Phase 1 (monorepo & tooling foundation).

## Phase 1 — Monorepo & Tooling Foundation

- **Status**: Complete
- **Completed work**: Root `package.json`/`pnpm-workspace.yaml`/`turbo.json`; `packages/config` (shared tsconfig/eslint-flat-config/prettier); `apps/api` Fastify skeleton (`buildApp()` in `src/app.ts`, long-running entrypoint `src/server.ts`, Vercel serverless adapter `src/adapters/vercel.ts` + `api/index.ts` + `vercel.json`, `Dockerfile` for the container path, `/health` route, redacting logger, CORS, rate limiting, OpenAPI served at `/api/docs` in dev); `apps/web` Next.js 15 (App Router) + Tailwind skeleton with a placeholder home page; `docker-compose.yml` (Postgres 16); `.env.example` documenting every variable used so far; `.gitignore`; Husky `pre-commit` running `lint-staged`.
- **Verification performed**: `pnpm install` (all 4 workspace projects resolve), `pnpm lint`, `pnpm typecheck`, `pnpm build` (both `apps/web` and `apps/api` build cleanly), `pnpm test` (passes with `--passWithNoTests`, since no test suites exist yet at this phase). Manually smoke-tested the built API (`node dist/server.js`): `/health` returns `200 {"status":"ok",...}` and `/api/docs/json` serves a valid OpenAPI document.
- **Remaining work**: None for this phase — `packages/{database,types,validation,classification}` are intentionally left as empty directories until Phase 2, per `docs/IMPLEMENTATION_PLAN.md`.
- **Known issues**: pnpm's build-script allowlist (`onlyBuiltDependencies`/`allowBuilds` in `pnpm-workspace.yaml`) had to be explicitly approved for `esbuild` and `unrs-resolver` (transitive deps of vitest/tsx and eslint's resolver) — expected one-time step in a fresh environment, not a code issue.
- **Tests**: N/A (no application logic yet; tooling itself verified per above).
- **Next action**: Begin Phase 2 (database schema & migrations) — `packages/database` (Prisma schema per `docs/DATABASE_DESIGN.md`) and `packages/types`.

## Phase 2 — Database Schema & Migrations

- **Status**: Complete
- **Completed work**: `packages/database` — full Prisma schema (`prisma/schema.prisma`) matching `docs/DATABASE_DESIGN.md` (User, Session, Account, Bucket, SubBucket, Merchant, MerchantRule, Event, Person, Transaction, PeopleLedgerEntry, Reconciliation, Import, NotificationSource, AuditLog, all enums), `prisma.config.ts` (explicit root-`.env` loading, since Prisma config files opt out of Prisma's automatic env loading), initial migration (`20260830000756_init`), and a substantial dev-only seed script (`prisma/seed.ts`) implementing the Croma/MerchantRule, Goa Trip event, and Rahul lending/repayment strands of the demo scenario (spec §44), plus several months of routine Food/Transport/Income/Transfer/Cash transactions for later analytics testing. `packages/types` — dependency-free shared enums mirroring the schema exactly, plus `toMinorUnits`/`fromMinorUnits`/`formatMinorUnitsAsINR` money helpers (kept out of `packages/database` deliberately so the Prisma-free mobile app can use the same conversion logic — see updated `docs/ADR/002-database.md`), and a `ParsedTransaction` interface shared between the future mobile parsers and the notification-ingestion API. `apps/api`'s dev script now loads the root `.env` via `dotenv-cli` (Next.js/Prisma each load env independently, documented in `docs/DEVELOPMENT_GUIDE.md`).
- **Verification performed**: Started local Postgres via Docker Compose (had to `systemctl --user start docker-desktop` first, since the Docker daemon wasn't running in this environment), ran `prisma migrate dev` (created and applied the initial migration against a real database) and `prisma db seed` (completed successfully), then queried the seeded data directly (`SELECT type, count(*), sum(amountMinor) FROM transactions GROUP BY type` — 6 transaction types present with correct sums). Full workspace `pnpm lint`, `pnpm typecheck`, `pnpm test` (added and passed 7 real unit tests for the money helpers, covering float-drift-prone conversions), and `pnpm build` all pass.
- **Remaining work**: `packages/validation` (Zod schemas) and `packages/classification` remain empty, per plan, until Phases 4–5.
- **Known issues**: None outstanding for this phase.
- **Tests**: `packages/types` — 7/7 passing (money conversion, including the classic `480.1 * 100` float-drift case). No API/DB-layer tests yet — those land with the services that use them in Phase 3+.
- **Next action**: Begin Phase 3 (authentication) — `/auth` endpoints in `apps/api`, wiring `@arthiq/database` as a real dependency of the API for the first time.

## Phase 3 — Authentication

- **Status**: Complete
- **Completed work**: `packages/validation` created (Zod schemas: `registerSchema`, `loginSchema`, `updateProfileSchema`). `apps/api` now depends on `@arthiq/database` for the first time: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, implemented per `docs/ADR/003-authentication.md` — scrypt password hashing (`src/lib/password.ts`, zero native deps), JWT access tokens via `jose` (`src/lib/jwt.ts`), opaque rotating refresh tokens hashed with SHA-256 before storage (`src/lib/refreshToken.ts`), a `requireAuth` Fastify preHandler plugin (`src/plugins/auth.ts`) that is the only place `request.userId` is ever set, `user`/`session` repositories, and an `auth.service.ts` orchestrating register/login/refresh/logout. Web clients get the refresh token in an `httpOnly` cookie; mobile clients (`X-Client: mobile` header) get it in the response body for secure-storage on-device, per the two-client design in the ADR. `buildApp()` now accepts an injectable `prismaClient` so tests can point it at a separate database without touching production wiring.
- **Verification performed**: Stood up a dedicated `arthiq_test` Postgres database (migrated with the same Prisma migration used for dev) and wrote 8 real integration tests (`apps/api/src/routes/__tests__/auth.test.ts`, run via Fastify's `.inject()` against the real test DB, table-truncated between tests) covering: successful register, duplicate-email rejection, invalid-input rejection, correct/incorrect login (identical error shape for "no such user" vs. "wrong password" — never leaks which), `/auth/me` unauthenticated vs. authenticated, refresh-token rotation (old token invalidated the instant a new one is issued, reuse rejected), logout revocation, and the mobile-vs-web response shape difference. One of these tests caught a real cross-test state bug on first run (a user from an earlier test no longer existed after the per-test table truncation) — fixed by making each test self-contained. Also caught and fixed a `tsc` footgun: a build that errors without `noEmitOnError` still emits partial `.js` files next to `.ts` sources, which then got linted/picked up by Vitest — added `noEmitOnError: true` to the shared tsconfig base and removed the stray files. Full workspace `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass (15 tests total across the workspace).
- **Remaining work**: `packages/validation` currently only has auth schemas — entity schemas (accounts, transactions, buckets, etc.) land in Phase 4. `DELETE /users/me` (account deletion) and `PATCH /users/me` are deferred to whichever phase first needs a settings screen — not blocking anything currently.
- **Known issues**: None outstanding for this phase.
- **Tests**: `apps/api` — 8/8 passing (auth flow, against a real Postgres test database, not mocked). `packages/types` — 7/7 passing. 15/15 total.
- **Next action**: Begin Phase 4 (transaction/account/category APIs) — accounts, buckets, sub-buckets, merchant-rules, events, people, and transactions CRUD, all repository functions enforcing mandatory `userId` scoping per `docs/ARCHITECTURE.md` §3.

## Phase 4 — Transaction/Account/Category APIs

- **Status**: Complete
- **Completed work**: `packages/validation` gained entity schemas for accounts, buckets/sub-buckets (+ merge), merchant rules, events, people, transactions (with `.superRefine` per-type field-requirement rules per ADR-004: `TRANSFER` requires `toAccountId` ≠ `accountId`; `LENT`/`BORROWED`/`LENT_REPAYMENT`/`BORROWED_REPAYMENT` require `personId`; balance-only types reject a `bucketId`), and the `/transactions/cash` and people-ledger-entry shapes. `apps/api` gained full CRUD for `/accounts` (+ `/accounts/:id/balance`, computed via the direction-based sum formula from `docs/RECONCILIATION_ENGINE.md` §1, not type-enumeration), `/buckets` + `/sub-buckets` (archive-not-delete, plus `/merge` endpoints that reassign transactions/sub-buckets/merchant-rules in a single DB transaction before archiving the source), `/merchant-rules`, `/events` (+ `/summary`), `/people` (+ `/:id/ledger`, balance computed live from `PeopleLedgerEntry` — never stored), and `/transactions` (list with filters/pagination, create/update/void, `/cash` convenience endpoint). Every repository function takes `userId` as a required parameter (`docs/ARCHITECTURE.md` §3); creating a `LENT`/`BORROWED`/repayment-type transaction atomically creates its `PeopleLedgerEntry` in the same DB transaction, so a lending-type `Transaction` can never exist without its ledger entry. A `presentAmounts()` helper (`src/lib/present.ts`) is the one place `*Minor` bigint fields become rupee numbers for JSON responses (Fastify/JSON.stringify cannot serialize `BigInt` directly — discovered and fixed during this phase, not assumed).
- **Verification performed**: Wrote 25 new integration tests across 5 files (accounts, categories, transactions, people, events) — all passed on the first run against the real `arthiq_test` database. Specifically verified: tenant scoping (one user can never fetch/list another's accounts — 404, not a leaked row); a `TRANSFER` between two of the user's own accounts nets to zero and the combined total across both accounts is unchanged; `LENT`/`BORROWED`/repayment transactions move account balances but never appear in category totals (no bucket allowed) and correctly compute a person's `receivable`/`payable`/`outstanding` from the ledger; archiving and merging a bucket reassigns existing transactions rather than orphaning them; voiding a transaction removes its effect from balance computation; pagination and type/status filters on `/transactions`. Full workspace `pnpm lint` (2 warnings, both a deliberate documented `any` needed for correct Zod generic inference — see `apps/api/src/lib/validate.ts`), `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass — 40 tests total across the workspace (33 in `apps/api`, 7 in `packages/types`).
- **Remaining work**: Classification is not wired in yet — every transaction created through `POST /transactions` gets `classificationSource: MANUAL` (if a bucket was given) or `UNKNOWN` (if not); the layered classifier, merchant-normalization-driven auto-classification, and the "correction creates a MerchantRule" learning loop land in Phase 5. `/people-ledger` as its own dedicated endpoint (vs. today's equivalent path through `POST /transactions` with `personId`) is deferred to Phase 8, matching the plan.
- **Known issues**: None outstanding for this phase.
- **Tests**: `apps/api` — 33/33 passing (8 auth + 25 new). `packages/types` — 7/7. 40 total test cases across the workspace (no skipped or flaky tests).
- **Next action**: Begin Phase 5 (transaction classification engine) — `packages/classification` (RuleClassifier, HistoricalClassifier, HeuristicClassifier, optional AIClassifier, CompositeClassifier per `docs/CLASSIFICATION_ENGINE.md`), wired into `addTransaction`/`editTransaction` in `apps/api`.

## Phase 5 — Transaction Classification Engine

- **Status**: Not started

## Phase 6 — Web Transaction Ledger

- **Status**: Not started

## Phase 7 — Web Dashboard & Analytics

- **Status**: Not started

## Phase 8 — People Ledger

- **Status**: Not started

## Phase 9 — Reconciliation

- **Status**: Not started

## Phase 10 — Android Mobile Application

- **Status**: Not started

## Phase 11 — NotificationListenerService

- **Status**: Not started

## Phase 12 — Notification Parsers & Transaction Ingestion

- **Status**: Not started

## Phase 13 — Real-Time Classification & Mobile Notification UX

- **Status**: Not started

## Phase 14 — CSV/Bank Statement Import

- **Status**: Not started

## Phase 15 — Testing & Hardening

- **Status**: Not started

## Phase 16 — Deployment

- **Status**: Not started

## Phase 17 — Documentation & Final QA

- **Status**: Not started
