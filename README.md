# Arthiq

Personal finance intelligence and reconciliation system. Captures financial transactions (starting with Android UPI payment notifications), classifies them into a hierarchical, user-editable category system, keeps a separate ledger for money lent/borrowed with other people, provides monthly financial analytics with event/trip-based adjustments, and reconciles tracked transactions against actual bank balances.

> **Status**: V1 complete — all 17 phases in `docs/IMPLEMENTATION_PLAN.md` are done. The web app, API, and Android app are fully built and tested (133 automated tests + a Playwright E2E scenario); the one standing gap is that the mobile app's native Kotlin module and screens have never run on a real device or emulator, since this project was built in a sandbox with no Android SDK. See `docs/IMPLEMENTATION_STATUS.md` for the exact, unglossed verification status of every phase.

## Why This Exists

Most finance-tracking apps either treat lending money to a friend as an expense, treat borrowing as income, or double-count transfers between your own accounts — all of which quietly corrupt your actual spending picture. Arthiq keeps these concepts explicitly separate (see `docs/PRODUCT_REQUIREMENTS.md` §3) and treats a monthly reconciliation against your real bank balance as a first-class feature, not an afterthought — so you always know whether the numbers you're looking at actually match reality, and if not, why.

## Features (V1 target)

- Android notification listener for near-real-time UPI transaction capture (Google Pay, PhonePe, Paytm, generic UPI)
- Layered, deterministic-first transaction classification that learns from your corrections (no AI required to function)
- Editable, user-defined category hierarchy (Bucket → Sub-bucket)
- Independent Event/Trip tagging with adjustable "include/exclude this event" analytics
- Separate People Ledger for lending, borrowing, and repayments — never mixed into expense/income totals
- Multi-account ledger with proper transfer handling (no double-counting)
- Manual transaction entry, cash expenses, and CSV/bank-statement import
- Cross-source deduplication (notification + import + future bank integration)
- Monthly reconciliation: expected vs. actual balance, with investigable discrepancy hints
- A real web dashboard (charts, insights generated only from actual stored data) and a companion Android app

## Architecture

```
┌────────────┐   ┌───────────────┐   ┌────────────┐
│ Android App │  │ Web Dashboard  │  │ PostgreSQL   │
│ (RN/Expo)    │  │ (Next.js,      │  │ (Prisma)      │
│ Notification  │  │  Vercel)       │  │              │
│ Listener      │  └──────┬────────┘  └──────┬───────┘
└──────┬───────┘         │                  │
       │  HTTPS/JWT       │  HTTPS/JWT        │
       └─────────┬────────┘                  │
                 ▼                          │
         ┌───────────────┐                    │
         │ Fastify API      │──── Prisma ─────┘
         │ (Vercel or        │
         │  container)         │
         └───────┬──────────┘
                 │
     ┌───────────┴────────────┐
     │ packages/classification, │
     │ database, types,          │
     │ validation                 │
     └────────────────────────┘
```

Full detail: `docs/ARCHITECTURE.md`. Key decisions and their rationale: `docs/ADR/`.

## Repository Structure

```
apps/
  web/          Next.js dashboard (Vercel)
  api/           Fastify REST API (Vercel-deployable, also container-portable)
  mobile/         React Native (Expo prebuild) Android app + native notification listener
packages/
  database/       Prisma schema, migrations, seed data
  types/           Shared TypeScript domain types/enums
  validation/       Shared Zod schemas
  classification/   The classification engine (pure TS)
  config/           Shared eslint/tsconfig/prettier config
docs/             Full engineering documentation (see below)
scripts/          Dev/ops helper scripts
```

## Tech Stack

| Layer    | Stack                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Web      | Next.js 15, React, TypeScript, Tailwind CSS (hand-rolled UI primitives, not a component library), Recharts |
| API      | Node.js, TypeScript, Fastify, Zod                                                                          |
| Mobile   | React Native, TypeScript, Expo (prebuild/bare workflow), Kotlin native module                              |
| Database | PostgreSQL, Prisma                                                                                         |
| Testing  | Vitest (unit/integration, all apps and packages), Playwright (web E2E)                                     |
| Tooling  | pnpm workspaces, Turborepo, ESLint, Prettier, Husky/lint-staged                                            |

Full rationale for every choice: `docs/ADR/`.

## Documentation Map

| Doc                             | Purpose                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `docs/PROJECT_STATUS.md`        | What existed in the repo before this build, risks, recommended architecture      |
| `docs/PRODUCT_REQUIREMENTS.md`  | What the product must do, and the core domain distinctions it must never violate |
| `docs/SYSTEM_REQUIREMENTS.md`   | Environment/toolchain/runtime requirements                                       |
| `docs/ARCHITECTURE.md`          | System design, monorepo layout, data flow                                        |
| `docs/DATABASE_DESIGN.md`       | Full schema, every table, dedup-hash design                                      |
| `docs/API_SPECIFICATION.md`     | REST API surface (OpenAPI served at `/api/docs` in dev)                          |
| `docs/MOBILE_ARCHITECTURE.md`   | Android app structure, notification flow, permissions                            |
| `docs/CLASSIFICATION_ENGINE.md` | The layered classifier and its learning loop                                     |
| `docs/RECONCILIATION_ENGINE.md` | Expected-vs-actual balance math and deduplication algorithm                      |
| `docs/SECURITY.md`              | What data is collected, where it lives, deletion path                            |
| `docs/TESTING_STRATEGY.md`      | What's tested, where, and how                                                    |
| `docs/DEPLOYMENT.md`            | Vercel + container deployment steps                                              |
| `docs/ANDROID_SETUP.md`         | Enabling notification access, testing capture end-to-end                         |
| `docs/MOTOROLA_SETUP.md`        | Motorola Edge 50 Fusion battery/background specifics                             |
| `docs/DEVELOPMENT_GUIDE.md`     | Local setup, all commands, build-the-APK instructions                            |
| `docs/IMPLEMENTATION_PLAN.md`   | The phased build plan                                                            |
| `docs/IMPLEMENTATION_STATUS.md` | Live status of every phase                                                       |
| `docs/ADR/`                     | Architecture Decision Records                                                    |

## Quick Start

```bash
git clone git@github.com:TheAditya-10/Arthiq.git
cd Arthiq
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Full walkthrough, including Android setup: `docs/DEVELOPMENT_GUIDE.md`.

## Testing

```bash
pnpm test        # unit + integration
pnpm lint
pnpm typecheck
```

Details: `docs/TESTING_STRATEGY.md`.

## Building the Android App

```bash
cd apps/mobile
npx expo prebuild -p android
npx expo run:android          # or: cd android && ./gradlew assembleDebug
```

Then `adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Full guide, including notification-access setup: `docs/ANDROID_SETUP.md` and `docs/MOTOROLA_SETUP.md`.

## Deployment

Web deploys to Vercel; the API is deployable to Vercel or any container host without code changes. Full steps: `docs/DEPLOYMENT.md`.

## Security & Privacy

Financial data handling, what's collected, what stays on-device, and how to delete your data: `docs/SECURITY.md`.

## Troubleshooting

See `docs/ANDROID_SETUP.md` §8 and `docs/MOTOROLA_SETUP.md` §8 for notification-capture issues; `docs/DEVELOPMENT_GUIDE.md` for local dev issues.

## Roadmap (not in V1)

Account Aggregator/bank API integration, multiple banks/credit cards/investment accounts, recurring-expense detection, budgeting, anomaly detection, natural-language financial queries, forecasting, Telegram/WhatsApp notification delivery, iOS client. Extension points for all of these are documented in `docs/ARCHITECTURE.md` §6 but deliberately not built until there's a real need.

## License

MIT — see `LICENSE`.
