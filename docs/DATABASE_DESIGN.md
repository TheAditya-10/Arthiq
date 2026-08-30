# Database Design

Engine: PostgreSQL. ORM: Prisma (`packages/database/prisma/schema.prisma` is the single source of truth — this document describes and explains it; if they ever disagree, the schema file wins and this doc should be updated).

Conventions: UUID primary keys (`@default(uuid())`), `createdAt`/`updatedAt` on every table, money as `BigInt` minor units (paise), soft-delete via `archivedAt: DateTime?` where deletion would break referential/audit integrity (Bucket, SubBucket, Account, Person), hard rows otherwise.

## 1. Entity Overview

```
User 1──* Account
User 1──* Bucket 1──* SubBucket
User 1──* Event
User 1──* Person 1──* PeopleLedgerEntry
User 1──* Transaction
User 1──* MerchantRule
User 1──* Merchant
User 1──* Reconciliation
User 1──* Import
User 1──* NotificationSource
User 1──* Session
User 1──* AuditLog

Transaction *──1 Account            (accountId, required)
Transaction *──0..1 Account          (toAccountId, required only when type=TRANSFER)
Transaction *──0..1 Bucket/SubBucket
Transaction *──0..1 Event
Transaction *──0..1 Person           (required only when type is a lending/borrowing type)
Transaction *──0..1 Merchant
Transaction 1──0..1 PeopleLedgerEntry (a lending-type transaction generates exactly one ledger entry)
Transaction 1──0..1 NotificationSource
Transaction 1──0..1 Import            (row provenance if created via CSV import)
```

## 2. Tables

### User

| Column                | Type           | Notes                                              |
| --------------------- | -------------- | -------------------------------------------------- |
| id                    | uuid PK        |                                                    |
| email                 | citext, unique |                                                    |
| passwordHash          | text, nullable | nullable to leave room for future OAuth-only users |
| passwordSalt          | text, nullable | scrypt salt                                        |
| displayName           | text           |                                                    |
| timezone              | text           | default `Asia/Kolkata`                             |
| createdAt / updatedAt | timestamptz    |                                                    |

### Session

Refresh-token store (ADR-003).

| Column           | Type                  | Notes                                               |
| ---------------- | --------------------- | --------------------------------------------------- |
| id               | uuid PK               |                                                     |
| userId           | uuid FK → User        | indexed                                             |
| refreshTokenHash | text                  | sha256 of the opaque refresh token, never store raw |
| userAgent        | text, nullable        |                                                     |
| expiresAt        | timestamptz           |                                                     |
| revokedAt        | timestamptz, nullable | set on rotation/logout                              |
| createdAt        | timestamptz           |                                                     |

### Account

| Column                | Type                  | Notes                                                                              |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| id                    | uuid PK               |                                                                                    |
| userId                | uuid FK               | indexed                                                                            |
| name                  | text                  | e.g. "HDFC Bank", "Cash"                                                           |
| type                  | enum `AccountType`    | `BANK \| CASH \| CREDIT_CARD \| WALLET \| INVESTMENT` (last 3 reserved for future) |
| openingBalanceMinor   | bigint                | balance as of `openingBalanceDate`                                                 |
| openingBalanceDate    | date                  |                                                                                    |
| currency              | text                  | default `INR`, fixed for V1                                                        |
| archivedAt            | timestamptz, nullable | soft delete                                                                        |
| createdAt / updatedAt | timestamptz           |                                                                                    |

Index: `(userId, archivedAt)`.

### Bucket / SubBucket

| Column (Bucket)     | Type                  |
| ------------------- | --------------------- |
| id                  | uuid PK               |
| userId              | uuid FK               |
| name                | text                  |
| archivedAt          | timestamptz, nullable |
| createdAt/updatedAt | timestamptz           |

`SubBucket` mirrors this with an additional `bucketId uuid FK`. Unique constraint `(userId, bucketId, name)` where not archived (partial index) prevents duplicate sub-bucket names within a bucket while still allowing an archived+recreated name.

Merging categories (FR-10) is implemented as: point all `Transaction.subBucketId`/`bucketId` referencing the merged-away category at the surviving one (in a transaction), then archive the merged-away row — never a delete, so `AuditLog` history stays resolvable.

### Merchant

Normalized merchant registry, decoupled from raw notification/CSV text.

| Column              | Type        | Notes                                                                  |
| ------------------- | ----------- | ---------------------------------------------------------------------- |
| id                  | uuid PK     |                                                                        |
| userId              | uuid FK     | merchants are per-user (two users' "Croma" don't share rules)          |
| normalizedName      | text        | e.g. `CROMA` — uppercase, punctuation-stripped, common suffix-stripped |
| displayName         | text        | best raw form seen, for UI                                             |
| createdAt/updatedAt | timestamptz |                                                                        |

Unique: `(userId, normalizedName)`.

### MerchantRule

The classification "memory" (ADR-006).

| Column              | Type               | Notes                     |
| ------------------- | ------------------ | ------------------------- |
| id                  | uuid PK            |                           |
| userId              | uuid FK            |                           |
| merchantId          | uuid FK → Merchant |                           |
| bucketId            | uuid FK            |                           |
| subBucketId         | uuid FK, nullable  |                           |
| createdFrom         | enum               | `USER_CORRECTION \| SEED` |
| createdAt/updatedAt | timestamptz        |                           |

Unique: `(userId, merchantId)` — one active rule per merchant; a new correction updates it in place (with the prior value captured in `AuditLog`).

### Event

| Column              | Type                  |
| ------------------- | --------------------- |
| id                  | uuid PK               |
| userId              | uuid FK               |
| name                | text                  |
| startDate / endDate | date, nullable        |
| notes               | text, nullable        |
| archivedAt          | timestamptz, nullable |
| createdAt/updatedAt | timestamptz           |

### Person

| Column              | Type                  |
| ------------------- | --------------------- |
| id                  | uuid PK               |
| userId              | uuid FK               |
| name                | text                  |
| notes               | text, nullable        |
| archivedAt          | timestamptz, nullable |
| createdAt/updatedAt | timestamptz           |

### Transaction (the core table)

| Column                   | Type                        | Notes                                                                                                                                                                               |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                       | uuid PK                     |                                                                                                                                                                                     |
| userId                   | uuid FK                     | indexed                                                                                                                                                                             |
| accountId                | uuid FK → Account           | indexed                                                                                                                                                                             |
| toAccountId              | uuid FK → Account, nullable | required iff `type = TRANSFER`                                                                                                                                                      |
| type                     | enum `TransactionType`      | `EXPENSE \| INCOME \| TRANSFER \| LENT \| BORROWED \| LENT_REPAYMENT \| BORROWED_REPAYMENT \| CASH_EXPENSE \| REFUND \| FEE \| UNKNOWN`                                             |
| amountMinor              | bigint                      | always positive; sign/effect derived from `type` + `direction`, never stored as a signed amount (avoids sign-convention bugs)                                                       |
| direction                | enum `Direction`            | `DEBIT \| CREDIT` — which way money moved on `accountId`                                                                                                                            |
| occurredAt               | timestamptz                 | when the transaction happened (not when ingested)                                                                                                                                   |
| merchantId               | uuid FK, nullable           |                                                                                                                                                                                     |
| merchantRaw              | text, nullable              | raw string as seen (notification/CSV), kept for traceability/re-parsing                                                                                                             |
| description              | text, nullable              | user-entered or CSV narration                                                                                                                                                       |
| bucketId / subBucketId   | uuid FK, nullable           | required (validated at API layer) for `EXPENSE \| CASH_EXPENSE \| INCOME \| REFUND \| FEE`; must be null for `TRANSFER \| LENT \| BORROWED \| LENT_REPAYMENT \| BORROWED_REPAYMENT` |
| eventId                  | uuid FK, nullable           | independent of type                                                                                                                                                                 |
| personId                 | uuid FK, nullable           | required iff type is one of the 4 lending/borrowing types                                                                                                                           |
| source                   | enum `TransactionSource`    | `ANDROID_NOTIFICATION \| MANUAL \| CSV_IMPORT \| ACCOUNT_AGGREGATOR(reserved)`                                                                                                      |
| classificationSource     | enum `ClassificationSource` | `RULE \| HISTORICAL \| HEURISTIC \| AI \| MANUAL \| UNKNOWN`                                                                                                                        |
| classificationConfidence | float, nullable             | 0..1                                                                                                                                                                                |
| classifiedAt             | timestamptz, nullable       |                                                                                                                                                                                     |
| classifiedBy             | text, nullable              | `"system"` or `userId` for MANUAL                                                                                                                                                   |
| status                   | enum `TransactionStatus`    | `CONFIRMED \| NEEDS_REVIEW \| DUPLICATE_SUSPECTED \| VOIDED`                                                                                                                        |
| dedupHash                | text                        | see §3 Deduplication                                                                                                                                                                |
| importId                 | uuid FK, nullable           | set when `source = CSV_IMPORT`                                                                                                                                                      |
| createdAt/updatedAt      | timestamptz                 |                                                                                                                                                                                     |

Indexes: `(userId, occurredAt)` (ledger listing/date filters), `(userId, type)`, `(userId, bucketId)`, `(userId, eventId)`, `(userId, personId)`, `(userId, dedupHash)` (dedup lookups), `(accountId, occurredAt)` (reconciliation/account statements).

Check constraints (enforced in the Zod layer today; documented as candidate DB `CHECK`s to add once Prisma's constraint support/raw SQL migration is wired — tracked, not silently skipped):

- `toAccountId IS NOT NULL` iff `type = 'TRANSFER'`, and `toAccountId <> accountId`.
- `personId IS NOT NULL` iff `type IN ('LENT','BORROWED','LENT_REPAYMENT','BORROWED_REPAYMENT')`.
- `bucketId IS NULL` when `type IN ('TRANSFER','LENT','BORROWED','LENT_REPAYMENT','BORROWED_REPAYMENT')`.

### PeopleLedgerEntry

Derived-but-materialized ledger row per lending-type transaction (kept 1:1 with the `Transaction` that caused it, so the entry is never hand-edited independent of the underlying transaction — one write path, one truth).

| Column              | Type            |
| ------------------- | --------------- |
| id                  | uuid PK         |
| userId              | uuid FK         |
| personId            | uuid FK         |
| transactionId       | uuid FK, unique | the `Transaction` (type LENT/BORROWED/LENT_REPAYMENT/BORROWED_REPAYMENT) this entry mirrors |
| entryType           | enum            | `LENT \| BORROWED \| REPAYMENT_RECEIVED \| REPAYMENT_MADE`                                  |
| amountMinor         | bigint          |                                                                                             |
| occurredAt          | timestamptz     |                                                                                             |
| dueDate             | date, nullable  |                                                                                             |
| notes               | text, nullable  |                                                                                             |
| createdAt/updatedAt | timestamptz     |                                                                                             |

**Outstanding balance formula** (always computed, never stored, so it can't drift):

```
receivable(person) = Σ LENT.amountMinor − Σ REPAYMENT_RECEIVED.amountMinor
payable(person)    = Σ BORROWED.amountMinor − Σ REPAYMENT_MADE.amountMinor
outstanding(person) = receivable(person) − payable(person)
  // positive => person owes the user; negative => user owes the person
```

### Reconciliation

| Column                      | Type             |
| --------------------------- | ---------------- |
| id                          | uuid PK          |
| userId                      | uuid FK          |
| accountId                   | uuid FK          |                                                 |
| periodStart / periodEnd     | date             | typically a calendar month                      |
| openingBalanceMinor         | bigint           |                                                 |
| expectedClosingBalanceMinor | bigint           | computed at run time, stored as a snapshot      |
| actualClosingBalanceMinor   | bigint, nullable | user-entered from bank statement                |
| differenceMinor             | bigint, nullable | `actual - expected`, stored snapshot            |
| status                      | enum             | `PENDING \| MATCHED \| DISCREPANCY \| RESOLVED` |
| resolutionNotes             | text, nullable   |                                                 |
| createdAt/updatedAt         | timestamptz      |                                                 |

### Import

| Column                                                 | Type            |
| ------------------------------------------------------ | --------------- |
| id                                                     | uuid PK         |
| userId                                                 | uuid FK         |
| accountId                                              | uuid FK         | which account the statement belongs to                                                                       |
| fileName                                               | text            |                                                                                                              |
| status                                                 | enum            | `PENDING_MAPPING \| PREVIEWED \| COMMITTED \| FAILED`                                                        |
| columnMapping                                          | jsonb           | suggested (then user-confirmed) CSV column → field mapping                                                   |
| stagedRows                                             | jsonb, nullable | parsed CSV rows, held only between preview and commit; set to `null` once committed — see `docs/SECURITY.md` |
| rowCount / importedCount / duplicateCount / errorCount | int             |                                                                                                              |
| createdAt/updatedAt                                    | timestamptz     |                                                                                                              |

### NotificationSource

Audit/provenance row per ingested notification (separate from `Transaction` so a duplicate/rejected notification is still auditable).

| Column         | Type              |
| -------------- | ----------------- |
| id             | uuid PK           |
| userId         | uuid FK           |
| transactionId  | uuid FK, nullable | null if rejected/duplicate and no transaction was created                                                         |
| sourcePackage  | text              | e.g. `com.google.android.apps.nbu.paisa.user`                                                                     |
| provider       | enum              | `GOOGLE_PAY \| PHONEPE \| PAYTM \| GENERIC_UPI`                                                                   |
| rawTextHash    | text              | sha256 of raw text — used for exact-duplicate detection without storing the text itself by default                |
| rawText        | text, nullable    | only populated when the device has debug-storage explicitly enabled; never populated in production ingestion path |
| parseSucceeded | boolean           |                                                                                                                   |
| dedupOutcome   | enum              | `NEW \| DUPLICATE \| REJECTED_UNPARSEABLE`                                                                        |
| receivedAt     | timestamptz       |                                                                                                                   |

### AuditLog

| Column     | Type            |
| ---------- | --------------- |
| id         | uuid PK         |
| userId     | uuid FK         |
| entityType | text            | e.g. `Transaction`, `Bucket`, `MerchantRule`                              |
| entityId   | uuid            |                                                                           |
| action     | text            | e.g. `CLASSIFICATION_OVERRIDDEN`, `CATEGORY_MERGED`, `REPAYMENT_RECORDED` |
| before     | jsonb, nullable |                                                                           |
| after      | jsonb, nullable |                                                                           |
| at         | timestamptz     |                                                                           |

## 3. Deduplication (schema-level support)

`dedupHash` on `Transaction` = a stable hash over a normalized composite key:

```
sha256(
  userId +
  accountId +
  type +
  amountMinor +
  round(occurredAt to nearest 5-minute bucket) +
  normalizedMerchant (if present)
)
```

On ingestion (notification or CSV row), the service:

1. Looks up existing `Transaction` rows with the same `dedupHash` within a ±configurable window (default: same hash is sufficient since the hash already buckets time; a secondary ±15-minute exact-timestamp fuzzy check runs if `referenceId`/UPI reference numbers are present but hashes differ due to bucket-edge timing).
2. If a match with a _different_ `source` is found (e.g., notification vs. CSV), the incoming one is linked as a duplicate (`status = DUPLICATE_SUSPECTED` if not identical, silently merged/discarded if identical) rather than a second row — the earlier-created transaction wins as canonical, and the new source's provenance (`NotificationSource`/`Import` row) still records `dedupOutcome = DUPLICATE` for auditability. See `docs/RECONCILIATION_ENGINE.md` for full dedup algorithm and the "never assume notification ID alone is sufficient" signal list.

## 4. Future: AuthIdentity (not built in V1, documented for ADR-003's OAuth extension point)

```
AuthIdentity
  id uuid PK
  userId uuid FK
  provider text   -- "google", etc.
  providerAccountId text
  unique(provider, providerAccountId)
```

## 5. Prisma Schema Location

`packages/database/prisma/schema.prisma`, migrations in `packages/database/prisma/migrations/`, seed script at `packages/database/prisma/seed.ts` (see `docs/DEVELOPMENT_GUIDE.md` for `pnpm db:migrate` / `pnpm db:seed`).
