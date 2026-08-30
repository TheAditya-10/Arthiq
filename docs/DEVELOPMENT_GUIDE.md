# Development Guide

## 1. Prerequisites

See `docs/SYSTEM_REQUIREMENTS.md`. Minimum to start on web/API work: Node 20+, pnpm, Docker. Android work additionally needs a JDK and the Android SDK (`docs/ANDROID_SETUP.md` covers device-side setup; SDK installation for building is covered in §6 below).

## 2. First-Time Setup

```bash
git clone git@github.com:TheAditya-10/Arthiq.git
cd Arthiq
pnpm install
cp .env.example .env            # fill in real values; .env is gitignored
docker compose up -d db          # starts local Postgres (if Docker Desktop isn't
                                  # already running: `systemctl --user start docker-desktop`
                                  # on Linux, or open the Docker Desktop app)
pnpm db:migrate                  # applies Prisma migrations
pnpm db:seed                     # loads development seed data (accounts, buckets, demo txns)
```

## 3. Common Commands (root `package.json`, delegated via Turborepo)

```bash
pnpm dev          # runs apps/web + apps/api concurrently in watch mode (turbo dev)
pnpm build        # builds all apps/packages
pnpm test         # runs all unit + integration tests
pnpm lint         # eslint across the workspace
pnpm typecheck    # tsc --noEmit across the workspace
pnpm db:migrate   # prisma migrate dev (packages/database)
pnpm db:seed      # tsx packages/database/prisma/seed.ts
pnpm format       # prettier --write
```

Per-app equivalents (when you only want one): `pnpm --filter @arthiq/web dev`, `pnpm --filter @arthiq/api dev`, etc.

## 4. Web Development

```bash
pnpm --filter @arthiq/web dev
```

Runs at `http://localhost:3000`. Requires `apps/api` running locally (`pnpm --filter @arthiq/api dev`, default `http://localhost:4000`) and `NEXT_PUBLIC_API_URL` pointed at it in `apps/web/.env.local`.

## 5. API Development

```bash
pnpm --filter @arthiq/api dev
```

Runs at `http://localhost:4000` by default (`PORT` env var). OpenAPI docs available at `http://localhost:4000/api/docs` in development only.

## 6. Mobile Development

### Install the Android SDK (one-time, if not already present)

This environment did not have the Android SDK installed at the time this guide was written (see `docs/PROJECT_STATUS.md` §6) — install it via either:

- **Android Studio** (simplest — bundles the SDK, an emulator, and a GUI installer): download from developer.android.com, run it once, and let its SDK Manager install SDK Platform 34 + Build-Tools + Platform-Tools.
- **Command-line only** (no Android Studio): download the "command line tools" package from developer.android.com, then:
  ```bash
  sdkmanager --sdk_root=$HOME/Android/Sdk "platform-tools" "platforms;android-34" "build-tools;34.0.0"
  echo 'export ANDROID_HOME=$HOME/Android/Sdk' >> ~/.zshrc
  echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.zshrc
  ```

### Run the App

```bash
cd apps/mobile
pnpm install
npx expo prebuild -p android   # generates/regenerates android/ from app.json + plugins
npx expo run:android           # builds + installs on a connected device/emulator, starts Metro
```

A device must be connected (`adb devices` shows it) with **USB debugging** enabled (`docs/MOTOROLA_SETUP.md` §2 for the Motorola-specific path), or an emulator running.

### Build a Debug APK Directly

```bash
cd apps/mobile/android
./gradlew assembleDebug
# output: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Build a Release APK/AAB

```bash
cd apps/mobile/android
./gradlew assembleRelease   # APK
./gradlew bundleRelease     # AAB (Play Store format; not used for V1 sideloading but documented for completeness)
```

Release builds require a signing key — generate one once with:

```bash
keytool -genkeypair -v -keystore apps/mobile/android/app/release.keystore \
  -alias arthiq -keyalg RSA -keysize 2048 -validity 10000
```

and configure `apps/mobile/android/app/build.gradle`'s `signingConfigs.release` to reference it (path + passwords via `apps/mobile/android/keystore.properties`, gitignored — never commit a keystore or its passwords).

## 7. Database Migrations Workflow

```bash
# after editing packages/database/prisma/schema.prisma:
pnpm --filter @arthiq/database db:migrate:dev --name <short_description>
```

This creates a new migration file, applies it locally, and regenerates the Prisma client. Commit the generated migration folder. In production, `db:migrate:deploy` applies pending migrations without prompting (used in CI/CD, against `DIRECT_URL`).

## 8. Testing

```bash
pnpm test                         # everything
pnpm --filter @arthiq/classification test
pnpm --filter @arthiq/api test
pnpm --filter @arthiq/web test:e2e   # Playwright, requires web+api+test-db running
pnpm --filter @arthiq/mobile test    # Jest, parser + component unit tests
```

`apps/api`'s integration tests (`docs/TESTING_STRATEGY.md`) run against a real Postgres database, never mocks — set up once:

```bash
docker exec arthiq-postgres psql -U arthiq -d postgres -c "CREATE DATABASE arthiq_test;"
DATABASE_URL="postgresql://arthiq:arthiq@localhost:5432/arthiq_test?schema=public" \
DIRECT_URL="postgresql://arthiq:arthiq@localhost:5432/arthiq_test?schema=public" \
  pnpm --filter @arthiq/database exec prisma migrate deploy
```

Add `TEST_DATABASE_URL` to your root `.env` (see `.env.example`) pointing at that database. Tests truncate every table after each test (`apps/api/tests/setup.ts`) — never point `TEST_DATABASE_URL` at a database with real data.

## 9. Linting/Formatting/Type Checking

```bash
pnpm lint
pnpm typecheck
pnpm format
```

Husky + lint-staged run `prettier --write` on staged files at commit time (configured at repo root, see `.husky/pre-commit`). Full `eslint` linting runs per-package (each app owns its own ESLint flat config) via `pnpm lint`, which must pass before a phase is considered complete — it is not wired into the per-commit hook because ESLint's flat config resolves one config per invocation directory, which doesn't cleanly scope to arbitrary staged files across multiple packages in a single lint-staged pass.

## 10. Git Workflow

- Commit at the end of each implementation phase (per `docs/IMPLEMENTATION_PLAN.md`), after lint/typecheck/test/build all pass.
- Conventional, descriptive commit messages (no fixed convention enforced by tooling in V1, but keep them meaningful — e.g. `feat(api): add people ledger endpoints`).
