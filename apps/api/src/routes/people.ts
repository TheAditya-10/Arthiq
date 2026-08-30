import type { FastifyInstance } from "fastify";
import { createPersonSchema, updatePersonSchema } from "@arthiq/validation";

import {
  addPerson,
  editPerson,
  getPeople,
  getPersonWithBalance,
  removePerson,
  requirePerson,
} from "../services/person.service.js";
import { presentAmounts } from "../lib/present.js";
import { parseOrThrow } from "../lib/validate.js";

export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/people", async (request) => {
    const includeArchived =
      (request.query as { includeArchived?: string }).includeArchived === "true";
    return getPeople(app.prisma, request.userId!, includeArchived);
  });

  app.post("/people", async (request, reply) => {
    const input = parseOrThrow(createPersonSchema, request.body);
    const person = await addPerson(app.prisma, request.userId!, input);
    reply.status(201);
    return person;
  });

  app.get("/people/:id", async (request) => {
    const { id } = request.params as { id: string };
    return getPersonWithBalance(app.prisma, request.userId!, id);
  });

  app.patch("/people/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updatePersonSchema, request.body);
    return editPerson(app.prisma, request.userId!, id, input);
  });

  app.delete("/people/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await removePerson(app.prisma, request.userId!, id);
    return reply.status(204).send();
  });

  app.get("/people/:id/ledger", async (request) => {
    const { id } = request.params as { id: string };
    await requirePerson(app.prisma, request.userId!, id);
    const entries = await app.prisma.peopleLedgerEntry.findMany({
      where: { userId: request.userId!, personId: id },
      orderBy: { occurredAt: "desc" },
    });
    return entries.map((e) => presentAmounts(e, ["amountMinor"]));
  });
}
