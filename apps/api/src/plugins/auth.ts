import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { verifyAccessToken } from "../lib/jwt.js";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Attaches request.userId from a verified access token. This is the ONLY
 * place userId is ever derived from client input — every route trusts
 * request.userId, never a client-supplied userId field in a body/query
 * (see docs/SECURITY.md §5).
 */
async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply
        .status(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Missing bearer token" } });
    }
    const token = header.slice("Bearer ".length);
    try {
      const { userId } = await verifyAccessToken(token);
      request.userId = userId;
    } catch {
      return reply
        .status(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Invalid or expired access token" } });
    }
  });
}

export default fp(authPlugin, { name: "auth" });
