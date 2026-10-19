import type { FastifyInstance } from "fastify";
import { deleteAccountSchema, updateProfileSchema } from "@arthiq/validation";

import { deleteUser, findUserById, updateUser } from "../repositories/user.repository.js";
import { ApiError, NotFoundError } from "../lib/errors.js";
import { verifyPassword } from "../lib/password.js";
import { exportUserData } from "../services/userData.service.js";
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

  // Right of access / portability. Rate-limited hard: it reads every table.
  app.get(
    "/users/me/export",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const data = await exportUserData(app.prisma, request.userId!);
      reply.header("Content-Disposition", 'attachment; filename="arthiq-export.json"');
      reply.header("Cache-Control", "no-store");
      return data;
    },
  );

  app.delete(
    "/users/me",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const existing = await findUserById(app.prisma, request.userId!);
      if (!existing) throw new NotFoundError("User");

      // Irreversible, so a valid access token alone isn't enough (it could be
      // a stolen/left-open session): the caller must re-enter the password.
      if (existing.passwordHash && existing.passwordSalt) {
        const { password } = parseOrThrow(deleteAccountSchema, request.body ?? {});
        const ok = await verifyPassword(password, existing.passwordHash, existing.passwordSalt);
        if (!ok) throw new ApiError("Incorrect password", 403, "INVALID_PASSWORD");
      }

      // onDelete: Cascade on every user-owned relation in the schema
      // (docs/SECURITY.md §6) means this single statement removes every row
      // this user owns — accounts, transactions, people, ledger entries,
      // merchant rules, notification sources, imports, audit logs, and
      // sessions — atomically, as one database operation.
      await deleteUser(app.prisma, request.userId!);

      reply.clearCookie(REFRESH_COOKIE, { path: "/" });
      return reply.status(204).send();
    },
  );
}
