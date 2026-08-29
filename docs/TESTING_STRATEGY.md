# Testing Strategy

## 1. Tooling
- **Unit tests**: Vitest, across `packages/classification`, `packages/validation`, `apps/api` services, and mobile notification parsers.
- **API integration tests**: Vitest + Fastify's `app.inject()` (no real HTTP server needed) against a real Postgres test database (Docker) — not mocked, because reconciliation/dedup/people-ledger correctness depends on real relational behavior (constraints, transactions).
- **Web E2E**: Playwright, driving the demo scenario against a running `apps/web` + `apps/api` + test Postgres.
- **Mobile**: Jest (React Native preset) for parser and component unit tests; native instrumentation testing is out of scope for CI (requires a device/emulator) but parser logic — the part that actually needs correctness guarantees — is fully covered without one, per §2 below.

## 2. What Is Tested Where

### Classification (`packages/classification`)
- Exact merchant rule match → `RULE`, confidence 1.0.
- No rule, historical majority category → `HISTORICAL`.
- No rule/history, keyword heuristic match → `HEURISTIC`.
- No match anywhere, AI disabled → `UNKNOWN`.
- No match anywhere, `MockAIClassifier` configured → `AI`, confidence capped ≤ 0.8.
- User override → `MerchantRule` created/updated; a subsequent classification call for the same merchant returns `RULE`.
- Malformed/hallucinated AI response (references a non-existent bucket) → treated as abstain, falls through to `UNKNOWN`.

### Transactions (`apps/api`)
- Create each `TransactionType` via `POST /transactions` with correct field requirements; assert rejection when a type-required field is missing (e.g. `TRANSFER` without `toAccountId`, `LENT` without `personId`).
- Assert `LENT`/`BORROWED`/repayments never appear in `/analytics/summary`'s expense or income totals.
- Assert a `TRANSFER` nets to zero across both accounts' balances and does not appear in expense totals.
- Assert `REFUND` reduces the expense total for the period it lands in.
- Assert `CASH_EXPENSE` appears in analytics and account balance identically to `EXPENSE` except it targets a `CASH`-type account.

### Reconciliation (`apps/api`)
- Exact match → `MATCHED`, `difference = 0`.
- Known discrepancy amount → `DISCREPANCY` with correct `differenceMinor`.
- Missing transaction scenario (seed a gap) → candidate-cause hint surfaced.
- Duplicate transaction (two rows, same `dedupHash`) → detected pre-reconciliation by the ingestion dedup test below; reconciliation itself is tested to *exclude* `DUPLICATE_SUSPECTED` rows from its sums.
- Transfer handling → confirmed net-zero across both legs (see Transactions above; re-asserted here in the reconciliation-specific context of expected-balance computation).

### Deduplication (`apps/api`)
- Identical notification delivered twice (same hash, same reference) → second is dropped, `NotificationSource.dedupOutcome = DUPLICATE`.
- Same transaction via notification then CSV import (same amount/date/merchant, different source, no reference number) → `DUPLICATE_SUSPECTED`, both provenance rows retained, only one `Transaction`.
- Two genuinely different transactions, same amount, different merchant/time far outside window → both created, no false-positive dedup.

### People Ledger (`apps/api`)
- Lending ₹2,000 to a person: account balance decreases by ₹2,000, `outstanding` for that person becomes ₹2,000, `/analytics/summary` expense total is unaffected.
- Partial repayment ₹1,000 received: `outstanding` becomes ₹1,000, income total unaffected.
- Full repayment: `outstanding` becomes ₹0.
- Borrowing ₹5,000: account balance increases, `payable` for that person increases, income total unaffected.

### Analytics (`apps/api`)
- Month-over-month percent change, standard case.
- Event exclusion: total minus a given event's transactions matches manual sum.
- Event inclusion (default): total includes event transactions.
- Percentage change with a zero-spend previous month (division-by-zero guarded, not `NaN`/`Infinity` surfaced to the UI).
- Empty month (no transactions): summary returns zeroes, not an error.
- Negative/refund transactions: correctly reduce the expense total rather than being excluded or double-subtracted.

### Android Notification Parsers (`apps/mobile`)
- Each parser (`GooglePayParser`, `PhonePeParser`, `PaytmParser`, `GenericUPIParser`) tested against a fixture set of recorded real-world-style notification title/text samples (multiple wording variants per provider, to cover "work even if wording changes slightly").
- Duplicate notification handling: the same fixture posted twice through the on-device `dedupCache` yields only one sync attempt.
- Unparseable/irrelevant notification → parser returns `null`, nothing queued.

## 3. E2E Demo Scenario (Playwright, against `apps/web` + `apps/api` + test DB)
Implements spec §44 end-to-end as the acceptance test:
1. Seed a Croma notification-shaped transaction via a direct `POST /notifications/ingest` call (simulating the mobile app, since Playwright drives the web, not the Android app) → assert auto-classified `Household → Electronics`.
2. Edit it in the web ledger to `Personal → Electronics` → assert a `MerchantRule` now exists.
3. Ingest a second Croma transaction → assert it auto-classifies to `Personal → Electronics` with `source: RULE`.
4. Create event "Goa Trip 2026," attach transactions.
5. Load dashboard for August → assert total.
6. Toggle "exclude Goa Trip" → assert adjusted total matches manual arithmetic.
7. Record lending ₹2,000 to "Rahul" → assert People Ledger shows ₹2,000 outstanding, dashboard expense total unchanged.
8. Record ₹1,000 repayment from Rahul → assert outstanding is ₹1,000.
9. Run reconciliation for the test account/period → assert expected vs. actual comparison renders with correct numbers.

## 4. CI Expectations
Every phase (per `docs/IMPLEMENTATION_PLAN.md`) must pass, before moving to the next phase:
```
pnpm lint
pnpm typecheck
pnpm test        # unit + integration
pnpm build       # all apps/packages build successfully
```
Playwright E2E is run for phases that touch the web UI end-to-end (Phase 6 onward); not required to pass on every intermediate commit but required before a phase is marked complete in `docs/IMPLEMENTATION_STATUS.md`.
