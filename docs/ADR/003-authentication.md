# ADR 003: Email/Password Auth with JWT Access + Rotating Refresh Tokens

## Status
Accepted

## Context
V1 needs real authentication for a personal finance app (financial data, not a toy). It must work for both the web app (browser, can use httpOnly cookies) and the mobile app (no cookie jar shared with a browser; needs a token it can store securely). It should not lock out adding OAuth (Google Sign-In is the obvious next step) later.

## Decision
- **Password auth**: passwords hashed with Node's built-in `crypto.scrypt` (no native addon — keeps the API deployable on Vercel's serverless Node runtime without native-binary compatibility risk that libraries like `argon2` can introduce; `bcryptjs` was the other zero-native-dep option but scrypt via built-in `crypto` needs zero extra dependency at all). Salt per user, stored alongside the hash.
- **Tokens**: short-lived JWT **access token** (15 min TTL, signed HS256 with `JWT_ACCESS_SECRET`) carrying `{ userId }`, plus a long-lived **refresh token** (30 days, opaque random string, stored hashed in a `Session` table, rotated on every use — old refresh token invalidated the moment a new one is issued, so replay of a stolen-then-superseded token is detectable).
- **Web**: refresh token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie; access token kept in memory (not localStorage, to reduce XSS token-theft surface) and refreshed via a `/auth/refresh` call.
- **Mobile**: refresh token stored in Android EncryptedSharedPreferences (via `expo-secure-store`, backed by Android Keystore); access token kept in memory/JS runtime state.
- **Structure for OAuth later**: the `User` table has a nullable `passwordHash` and a separate `AuthIdentity` concept is documented (not built in V1) so an OAuth provider identity can be attached to a `User` without a schema rewrite — see `docs/DATABASE_DESIGN.md` §"Future: AuthIdentity".
- Every authenticated API request is authorized by decoding the access JWT and attaching `userId` to the request context; every DB query in every repository function takes `userId` as a required parameter (not optional) — this is enforced by TypeScript function signatures, not just convention, to make cross-user data leaks a compile error, not a runtime bug.

## Consequences
- No third-party auth vendor dependency (no Clerk/Auth0/NextAuth required) — full control, no per-MAU billing, but the team owns session security correctness.
- Refresh rotation requires a `Session` table and a bit more logic than a single long-lived JWT, but meaningfully reduces stolen-refresh-token blast radius.
- Zero native dependencies for password hashing simplifies serverless deployment.

## Rejected Alternatives
- **NextAuth/Auth.js**: attractive for the web app alone, but the API is a separate Fastify service consumed by both web and mobile — NextAuth is Next.js-coupled and would fragment auth logic across two implementations (Next.js session for web, something else for mobile). Rejected in favor of one auth implementation in the API that both clients call.
- **Argon2**: stronger KDF than scrypt in some parameter regimes, but ships as a native addon; rejected to avoid native-binary/serverless-runtime compatibility risk. Documented as revisitable if the API moves to a container deployment where native deps are less of a concern.
- **Single long-lived JWT, no refresh rotation**: simplest, rejected — no way to revoke a compromised token before natural expiry without a blocklist, which is effectively reinventing session storage anyway.
