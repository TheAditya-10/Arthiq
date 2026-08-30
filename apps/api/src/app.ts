import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { prisma as defaultPrisma, type PrismaClient } from "@arthiq/database";

import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { accountRoutes } from "./routes/accounts.js";
import { categoryRoutes } from "./routes/categories.js";
import { merchantRuleRoutes } from "./routes/merchantRules.js";
import { eventRoutes } from "./routes/events.js";
import { peopleRoutes } from "./routes/people.js";
import { transactionRoutes } from "./routes/transactions.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { reconciliationRoutes } from "./routes/reconciliation.js";
import authPlugin from "./plugins/auth.js";

export interface BuildAppOptions {
  logger?: boolean;
  /** Injected for tests (a differently-configured PrismaClient); defaults to the shared singleton. */
  prismaClient?: PrismaClient;
}

/**
 * Builds the Fastify application instance. This is the ONLY entrypoint into
 * the application's HTTP surface — both the long-running Node server
 * (src/server.ts) and the Vercel serverless adapter (src/adapters/vercel.ts)
 * wrap this same instance. No route, plugin, or service in this function may
 * import a Vercel-specific API (see docs/ADR/007-deployment-strategy.md).
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: process.env.LOG_LEVEL ?? "info",
            transport:
              process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
            // Never let sensitive fields reach logs, in any environment.
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "*.password",
                "*.passwordHash",
                "*.refreshToken",
                "*.rawText",
              ],
              censor: "[REDACTED]",
            },
          },
  });

  app.decorate("prisma", opts.prismaClient ?? defaultPrisma);

  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  await app.register(authPlugin);

  if (process.env.NODE_ENV !== "production") {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "Arthiq API",
          description: "Personal finance intelligence and reconciliation system API",
          version: "0.1.0",
        },
      },
    });
    await app.register(swaggerUi, {
      routePrefix: "/api/docs",
    });
  }

  app.setErrorHandler((error: FastifyError & { details?: unknown }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    app.log.error({ err: error }, "request failed");
    reply.status(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL",
        message: statusCode >= 500 ? "Internal server error" : error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(categoryRoutes);
  await app.register(merchantRuleRoutes);
  await app.register(eventRoutes);
  await app.register(peopleRoutes);
  await app.register(transactionRoutes);
  await app.register(analyticsRoutes);
  await app.register(reconciliationRoutes);

  return app;
}
