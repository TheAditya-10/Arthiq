import type { AIClassifier } from "@arthiq/classification";
import { AnthropicAIClassifier } from "../lib/anthropicAIClassifier.js";

/**
 * The system must work with zero AI provider configured (docs/ADR/006) —
 * this returns undefined unless AI_PROVIDER_API_KEY is explicitly set.
 */
export function getConfiguredAIClassifier(): AIClassifier | undefined {
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!apiKey) return undefined;
  return new AnthropicAIClassifier(apiKey);
}

export function getAIConfidenceThreshold(): number {
  const raw = process.env.AI_CONFIDENCE_THRESHOLD;
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0.6;
}
