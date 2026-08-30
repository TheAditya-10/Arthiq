import type { Prisma, PrismaClient, TransactionType } from "@arthiq/database";

/** Expense-affecting types per docs/ADR/004; REFUND is subtracted (it reverses a prior expense), never added. */
const POSITIVE_EXPENSE_TYPES: TransactionType[] = ["EXPENSE", "CASH_EXPENSE", "FEE"];
const NEGATIVE_EXPENSE_TYPES: TransactionType[] = ["REFUND"];
const INCOME_TYPES: TransactionType[] = ["INCOME"];

export interface PeriodRange {
  gte: Date;
  lt: Date;
}

function eventExclusionWhere(excludeEventIds: string[]): Prisma.TransactionWhereInput {
  if (excludeEventIds.length === 0) return {};
  // Deliberately NOT `eventId: { notIn: excludeEventIds }` — in SQL, `NOT IN`
  // against a list evaluates to NULL (i.e. excluded) for rows where eventId
  // IS NULL, which would wrongly drop every non-event transaction. Explicit
  // OR keeps null-eventId rows in, only actually excluding the named events.
  return { OR: [{ eventId: null }, { eventId: { notIn: excludeEventIds } }] };
}

/** Sums expense/income for one period, optionally excluding a set of events. */
export async function sumPeriodTotals(
  prisma: PrismaClient,
  userId: string,
  period: PeriodRange,
  excludeEventIds: string[] = [],
): Promise<{ expenseMinor: bigint; incomeMinor: bigint }> {
  const rows = await prisma.transaction.groupBy({
    by: ["type"],
    where: {
      userId,
      occurredAt: { gte: period.gte, lt: period.lt },
      status: { not: "VOIDED" },
      type: { in: [...POSITIVE_EXPENSE_TYPES, ...NEGATIVE_EXPENSE_TYPES, ...INCOME_TYPES] },
      ...eventExclusionWhere(excludeEventIds),
    },
    _sum: { amountMinor: true },
  });
  const byType = new Map(rows.map((r) => [r.type, r._sum.amountMinor ?? 0n]));
  let expenseMinor = 0n;
  for (const t of POSITIVE_EXPENSE_TYPES) expenseMinor += byType.get(t) ?? 0n;
  for (const t of NEGATIVE_EXPENSE_TYPES) expenseMinor -= byType.get(t) ?? 0n;
  const incomeMinor = INCOME_TYPES.reduce((sum, t) => sum + (byType.get(t) ?? 0n), 0n);
  return { expenseMinor, incomeMinor };
}

export interface BucketTotal {
  bucketId: string;
  bucketName: string;
  totalMinor: bigint;
  subBuckets: { subBucketId: string; subBucketName: string; totalMinor: bigint }[];
}

export async function sumByBucket(
  prisma: PrismaClient,
  userId: string,
  period: PeriodRange,
  excludeEventIds: string[] = [],
): Promise<BucketTotal[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: { gte: period.gte, lt: period.lt },
      status: { not: "VOIDED" },
      type: { in: [...POSITIVE_EXPENSE_TYPES, ...NEGATIVE_EXPENSE_TYPES] },
      bucketId: { not: null },
      ...eventExclusionWhere(excludeEventIds),
    },
    select: {
      type: true,
      amountMinor: true,
      bucketId: true,
      subBucketId: true,
      bucket: { select: { name: true } },
      subBucket: { select: { name: true } },
    },
  });

  const buckets = new Map<string, BucketTotal>();
  for (const row of rows) {
    const sign = NEGATIVE_EXPENSE_TYPES.includes(row.type) ? -1n : 1n;
    const signedAmount = sign * row.amountMinor;
    let bucket = buckets.get(row.bucketId!);
    if (!bucket) {
      bucket = {
        bucketId: row.bucketId!,
        bucketName: row.bucket!.name,
        totalMinor: 0n,
        subBuckets: [],
      };
      buckets.set(row.bucketId!, bucket);
    }
    bucket.totalMinor += signedAmount;
    if (row.subBucketId) {
      let sub = bucket.subBuckets.find((s) => s.subBucketId === row.subBucketId);
      if (!sub) {
        sub = { subBucketId: row.subBucketId, subBucketName: row.subBucket!.name, totalMinor: 0n };
        bucket.subBuckets.push(sub);
      }
      sub.totalMinor += signedAmount;
    }
  }
  return [...buckets.values()].sort((a, b) => (b.totalMinor > a.totalMinor ? 1 : -1));
}

export interface TrendPoint {
  bucketKey: string; // "2026-08-05" or "2026-08"
  expenseMinor: bigint;
  incomeMinor: bigint;
}

export async function sumTrend(
  prisma: PrismaClient,
  userId: string,
  period: PeriodRange,
  granularity: "daily" | "monthly",
): Promise<TrendPoint[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: { gte: period.gte, lt: period.lt },
      status: { not: "VOIDED" },
      type: { in: [...POSITIVE_EXPENSE_TYPES, ...NEGATIVE_EXPENSE_TYPES, ...INCOME_TYPES] },
    },
    select: { type: true, amountMinor: true, occurredAt: true },
  });

  const points = new Map<string, TrendPoint>();
  for (const row of rows) {
    const key =
      granularity === "daily"
        ? row.occurredAt.toISOString().slice(0, 10)
        : row.occurredAt.toISOString().slice(0, 7);
    let point = points.get(key);
    if (!point) {
      point = { bucketKey: key, expenseMinor: 0n, incomeMinor: 0n };
      points.set(key, point);
    }
    if (POSITIVE_EXPENSE_TYPES.includes(row.type)) point.expenseMinor += row.amountMinor;
    else if (NEGATIVE_EXPENSE_TYPES.includes(row.type)) point.expenseMinor -= row.amountMinor;
    else if (INCOME_TYPES.includes(row.type)) point.incomeMinor += row.amountMinor;
  }
  return [...points.values()].sort((a, b) => a.bucketKey.localeCompare(b.bucketKey));
}

export async function sumEventSpend(
  prisma: PrismaClient,
  userId: string,
  period: PeriodRange,
): Promise<{ eventId: string; eventName: string; totalMinor: bigint }[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: { gte: period.gte, lt: period.lt },
      status: { not: "VOIDED" },
      type: { in: [...POSITIVE_EXPENSE_TYPES, ...NEGATIVE_EXPENSE_TYPES] },
      eventId: { not: null },
    },
    select: { type: true, amountMinor: true, eventId: true, event: { select: { name: true } } },
  });
  const events = new Map<string, { eventId: string; eventName: string; totalMinor: bigint }>();
  for (const row of rows) {
    const sign = NEGATIVE_EXPENSE_TYPES.includes(row.type) ? -1n : 1n;
    let e = events.get(row.eventId!);
    if (!e) {
      e = { eventId: row.eventId!, eventName: row.event!.name, totalMinor: 0n };
      events.set(row.eventId!, e);
    }
    e.totalMinor += sign * row.amountMinor;
  }
  return [...events.values()].sort((a, b) => (b.totalMinor > a.totalMinor ? 1 : -1));
}
