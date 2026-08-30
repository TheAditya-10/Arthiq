import { createHash } from "node:crypto";

/**
 * Composite dedup hash — see docs/DATABASE_DESIGN.md §3 and
 * docs/RECONCILIATION_ENGINE.md §4. Buckets occurredAt to the nearest
 * 5-minute window so near-simultaneous re-deliveries of the same real
 * transaction (e.g. a notification re-post) hash identically, while
 * genuinely distinct transactions at different times don't collide.
 */
export function computeDedupHash(input: {
  userId: string;
  accountId: string;
  type: string;
  amountMinor: bigint;
  occurredAt: Date;
  normalizedMerchant?: string | null;
}): string {
  const bucketMs = 5 * 60 * 1000;
  const bucketedTime = Math.floor(input.occurredAt.getTime() / bucketMs) * bucketMs;
  const parts = [
    input.userId,
    input.accountId,
    input.type,
    input.amountMinor.toString(),
    String(bucketedTime),
    input.normalizedMerchant ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Uppercases, strips punctuation/legal suffixes and reference-number noise. See docs/CLASSIFICATION_ENGINE.md §3. */
export function normalizeMerchant(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC)\b\.?/g, "")
    .replace(/\bUPI\/?[A-Z0-9]*\b/g, "")
    .replace(/\bREF\.?\s*(NO)?\.?\s*[A-Z0-9]+\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
