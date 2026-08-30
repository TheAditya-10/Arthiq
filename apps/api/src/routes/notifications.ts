import type { FastifyInstance } from "fastify";
import { ingestNotificationSchema, listNotificationSourcesQuerySchema } from "@arthiq/validation";

import { ingestNotification, listNotificationSources } from "../services/notification.service.js";
import { presentAmounts } from "../lib/present.js";
import { parseOrThrow } from "../lib/validate.js";

/** Safety net against a device bug (or a compromised/misbehaving client) flooding this endpoint — see docs/API_SPECIFICATION.md. */
const ingestRateLimit = { rateLimit: { max: 60, timeWindow: "1 minute" } };

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.post("/notifications/ingest", { config: ingestRateLimit }, async (request, reply) => {
    const input = parseOrThrow(ingestNotificationSchema, request.body);
    const result = await ingestNotification(app.prisma, request.userId!, input);
    reply.status(201);
    return {
      dedupOutcome: result.dedupOutcome,
      transaction: result.transaction ? presentAmounts(result.transaction, ["amountMinor"]) : null,
      notificationSourceId: result.notificationSource.id,
    };
  });

  app.get("/notifications/sources", async (request) => {
    const query = parseOrThrow(listNotificationSourcesQuerySchema, request.query);
    return listNotificationSources(app.prisma, request.userId!, query.page, query.pageSize);
  });
}
