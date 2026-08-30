import type {
  DedupOutcome,
  NotificationProviderKey,
  NotificationSource,
  PrismaClient,
} from "@arthiq/database";

export function createNotificationSource(
  prisma: PrismaClient,
  userId: string,
  data: {
    transactionId?: string;
    sourcePackage: string;
    provider: NotificationProviderKey;
    rawTextHash: string;
    rawText?: string;
    parseSucceeded: boolean;
    dedupOutcome: DedupOutcome;
  },
): Promise<NotificationSource> {
  return prisma.notificationSource.create({ data: { userId, ...data } });
}

export async function listNotificationSources(
  prisma: PrismaClient,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ items: NotificationSource[]; total: number }> {
  const [items, total] = await Promise.all([
    prisma.notificationSource.findMany({
      where: { userId },
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificationSource.count({ where: { userId } }),
  ]);
  return { items, total };
}
