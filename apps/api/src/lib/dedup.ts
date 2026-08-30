import { createHash } from "node:crypto";
import { normalizeMerchant } from "@arthiq/types";

export { normalizeMerchant };

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
