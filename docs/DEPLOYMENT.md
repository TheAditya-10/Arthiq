# Deployment

See ADR-007 for rationale.

## 1. Database (do this first)

Any managed PostgreSQL works; documented here against **Neon** (good Vercel pairing, built-in pooling, generous free tier) with equally-valid alternatives noted.

1. Create a Neon project (or Supabase/Railway/RDS/self-hosted Postgres).
2. Note two connection strings:
   - `DATABASE_URL` — the **pooled** connection string (used by the running app).
   - `DIRECT_URL` — the **unpooled/direct** connection string (used only for `prisma migrate deploy`).
3. Run migrations against it: `pnpm --filter @arthiq/database db:migrate:deploy` (see `docs/DEVELOPMENT_GUIDE.md`).

Local development instead uses Docker Compose (`docker-compose.yml` at repo root) — no managed account needed until you actually deploy.

## 2. Web (`apps/web`) → Vercel

Both `apps/web` and `apps/api` live in one Vercel-linked repo as **two separate Vercel projects**. If you set this up via `vercel link`/`vercel project add` from the CLI (rather than importing twice from the dashboard), the project's **Root Directory** and **Install Command** aren't inferred automatically — set them explicitly, once, per project:

```bash
vercel project update arthiq-web --root-directory apps/web \
  --install-command "pnpm install --frozen-lockfile" --framework nextjs
```

1. `vercel link` inside `apps/web` (or import the repo in the Vercel dashboard, setting **Root Directory** to `apps/web`).
2. Environment variables (Vercel project settings → Environment Variables), per environment (Production/Preview/Development):
   - `NEXT_PUBLIC_API_URL` — the deployed API's base URL.
   - `DATABASE_URL` — only if the web app ever needs direct read access for a server component optimization; **not required** in the base architecture, since web talks to the API, not the DB directly (kept this way deliberately — see `docs/ARCHITECTURE.md` §3).
3. Build command: default Next.js build (`next build`) — Vercel auto-detects this from `apps/web`'s `package.json` once Root Directory is set correctly; no custom `vercel.json` needed.
4. Deploy: `vercel deploy --prod --project arthiq-web` from the **repo root** (not from inside `apps/web`) — a monorepo deploy needs the whole repo uploaded so pnpm can resolve workspace packages; the project's Root Directory setting tells Vercel which subfolder to actually build. Or push to the connected branch for automatic deployment (`vercel git connect --project arthiq-web` wires this up once).
5. Production URL is whatever Vercel assigns/aliases (e.g. `arthiq-web.vercel.app` or a custom domain configured in Vercel's Domains settings) — not hard-coded anywhere in this repo.

## 3. API (`apps/api`)

### Option A — Vercel (serverless)

1. `vercel link` inside `apps/api` (or `vercel project add arthiq-api` from the repo root), then set Root Directory/Install Command the same way as web:
   ```bash
   vercel project update arthiq-api --root-directory apps/api \
     --install-command "pnpm install --frozen-lockfile"
   ```
2. **Build command** — must be set explicitly (Vercel's zero-config detection doesn't know to run Prisma codegen or that `packages/*` need building first):
   ```bash
   vercel project update arthiq-api --build-command \
     "pnpm --filter @arthiq/database run db:generate && pnpm turbo run build --filter=@arthiq/api"
   ```
   `turbo run build --filter=@arthiq/api` also builds `packages/database`, `packages/types`, `packages/validation`, and `packages/classification` first (turbo's dependency graph, see `turbo.json`) — all four ship compiled `dist/` output (not raw `.ts`) specifically so Vercel's function bundler can trace them; a workspace package with `"main": "./src/index.ts"` breaks Vercel's per-function build in a way `tsc`/`tsx` never surface locally.
3. Environment variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `AI_PROVIDER_API_KEY` (optional), `CORS_ALLOWED_ORIGINS` (comma-separated list including the web app's URL) — see `.env.example` for the full list, including optional ones (`LOG_LEVEL`, `AI_CONFIDENCE_THRESHOLD`). There is no `JWT_REFRESH_SECRET` — refresh tokens are opaque random bytes, not JWTs (docs/SECURITY.md §3).
   - If provisioning Postgres via the Vercel Marketplace Neon integration (`vercel integration add neon`), it sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` — Prisma's schema expects `DIRECT_URL`, so add that name yourself pointing at the same unpooled connection string:
     ```bash
     vercel env add DIRECT_URL production preview development --no-sensitive
     ```
4. The Vercel-specific entrypoint (`apps/api/src/adapters/vercel.ts`, per ADR-007) is the only file aware it's running on Vercel; everything else is portable. `apps/api/api/index.ts` re-exports it so Vercel's file-based function routing picks it up, and `apps/api/vercel.json` rewrites every path to that one function.
5. Run migrations against the target database before or right after the first deploy (see §1) — the build/deploy step does not run `prisma migrate deploy` automatically.
6. Deploy: `vercel deploy --prod --project arthiq-api` from the **repo root** (same reasoning as web, above).

### Option B — Container (Railway / Render / Fly.io / any Docker host)

1. `apps/api` includes a `Dockerfile` (multi-stage: install → build → slim runtime image running `node dist/server.js`, the long-running-process entrypoint from ADR-007).
2. Set the same environment variables as above via the host's dashboard/CLI.
3. Point a reverse proxy/load balancer at the container for TLS termination if the host doesn't provide it automatically (Railway/Render/Fly all do).
4. This path is what you'd migrate to if Vercel's serverless execution model (cold starts, max execution duration) ever becomes limiting — no code changes required, only the deployment target.

Both options run the exact same `buildApp()` Fastify instance — see `docs/ARCHITECTURE.md` §3 "adapters/".

## 4. Mobile — Not Deployed to an App Store in V1

The Android app is built and installed locally (APK/AAB via Gradle, sideloaded or installed via `adb`) rather than published to the Play Store for V1 — see `docs/ANDROID_SETUP.md` and `docs/MOTOROLA_SETUP.md`. It points at the deployed API via a build-time config value (`API_URL` in `apps/mobile/.env` / `app.json` extra config), so switching between a local dev API and the production Vercel/container API is a config change, not a code change.

## 5. Environments

| Env         | Web                                                                                                                                        | API                                    | DB                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| development | `next dev` on localhost                                                                                                                    | `apps/api` via `pnpm dev` (tsx watch)  | Docker Compose Postgres                                                                                                                 |
| test        | `next dev` on a dedicated port (3100) — see `apps/web/playwright.config.ts`'s `webServer` entries — driven by Playwright for the E2E suite | same binary, dedicated port (4100)     | dedicated `arthiq_test` database in the same Docker Compose Postgres, truncated by `apps/web/e2e/global-setup.ts` before the suite runs |
| production  | Vercel                                                                                                                                     | Vercel or container (Option A/B above) | managed Postgres (Neon/Supabase/etc.)                                                                                                   |

## 6. Rollback

- Web: Vercel keeps every deployment; "Promote" a previous deployment from the dashboard/CLI (`vercel rollback`) if a release regresses.
- API: same, on Vercel; on a container host, redeploy the previous image tag.
- Database: Prisma migrations are additive-first by convention in this project (avoid destructive migrations without a documented backfill plan) — see `docs/DEVELOPMENT_GUIDE.md` for the migration workflow.
