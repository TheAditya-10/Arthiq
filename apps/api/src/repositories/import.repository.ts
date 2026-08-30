import { Prisma } from "@arthiq/database";
import type { Import, PrismaClient } from "@arthiq/database";

export function createImport(
  prisma: PrismaClient,
  userId: string,
  data: {
    accountId: string;
    fileName: string;
    columnMapping: Prisma.InputJsonValue;
    stagedRows: Prisma.InputJsonValue;
    rowCount: number;
  },
): Promise<Import> {
  return prisma.import.create({
    data: { userId, ...data, status: "PREVIEWED" },
  });
}

export function findImportById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Import | null> {
  return prisma.import.findFirst({ where: { id, userId } });
}

export function finalizeImport(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: {
    status: "COMMITTED" | "FAILED";
    importedCount: number;
    duplicateCount: number;
    errorCount: number;
  },
): Promise<Import> {
  return prisma.import.update({
    where: { id, userId },
    data: { ...data, stagedRows: Prisma.JsonNull },
  });
}
