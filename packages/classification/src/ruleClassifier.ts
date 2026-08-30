import type {
  ClassificationContext,
  ClassificationProvider,
  ClassificationResult,
  ParsedMerchantInput,
} from "./types.js";

/** Step 1 — exact learned/seeded merchant rule. Highest priority, full confidence. */
export const RuleClassifier: ClassificationProvider = {
  async classify(
    input: ParsedMerchantInput,
    ctx: ClassificationContext,
  ): Promise<ClassificationResult | null> {
    if (!input.merchantRaw) return null;
    const normalized = ctx.normalizeMerchant(input.merchantRaw);
    if (!normalized) return null;
    const rule = await ctx.findMerchantRule(normalized);
    if (!rule) return null;
    return {
      bucketId: rule.bucketId,
      subBucketId: rule.subBucketId,
      source: "RULE",
      confidence: 1.0,
    };
  },
};
