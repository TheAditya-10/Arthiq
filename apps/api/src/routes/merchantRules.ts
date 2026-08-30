import type { FastifyInstance } from "fastify";
import { createMerchantRuleSchema, updateMerchantRuleSchema } from "@arthiq/validation";

import { listMerchantRules, upsertMerchantRule } from "../repositories/merchant.repository.js";
import { requireBucket, requireSubBucket } from "../services/category.service.js";
import { parseOrThrow } from "../lib/validate.js";

export async function merchantRuleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/merchant-rules", async (request) => {
    return listMerchantRules(app.prisma, request.userId!);
  });

  app.post("/merchant-rules", async (request, reply) => {
    const input = parseOrThrow(createMerchantRuleSchema, request.body);
    await requireBucket(app.prisma, request.userId!, input.bucketId);
    if (input.subBucketId) await requireSubBucket(app.prisma, request.userId!, input.subBucketId);
    const rule = await upsertMerchantRule(app.prisma, request.userId!, {
      ...input,
      createdFrom: "SEED",
    });
    reply.status(201);
    return rule;
  });

  app.patch("/merchant-rules/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updateMerchantRuleSchema, request.body);
    await requireBucket(app.prisma, request.userId!, input.bucketId);
    if (input.subBucketId) await requireSubBucket(app.prisma, request.userId!, input.subBucketId);
    return app.prisma.merchantRule.update({
      where: { id, userId: request.userId! },
      data: { bucketId: input.bucketId, subBucketId: input.subBucketId ?? null },
    });
  });

  app.delete("/merchant-rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await app.prisma.merchantRule.delete({ where: { id, userId: request.userId! } });
    return reply.status(204).send();
  });
}
