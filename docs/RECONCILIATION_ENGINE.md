# Reconciliation Engine

Implements spec §18 (reconciliation) and §20 (deduplication) — the two are documented together because dedup is what makes reconciliation numbers trustworthy in the first place (an undetected duplicate transaction silently corrupts the "expected" side of the reconciliation equation).

## 1. Expected Closing Balance Formula

For a given `(accountId, periodStart, periodEnd)`:

```
expectedClosing =
    openingBalance(accountId, periodStart)
  + Σ INCOME.amountMinor where accountId matches, occurredAt in range
  + Σ REFUND.amountMinor (refund is a credit) where accountId matches, in range
  − Σ EXPENSE.amountMinor where accountId matches, in range
  − Σ CASH_EXPENSE.amountMinor where accountId matches, in range
  − Σ FEE.amountMinor where accountId matches, in range
  − Σ TRANSFER.amountMinor where accountId = this account (outgoing leg)
  + Σ TRANSFER.amountMinor where toAccountId = this account (incoming leg)
  − Σ LENT.amountMinor where accountId matches (money left this account to lend)
  + Σ BORROWED.amountMinor where accountId matches (money arrived in this account)
  + Σ LENT_REPAYMENT... wait, see note below
```

Precisely, using `direction` rather than re-deriving sign from `type` (both are stored; `direction` is authoritative for balance math, `type` is authoritative for expense/income/ledger categorization — see ADR-004):

```
expectedClosing = openingBalance
  + Σ amountMinor where accountId = this account AND direction = CREDIT
  − Σ amountMinor where accountId = this account AND direction = DEBIT
  + Σ amountMinor where toAccountId = this account   (transfer's destination leg is always a CREDIT to that account by construction)
```
This single direction-based sum is what actually gets implemented (`ReconciliationService.computeExpectedClosingBalance`) — it is provably equivalent to the type-enumerated formula above (every transaction type's `direction` is chosen precisely so that summing by direction reproduces the accounting effect), and it has the advantage of being one code path that can't drift from the type-effect mapping in `docs/ADR/004-transaction-model.md` as new types are ever added. Both forms are documented here so the "why" is traceable, but only the direction-based sum is implemented.

`VOIDED` transactions are excluded from all sums. `DUPLICATE_SUSPECTED` transactions are excluded by default (flagged for user review, not counted until confirmed) — this is the direct link between dedup quality and reconciliation correctness.

## 2. Comparison & Discrepancy

```
difference = actualClosingBalanceMinor − expectedClosingBalanceMinor
status = difference == 0 ? MATCHED : DISCREPANCY
```

## 3. Candidate Cause Hints

When `status = DISCREPANCY`, `ReconciliationService` runs a set of cheap heuristics to suggest likely causes (never auto-applied — always presented for the user to investigate, per spec §18):

| Heuristic | Signal |
|---|---|
| Missing transaction | `abs(difference)` matches (within ±1%) a round-number gap and there's a multi-day span in `occurredAt` with zero transactions on this account, atypical for the account's usual frequency |
| Duplicate transaction | Two `Transaction` rows on this account with identical `dedupHash` but different `id` and both `CONFIRMED` (should be structurally rare given ingestion-time dedup, but an import edge case or manual double-entry can produce it) |
| Bank fee | `abs(difference)` is small (< ₹100 default threshold) and matches common fee amounts (configurable list, e.g. ₹0–₹50 range) with no corresponding `FEE` transaction |
| Cash withdrawal / cash expense | `abs(difference)` roughly matches an unrecorded cash pattern — surfaced as a prompt to check for missing `CASH_EXPENSE` entries, not auto-detected from cash itself (cash has no bank trail to compare against) |
| Unrecorded transfer | A `TRANSFER`-shaped amount (matches another account's unexplained difference of the *opposite* sign in the same period) |
| Incorrect classification | Not a balance-diff cause (classification doesn't change balance) — instead flagged separately as a data-quality prompt when `UNKNOWN`-classified transaction count is high for the period |
| Data ingestion failure | The account's notification-sourced transaction count for the period is anomalously low vs. its trailing 3-month average (possible sign the notification listener was killed/disabled — points the user at `docs/MOTOROLA_SETUP.md`) |

These are advisory strings + a `suggestedTransactionIds` array where applicable — the API returns them, the UI lists them, the user decides what (if anything) to fix. No automatic mutation of transactions happens from a reconciliation run.

## 4. Deduplication Algorithm (spec §20)

Applied at every ingestion point (notification ingest, CSV import commit) before a `Transaction` row is created.

### Signals used (never a single field alone)
```
- amountMinor (exact)
- occurredAt (within a time window — default ±15 minutes for notification-vs-notification,
  ±36 hours for notification-vs-CSV since bank statements often post next-day)
- normalizedMerchant (if both sides have one)
- direction
- accountId
- referenceId / UPI reference number (if present on both sides — strong signal, but never
  the *only* signal checked, since not all sources reliably provide one)
- source (used to decide *how* to resolve a match, not whether one exists)
```

### Algorithm
```
1. Compute dedupHash for the incoming candidate (see docs/DATABASE_DESIGN.md §3).
2. Query existing non-voided Transactions for this user+account with the same dedupHash.
   → If found: treat as duplicate. If the existing row already has a referenceId and the
     incoming one has a matching referenceId, outcome = DUPLICATE (high confidence, auto-drop
     with an audit trail). If reference numbers are absent or differ, outcome =
     DUPLICATE_SUSPECTED (flagged for user review, not silently dropped — better to surface
     an uncertain match than hide a real second transaction).
3. If no exact hash match, run a widened fuzzy pass: same account + direction + amountMinor
   within the source-pair's time window (per table above) + (normalizedMerchant matches OR
   one side lacks a merchant, e.g. a CSV row with only a narration string). A fuzzy match also
   yields DUPLICATE_SUSPECTED, never a silent auto-drop — only an exact dedupHash match with a
   confirmed matching reference number auto-drops.
4. No match at any stage → new Transaction, status = CONFIRMED (or NEEDS_REVIEW if
   classification confidence was low — an orthogonal status axis, not overloaded onto dedup).
```

### Why not "notification ID alone"
Android's notification ID/key is per-notification-post, not per-transaction — the same payment can trigger multiple posts (e.g., an update to an existing notification), and different transactions can never be assumed to get distinct stable IDs across app restarts or OS versions. Relying on it alone would both under-detect (miss a real duplicate arriving via CSV import, which has no notification ID at all) and over-trust a signal that isn't guaranteed unique or stable — hence the composite, multi-signal approach above.

## 5. Testing
Reconciliation and dedup are financial-correctness-critical and covered by `packages/database`/`apps/api` unit + integration tests per `docs/TESTING_STRATEGY.md`: exact match, small discrepancy, missing transaction, duplicate transaction (exact and fuzzy), and transfer double-counting (explicitly asserting a transfer between two of the user's own accounts nets to zero in both accounts' expected-balance computation and never appears in `analytics/summary`'s expense total).
