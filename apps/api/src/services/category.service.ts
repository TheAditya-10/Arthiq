import type { Bucket, PrismaClient, SubBucket } from "@arthiq/database";

import {
  archiveBucket,
  archiveSubBucket,
  createBucket,
  createSubBucket,
  findBucketById,
  findSubBucketById,
  listBuckets,
  listSubBuckets,
  mergeBuckets,
  mergeSubBuckets,
  renameBucket,
  renameSubBucket,
} from "../repositories/category.repository.js";
import { NotFoundError } from "../lib/errors.js";

export const getBuckets = listBuckets;

export async function requireBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Bucket> {
  const bucket = await findBucketById(prisma, userId, id);
  if (!bucket) throw new NotFoundError("Bucket");
  return bucket;
}

export const addBucket = createBucket;

export async function editBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
  name: string,
): Promise<Bucket> {
  await requireBucket(prisma, userId, id);
  return renameBucket(prisma, userId, id, name);
}

export async function removeBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Bucket> {
  await requireBucket(prisma, userId, id);
  return archiveBucket(prisma, userId, id);
}

export async function mergeBucketInto(
  prisma: PrismaClient,
  userId: string,
  fromId: string,
  intoId: string,
): Promise<void> {
  await requireBucket(prisma, userId, fromId);
  await requireBucket(prisma, userId, intoId);
  await mergeBuckets(prisma, userId, fromId, intoId);
}

export const getSubBuckets = listSubBuckets;

export async function requireSubBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<SubBucket> {
  const subBucket = await findSubBucketById(prisma, userId, id);
  if (!subBucket) throw new NotFoundError("SubBucket");
  return subBucket;
}

export async function addSubBucket(
  prisma: PrismaClient,
  userId: string,
  bucketId: string,
  name: string,
): Promise<SubBucket> {
  await requireBucket(prisma, userId, bucketId);
  return createSubBucket(prisma, userId, bucketId, name);
}

export async function editSubBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
  name: string,
): Promise<SubBucket> {
  await requireSubBucket(prisma, userId, id);
  return renameSubBucket(prisma, userId, id, name);
}

export async function removeSubBucket(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<SubBucket> {
  await requireSubBucket(prisma, userId, id);
  return archiveSubBucket(prisma, userId, id);
}

export async function mergeSubBucketInto(
  prisma: PrismaClient,
  userId: string,
  fromId: string,
  intoId: string,
): Promise<void> {
  await requireSubBucket(prisma, userId, fromId);
  await requireSubBucket(prisma, userId, intoId);
  await mergeSubBuckets(prisma, userId, fromId, intoId);
}
