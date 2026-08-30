import type { Event, PrismaClient } from "@arthiq/database";
import type { CreateEventInput, UpdateEventInput } from "@arthiq/validation";

import {
  archiveEvent,
  createEvent,
  findEventById,
  getEventSummary,
  listEvents,
  updateEvent,
} from "../repositories/event.repository.js";
import { NotFoundError } from "../lib/errors.js";

export const getEvents = listEvents;

export async function requireEvent(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Event> {
  const event = await findEventById(prisma, userId, id);
  if (!event) throw new NotFoundError("Event");
  return event;
}

export function addEvent(
  prisma: PrismaClient,
  userId: string,
  input: CreateEventInput,
): Promise<Event> {
  return createEvent(prisma, userId, {
    name: input.name,
    ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
    ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
}

export async function editEvent(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: UpdateEventInput,
): Promise<Event> {
  await requireEvent(prisma, userId, id);
  return updateEvent(prisma, userId, id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
    ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
}

export async function removeEvent(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Event> {
  await requireEvent(prisma, userId, id);
  return archiveEvent(prisma, userId, id);
}

export async function getEventSummaryForUser(prisma: PrismaClient, userId: string, id: string) {
  await requireEvent(prisma, userId, id);
  return getEventSummary(prisma, userId, id);
}
