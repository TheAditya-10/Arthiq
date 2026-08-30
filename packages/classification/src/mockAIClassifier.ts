import type { AIClassificationRequest, AIClassificationResponse, AIClassifier } from "./types.js";

/**
 * Deterministic stand-in for a real LLM-backed AIClassifier — used in
 * tests and as the default when AI_PROVIDER_API_KEY is unset, so the full
 * pipeline (including the AI step) is exercised without ever calling out
 * to a real provider. Picks the user's first available category, which is
 * intentionally a poor "classifier" — it exists to prove the plumbing
 * works, not to be a real fallback. A real AIClassifier implementation is
 * out of scope for V1 per docs/ADR/006 (never mandatory, no fabricated
 * provider integration).
 */
export const MockAIClassifier: AIClassifier = {
  async classify(request: AIClassificationRequest): Promise<AIClassificationResponse | null> {
    const first = request.availableCategories[0];
    if (!first) return null;
    return { bucketId: first.bucketId, subBucketId: first.subBucketId };
  },
};
