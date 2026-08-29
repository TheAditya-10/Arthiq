# ADR 007: Web on Vercel, API Vercel-Deployable but Container-Portable, Postgres Provider-Agnostic

## Status
Accepted

## Context
The spec requires the web dashboard to deploy to Vercel, prefers the backend be Vercel-compatible "where practical" for V1, but explicitly requires business logic stay independent of Vercel-specific APIs so the backend can move to Railway/Render/Fly/AWS later. It also asks not to hard-code a Postgres provider.

## Decision
- **Web (`apps/web`)**: deployed to Vercel directly as a standard Next.js app — no special adapter needed.
- **API (`apps/api`)**: written as a plain Fastify app (`buildApp(): FastifyInstance`) with zero Vercel imports in route handlers, services, or repositories. Two thin entrypoints wrap the same `buildApp()`:
  - `src/server.ts` — starts a long-running Node HTTP server (`app.listen()`), used for local dev, Docker, and any container host (Railway/Render/Fly/plain VM).
  - `api/[[...slug]].ts` (or `apps/api`'s own `vercel.json` + a serverless handler using `@vercel/node`-compatible export) — wraps the same Fastify instance for Vercel serverless functions via `app.ready()` + `app.server.emit('request', req, res)`-style adaptation (concretely implemented with the `@fastify/aws-lambda`-style pattern or a minimal custom adapter — documented and implemented in `docs/DEPLOYMENT.md`/`apps/api`).
  
  This means the *only* Vercel-specific code is a few lines in one adapter file; everything else (routes, services, Prisma access, classification, reconciliation) is portable.
- **Database**: PostgreSQL via `DATABASE_URL`, provider-agnostic. Documented primarily against **Neon** (serverless Postgres with connection pooling built in, zero-config pairing with Vercel — but not required, and not a paid dependency baked into code), with Supabase/Railway/self-hosted-via-Docker documented as equally valid alternatives. No provider SDK is imported anywhere — just a standard `postgresql://` connection string Prisma consumes.
- **Local dev**: Docker Compose spins up Postgres for local development regardless of which managed provider is used in production.

## Consequences
- A developer can `vercel deploy` both `apps/web` and `apps/api` as two Vercel projects sharing one Postgres, satisfying "Vercel-compatible where practical."
- If Vercel's serverless model (cold starts, execution time limits, no long-lived connections) ever becomes a poor fit (e.g., a future feature needs a long-lived worker), the API can be redeployed as a container with a one-line entrypoint change and zero business-logic changes.
- Slightly more setup than a pure Next.js-API-routes monolith, justified by the explicit requirement to keep the backend portable and reusable by the mobile app (which cannot call Next.js server actions directly — it needs a real REST API).

## Rejected Alternatives
- **Backend as Next.js API routes inside `apps/web`**: simplest Vercel deployment, rejected because it would couple all business logic to Next.js request/response conventions and make it harder for the mobile app to consume the same API surface cleanly, and would violate the explicit "keep business logic independent of Vercel-specific APIs" requirement more directly than the adapter approach.
- **NestJS instead of Fastify**: NestJS's DI/module system is heavier than needed for this API's size; Fastify's lower overhead and simpler mental model were preferred, matching the spec's "Fastify or NestJS, prefer lighter" framing implicitly through the "avoid overengineering" principle.
- **Hard-coding a specific Postgres vendor's SDK** (e.g., Neon's serverless driver `@neondatabase/serverless` in application code): rejected — kept at the connection-string level so switching providers is a config change, not a code change. (A project may still opt into a vendor driver purely as a `DATABASE_URL`-compatible drop-in without code changes if pooling requires it — documented, not mandated.)
