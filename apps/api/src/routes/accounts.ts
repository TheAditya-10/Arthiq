import type { FastifyInstance } from "fastify";
import { createAccountSchema, updateAccountSchema } from "@arthiq/validation";

import {
  addAccount,
  editAccount,
  getAccountBalance,
  getAccounts,
  removeAccount,
  requireAccount,
} from "../services/account.service.js";
import { presentAmounts } from "../lib/present.js";
import { parseOrThrow } from "../lib/validate.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/accounts", async (request) => {
    const includeArchived =
      (request.query as { includeArchived?: string }).includeArchived === "true";
    const accounts = await getAccounts(app.prisma, request.userId!, includeArchived);
    return accounts.map((a) => presentAmounts(a, ["openingBalanceMinor"]));
  });

  app.post("/accounts", async (request, reply) => {
    const input = parseOrThrow(createAccountSchema, request.body);
    const account = await addAccount(app.prisma, request.userId!, input);
    reply.status(201);
    return presentAmounts(account, ["openingBalanceMinor"]);
  });

  app.get("/accounts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const account = await requireAccount(app.prisma, request.userId!, id);
    return presentAmounts(account, ["openingBalanceMinor"]);
  });

  app.patch("/accounts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updateAccountSchema, request.body);
    const account = await editAccount(app.prisma, request.userId!, id, input);
    return presentAmounts(account, ["openingBalanceMinor"]);
  });

  app.delete("/accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await removeAccount(app.prisma, request.userId!, id);
    return reply.status(204).send();
  });

  app.get("/accounts/:id/balance", async (request) => {
    const { id } = request.params as { id: string };
    const { balanceMinor } = await getAccountBalance(app.prisma, request.userId!, id);
    return presentAmounts({ balanceMinor }, ["balanceMinor"]);
  });
}
