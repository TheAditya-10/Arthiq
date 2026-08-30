import type { Merchant, MerchantRule, PrismaClient } from "@arthiq/database";

export function findMerchantByNormalizedName(
  prisma: PrismaClient,
  userId: string,
  normalizedName: string,
): Promise<Merchant | null> {
  return prisma.merchant.findUnique({
    where: { userId_normalizedName: { userId, normalizedName } },
  });
}

export function upsertMerchant(
  prisma: PrismaClient,
  userId: string,
  normalizedName: string,
  displayName: string,
): Promise<Merchant> {
  return prisma.merchant.upsert({
    where: { userId_normalizedName: { userId, normalizedName } },
    update: {},
    create: { userId, normalizedName, displayName },
  });
}

export function listMerchantRules(
  prisma: PrismaClient,
  userId: string,
): Promise<(MerchantRule & { merchant: Merchant })[]> {
  return prisma.merchantRule.findMany({ where: { userId }, include: { merchant: true } });
}

export function findMerchantRuleByMerchant(
  prisma: PrismaClient,
  userId: string,
  merchantId: string,
): Promise<MerchantRule | null> {
  return prisma.merchantRule.findUnique({ where: { userId_merchantId: { userId, merchantId } } });
}

export function upsertMerchantRule(
  prisma: PrismaClient,
  userId: string,
  data: {
    merchantId: string;
    bucketId: string;
    subBucketId?: string | null;
    createdFrom: "USER_CORRECTION" | "SEED";
  },
): Promise<MerchantRule> {
  return prisma.merchantRule.upsert({
    where: { userId_merchantId: { userId, merchantId: data.merchantId } },
    update: { bucketId: data.bucketId, subBucketId: data.subBucketId ?? null },
    create: { userId, ...data },
  });
}

export function deleteMerchantRule(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<MerchantRule> {
  return prisma.merchantRule.delete({ where: { id, userId } });
}
