# ADR 004: Single Transaction Table with Explicit `type`, Not Category-Derived Semantics

## Status
Accepted

## Context
The system must never infer financial semantics (does this affect expense totals? does it affect a person's balance?) from the category alone, per the product's core principle: lending to a friend must never be counted as an expense, and borrowing must never be counted as income, no matter what bucket it's filed under.

Two schema shapes were considered: (a) separate tables per transaction type (`Expense`, `Income`, `Transfer`, `LoanTransaction`, ...), or (b) one `Transaction` table with a discriminating `type` enum and nullable type-specific foreign keys.

## Decision
One **`Transaction`** table with a required `type: TransactionType` enum:
```
EXPENSE | INCOME | TRANSFER | LENT | BORROWED | LENT_REPAYMENT | BORROWED_REPAYMENT | CASH_EXPENSE | REFUND | FEE | UNKNOWN
```
- `accountId` (required) — the account affected.
- `toAccountId` (nullable, required only for `TRANSFER`) — destination account.
- `personId` (nullable, required only for `LENT | BORROWED | LENT_REPAYMENT | BORROWED_REPAYMENT`) — links to the People Ledger.
- `bucketId`/`subBucketId` (nullable — categorization is orthogonal to type; a `LENT` transaction is *not* categorized into expense buckets at all, since it's not an expense, though the UI may still let it carry a note).
- `eventId` (nullable) — optional trip/event tag, independent of type and category.

**Analytics and balance calculations branch on `type`, never on bucket.** A single `computeMonthlyTotals(userId, range)` function in the analytics package treats `EXPENSE`, `CASH_EXPENSE`, and `FEE` as expense-affecting; `INCOME` and negative `REFUND` adjustments as income-affecting; `TRANSFER`, `LENT`, `BORROWED`, `LENT_REPAYMENT`, `BORROWED_REPAYMENT` as balance-affecting-only (never expense/income-affecting). This mapping lives in exactly one place (`packages/classification`'s sibling analytics logic in `apps/api`) so "does X count as an expense" has one authoritative answer.

## Consequences
- One table keeps queries simple (the whole ledger is `SELECT * FROM Transaction WHERE userId = ...`), which is what the Transaction Ledger UI needs anyway.
- Requires DB check constraints / application-layer validation to enforce "type X requires field Y" (e.g., `TRANSFER` requires `toAccountId`, `LENT` requires `personId`) since a single nullable-heavy table can't express this in the type system alone — enforced in a Zod schema (`packages/validation`) with per-type refinements before it ever reaches Prisma.
- A person-ledger balance is *always* derived by summing `Transaction` rows for that `personId` by type — never stored as a separately-maintained running total — so it can never drift from the ledger (see `docs/DATABASE_DESIGN.md` for the exact formula).

## Rejected Alternatives
- **Separate tables per type**: rejected — would fragment the ledger query (`UNION` across 5+ tables for the transaction list), fragment dedup logic (has to check across tables), and fragment the notification-ingestion write path (has to decide which table before it even knows classification). The single-table-with-type-enum model, common in ledger/accounting system design, was judged more maintainable here.
- **Deriving type from category** (e.g., a "Lending" bucket implies a loan): explicitly rejected by the product spec (Rule 9) — type must be explicit, independent of category.
