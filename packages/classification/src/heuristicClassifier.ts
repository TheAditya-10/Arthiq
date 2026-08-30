import { HEURISTIC_RULES } from "./heuristics.js";
import type {
  ClassificationContext,
  ClassificationProvider,
  ClassificationResult,
  ParsedMerchantInput,
} from "./types.js";

/** Step 3 — deterministic keyword dictionary, seeded/user-independent. */
export const HeuristicClassifier: ClassificationProvider = {
  async classify(
    input: ParsedMerchantInput,
    ctx: ClassificationContext,
  ): Promise<ClassificationResult | null> {
    if (!input.merchantRaw) return null;
    const normalized = ctx.normalizeMerchant(input.merchantRaw);
    if (!normalized) return null;

    for (const rule of HEURISTIC_RULES) {
      if (rule.pattern.test(normalized)) {
        const resolved = await ctx.findBucketAndSubBucketByName(
          rule.bucketName,
          rule.subBucketName,
        );
        if (!resolved) continue; // user doesn't have this bucket — try the next matching rule, if any
        return {
          bucketId: resolved.bucketId,
          subBucketId: resolved.subBucketId,
          source: "HEURISTIC",
          confidence: rule.confidence,
        };
      }
    }
    return null;
  },
};
