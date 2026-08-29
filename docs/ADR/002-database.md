# ADR 002: PostgreSQL + Prisma, Integer-Paise Money, UUID Keys

## Status
Accepted

## Context
Financial data requires strong consistency, relational integrity (accounts ↔ transactions ↔ people ledger ↔ events), and exact decimal-safe arithmetic. It must also be deployable against a managed Postgres reachable from Vercel serverless functions (short-lived connections, need for pooling).

## Decision
1. **PostgreSQL** as the only supported database. Relational integrity (foreign keys, check constraints) is core to correctness guarantees like "a transfer must reference two accounts owned by the same user" or "a people-ledger entry must reference a valid person."
2. **Prisma ORM** over Drizzle. Prisma's migration workflow (`prisma migrate dev`/`deploy`), generated type-safe client, and mature ecosystem outweigh Drizzle's lighter runtime for a project where schema clarity and migration safety matter more than raw query-builder control. Revisit only if a specific query pattern proves awkward in Prisma.
3. **Money as integers (paise / smallest unit, `Int` or `BigInt`)** — never `Float`/`Decimal` arithmetic in application code. `amountMinor: Int` (INR paise; max ~21M INR fits `Int32`, but `BigInt` is used for `amountMinor` to leave headroom). All display formatting divides by 100 only at the presentation layer.
4. **UUIDs** (`@default(uuid())`) for all primary keys, so records can be created client-side (e.g., idempotent notification ingestion) without round-tripping for an ID first, and so IDs never leak sequential/enumerable information.
5. Every row scoped by `userId` with a foreign key + composite indexes `(userId, ...)` on hot query paths (see `docs/DATABASE_DESIGN.md`).
6. Connection pooling for serverless: Prisma's standard direct connection is unsuitable for Vercel's per-invocation connection churn. `DATABASE_URL` in production points at a pooled endpoint (Neon's built-in pooler, or PgBouncer in front of self-hosted Postgres); `DIRECT_URL` (unpooled) is used only for running migrations.

## Consequences
- Strong correctness guarantees at the DB layer (constraints, not just app-layer checks).
- Prisma Client adds a build step (`prisma generate`) to the pipeline.
- Integer money means every UI input (rupees) must be converted ×100 on the way in and ÷100 on the way out — centralized in `packages/validation` so it's done once, not scattered.

## Rejected Alternatives
- **SQLite** — rejected: no serverless-friendly managed hosting story compatible with Vercel, weaker concurrent-write story.
- **MongoDB** — rejected: this domain is inherently relational (referential integrity between transactions, accounts, people, events is load-bearing for correctness, e.g. "never double-count a transfer").
- **Drizzle** — reconsidered but not chosen for V1; Prisma's migration tooling and schema-as-single-file readability were weighted higher for a project prioritizing traceability/auditability over query micro-optimization.
- **Decimal/Numeric column with app-level `Decimal.js`** — rejected in favor of integer paise: simpler, avoids an extra dependency, and matches how most ledger systems handle currency.
