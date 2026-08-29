# ADR 006: Layered, Deterministic-First Classification with Optional AI Fallback

## Status
Accepted

## Context
Every transaction needs a Bucket/Sub-bucket suggestion, but calling an LLM per transaction would be slow, costly, non-deterministic, and unnecessary once the system has learned a merchant's category from history or explicit rules. The spec explicitly forbids AI-as-source-of-truth and per-transaction LLM calls.

## Decision
Implement `packages/classification` as a **composite classifier** run in strict priority order, stopping at the first confident match:

```
1. Exact Merchant Rule   — user-created/learned rule: normalizedMerchant -> (bucketId, subBucketId), confidence 1.0
2. Merchant Normalization + Historical Preference
                          — fuzzy-normalize the raw merchant string (case, whitespace, common suffixes
                            like "PVT LTD", transliteration noise), then look up the user's most common
                            prior category for that normalized merchant, confidence = historical frequency ratio
3. Deterministic Heuristic — keyword/category dictionaries (e.g. "UBER"/"OLA" -> Transport/Cab,
                            "ZOMATO"/"SWIGGY" -> Food/Delivery) bundled as seed data, confidence fixed per rule
4. AI Classifier (optional) — only invoked if steps 1–3 produce confidence below a threshold (default 0.6)
                            AND an AI provider is configured; abstracted behind ClassificationProvider so V1
                            ships fully functional with this disabled
5. Unknown                — surfaced to the user for manual classification; still recorded as a Transaction,
                            never blocks ingestion
```
Implemented as:
```
ClassificationProvider (interface)
├── RuleClassifier          (step 1)
├── HistoricalClassifier    (step 2)
├── HeuristicClassifier     (step 3)
├── AIClassifier            (step 4 — optional, pluggable; MockAIClassifier used in tests/dev)
└── CompositeClassifier     (orchestrates 1→4, falls through to UNKNOWN)
```
Every classification result records `{ bucketId, subBucketId, source: RULE|HISTORICAL|HEURISTIC|AI|MANUAL|UNKNOWN, confidence, classifiedAt, classifiedBy }` on the `Transaction` row.

**Learning loop**: when a user edits a transaction's category, the API upserts a `MerchantRule` row for that transaction's normalized merchant (if the transaction has one) — turning every correction into a permanent step-1 rule, per the product's core requirement that corrections improve future classification. Manual edits are recorded with `source: MANUAL` on the edited transaction itself, but future transactions from that merchant hit `RULE` (step 1) via the new/updated `MerchantRule`.

## Consequences
- Zero AI calls needed for the vast majority of steady-state transactions (rules + history cover repeat merchants, which dominate real spending).
- Fully deterministic and testable without any external API — `RuleClassifier`, `HistoricalClassifier`, `HeuristicClassifier` are pure functions over the DB/seed data.
- AI, when enabled, only handles genuinely novel merchants, keeping cost and latency low and keeping the system fast-degrading to "Unknown" (never blocking) if the AI provider is down or unset.

## Rejected Alternatives
- **LLM classification for every transaction**: rejected — violates Rule 11, adds latency/cost/non-determinism where a lookup table would do.
- **Pure keyword-heuristic-only, no learning**: rejected — doesn't satisfy the explicit requirement that user corrections must improve future classification (Croma example in the spec).
- **Storing classification confidence as a vague label ("high/medium/low") instead of a float**: rejected — a numeric confidence lets the AI-invocation threshold and future UI ("uncertain — please confirm") be tuned without a schema change.
