import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { testPrisma } from "./setup.js";

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false, prismaClient: testPrisma });
  await app.ready();
  return app;
}
