import type { FastifyInstance } from "fastify";
import {
  byBucketQuerySchema,
  insightsQuerySchema,
  monthlySummaryQuerySchema,
  trendQuerySchema,
} from "@arthiq/validation";

import {
  getByBucket,
  getInsights,
  getMonthlySummary,
  getTrend,
} from "../services/analytics.service.js";
import { parseOrThrow } from "../lib/validate.js";

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/analytics/summary", async (request) => {
    const query = parseOrThrow(monthlySummaryQuerySchema, request.query);
    return getMonthlySummary(app.prisma, request.userId!, query.month, query.excludeEventIds);
  });

  app.get("/analytics/by-bucket", async (request) => {
    const query = parseOrThrow(byBucketQuerySchema, request.query);
    return getByBucket(app.prisma, request.userId!, query.month, query.excludeEventIds);
  });

  app.get("/analytics/trend", async (request) => {
    const query = parseOrThrow(trendQuerySchema, request.query);
    return getTrend(app.prisma, request.userId!, query.from, query.to, query.granularity);
  });

  app.get("/analytics/insights", async (request) => {
    const query = parseOrThrow(insightsQuerySchema, request.query);
    const insights = await getInsights(app.prisma, request.userId!, query.month);
    return { insights };
  });
}
