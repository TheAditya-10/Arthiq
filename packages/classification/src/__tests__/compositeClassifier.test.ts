import { describe, expect, it } from "vitest";
import { classifyTransaction } from "../compositeClassifier.js";
import { MockAIClassifier } from "../mockAIClassifier.js";
import type {
  AIClassificationRequest,
  AIClassificationResponse,
  AIClassifier,
  ClassificationContext,
  HistoricalLookup,
  MerchantRuleLookup,
} from "../types.js";

function normalize(raw: string): string {
  return raw.toUpperCase().trim();
}

interface FakeContextConfig {
  rules?: Record<string, MerchantRuleLookup>;
  historical?: Record<string, HistoricalLookup>;
  categoriesByName?: Record<string, { bucketId: string; subBucketId: string | null }>;
  availableCategories?: {
    bucketId: string;
    bucketName: string;
    subBucketId: string | null;
    subBucketName: string | null;
  }[];
  aiClassifier?: AIClassifier;
}

function makeContext(config: FakeContextConfig): ClassificationContext {
  return {
    userId: "user-1",
    normalizeMerchant: normalize,
    async findMerchantRule(normalizedMerchant) {
      return config.rules?.[normalizedMerchant] ?? null;
    },
    async getHistoricalCategory(normalizedMerchant) {
      return config.historical?.[normalizedMerchant] ?? null;
    },
    async findBucketAndSubBucketByName(bucketName, subBucketName) {
      return config.categoriesByName?.[`${bucketName}:${subBucketName}`] ?? null;
    },
    async getAvailableCategories() {
      return config.availableCategories ?? [];
    },
    aiClassifier: config.aiClassifier,
  };
}

const BASE_INPUT = { amountMinor: 48000n, direction: "DEBIT" as const };

describe("classifyTransaction", () => {
  it("uses an exact merchant rule with full confidence when present (step 1)", async () => {
    const ctx = makeContext({
      rules: { CROMA: { bucketId: "bucket-personal", subBucketId: "sub-electronics" } },
    });
    const result = await classifyTransaction({ ...BASE_INPUT, merchantRaw: "Croma" }, ctx);
    expect(result).toEqual({
      bucketId: "bucket-personal",
      subBucketId: "sub-electronics",
      source: "RULE",
      confidence: 1.0,
    });
  });

  it("falls back to historical majority when no rule exists (step 2)", async () => {
    const ctx = makeContext({
      historical: {
        "LOCAL CAFE": { bucketId: "bucket-food", subBucketId: "sub-cafe", confidence: 0.8 },
      },
    });
    const result = await classifyTransaction({ ...BASE_INPUT, merchantRaw: "Local Cafe" }, ctx);
    expect(result.source).toBe("HISTORICAL");
    expect(result.bucketId).toBe("bucket-food");
    expect(result.confidence).toBe(0.8);
  });

  it("falls back to a deterministic keyword heuristic when no rule/history exists (step 3)", async () => {
    const ctx = makeContext({
      categoriesByName: {
        "Food:Delivery": { bucketId: "bucket-food", subBucketId: "sub-delivery" },
      },
    });
    const result = await classifyTransaction(
      { ...BASE_INPUT, merchantRaw: "ZOMATO ONLINE ORDER" },
      ctx,
    );
    expect(result.source).toBe("HEURISTIC");
    expect(result.bucketId).toBe("bucket-food");
    expect(result.subBucketId).toBe("sub-delivery");
  });

  it("returns UNKNOWN when nothing matches and no AI is configured", async () => {
    const ctx = makeContext({});
    const result = await classifyTransaction(
      { ...BASE_INPUT, merchantRaw: "Some Random Shop" },
      ctx,
    );
    expect(result.source).toBe("UNKNOWN");
    expect(result.confidence).toBe(0);
    expect(result.bucketId).toBe("");
  });

  it("returns UNKNOWN when there is no merchant string at all", async () => {
    const ctx = makeContext({});
    const result = await classifyTransaction({ ...BASE_INPUT }, ctx);
    expect(result.source).toBe("UNKNOWN");
  });

  it("invokes the configured AI classifier only when steps 1-3 abstain, capping confidence at 0.8", async () => {
    const availableCategories = [
      {
        bucketId: "bucket-x",
        bucketName: "Personal",
        subBucketId: "sub-x",
        subBucketName: "Shopping",
      },
    ];
    const ctx = makeContext({
      availableCategories,
      aiClassifier: {
        async classify(request: AIClassificationRequest): Promise<AIClassificationResponse | null> {
          expect(request.normalizedMerchant).toBe("NOVEL MERCHANT XYZ");
          return { bucketId: "bucket-x", subBucketId: "sub-x" };
        },
      },
    });
    const result = await classifyTransaction(
      { ...BASE_INPUT, merchantRaw: "Novel Merchant XYZ" },
      ctx,
    );
    expect(result.source).toBe("AI");
    expect(result.confidence).toBe(0.8);
    expect(result.bucketId).toBe("bucket-x");
  });

  it("never calls the AI step when a high-confidence rule already matched", async () => {
    let aiCalled = false;
    const ctx = makeContext({
      rules: { CROMA: { bucketId: "bucket-personal", subBucketId: "sub-electronics" } },
      aiClassifier: {
        async classify() {
          aiCalled = true;
          return null;
        },
      },
    });
    await classifyTransaction({ ...BASE_INPUT, merchantRaw: "Croma" }, ctx);
    expect(aiCalled).toBe(false);
  });

  it("treats a hallucinated AI response (category the user doesn't have) as an abstain, falling to UNKNOWN", async () => {
    const ctx = makeContext({
      availableCategories: [
        { bucketId: "bucket-real", bucketName: "Food", subBucketId: null, subBucketName: null },
      ],
      aiClassifier: {
        async classify(): Promise<AIClassificationResponse | null> {
          return { bucketId: "bucket-does-not-exist", subBucketId: null };
        },
      },
    });
    const result = await classifyTransaction(
      { ...BASE_INPUT, merchantRaw: "Mystery Merchant" },
      ctx,
    );
    expect(result.source).toBe("UNKNOWN");
  });

  it("falls back to a low-confidence heuristic result if the AI step also abstains", async () => {
    const ctx = makeContext({
      categoriesByName: {
        "Personal:Shopping": { bucketId: "bucket-personal", subBucketId: "sub-shopping" },
      },
      availableCategories: [],
      aiClassifier: MockAIClassifier, // returns null when availableCategories is empty
    });
    const result = await classifyTransaction({ ...BASE_INPUT, merchantRaw: "Amazon.in" }, ctx);
    // AMAZON heuristic confidence (0.55) is below the default 0.6 threshold,
    // but with no better AI result, the low-confidence heuristic still wins
    // over discarding a real signal as UNKNOWN.
    expect(result.source).toBe("HEURISTIC");
    expect(result.bucketId).toBe("bucket-personal");
  });
});
