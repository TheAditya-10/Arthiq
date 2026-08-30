import type { Bucket, PrismaClient, SubBucket } from "@arthiq/database";

// --- Buckets -----------------------------------------------------------------

export function listBuckets(
  prisma: PrismaClient,
  userId: string,
  includeArchived = false,
): Promise<Bucket[]> {
  return prisma.bucket.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
  });
}

export function findBucketById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Bucket | null> {
  return prisma.bucket.findFirst({ where: { id, userId } });
}

export function createBucket(prisma: PrismaClient, userId: string, name: string): Promise<Bucket> {
  return prisma.bucket.create({ data: { userId, name } });
}

export function renameBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
  name: string,
): Promise<Bucket> {
  return prisma.bucket.update({ where: { id, userId }, data: { name } });
}

export function archiveBucket(prisma: PrismaClient, userId: string, id: string): Promise<Bucket> {
  return prisma.bucket.update({ where: { id, userId }, data: { archivedAt: new Date() } });
}

/** Reassigns every transaction/sub-bucket from `fromBucketId` to `intoBucketId`, then archives the source. */
export async function mergeBuckets(
  prisma: PrismaClient,
  userId: string,
  fromBucketId: string,
  intoBucketId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.subBucket.updateMany({
      where: { userId, bucketId: fromBucketId },
      data: { bucketId: intoBucketId },
    }),
    prisma.transaction.updateMany({
      where: { userId, bucketId: fromBucketId },
      data: { bucketId: intoBucketId },
    }),
    prisma.merchantRule.updateMany({
      where: { userId, bucketId: fromBucketId },
      data: { bucketId: intoBucketId },
    }),
    prisma.bucket.update({
      where: { id: fromBucketId, userId },
      data: { archivedAt: new Date() },
    }),
  ]);
}

// --- Sub-buckets ---------------------------------------------------------------

export function listSubBuckets(
  prisma: PrismaClient,
  userId: string,
  bucketId?: string,
  includeArchived = false,
): Promise<SubBucket[]> {
  return prisma.subBucket.findMany({
    where: {
      userId,
      ...(bucketId ? { bucketId } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { name: "asc" },
  });
}

export function findSubBucketById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<SubBucket | null> {
  return prisma.subBucket.findFirst({ where: { id, userId } });
}

export function createSubBucket(
  prisma: PrismaClient,
  userId: string,
  bucketId: string,
  name: string,
): Promise<SubBucket> {
  return prisma.subBucket.create({ data: { userId, bucketId, name } });
}

export function renameSubBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
  name: string,
): Promise<SubBucket> {
  return prisma.subBucket.update({ where: { id, userId }, data: { name } });
}

export function archiveSubBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<SubBucket> {
  return prisma.subBucket.update({ where: { id, userId }, data: { archivedAt: new Date() } });
}

export async function mergeSubBuckets(
  prisma: PrismaClient,
  userId: string,
  fromSubBucketId: string,
  intoSubBucketId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { userId, subBucketId: fromSubBucketId },
      data: { subBucketId: intoSubBucketId },
    }),
    prisma.merchantRule.updateMany({
      where: { userId, subBucketId: fromSubBucketId },
      data: { subBucketId: intoSubBucketId },
    }),
    prisma.subBucket.update({
      where: { id: fromSubBucketId, userId },
      data: { archivedAt: new Date() },
    }),
  ]);
}
