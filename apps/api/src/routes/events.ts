import type { FastifyInstance } from "fastify";
import { createEventSchema, updateEventSchema } from "@arthiq/validation";

import {
  addEvent,
  editEvent,
  getEvents,
  getEventSummaryForUser,
  removeEvent,
  requireEvent,
} from "../services/event.service.js";
import { presentAmounts } from "../lib/present.js";
import { parseOrThrow } from "../lib/validate.js";

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.requireAuth);

  app.get("/events", async (request) => {
    const includeArchived =
      (request.query as { includeArchived?: string }).includeArchived === "true";
    return getEvents(app.prisma, request.userId!, includeArchived);
  });

  app.post("/events", async (request, reply) => {
    const input = parseOrThrow(createEventSchema, request.body);
    const event = await addEvent(app.prisma, request.userId!, input);
    reply.status(201);
    return event;
  });

  app.get("/events/:id", async (request) => {
    const { id } = request.params as { id: string };
    return requireEvent(app.prisma, request.userId!, id);
  });

  app.patch("/events/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = parseOrThrow(updateEventSchema, request.body);
    return editEvent(app.prisma, request.userId!, id, input);
  });

  app.delete("/events/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await removeEvent(app.prisma, request.userId!, id);
    return reply.status(204).send();
  });

  app.get("/events/:id/summary", async (request) => {
    const { id } = request.params as { id: string };
    const summary = await getEventSummaryForUser(app.prisma, request.userId!, id);
    return presentAmounts(summary, ["totalMinor"]);
  });
}
