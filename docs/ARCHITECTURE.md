# Architecture

See `docs/ADR/` for the reasoning behind each major decision referenced here.

## 1. System Overview

```
┌─────────────────┐        ┌──────────────────┐        ┌────────────────────┐
│   Android App     │        │   Web Dashboard    │        │   PostgreSQL         │
│ (React Native/     │        │ (Next.js, Vercel)   │        │ (Neon/Supabase/       │
│  Expo prebuild)     │        │                    │        │  self-hosted)         │
│                    │        │                    │        │                     │
│ NotificationListener│        │  Dashboard/Ledger/  │        │  User, Account,       │
│  Service (Kotlin)   │        │  People/Analytics/   │        │  Transaction, Bucket, │
│  Parsers, local queue│       │  Reconciliation UI   │        │  Person, Event, ...   │
└─────────┬───────────┘        └─────────┬──────────┘        └──────────┬──────────┘
          │  HTTPS (JWT)                  │  HTTPS (JWT via                  │
          │                               │   httpOnly cookie)                │
          └──────────────┬────────────────┘                                   │
                         ▼                                                    │
                ┌──────────────────────┐                                       │
                │   Fastify API           │───────────── Prisma ─────────────────┘
                │ (apps/api, Vercel or     │
                │  container)               │
                │                          │
                │ auth · transactions ·      │
                │ accounts · buckets ·        │
                │ merchant-rules · events ·    │
                │ people · people-ledger ·      │
                │ reconciliation · analytics ·   │
                │ imports · notifications         │
                └───────────┬──────────────┘
                            │
                  ┌─────────┴─────────┐
                  │ packages/          │
                  │  classification     │  (composite classifier, pure TS)
                  │  database (Prisma)  │
                  │  types              │
                  │  validation (Zod)    │
                  └────────────────────┘
```

## 2. Monorepo Layout

```
Arthiq/
├── apps/
│   ├── web/          Next.js 15 App Router, Tailwind, shadcn/ui, Recharts
│   ├── api/           Fastify + TypeScript REST API
│   └── mobile/         React Native (Expo prebuild/bare) Android app
├── packages/
│   ├── database/       Prisma schema, migrations, seed script, generated client
│   ├── types/           Shared TS enums/domain types (no Prisma import — mobile-safe)
│   ├── validation/       Zod schemas (request validation + form validation, shared)
│   ├── classification/   Composite classification engine (pure TS, no I/O — takes
│   │                     a data-access interface as a dependency, so it's testable
│   │                     without a DB and reusable if classification is ever run
│   │                     on-device)
│   └── config/           Shared eslint-config, tsconfig base, prettier config
├── docs/
├── scripts/             one-off/dev scripts (seed trigger, docker helpers)
├── .env.example
├── docker-compose.yml    local Postgres
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## 3. Layering Within `apps/api`

```
routes/         Fastify route definitions — HTTP concerns only (params, status codes)
                 → call services, never touch Prisma directly
services/       Business logic (e.g. TransactionService, ReconciliationService,
                 PeopleLedgerService, AnalyticsService) — orchestrates repositories +
                 packages/classification; this is where "lending never counts as an
                 expense" and "transfers never double-count" are enforced, in one place
repositories/   Thin Prisma query layer. Every function signature requires `userId`
                 as its first parameter — a repository function that queries
                 Transaction without a userId parameter does not compile. This is the
                 structural enforcement of "never allow one user's data to leak to
                 another" (Rule: tenant scoping)
plugins/        Fastify plugins: auth (JWT verify → request.userId), error handler,
                 rate limiting, request logging (redacting sensitive fields)
adapters/       Deployment adapters — node-server.ts (long-running listen) and
                 vercel.ts (serverless handler wrapping the same Fastify instance).
                 This is the *only* place Vercel-specific code may appear.
```

Web (`apps/web`) is a standard Next.js App Router app: Server Components fetch from the API using a server-side API client (attaches the session cookie/token), Client Components handle interactive forms (transaction edit, reconciliation input) via a typed fetch wrapper. No direct Prisma access from `apps/web` — it always goes through the API, so mobile and web share one authorization/business-logic path and never drift.

## 4. Data Flow: Notification → Classified Transaction (the core loop)

1. Android `NotificationListenerService` receives a `StatusBarNotification` from an allow-listed package.
2. The matching `NotificationProvider` parser extracts `{ amountMinor, direction, merchantRaw, timestamp, referenceId?, sourcePackage }`. If no parser matches or required fields can't be extracted, the notification is dropped (never sent as a garbage transaction).
3. The RN layer computes a local dedup hash and checks a small on-device recent-hash cache (handles the OS occasionally re-posting/updating the same notification) before queuing a sync.
4. `POST /notifications/ingest` (JWT-authenticated) with the normalized payload.
5. API: `NotificationIngestService` → dedup check against existing `Transaction`/`NotificationSource` rows (composite signal, see `docs/RECONCILIATION_ENGINE.md` §Dedup) → if new, creates a `Transaction` (`type: UNKNOWN` until classified, direction-appropriate default guess of `EXPENSE`/`INCOME` from the parsed direction) and a `NotificationSource` audit row.
6. `CompositeClassifier` (packages/classification) runs synchronously in the same request (it's all local DB lookups + optional single AI call only on low confidence) and updates `bucketId`/`subBucketId`/classification metadata.
7. API responds; mobile shows a local notification: `"₹480 at Zomato — Food → Delivery [Correct] [Change]"`.
8. If the user taps "Change," the mobile app calls `PATCH /transactions/:id` with the new bucket/sub-bucket; the API updates the transaction (`classificationSource: MANUAL`) and upserts a `MerchantRule` for that merchant (`RuleClassifier`'s data), so future transactions from that merchant classify via step 1 (`RULE`) automatically.

## 5. Cross-Cutting Concerns

- **Auth**: see ADR-003. Enforced via a Fastify `preHandler` hook (`requireAuth`) on every protected route, attaching `request.userId`.
- **Validation**: every route validates its body/query/params against a Zod schema from `packages/validation` before it reaches a service — invalid input never reaches business logic.
- **Audit logging**: material state changes (classification override, category merge, reconciliation adjustment, people-ledger repayment) write an `AuditLog` row (`userId, entityType, entityId, action, before, after, at`) — see `docs/DATABASE_DESIGN.md`.
- **Money math**: centralized in `packages/database`'s money helpers (`toMinor`, `fromMinor`) and `apps/api`'s analytics/reconciliation services — never re-implemented ad hoc in a route handler or in the web/mobile UI layer beyond simple display formatting.

## 6. Extensibility Points (kept open, not built, in V1)

- `NotificationProvider` → add a parser for a new app or, later, a bank's own push notifications.
- `ClassificationProvider` → swap/add an `AIClassifier` implementation without touching `CompositeClassifier`'s orchestration.
- `Transaction.source` enum has room for `ACCOUNT_AGGREGATOR` alongside `ANDROID_NOTIFICATION | MANUAL | CSV_IMPORT`.
- `Account.type` enum has room for `CREDIT_CARD | WALLET | INVESTMENT` alongside `BANK | CASH`.
- Multi-currency: `amountMinor` + a currently-fixed `currency: "INR"` column, so adding a currency dimension later doesn't require a data migration of the amount column itself.
