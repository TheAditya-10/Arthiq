import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../app.js";

/**
 * The ONLY Vercel-specific file in this codebase (see
 * docs/ADR/007-deployment-strategy.md). Wraps the exact same Fastify
 * instance used by src/server.ts for standalone/container deployment —
 * no route or service code is duplicated or Vercel-aware.
 *
 * Fastify is not natively a "serverless handler" — it owns a Node
 * http.Server internally. The standard pattern for adapting it to a
 * platform that hands you a raw (req, res) pair per invocation is to let
 * Fastify's own server process that pair directly via its internal request
 * event, once the app is ready.
 */
const appPromise = buildApp();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", req, res);
}
