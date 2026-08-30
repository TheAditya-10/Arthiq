import type { FastifyInstance } from "fastify";
import {
  createBucketSchema,
  createSubBucketSchema,
  mergeBucketSchema,
  mergeSubBucketSchema,
  updateBucketSchema,
  updateSubBucketSchema,
} from "@arthiq/validation";

import {
  addBucket,
  addSubBucket,
  editBucket,
  editSubBucket,
  getBuckets,
  getSubBuckets,
  mergeBucketInto,
  mergeSubBucketInto,
  removeBucket,
  removeSubBucket,
  requireBucket,
  requireSubBucket,
} from "../services/category.service.js";
import { parseOrThrow } from "../lib/validate.js";

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/buckets", async (request) => {
    const includeArchived =
      (request.query as { includeArchived?: string }).includeArchived === "true";
    return getBuckets(app.prisma, request.userId!, includeArchived);
  });

  app.post("/buckets", async (request, reply) => {
    const input = parseOrThrow(createBucketSchema, request.body);
    const bucket = await addBucket(app.prisma, request.userId!, input.name);
    reply.status(201);
    return bucket;
  });

  app.get("/buckets/:id", async (request) => {
    const { id } = request.params as { id: string };
    return requireBucket(app.prisma, request.userId!, id);
  });

  app.patch("/buckets/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updateBucketSchema, request.body);
    return editBucket(app.prisma, request.userId!, id, input.name);
  });

  app.delete("/buckets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await removeBucket(app.prisma, request.userId!, id);
    return reply.status(204).send();
  });

  app.post("/buckets/:id/merge", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(mergeBucketSchema, request.body);
    await mergeBucketInto(app.prisma, request.userId!, id, input.intoBucketId);
    return { merged: true };
  });

  app.get("/sub-buckets", async (request) => {
    const query = request.query as { bucketId?: string; includeArchived?: string };
    return getSubBuckets(
      app.prisma,
      request.userId!,
      query.bucketId,
      query.includeArchived === "true",
    );
  });

  app.post("/sub-buckets", async (request, reply) => {
    const input = parseOrThrow(createSubBucketSchema, request.body);
    const subBucket = await addSubBucket(app.prisma, request.userId!, input.bucketId, input.name);
    reply.status(201);
    return subBucket;
  });

  app.get("/sub-buckets/:id", async (request) => {
    const { id } = request.params as { id: string };
    return requireSubBucket(app.prisma, request.userId!, id);
  });

  app.patch("/sub-buckets/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updateSubBucketSchema, request.body);
    return editSubBucket(app.prisma, request.userId!, id, input.name);
  });

  app.delete("/sub-buckets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await removeSubBucket(app.prisma, request.userId!, id);
    return reply.status(204).send();
  });

  app.post("/sub-buckets/:id/merge", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(mergeSubBucketSchema, request.body);
    await mergeSubBucketInto(app.prisma, request.userId!, id, input.intoSubBucketId);
    return { merged: true };
  });
}
