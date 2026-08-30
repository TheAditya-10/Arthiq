import type { Event, PrismaClient } from "@arthiq/database";

export function listEvents(
  prisma: PrismaClient,
  userId: string,
  includeArchived = false,
): Promise<Event[]> {
  return prisma.event.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "desc" },
  });
}

export function findEventById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Event | null> {
  return prisma.event.findFirst({ where: { id, userId } });
}

export function createEvent(
  prisma: PrismaClient,
  userId: string,
  data: { name: string; startDate?: Date; endDate?: Date; notes?: string },
): Promise<Event> {
  return prisma.event.create({ data: { ...data, userId } });
}

export function updateEvent(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: { name?: string; startDate?: Date; endDate?: Date; notes?: string },
): Promise<Event> {
  return prisma.event.update({ where: { id, userId }, data });
}

export function archiveEvent(prisma: PrismaClient, userId: string, id: string): Promise<Event> {
  return prisma.event.update({ where: { id, userId }, data: { archivedAt: new Date() } });
}

export async function getEventSummary(
  prisma: PrismaClient,
  userId: string,
  eventId: string,
): Promise<{ totalMinor: bigint; transactionCount: number }> {
  const agg = await prisma.transaction.aggregate({
    where: { userId, eventId, status: { not: "VOIDED" } },
    _sum: { amountMinor: true },
    _count: true,
  });
  return { totalMinor: agg._sum.amountMinor ?? 0n, transactionCount: agg._count };
}
