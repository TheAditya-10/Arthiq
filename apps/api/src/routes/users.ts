import type { FastifyInstance } from "fastify";
import { updateProfileSchema } from "@arthiq/validation";

import { deleteUser, findUserById, updateUser } from "../repositories/user.repository.js";
import { NotFoundError } from "../lib/errors.js";
import { parseOrThrow } from "../lib/validate.js";

const REFRESH_COOKIE = "arthiq_refresh_token";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.patch("/users/me", async (request) => {
    const input = parseOrThrow(updateProfileSchema, request.body);
    const user = await updateUser(app.prisma, request.userId!, input);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
    };
  });

  app.delete("/users/me", async (request, reply) => {
    const existing = await findUserById(app.prisma, request.userId!);
    if (!existing) throw new NotFoundError("User");

    // onDelete: Cascade on every user-owned relation in the schema
    // (docs/SECURITY.md §6) means this single statement removes every row
    // this user owns — accounts, transactions, people, ledger entries,
    // merchant rules, notification sources, imports, audit logs, and
    // sessions — atomically, as one database operation.
    await deleteUser(app.prisma, request.userId!);

    reply.clearCookie(REFRESH_COOKIE, { path: "/" });
    return reply.status(204).send();
  });
}
