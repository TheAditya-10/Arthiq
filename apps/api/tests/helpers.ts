import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { testPrisma } from "./setup.js";

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false, prismaClient: testPrisma });
  await app.ready();
  return app;
}

let counter = 0;

/** Registers a fresh user and returns an access token for authenticated requests. */
export async function registerTestUser(
  app: FastifyInstance,
  overrides: { email?: string; password?: string; displayName?: string } = {},
): Promise<{ accessToken: string; userId: string; email: string }> {
  counter += 1;
  const email = overrides.email ?? `user${counter}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: overrides.password ?? "correct horse battery",
      displayName: overrides.displayName ?? "Test User",
    },
  });
  const body = res.json();
  return { accessToken: body.accessToken, userId: body.user.id, email };
}

export function authHeader(accessToken: string): { authorization: string } {
  return { authorization: `Bearer ${accessToken}` };
}
