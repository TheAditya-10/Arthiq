import type { FastifyInstance } from "fastify";
import {
  listReconciliationsQuerySchema,
  runReconciliationSchema,
  updateReconciliationSchema,
} from "@arthiq/validation";

import {
  editReconciliation,
  getReconciliations,
  runReconciliation,
} from "../services/reconciliation.service.js";
import { presentAmounts } from "../lib/present.js";
import { parseOrThrow } from "../lib/validate.js";

export async function reconciliationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/reconciliation", async (request) => {
    const query = parseOrThrow(listReconciliationsQuerySchema, request.query);
    const rows = await getReconciliations(app.prisma, request.userId!, query.accountId);
    return rows.map((r) =>
      presentAmounts(r, [
        "openingBalanceMinor",
        "expectedClosingBalanceMinor",
        "actualClosingBalanceMinor",
        "differenceMinor",
      ]),
    );
  });

  app.post("/reconciliation/run", async (request, reply) => {
    const input = parseOrThrow(runReconciliationSchema, request.body);
    const result = await runReconciliation(app.prisma, request.userId!, input);
    reply.status(201);
    return presentAmounts(result, [
      "openingBalanceMinor",
      "expectedClosingBalanceMinor",
      "actualClosingBalanceMinor",
      "differenceMinor",
    ]);
  });

  app.patch("/reconciliation/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updateReconciliationSchema, request.body);
    const result = await editReconciliation(app.prisma, request.userId!, id, input);
    return presentAmounts(result, [
      "openingBalanceMinor",
      "expectedClosingBalanceMinor",
      "actualClosingBalanceMinor",
      "differenceMinor",
    ]);
  });
}
