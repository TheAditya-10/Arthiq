import type {
  ClassificationContext,
  ClassificationProvider,
  ClassificationResult,
  ParsedMerchantInput,
} from "./types.js";

/**
 * Step 2 — no explicit rule, but this merchant has enough transaction
 * history for one category to dominate. See docs/CLASSIFICATION_ENGINE.md
 * §2 Step 2: the confidence threshold (≥3 prior transactions, ≥70%
 * agreement) is enforced by the ClassificationContext implementation
 * (apps/api), which is what actually queries transaction history — this
 * classifier just trusts whatever the context returns or abstains.
 */
export const HistoricalClassifier: ClassificationProvider = {
  async classify(
    input: ParsedMerchantInput,
    ctx: ClassificationContext,
  ): Promise<ClassificationResult | null> {
    if (!input.merchantRaw) return null;
    const normalized = ctx.normalizeMerchant(input.merchantRaw);
    if (!normalized) return null;
    const historical = await ctx.getHistoricalCategory(normalized);
    if (!historical) return null;
    return {
      bucketId: historical.bucketId,
      subBucketId: historical.subBucketId,
      source: "HISTORICAL",
      confidence: historical.confidence,
    };
  },
};
