import type { PrismaClient } from "@arthiq/database";
import { normalizeMerchant } from "@arthiq/types";
import type {
  AIClassifier,
  ClassificationContext,
  HistoricalLookup,
  MerchantRuleLookup,
} from "@arthiq/classification";

const HISTORICAL_LOOKBACK = 20;
const HISTORICAL_MIN_SAMPLES = 3;
const HISTORICAL_MIN_AGREEMENT = 0.7;

/**
 * The Prisma-backed implementation of packages/classification's
 * ClassificationContext interface — this file is the only place the
 * classification engine touches a database. See docs/CLASSIFICATION_ENGINE.md.
 */
export function buildClassificationContext(
  prisma: PrismaClient,
  userId: string,
  aiClassifier?: AIClassifier,
): ClassificationContext {
  return {
    userId,
    normalizeMerchant,

    async findMerchantRule(normalizedMerchant: string): Promise<MerchantRuleLookup | null> {
      const merchant = await prisma.merchant.findUnique({
        where: { userId_normalizedName: { userId, normalizedName: normalizedMerchant } },
      });
      if (!merchant) return null;
      const rule = await prisma.merchantRule.findUnique({
        where: { userId_merchantId: { userId, merchantId: merchant.id } },
      });
      if (!rule) return null;
      return { bucketId: rule.bucketId, subBucketId: rule.subBucketId };
    },

    async getHistoricalCategory(normalizedMerchant: string): Promise<HistoricalLookup | null> {
      const merchant = await prisma.merchant.findUnique({
        where: { userId_normalizedName: { userId, normalizedName: normalizedMerchant } },
      });
      if (!merchant) return null;

      const recent = await prisma.transaction.findMany({
        where: {
          userId,
          merchantId: merchant.id,
          bucketId: { not: null },
          status: { not: "VOIDED" },
        },
        orderBy: { occurredAt: "desc" },
        take: HISTORICAL_LOOKBACK,
        select: { bucketId: true, subBucketId: true },
      });
      if (recent.length < HISTORICAL_MIN_SAMPLES) return null;

      const counts = new Map<
        string,
        { bucketId: string; subBucketId: string | null; count: number }
      >();
      for (const txn of recent) {
        const key = `${txn.bucketId}:${txn.subBucketId ?? ""}`;
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else counts.set(key, { bucketId: txn.bucketId!, subBucketId: txn.subBucketId, count: 1 });
      }
      const top = [...counts.values()].sort((a, b) => b.count - a.count)[0]!;
      const agreement = top.count / recent.length;
      if (agreement < HISTORICAL_MIN_AGREEMENT) return null;
      return { bucketId: top.bucketId, subBucketId: top.subBucketId, confidence: agreement };
    },

    async findBucketAndSubBucketByName(bucketName: string, subBucketName: string) {
      const bucket = await prisma.bucket.findFirst({
        where: { userId, name: bucketName, archivedAt: null },
      });
      if (!bucket) return null;
      const subBucket = await prisma.subBucket.findFirst({
        where: { userId, bucketId: bucket.id, name: subBucketName, archivedAt: null },
      });
      return { bucketId: bucket.id, subBucketId: subBucket?.id ?? null };
    },

    async getAvailableCategories() {
      const subBuckets = await prisma.subBucket.findMany({
        where: { userId, archivedAt: null },
        include: { bucket: true },
      });
      return subBuckets
        .filter((sb) => !sb.bucket.archivedAt)
        .map((sb) => ({
          bucketId: sb.bucketId,
          bucketName: sb.bucket.name,
          subBucketId: sb.id,
          subBucketName: sb.name,
        }));
    },

    aiClassifier,
  };
}
