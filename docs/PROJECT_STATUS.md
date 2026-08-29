# Project Status

_Last updated: 2026-08-30 (Phase 0)_

## 1. Current Repository State

The repository (`TheAditya-10/Arthiq` on GitHub, remote `origin` already configured over SSH) was, at the start of this effort, **effectively empty**:

```
Arthiq/
├── .git/
└── LICENSE   (MIT, copyright Aditya Pratap Singh Tomar, 2026)
```

- Single commit on `main` ("Initial commit"), working tree clean.
- No source code, no configuration, no package manager files, no CI, no documentation beyond the license.
- No existing Android project, no existing web project, no existing database schema.

This is a **greenfield build**. There is nothing to migrate and nothing to preserve except the LICENSE and the repository identity (name, remote, git history), which are kept as-is.

## 2. Existing Technologies

None. The only constraint inherited from the environment is the local toolchain available for development (see §6).

## 3. Existing Components

None.

## 4. Reusable Code

None. No prior application code exists.

## 5. Missing Components (= everything in scope)

Per the build specification, the full V1 requires:

- Monorepo tooling (pnpm workspaces + Turborepo)
- PostgreSQL schema + Prisma
- Fastify backend API (auth, transactions, accounts, categories, events, people ledger, reconciliation, analytics, imports, notifications)
- Classification engine (rule → historical → heuristic → AI → unknown)
- Next.js + Tailwind + shadcn/ui web dashboard
- React Native (Expo, bare/prebuild) Android app
- Native Android `NotificationListenerService` module + parser framework
- CSV/bank-statement import
- Deduplication engine
- Reconciliation engine
- Test suites (unit, integration, E2E, Android parser tests)
- Full documentation set (this file plus 15 others + ADRs)
- Deployment configuration (Vercel for web, Vercel-compatible + container fallback for API)

## 6. Local Environment / Toolchain (inspected 2026-08-30)

| Tool | Status | Notes |
|---|---|---|
| Node.js | v22.23.1 | OK, matches Next.js 15 / modern tooling requirements |
| npm | 10.9.8 | present |
| pnpm | Not preinstalled | Installed during this session via `npm install -g pnpm` (user-level, since corepack's global symlink hit `EACCES`) → v11.24.0 |
| Java (OpenJDK) | 21.0.11 | Sufficient for modern Android Gradle Plugin / Kotlin builds |
| Android SDK / `adb` | **Not installed** | No `$ANDROID_HOME`, no `~/Android/Sdk`, `adb` not on PATH. Must be installed by the developer before building/running the mobile app locally. Documented step-by-step in `docs/ANDROID_SETUP.md`. This does **not** block writing the mobile app's source/config — only local compilation/flashing. |
| Docker | 29.6.1 | Available — used for local PostgreSQL in development, and as the container fallback deployment path for the API |
| `psql` client | Not installed | Not required; Prisma talks to Postgres directly, and Docker's `postgres` image ships its own `psql` for ad-hoc access |
| git | configured | `user.name`/`user.email` set globally |

**Risk noted:** Because the Android SDK is not present in this environment, actual `./gradlew assembleDebug` / device install steps cannot be executed and verified end-to-end from this session. The Android source (Kotlin native module, RN/Expo app, Gradle config) will be written to be correct and buildable per documented Android/Gradle conventions, and `docs/ANDROID_SETUP.md` + `docs/MOTOROLA_SETUP.md` give the developer the exact commands to finish the build and install on a physical Motorola Edge 50 Fusion. This is called out again in `docs/IMPLEMENTATION_STATUS.md` as a standing known-limitation until verified on real hardware.

## 7. Risks Identified

1. **Android `NotificationListenerService` reliability** — OEM battery managers (Motorola/Lenovo's "MyUX"-derived Android skin) can kill background listener services. Mitigated via foreground-service-adjacent patterns, documented battery-optimization exemption steps, and by treating notification ingestion as a best-effort event source, never the sole source of truth (bank statement / CSV import remains the reconciliation baseline).
2. **UPI notification format drift** — Google Pay/PhonePe/Paytm change notification text over time and per-region. Mitigated with a parser abstraction, versioned/pattern-based (not brittle single-regex) extraction, generic UPI fallback parser, and unit tests per format sample.
3. **No public UPI transaction-history API exists** — the design does not assume one. Direct app integration (Google Pay/PhonePe/Paytm APIs) is out of scope and not fabricated; only `NotificationListenerService` (an Android OS capability, not a payment-provider API) is used.
4. **Duplicate transactions across sources** (notification + CSV import + future Account Aggregator) — addressed by a dedicated deduplication engine using a composite hash + fuzzy matching window, never a single ID.
5. **Financial correctness** — all money math (totals, reconciliation, outstanding balances) is deterministic backend/DB logic; AI is never the source of truth (see `docs/CLASSIFICATION_ENGINE.md`, `docs/ANALYTICS` sections of `docs/ARCHITECTURE.md`).
6. **Vercel + Postgres + long-lived listener mismatch** — Vercel serverless functions are stateless/short-lived; they are a fine fit for the REST API and web app, but not for anything resembling a persistent connection. No component in this design requires a persistent server connection (notification ingestion is a simple authenticated POST), so this is a non-issue, but it constrains connection pooling (→ PgBouncer/Prisma Accelerate-style pooling documented in `docs/DEPLOYMENT.md`).
7. **Auth secrets & financial data sensitivity** — handled via environment variables, hashed credentials, short-lived tokens, and scoped queries (every query filtered by `userId`); detailed in `docs/SECURITY.md`.
8. **Local Android build verification gap** (see §6) — flagged as an open risk until the developer runs the documented setup on real hardware.

## 8. Recommended Architecture (summary — full detail in `docs/ARCHITECTURE.md`)

- **Monorepo**: pnpm workspaces + Turborepo, `apps/{web,api,mobile}` + `packages/{database,types,validation,classification,config}`.
- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Recharts, deployed to Vercel.
- **API**: Fastify + TypeScript, framework-pure business logic (no Vercel-specific APIs in domain code), runnable both as a standalone Node process (Docker/Railway/Fly/Render) and wrapped for Vercel serverless functions.
- **Database**: PostgreSQL + Prisma ORM, hosted on any Postgres-compatible managed provider (Neon/Supabase/Railway — not hard-coded).
- **Mobile**: React Native + TypeScript via Expo (prebuild/bare workflow, not Expo-managed-only) so a custom Kotlin native module for `NotificationListenerService` can be added while retaining Expo tooling for everything else. Buildable locally with Gradle, no EAS dependency required.
- **Classification**: composite, deterministic-first engine (`packages/classification`), AI step optional and pluggable, off by default.
- **Auth**: email/password, argon2/scrypt-hashed, JWT access + rotating refresh tokens, structured for future OAuth.

This is elaborated with rationale in `docs/ARCHITECTURE.md` and the ADRs in `docs/ADR/`.
