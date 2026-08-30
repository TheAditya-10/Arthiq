import type { ClassificationSource, Direction } from "@arthiq/types";

export interface ParsedMerchantInput {
  merchantRaw?: string;
  amountMinor: bigint;
  direction: Direction;
}

export interface ClassificationResult {
  bucketId: string;
  subBucketId: string | null;
  source: ClassificationSource;
  confidence: number; // 0..1
}

export interface MerchantRuleLookup {
  bucketId: string;
  subBucketId: string | null;
}

export interface HistoricalLookup {
  bucketId: string;
  subBucketId: string | null;
  confidence: number;
}

/**
 * Everything a classifier needs from the outside world, injected by the
 * caller (apps/api) so this package stays a pure, DB-free, unit-testable
 * library — see docs/CLASSIFICATION_ENGINE.md §1. A test can implement
 * this with in-memory fakes; apps/api implements it with Prisma queries.
 */
export interface ClassificationContext {
  userId: string;
  normalizeMerchant(raw: string): string;
  findMerchantRule(normalizedMerchant: string): Promise<MerchantRuleLookup | null>;
  getHistoricalCategory(normalizedMerchant: string): Promise<HistoricalLookup | null>;
  /** Resolves a seed heuristic's bucket/sub-bucket *names* to this user's actual bucket/sub-bucket ids. Returns null if the user has no such bucket (heuristic then abstains rather than guessing). */
  findBucketAndSubBucketByName(
    bucketName: string,
    subBucketName: string,
  ): Promise<{ bucketId: string; subBucketId: string | null } | null>;
  /** Only called if the AI step actually runs (steps 1-3 abstained/low-confidence and aiClassifier is configured). */
  getAvailableCategories(): Promise<
    {
      bucketId: string;
      bucketName: string;
      subBucketId: string | null;
      subBucketName: string | null;
    }[]
  >;
  aiClassifier?: AIClassifier;
}

export interface AIClassificationRequest {
  normalizedMerchant: string;
  amountMinor: bigint;
  direction: Direction;
  /** The user's existing buckets/sub-buckets — the AI may only pick from these, never invent new ones. */
  availableCategories: {
    bucketId: string;
    bucketName: string;
    subBucketId: string | null;
    subBucketName: string | null;
  }[];
}

export interface AIClassificationResponse {
  bucketId: string;
  subBucketId: string | null;
}

/** Abstracted so V1 ships fully functional with no AI provider configured. See docs/ADR/006. */
export interface AIClassifier {
  classify(request: AIClassificationRequest): Promise<AIClassificationResponse | null>;
}

/**
 * One step in the composite chain. Returning null means "no opinion, try
 * the next step" — never means "classify as unknown," which is the
 * CompositeClassifier's own fallback after every step abstains.
 */
export interface ClassificationProvider {
  classify(
    input: ParsedMerchantInput,
    ctx: ClassificationContext,
  ): Promise<ClassificationResult | null>;
}
