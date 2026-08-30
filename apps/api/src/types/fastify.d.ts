import type { PrismaClient } from "@arthiq/database";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
  interface FastifyRequest {
    /** Set by the requireAuth preHandler once the access token is verified. */
    userId?: string;
  }
}
