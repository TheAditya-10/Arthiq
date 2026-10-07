import type { Prisma, PrismaClient, Transaction } from "@arthiq/database";

/** Accepts either the top-level client or a $transaction callback's scoped client. */
type Db = PrismaClient | Prisma.TransactionClient;

export interface TransactionFilters {
  from?: Date;
  to?: Date;
  bucketId?: string;
  subBucketId?: string;
  eventId?: string;
  accountId?: string;
  personId?: string;
  type?: string;
  source?: string;
  status?: string;
  classificationSource?: string;
  search?: string;
  /** Hide soft-deleted rows (the default for user-facing lists). Ignored when `status` is set. */
  excludeVoided?: boolean;
}

function buildWhere(userId: string, filters: TransactionFilters): Prisma.TransactionWhereInput {
  return {
    userId,
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.bucketId ? { bucketId: filters.bucketId } : {}),
    ...(filters.subBucketId ? { subBucketId: filters.subBucketId } : {}),
    ...(filters.eventId ? { eventId: filters.eventId } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.personId ? { personId: filters.personId } : {}),
    ...(filters.type ? { type: filters.type as Transaction["type"] } : {}),
    ...(filters.source ? { source: filters.source as Transaction["source"] } : {}),
    ...(filters.status
      ? { status: filters.status as Transaction["status"] }
      : filters.excludeVoided
        ? { status: { not: "VOIDED" as const } }
        : {}),
    ...(filters.classificationSource
      ? {
          classificationSource: filters.classificationSource as Transaction["classificationSource"],
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { merchantRaw: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listTransactions(
  prisma: PrismaClient,
  userId: string,
  filters: TransactionFilters,
  page: number,
  pageSize: number,
): Promise<{ items: Transaction[]; total: number }> {
  const where = buildWhere(userId, filters);
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);
  return { items, total };
}

export interface SummaryRow {
  type: Transaction["type"];
  direction: Transaction["direction"];
  amountMinor: bigint;
  occurredAt: Date;
  bucketId: string | null;
  eventId: string | null;
}

/** Just the columns needed to total a filtered set — every matching row, not one page. */
export function listForSummary(
  prisma: PrismaClient,
  userId: string,
  filters: TransactionFilters,
): Promise<SummaryRow[]> {
  return prisma.transaction.findMany({
    where: buildWhere(userId, filters),
    select: {
      type: true,
      direction: true,
      amountMinor: true,
      occurredAt: true,
      bucketId: true,
      eventId: true,
    },
  });
}

export function findTransactionById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Transaction | null> {
  return prisma.transaction.findFirst({ where: { id, userId } });
}

export function findTransactionsByDedupHash(
  prisma: PrismaClient,
  userId: string,
  dedupHash: string,
): Promise<Transaction[]> {
  return prisma.transaction.findMany({ where: { userId, dedupHash, status: { not: "VOIDED" } } });
}

export function createTransaction(
  prisma: Db,
  data: Prisma.TransactionUncheckedCreateInput,
): Promise<Transaction> {
  return prisma.transaction.create({ data });
}

export function updateTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: Prisma.TransactionUncheckedUpdateInput,
): Promise<Transaction> {
  return prisma.transaction.update({ where: { id, userId }, data });
}

export function voidTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Transaction> {
  return prisma.transaction.update({ where: { id, userId }, data: { status: "VOIDED" } });
}
