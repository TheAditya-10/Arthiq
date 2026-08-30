import type { Account, AccountType, PrismaClient } from "@arthiq/database";

export function listAccounts(
  prisma: PrismaClient,
  userId: string,
  includeArchived = false,
): Promise<Account[]> {
  return prisma.account.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
  });
}

export function findAccountById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Account | null> {
  return prisma.account.findFirst({ where: { id, userId } });
}

export function createAccount(
  prisma: PrismaClient,
  userId: string,
  data: {
    name: string;
    type: AccountType;
    openingBalanceMinor: bigint;
    openingBalanceDate: Date;
  },
): Promise<Account> {
  return prisma.account.create({ data: { ...data, userId } });
}

export function updateAccount(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: { name?: string; openingBalanceMinor?: bigint; openingBalanceDate?: Date },
): Promise<Account> {
  return prisma.account.update({ where: { id, userId }, data });
}

export function archiveAccount(prisma: PrismaClient, userId: string, id: string): Promise<Account> {
  return prisma.account.update({ where: { id, userId }, data: { archivedAt: new Date() } });
}
