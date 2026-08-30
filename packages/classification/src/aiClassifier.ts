import type {
  ClassificationContext,
  ClassificationProvider,
  ClassificationResult,
  ParsedMerchantInput,
} from "./types.js";

const AI_CONFIDENCE_CAP = 0.8;

/**
 * Step 4 — only invoked by CompositeClassifier when steps 1-3 abstained and
 * ctx.aiClassifier is configured (never called otherwise, so V1 works with
 * zero AI calls if no provider is set — docs/ADR/006). Never trusts the
 * response blindly: a bucketId/subBucketId not present in the user's own
 * category list is treated as an abstain, not an error and not a guess.
 */
export const AIClassifierStep: ClassificationProvider = {
  async classify(
    input: ParsedMerchantInput,
    ctx: ClassificationContext,
  ): Promise<ClassificationResult | null> {
    if (!ctx.aiClassifier || !input.merchantRaw) return null;
    const normalized = ctx.normalizeMerchant(input.merchantRaw);
    if (!normalized) return null;

    const availableCategories = await ctx.getAvailableCategories();
    if (availableCategories.length === 0) return null;

    const response = await ctx.aiClassifier.classify({
      normalizedMerchant: normalized,
      amountMinor: input.amountMinor,
      direction: input.direction,
      availableCategories,
    });
    if (!response) return null;

    const matched = availableCategories.find(
      (c) => c.bucketId === response.bucketId && c.subBucketId === (response.subBucketId ?? null),
    );
    if (!matched) return null; // hallucinated/invalid category — abstain, never trust as-is

    return {
      bucketId: response.bucketId,
      subBucketId: response.subBucketId,
      source: "AI",
      confidence: AI_CONFIDENCE_CAP,
    };
  },
};
