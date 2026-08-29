# Classification Engine

Package: `packages/classification`. Pure TypeScript, no direct database access — takes a small `ClassificationContext` (data-access functions passed in by the caller in `apps/api`) so the engine is unit-testable with in-memory fakes and could theoretically run anywhere (including on-device) without change.

See ADR-006 for the decision rationale. This document specifies the concrete algorithm and interfaces.

## 1. Interfaces

```ts
interface ParsedMerchantInput {
  merchantRaw?: string;
  descriptionRaw?: string;
  amountMinor: bigint;
  direction: "DEBIT" | "CREDIT";
}

interface ClassificationResult {
  bucketId: string | null;
  subBucketId: string | null;
  source: "RULE" | "HISTORICAL" | "HEURISTIC" | "AI" | "MANUAL" | "UNKNOWN";
  confidence: number; // 0..1
}

interface ClassificationContext {
  userId: string;
  normalizeMerchant(raw: string): string;
  findMerchantRule(userId: string, normalizedMerchant: string): Promise<MerchantRuleLookup | null>;
  getHistoricalCategory(userId: string, normalizedMerchant: string): Promise<HistoricalLookup | null>;
  aiClassifier?: AIClassifier; // optional — absent means step 4 is skipped entirely
}

interface ClassificationProvider {
  classify(input: ParsedMerchantInput, ctx: ClassificationContext): Promise<ClassificationResult | null>;
  // returning null means "this step has no opinion, try the next one"
}
```

`CompositeClassifier` runs providers in order and returns the first non-null result, or `UNKNOWN` if all abstain.

## 2. Step-by-Step Algorithm

### Step 1 — `RuleClassifier`
1. Normalize `merchantRaw` (see §3).
2. Look up `MerchantRule` for `(userId, normalizedMerchant)`.
3. If found → `{ bucketId, subBucketId, source: "RULE", confidence: 1.0 }`.

### Step 2 — `HistoricalClassifier`
1. If no rule, look at the user's last N (default 20) transactions with the same normalized merchant.
2. If ≥ 3 prior transactions exist and one `(bucketId, subBucketId)` pair accounts for ≥ 70% of them, return it with `confidence = thatFraction`.
3. Otherwise abstain (return `null`).

### Step 3 — `HeuristicClassifier`
1. Deterministic keyword dictionary (seed data, user-independent, stored as system-level `MerchantRule`-like seed rows or a static table — implementation detail, but conceptually: `{ pattern: /ZOMATO|SWIGGY/i, bucket: "Food", subBucket: "Delivery" }`, etc., covering the example categories in the product spec).
2. First matching pattern wins, `confidence` is a fixed value per rule (default 0.75, tunable per pattern for well-known vs. ambiguous keywords).
3. No match → abstain.

### Step 4 — `AIClassifier` (optional)
1. Only invoked if steps 1–3 abstained **or** returned confidence below `AI_CONFIDENCE_THRESHOLD` (default 0.6) **and** `ctx.aiClassifier` is configured (i.e., `AI_PROVIDER_API_KEY` set).
2. Sends only the minimal necessary fields (normalized merchant string, amount, direction — never full notification text, never other transactions) to the configured LLM with a constrained prompt asking it to pick from the user's existing bucket/sub-bucket list (never to invent new categories).
3. Result is parsed strictly (must match an existing bucket/sub-bucket id) — a malformed/hallucinated response is treated as an abstain, never trusted as-is.
4. `confidence` returned is capped at 0.8 (AI suggestions are always presented as more provisional than a learned rule).
5. `MockAIClassifier` (returns a fixed/deterministic canned response) is used in tests and as the default in dev when no API key is set, so the whole pipeline is testable without hitting a real LLM.

### Step 5 — Unknown
If every step abstains: `{ bucketId: null, subBucketId: null, source: "UNKNOWN", confidence: 0 }`. The transaction is still created (never blocks ingestion) and surfaced in the ledger/UI as needing classification.

## 3. Merchant Normalization
`normalizeMerchant(raw)`:
1. Uppercase, trim.
2. Strip common noise tokens: payment references (`UPI/`, `REF NO`, long digit sequences), legal suffixes (`PVT LTD`, `LIMITED`, `LLP`), and punctuation.
3. Collapse whitespace.
4. Result is used as the `Merchant.normalizedName` key — e.g. `"Croma - Phoenix Mall Pvt Ltd"` and `"CROMA PHOENIX MALL"` both normalize to `CROMA PHOENIX MALL`, but note this is intentionally a fairly literal normalization (not fuzzy/Levenshtein matching) so classification stays deterministic and explainable; near-duplicate merchant name variants that don't normalize to the same string get their own `Merchant` row and, if desired, the user can be offered a "these look similar — merge?" suggestion in a future version (not V1 auto-merge, to avoid incorrectly merging two different actual merchants).

## 4. Learning Loop (the Croma example from the spec)

1. Transaction arrives: merchant `"Croma"`, auto-classified by `HeuristicClassifier` as `Household → Electronics` (a keyword match), `confidence: 0.75`.
2. User edits the transaction to `Personal → Electronics` via `PATCH /transactions/:id`.
3. `TransactionService.update`:
   - Updates the transaction: `bucketId/subBucketId` = new values, `classificationSource: "MANUAL"`, `classifiedBy: userId`.
   - If the transaction has a resolved `merchantId`, upserts `MerchantRule { userId, merchantId, bucketId: Personal, subBucketId: Electronics, createdFrom: "USER_CORRECTION" }`.
   - Writes an `AuditLog` row capturing the before/after classification.
4. Next Croma transaction → `RuleClassifier` (step 1) matches immediately, `confidence: 1.0`, `source: "RULE"` — no heuristic, no AI call needed.

## 5. What the Engine Deliberately Does Not Do
- It never classifies `TRANSFER`, `LENT`, `BORROWED`, `LENT_REPAYMENT`, or `BORROWED_REPAYMENT` transactions into buckets — those types are, by definition (ADR-004), outside the expense/income category system.
- It never calls an AI provider when one isn't configured — the whole pipeline (steps 1–3, 5) is fully deterministic and self-contained.
- It never computes totals, balances, or any aggregate financial figure — that's `apps/api`'s analytics/reconciliation services, kept entirely separate (Rule 11).
