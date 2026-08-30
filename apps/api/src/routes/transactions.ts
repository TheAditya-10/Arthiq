import type { FastifyInstance } from "fastify";
import {
  createCashExpenseSchema,
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from "@arthiq/validation";

import {
  addCashExpense,
  addTransaction,
  editTransaction,
  getTransactions,
  removeTransaction,
  requireTransaction,
} from "../services/transaction.service.js";
import { presentAmounts } from "../lib/present.js";
import { parseOrThrow } from "../lib/validate.js";

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/transactions", async (request) => {
    const query = parseOrThrow(listTransactionsQuerySchema, request.query);
    const { items, total, page, pageSize } = await getTransactions(
      app.prisma,
      request.userId!,
      query,
    );
    return {
      items: items.map((t) => presentAmounts(t, ["amountMinor"])),
      total,
      page,
      pageSize,
    };
  });

  app.post("/transactions", async (request, reply) => {
    const input = parseOrThrow(createTransactionSchema, request.body);
    const transaction = await addTransaction(app.prisma, request.userId!, input);
    reply.status(201);
    return presentAmounts(transaction, ["amountMinor"]);
  });

  app.post("/transactions/cash", async (request, reply) => {
    const input = parseOrThrow(createCashExpenseSchema, request.body);
    const transaction = await addCashExpense(app.prisma, request.userId!, input);
    reply.status(201);
    return presentAmounts(transaction, ["amountMinor"]);
  });

  app.get("/transactions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const transaction = await requireTransaction(app.prisma, request.userId!, id);
    return presentAmounts(transaction, ["amountMinor"]);
  });

  app.patch("/transactions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updateTransactionSchema, request.body);
    const transaction = await editTransaction(app.prisma, request.userId!, id, input);
    return presentAmounts(transaction, ["amountMinor"]);
  });

  app.delete("/transactions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await removeTransaction(app.prisma, request.userId!, id);
    return reply.status(204).send();
  });
}
