import type { PrismaClient, Session } from "@arthiq/database";

export function createSession(
  prisma: PrismaClient,
  data: { userId: string; refreshTokenHash: string; userAgent?: string; expiresAt: Date },
): Promise<Session> {
  return prisma.session.create({ data });
}

export function findActiveSessionByHash(
  prisma: PrismaClient,
  refreshTokenHash: string,
): Promise<Session | null> {
  return prisma.session.findFirst({
    where: { refreshTokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
  });
}

export function revokeSession(prisma: PrismaClient, sessionId: string): Promise<Session> {
  return prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

export function revokeAllSessionsForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<{ count: number }> {
  return prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
