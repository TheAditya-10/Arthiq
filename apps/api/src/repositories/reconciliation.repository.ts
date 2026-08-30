import type { PrismaClient, Reconciliation } from "@arthiq/database";

/**
 * Balance as of `asOf` (exclusive) — every transaction effect strictly
 * before that instant, on top of the account's opening balance. Reused for
 * both the period's opening balance (asOf = periodStart) and its expected
 * closing balance (asOf = periodEnd), so both figures come from the same
 * formula and can never drift relative to each other. Direction-based, not
 * type-enumerated — see docs/RECONCILIATION_ENGINE.md §1.
 */
export async function computeBalanceAsOf(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  asOf: Date,
): Promise<bigint> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new Error("Account not found");

  const [debits, credits, incoming] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        userId,
        accountId,
        direction: "DEBIT",
        status: { not: "VOIDED" },
        occurredAt: { lt: asOf },
      },
      _sum: { amountMinor: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        accountId,
        direction: "CREDIT",
        status: { not: "VOIDED" },
        occurredAt: { lt: asOf },
      },
      _sum: { amountMinor: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        toAccountId: accountId,
        status: { not: "VOIDED" },
        occurredAt: { lt: asOf },
      },
      _sum: { amountMinor: true },
    }),
  ]);

  return (
    account.openingBalanceMinor +
    (credits._sum.amountMinor ?? 0n) -
    (debits._sum.amountMinor ?? 0n) +
    (incoming._sum.amountMinor ?? 0n)
  );
}

export function createReconciliation(
  prisma: PrismaClient,
  userId: string,
  data: {
    accountId: string;
    periodStart: Date;
    periodEnd: Date;
    openingBalanceMinor: bigint;
    expectedClosingBalanceMinor: bigint;
    actualClosingBalanceMinor: bigint;
    differenceMinor: bigint;
    status: "MATCHED" | "DISCREPANCY";
  },
): Promise<Reconciliation> {
  return prisma.reconciliation.create({ data: { ...data, userId } });
}

export function listReconciliations(
  prisma: PrismaClient,
  userId: string,
  accountId?: string,
): Promise<Reconciliation[]> {
  return prisma.reconciliation.findMany({
    where: { userId, ...(accountId ? { accountId } : {}) },
    orderBy: { periodStart: "desc" },
  });
}

export function updateReconciliation(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: { resolutionNotes?: string; status?: "RESOLVED" },
): Promise<Reconciliation> {
  return prisma.reconciliation.update({ where: { id, userId }, data });
}

export function findReconciliationById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Reconciliation | null> {
  return prisma.reconciliation.findFirst({ where: { id, userId } });
}

/** Non-voided transactions in-period sharing a dedupHash with another — a same-source double-entry that slipped past ingestion-time dedup. */
export async function findDuplicateCandidates(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  period: { gte: Date; lt: Date },
): Promise<{ dedupHash: string; count: number }[]> {
  const rows = await prisma.transaction.groupBy({
    by: ["dedupHash"],
    where: {
      userId,
      accountId,
      status: { not: "VOIDED" },
      occurredAt: { gte: period.gte, lt: period.lt },
    },
    _count: { _all: true },
  });
  return rows
    .filter((r) => r._count._all > 1)
    .map((r) => ({ dedupHash: r.dedupHash, count: r._count._all }));
}

export function countNotificationSourced(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  period: { gte: Date; lt: Date },
): Promise<number> {
  return prisma.transaction.count({
    where: {
      userId,
      accountId,
      source: "ANDROID_NOTIFICATION",
      status: { not: "VOIDED" },
      occurredAt: { gte: period.gte, lt: period.lt },
    },
  });
}

export function countFeeTransactions(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  period: { gte: Date; lt: Date },
): Promise<number> {
  return prisma.transaction.count({
    where: {
      userId,
      accountId,
      type: "FEE",
      status: { not: "VOIDED" },
      occurredAt: { gte: period.gte, lt: period.lt },
    },
  });
}
