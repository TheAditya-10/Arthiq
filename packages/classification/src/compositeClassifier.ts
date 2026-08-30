import { AIClassifierStep } from "./aiClassifier.js";
import { HeuristicClassifier } from "./heuristicClassifier.js";
import { HistoricalClassifier } from "./historicalClassifier.js";
import { RuleClassifier } from "./ruleClassifier.js";
import type { ClassificationContext, ClassificationResult, ParsedMerchantInput } from "./types.js";

const DEFAULT_AI_CONFIDENCE_THRESHOLD = 0.6;

export const UNKNOWN_RESULT: ClassificationResult = {
  bucketId: "",
  subBucketId: null,
  source: "UNKNOWN",
  confidence: 0,
};

/**
 * Orchestrates the layered classification chain in strict priority order,
 * stopping at the first confident match. See docs/CLASSIFICATION_ENGINE.md
 * §2 and docs/ADR/006-classification-strategy.md.
 *
 * Deterministic steps (RULE, HISTORICAL, HEURISTIC) run first, in order. A
 * result at or above `aiConfidenceThreshold` returns immediately. Below
 * that threshold, the first (highest-priority) deterministic hit is kept
 * as a fallback and the AI step is given a chance to do better; if AI is
 * unconfigured or also abstains, the kept low-confidence deterministic
 * result is used rather than discarding a real signal in favor of
 * UNKNOWN.
 */
export async function classifyTransaction(
  input: ParsedMerchantInput,
  ctx: ClassificationContext,
  options: { aiConfidenceThreshold?: number } = {},
): Promise<ClassificationResult> {
  const threshold = options.aiConfidenceThreshold ?? DEFAULT_AI_CONFIDENCE_THRESHOLD;

  let bestLowConfidenceResult: ClassificationResult | null = null;
  for (const provider of [RuleClassifier, HistoricalClassifier, HeuristicClassifier]) {
    const result = await provider.classify(input, ctx);
    if (!result) continue;
    if (result.confidence >= threshold) return result;
    bestLowConfidenceResult ??= result;
  }

  const aiResult = await AIClassifierStep.classify(input, ctx);
  if (aiResult) return aiResult;

  return bestLowConfidenceResult ?? UNKNOWN_RESULT;
}
