# System Requirements

## 1. Development Environment

| Requirement | Version / Notes |
|---|---|
| Node.js | ≥ 20 LTS (developed against 22.23.1) |
| pnpm | ≥ 9 (developed against 11.24.0) — installed via `npm install -g pnpm` if corepack's global symlink is blocked by permissions, as it was in this environment |
| Java (JDK) | 17–21 (Android Gradle Plugin 8.x requires 17+; developed against OpenJDK 21) |
| Android SDK | API 34+ (compileSdk), minSdk 26 (Android 8.0 — required for `NotificationListenerService` stability and covers 2018+ devices) |
| Docker | for local PostgreSQL and optional containerized API run |
| Git | any recent version |

Android Studio is **not required** for day-to-day development — all builds are CLI-driven via Gradle wrapper (`./gradlew`) and `adb`. Android Studio is documented as a fallback for debugging/emulator UI in `docs/ANDROID_SETUP.md`.

## 2. Runtime Requirements

### Web (`apps/web`)
- Deploys to Vercel (Node.js serverless runtime, Next.js 15 App Router).
- Requires `DATABASE_URL` (pooled Postgres connection) and API base URL env vars.

### API (`apps/api`)
- Runs as a standalone Node.js HTTP server (Fastify) for container deployment (Docker/Railway/Render/Fly), **and** exposes a serverless-compatible handler for Vercel deployment.
- Requires PostgreSQL 14+ (developed against 16 via Docker).
- Stateless — no in-process session storage; all state in Postgres. This is what makes both deployment targets possible.

### Mobile (`apps/mobile`)
- Target: Android only for V1 (minSdk 26, targetSdk 34).
- Built with React Native via Expo prebuild (bare workflow) — not Expo Go, because a custom native Kotlin module (`NotificationListenerService`) is required and Expo Go cannot load custom native modules.
- Physical device testing target: Motorola Edge 50 Fusion (Android 14, "Hello UI" skin) — see `docs/MOTOROLA_SETUP.md`. Also supports any Android 8.0+ device generically.

### Database
- PostgreSQL, managed by Prisma migrations. No provider lock-in; documented against Neon (serverless Postgres, pairs well with Vercel) with notes for Supabase/Railway/self-hosted.

## 3. Hardware / Device Requirements (Android app)

- Android 8.0 (API 26) minimum.
- Notification access permission (user-granted via system settings, cannot be requested via runtime permission dialog — must deep-link the user to Settings).
- Internet connectivity (Wi-Fi/mobile data) for syncing captured transactions to the backend.
- Battery-optimization exemption strongly recommended (see `docs/MOTOROLA_SETUP.md`) — Android's Doze mode and OEM battery managers can suspend background listeners otherwise.

## 4. External Dependencies

- No third-party UPI/payment-provider API is used or assumed to exist. The only Android-OS-level capability used is `NotificationListenerService`, which is a standard public Android API for any app the user grants access to — this is not a payment-provider integration.
- AI classification (optional, V1 off by default) would call an external LLM API if configured via `AI_PROVIDER_API_KEY`; the system is fully functional with this unset.

## 5. Constraints Carried Into Architecture

1. Backend business logic must not import Vercel-specific APIs (`@vercel/*` runtime hooks) directly in domain code — isolated to a thin adapter layer — so the API can move off Vercel later without a rewrite.
2. All monetary values stored as integers (paise) — no floating point in the money path.
3. Every database query that touches user data must be scoped by `userId` — enforced structurally via a repository layer, not left to per-call discipline (see `docs/SECURITY.md`).
4. Notification content handling must support a "store nothing beyond structured fields once parsed" mode for production (raw text kept only transiently / behind an explicit debug flag).
