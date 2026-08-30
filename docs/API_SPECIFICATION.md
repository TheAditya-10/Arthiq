# API Specification

Base: `apps/api`, Fastify + TypeScript. Full machine-readable spec generated via `@fastify/swagger` and served at `/api/docs` in development (OpenAPI 3). This document is the human-readable overview; the OpenAPI doc is authoritative for exact request/response shapes once implemented.

All endpoints except `/auth/register` and `/auth/login` require `Authorization: Bearer <accessToken>` (web sends it from an in-memory token refreshed via the httpOnly-cookie refresh flow; mobile sends it from secure-stored token). Every response is scoped to `request.userId`.

Money fields in requests/responses are **rupees as a number at the API boundary** (e.g. `"amount": 480`), converted to/from `amountMinor` (paise) by the service layer using `packages/types`' `toMinorUnits`/`fromMinorUnits` — API consumers never think in paise. A response never contains a raw `*Minor` bigint field; `apps/api/src/lib/present.ts`'s `presentAmounts()` helper strips/renames every `*Minor` field to its rupee equivalent (e.g. `openingBalanceMinor` → `openingBalance`) before a route sends its response, both because BigInt cannot be JSON-serialized directly and to keep this conversion in exactly one place. Internal storage stays integer-minor-unit (ADR-002).

## `/auth`

| Method | Path             | Notes                                                                                                                                                               |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register` | `{ email, password, displayName }` → creates user, returns access token + sets refresh cookie (web) / returns refresh token (mobile, via `X-Client: mobile` header) |
| POST   | `/auth/login`    | `{ email, password }` → same response shape as register                                                                                                             |
| POST   | `/auth/refresh`  | rotates refresh token, returns new access token                                                                                                                     |
| POST   | `/auth/logout`   | revokes the current session's refresh token                                                                                                                         |
| GET    | `/auth/me`       | current user profile                                                                                                                                                |

## `/users`

| Method | Path        | Notes                                                             |
| ------ | ----------- | ----------------------------------------------------------------- |
| PATCH  | `/users/me` | update `displayName`, `timezone`                                  |
| DELETE | `/users/me` | account deletion — cascades per `docs/SECURITY.md` §Data Deletion |

## `/accounts`

| Method | Path                    | Notes                                                                                                                                              |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/accounts`             | list (excludes archived by default; `?includeArchived=true`)                                                                                       |
| POST   | `/accounts`             | `{ name, type, openingBalanceMinor→amount, openingBalanceDate }`                                                                                   |
| PATCH  | `/accounts/:id`         | rename, adjust opening balance                                                                                                                     |
| DELETE | `/accounts/:id`         | archives (soft delete) — 409 if it has non-archivable dependents in a way that would orphan data; in practice archiving never deletes transactions |
| GET    | `/accounts/:id/balance` | computed current balance (opening + all transaction effects to date)                                                                               |

## `/transactions`

| Method | Path                 | Notes                                                                                                                                                                         |
| ------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/transactions`      | filters: `from`, `to`, `bucketId`, `subBucketId`, `eventId`, `accountId`, `type`, `source`, `status`, `search` (merchant/description), `sort`, pagination (`page`,`pageSize`) |
| POST   | `/transactions`      | manual entry, any `type` (validated per-type field requirements, ADR-004)                                                                                                     |
| GET    | `/transactions/:id`  |                                                                                                                                                                               |
| PATCH  | `/transactions/:id`  | edit any field incl. category (triggers `MerchantRule` upsert per ADR-006 when bucket/subBucket changes and a merchant is present)                                            |
| DELETE | `/transactions/:id`  | sets `status = VOIDED` (never hard-deletes a financial record)                                                                                                                |
| POST   | `/transactions/cash` | convenience endpoint for the "+ Add Cash Expense" flow — same as POST `/transactions` with `type: CASH_EXPENSE` preset                                                        |

## `/buckets`, `/sub-buckets`

| Method       | Path                     | Notes                                                                    |
| ------------ | ------------------------ | ------------------------------------------------------------------------ |
| GET/POST     | `/buckets`               |                                                                          |
| PATCH/DELETE | `/buckets/:id`           | delete = archive                                                         |
| POST         | `/buckets/:id/merge`     | `{ intoBucketId }` — reassigns sub-buckets/transactions, archives source |
| GET/POST     | `/sub-buckets`           | `?bucketId=` filter on GET                                               |
| PATCH/DELETE | `/sub-buckets/:id`       |                                                                          |
| POST         | `/sub-buckets/:id/merge` | `{ intoSubBucketId }`                                                    |

## `/merchant-rules`

| Method       | Path                  | Notes                                |
| ------------ | --------------------- | ------------------------------------ |
| GET          | `/merchant-rules`     | list learned + seeded rules          |
| POST         | `/merchant-rules`     | manually create a rule ahead of time |
| PATCH/DELETE | `/merchant-rules/:id` |                                      |

## `/events`

| Method       | Path                  | Notes                                                             |
| ------------ | --------------------- | ----------------------------------------------------------------- |
| GET/POST     | `/events`             |                                                                   |
| PATCH/DELETE | `/events/:id`         |                                                                   |
| GET          | `/events/:id/summary` | total spend attached to this event, transaction count, date range |

## `/people`, `/people-ledger`

| Method       | Path                 | Notes                                                                                                                                                                                                                                                        |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET/POST     | `/people`            |                                                                                                                                                                                                                                                              |
| PATCH/DELETE | `/people/:id`        |                                                                                                                                                                                                                                                              |
| GET          | `/people/:id`        | includes computed `outstanding`, `receivable`, `payable`                                                                                                                                                                                                     |
| GET          | `/people/:id/ledger` | full entry history for the person                                                                                                                                                                                                                            |
| POST         | `/people-ledger`     | `{ personId, entryType: LENT\|BORROWED\|REPAYMENT_RECEIVED\|REPAYMENT_MADE, amount, accountId, occurredAt, dueDate?, notes? }` — creates the underlying `Transaction` (LENT/BORROWED/LENT_REPAYMENT/BORROWED_REPAYMENT) + its `PeopleLedgerEntry` atomically |

## `/reconciliation`

| Method | Path                  | Notes                                                                                                                                                               |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/reconciliation`     | list past reconciliations, filter by `accountId`                                                                                                                    |
| POST   | `/reconciliation/run` | `{ accountId, periodStart, periodEnd, actualClosingBalanceMinor→amount }` → computes expected balance, diff, candidate-cause hints; persists a `Reconciliation` row |
| PATCH  | `/reconciliation/:id` | attach `resolutionNotes`, set `status: RESOLVED`                                                                                                                    |

## `/analytics`

| Method | Path                   | Notes                                                                                                                                                           |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/analytics/summary`   | `?month=2026-08&excludeEventIds=id1,id2` → total spend/income/net, vs. previous month, vs. 3/6/12-month averages, all computed with/without the excluded events |
| GET    | `/analytics/by-bucket` | spend grouped by bucket/sub-bucket for a range                                                                                                                  |
| GET    | `/analytics/trend`     | daily/monthly time series for charts                                                                                                                            |
| GET    | `/analytics/insights`  | derived textual insights, generated only from the above computed numbers (no free-form LLM generation of figures — see `docs/CLASSIFICATION_ENGINE.md`/Rule 11) |

## `/imports`

| Method | Path                  | Notes                                                                                   |
| ------ | --------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/imports`            | upload CSV (multipart), returns parsed headers + row preview + suggested column mapping |
| POST   | `/imports/:id/map`    | confirm column mapping, returns full preview with per-row dedup-candidate flags         |
| POST   | `/imports/:id/commit` | commits non-duplicate rows as `Transaction`s (`source: CSV_IMPORT`)                     |
| GET    | `/imports/:id`        | status/counts                                                                           |

## `/notifications`

| Method    | Path                      | Notes                                                                                                                                                   |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST      | `/notifications/ingest`   | mobile → backend, body = normalized `ParsedTransaction` (ADR-005) + `provider`, `sourcePackage`, `rawTextHash`, optional `rawText` (only if debug mode) |
| GET       | `/notifications/sources`  | list `NotificationSource` audit rows (troubleshooting UI)                                                                                               |
| GET/PATCH | `/notifications/settings` | which providers are enabled — mirrors the on-device settings, kept for cross-device consistency in a future multi-device scenario                       |

## Error Format

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

Standard codes: `VALIDATION_ERROR (400)`, `UNAUTHORIZED (401)`, `FORBIDDEN (403)`, `NOT_FOUND (404)`, `CONFLICT (409)`, `RATE_LIMITED (429)`, `INTERNAL (500)`.

## Rate Limiting

`/auth/login`, `/auth/register` are rate-limited per-IP (`@fastify/rate-limit`) to mitigate credential-stuffing; `/notifications/ingest` is rate-limited per-user to a sane ceiling (e.g. 60/min) as a safety net against a device bug flooding the endpoint.
