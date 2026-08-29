# Security

## 1. What Data Is Collected and Why

| Data | Why | Where stored |
|---|---|---|
| Email, password hash+salt | Authentication | Postgres (`User`) |
| Transaction details (amount, merchant, category, timestamps) | Core product function | Postgres (`Transaction`) |
| Parsed notification fields (amount, merchant, direction, timestamp) | To create a transaction from a UPI notification | Postgres (`Transaction`, `NotificationSource` — structured fields only) |
| Raw notification text | Only for debugging/re-parsing when explicitly enabled | **On-device only**, transiently, unless `DEBUG_STORE_RAW_NOTIFICATIONS` is explicitly set — never sent to the backend or logged in production; if a developer explicitly opts a build into debug storage, `NotificationSource.rawText` may be populated, but this is off by default and documented as a developer/troubleshooting-only setting, not a production default |
| CSV import files | To import bank statement transactions | Processed in-memory/streamed at import time; the original file itself is not persisted server-side beyond the import session, only the resulting `Transaction` rows and an `Import` summary record |
| Refresh tokens (hashed) | Session management | Postgres (`Session.refreshTokenHash`, never the raw token) |
| Audit trail of classification/category/ledger changes | Traceability, spec requirement | Postgres (`AuditLog`) |

## 2. What Stays On-Device vs. What Is Transmitted

**On-device only:**
- Raw notification text (except transiently for parsing, unless debug mode is explicitly on).
- The refresh token itself (stored hashed server-side; the plaintext token lives only in Android Keystore-backed `expo-secure-store` on the device).
- Local notification-settings UI state (which providers are enabled) — mirrored to the backend for audit/multi-device consistency, but the authoritative filter for what gets processed is the on-device allow-list.

**Transmitted to backend (over HTTPS only):**
- Parsed, structured transaction fields (amount, direction, merchant string, timestamp, source package, provider, hash of raw text).
- Auth credentials at login/register (over HTTPS; never logged).
- CSV file content, transiently, for the import flow.

## 3. Authentication & Session Security
See ADR-003 for full rationale. Summary controls:
- Passwords hashed with `crypto.scrypt` + per-user random salt; never stored or logged in plaintext.
- Access tokens: short-lived (15 min) JWT, HS256, secret from `JWT_ACCESS_SECRET` env var.
- Refresh tokens: opaque random 256-bit tokens, stored server-side only as a SHA-256 hash, rotated on every use, revocable (logout, or detected reuse-after-rotation).
- Web: refresh token in `httpOnly; Secure; SameSite=Lax` cookie — never readable by page JavaScript, mitigating XSS token theft.
- Mobile: refresh token in Android Keystore-backed encrypted storage.

## 4. Transport & Storage Security
- HTTPS enforced in production (Vercel provides TLS termination for both `apps/web` and `apps/api` by default; a container deployment must terminate TLS at the load balancer/reverse proxy — documented in `docs/DEPLOYMENT.md`).
- Database connections use `sslmode=require` in production connection strings.
- No secrets committed to git — `.env` is gitignored; `.env.example` documents every variable with placeholder values only.

## 5. Application-Layer Controls
- **Tenant scoping**: every repository function requires `userId` as a parameter (structural, not just convention — see `docs/ARCHITECTURE.md` §3). Every route handler derives `userId` from the verified JWT, never from a client-supplied field, so a request can never claim to act as another user.
- **Input validation**: every request body/query validated against a Zod schema (`packages/validation`) before reaching a service — rejects malformed or unexpected fields.
- **Rate limiting**: `/auth/login`, `/auth/register` per-IP; `/notifications/ingest` per-user.
- **SQL injection**: not applicable in the normal path — Prisma parameterizes all queries; any future raw SQL (e.g., a reporting query) must use Prisma's tagged-template `$queryRaw` (parameterized), never string concatenation.
- **Audit logging**: category merges, classification overrides, and people-ledger repayments write an `AuditLog` row with before/after state, so financial-state-changing actions are traceable to a user and a time.
- **Logging discipline**: the API's logger (`pino`, via Fastify's default) is configured with a redaction list covering `password`, `passwordHash`, `authorization`, `refreshToken`, `rawText` — these fields are replaced with `[REDACTED]` in any log line, in every environment, not just production, so a developer never gets used to seeing sensitive values in logs during dev either.

## 6. Data Deletion
`DELETE /users/me` performs a hard cascade delete of all of that user's rows (accounts, transactions, people, ledger entries, merchant rules, notification sources, imports, audit logs, sessions) within a single database transaction — a full "right to be forgotten" path, since this is personal financial data with no other party's data mixed in. There is no soft "deactivate" state for account deletion itself (soft-delete/archive is used for buckets/accounts/people during *normal use*, but full user deletion is a hard, irreversible delete, and the API confirms this distinction to the client so a UI can warn the user appropriately).

## 7. Known Limitations (V1, honestly stated)
- No 2FA in V1 (documented as a roadmap item).
- No WAF/DDoS-specific hardening beyond Vercel's platform defaults and the app-level rate limiting described above.
- The Android app cannot cryptographically prove a notification's authenticity beyond trusting the OS's `NotificationListenerService` API and the source package name — a rooted device with a malicious app could theoretically spoof a notification from a trusted package. This is an inherent limitation of notification-based ingestion (ADR-005), which is exactly why notification ingestion is never treated as the sole source of truth and reconciliation against actual bank data is a first-class feature, not an afterthought.
