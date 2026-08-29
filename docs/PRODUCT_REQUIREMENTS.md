# Product Requirements Document (PRD)

## 1. Vision

Arthiq is a personal finance intelligence and reconciliation system. It automatically captures financial transactions (starting with Android UPI payment notifications), classifies them into a hierarchical, user-editable category system, keeps lending/borrowing with other people in a ledger that is explicitly separate from income/expense, and reconciles the tracked transaction history against actual bank balances every month — surfacing discrepancies instead of hiding them.

The product optimizes for **correctness and traceability** over automation for its own sake. Every automated decision (a classification, a dedup match) must be visible, editable, and reversible by the user.

## 2. Target User (V1)

A single user (the account holder) tracking their own personal finances across one or more Indian bank accounts and cash, primarily transacting via UPI. Multi-user support exists at the data-model level (every row is scoped to a `User`) but V1 does not build shared/family accounts or Account Aggregator integration.

## 3. Core Domain Distinctions

The product must never conflate:

| # | Concept | Effect on account balance | Effect on expense/income totals | Effect on people ledger |
|---|---|---|---|---|
| 1 | Expense | decreases | increases expense | — |
| 2 | Income | increases | increases income | — |
| 3 | Transfer (between own accounts) | moves between two accounts, net zero | **none** | — |
| 4 | Lent (to a person) | decreases | **none** | increases their receivable |
| 5 | Borrowed (from a person) | increases | **none** | increases their payable |
| 6 | Repayment received (they repay what they borrowed from you) | increases | **none** | decreases their receivable |
| 7 | Repayment made (you repay what you borrowed from them) | decreases | **none** | decreases their payable |
| 8 | Cash expense | decreases cash account | increases expense | — |
| 9 | Refund | increases | decreases expense (reverses) | — |
| 10 | Fee | decreases | increases expense (as "Fees" bucket) | — |

Event/Trip tagging (e.g. "Goa Trip 2026") is an orthogonal, optional dimension on top of any of the above expense/income transactions — never a replacement for bucket/sub-bucket categorization.

## 4. Functional Requirements

### 4.1 Transaction Capture
- FR-1: Capture transactions from Android notifications (event source, not source of truth).
- FR-2: Allow full manual transaction entry (any type).
- FR-3: Allow manual cash expense entry as a first-class flow.
- FR-4: Allow CSV/bank-statement import with column mapping and preview before commit.
- FR-5: Architecture must not preclude a future Account Aggregator/bank-API source.

### 4.2 Classification
- FR-6: Every ingested/imported transaction is auto-classified into Bucket → Sub-bucket using a layered engine (exact merchant rule → normalized merchant + historical preference → deterministic heuristic → optional AI → Unknown).
- FR-7: Every classification is user-editable at any time.
- FR-8: A user correction on a merchant creates/updates a `MerchantRule` so future transactions from that merchant classify correctly without re-asking.
- FR-9: Classification metadata (`source`, `confidence`, `classifiedAt`, `classifiedBy`) is stored per transaction and visible in the ledger.

### 4.3 Categories
- FR-10: Buckets and sub-buckets are user-configurable (create, rename, archive, merge); never hard-coded in business logic.
- FR-11: Deleting/archiving a bucket must not orphan or silently delete historical transactions — transactions must be reassigned or the bucket archived (soft-delete) with references intact.

### 4.4 Events
- FR-12: Users can create named events (trips, one-off large purchases, etc.) and optionally attach any transaction to at most one event.
- FR-13: Analytics must support including/excluding one or more events from a given time-range calculation on demand.

### 4.5 Accounts & Transfers
- FR-14: Users manage a list of accounts (bank, cash, and future card/wallet/investment types).
- FR-15: A transfer between two of the user's own accounts is recorded as a single `TRANSFER` transaction with a source and destination account, and must never appear as an expense or income in analytics.

### 4.6 People Ledger
- FR-16: Lending, borrowing, and repayments are tracked per person, entirely separate from the expense/income ledger.
- FR-17: A person's outstanding balance is always derivable deterministically from their ledger entries (lent + borrowed_repayment_made − received_repayment − ... — exact formula in `docs/DATABASE_DESIGN.md`).
- FR-18: Partial and full repayments are supported, with notes and optional due dates.

### 4.7 Reconciliation
- FR-19: For any account and month, the system computes an expected closing balance from opening balance + income − expenses ± transfers ± lending/borrowing cash effects, and compares it to a user-entered actual balance.
- FR-20: Discrepancies are surfaced with actionable candidate causes (missing txn, duplicate, fee, unrecorded cash, misclassification, unrecorded transfer, ingestion failure) and let the user investigate/annotate, not just display a number.

### 4.8 Analytics
- FR-21: Monthly summaries: total spend, total income, net cash flow, comparisons to previous month and to 3/6/12-month rolling averages.
- FR-22: Arbitrary event inclusion/exclusion in any of the above.
- FR-23: Charts: spending by bucket/sub-bucket, daily spending, monthly trend, category trend, income vs. expense, event spending.
- FR-24: Insights are generated exclusively from computed, stored data — never fabricated, never LLM-invented numbers.

### 4.9 Dedup
- FR-25: The same real-world transaction arriving from two sources (e.g., notification + CSV import) must be detected and merged/flagged, using a composite signal (amount, time window, merchant, reference number, account, direction, source), never a single field.

### 4.10 Security & Privacy
- FR-26: Auth required for all financial data access; every query scoped to the authenticated user.
- FR-27: The Android app only listens to notifications from apps the user has explicitly enabled in settings; raw notification text is not persisted beyond what's needed for parsing/audit, and is never written to production logs.

## 5. Non-Functional Requirements

- NFR-1: Deterministic financial math (no LLM in the calculation path for totals, balances, or reconciliation).
- NFR-2: The web dashboard must be usable on a mobile browser (responsive) even though a native app also exists.
- NFR-3: The system must function fully with zero AI provider configured (`AIClassifier` is optional).
- NFR-4: p95 API latency target for typical CRUD/list endpoints: < 400ms against a warm Postgres connection (informal V1 target, not load-tested).
- NFR-5: All timestamps stored in UTC; displayed in the user's local timezone (assume `Asia/Kolkata` default, configurable).

## 6. Out of Scope for V1

- Account Aggregator / direct bank API integration (abstraction only).
- Multi-currency support (INR only; amounts stored as integer paise).
- Shared/family accounts, multi-tenant orgs.
- iOS app.
- Budgeting/forecasting/anomaly detection/NL queries (see `docs/ROADMAP` section of `README.md`).
- Push notifications via Telegram/WhatsApp.

## 7. Demo / Acceptance Scenario

The canonical end-to-end scenario in §44 of the build spec (Croma notification → classify → correct → merchant rule learned → Goa Trip event → adjusted analytics → lend to Rahul → partial repayment → reconciliation) is the acceptance test for V1 and is implemented as an E2E/integration test suite (`docs/TESTING_STRATEGY.md`).
