import type {
  AIClassificationRequest,
  AIClassificationResponse,
  AIClassifier,
} from "@arthiq/classification";

/**
 * Real (not fabricated) integration with Anthropic's public Messages API —
 * https://docs.anthropic.com/en/api/messages — used only as the optional
 * step-4 fallback (docs/ADR/006-classification-strategy.md). Only
 * instantiated when AI_PROVIDER_API_KEY is set (see apps/api/src/services/
 * classification.provider.ts); the system is fully functional without it.
 *
 * Sends only the minimal fields needed (normalized merchant, amount,
 * direction, and the user's own category names) — never raw notification
 * text, never other transactions (docs/SECURITY.md).
 */
export class AnthropicAIClassifier implements AIClassifier {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-haiku-4-5-20251001",
  ) {}

  async classify(request: AIClassificationRequest): Promise<AIClassificationResponse | null> {
    if (request.availableCategories.length === 0) return null;

    const categoryList = request.availableCategories
      .map((c, i) => `${i}: ${c.bucketName}${c.subBucketName ? ` > ${c.subBucketName}` : ""}`)
      .join("\n");

    const prompt = [
      "Classify this financial transaction into exactly one of the numbered categories below.",
      `Merchant: ${request.normalizedMerchant}`,
      `Amount: ${(Number(request.amountMinor) / 100).toFixed(2)} INR`,
      `Direction: ${request.direction}`,
      "Categories:",
      categoryList,
      "Respond with ONLY the category number, nothing else.",
    ].join("\n");

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch {
      return null; // network failure — abstain, never block classification on an outage
    }

    if (!response.ok) return null;

    const body = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((block) => block.type === "text")?.text?.trim();
    if (!text) return null;

    const index = Number.parseInt(text, 10);
    const category = request.availableCategories[index];
    if (!category || Number.isNaN(index)) return null; // malformed/out-of-range — abstain, never guess

    return { bucketId: category.bucketId, subBucketId: category.subBucketId };
  }
}
