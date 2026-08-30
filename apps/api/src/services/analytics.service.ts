import type { PrismaClient } from "@arthiq/database";
import { fromMinorUnits } from "@arthiq/types";
import {
  type PeriodRange,
  sumByBucket,
  sumEventSpend,
  sumPeriodTotals,
  sumTrend,
} from "../repositories/analytics.repository.js";

/** "2026-08" -> the [gte, lt) range covering that calendar month, in UTC. */
export function monthRange(month: string): PeriodRange {
  const [year, mon] = month.split("-").map(Number);
  const gte = new Date(Date.UTC(year!, mon! - 1, 1));
  const lt = new Date(Date.UTC(year!, mon!, 1));
  return { gte, lt };
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year!, mon! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Percent change from `baseline` to `current`, guarded against a
 * zero/negative baseline — returns null (never NaN/Infinity) so the UI can
 * render "—" instead of a nonsensical percentage, per
 * docs/TESTING_STRATEGY.md's "Analytics" test matrix.
 */
export function percentChange(current: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

async function averageExpenseOverTrailingMonths(
  prisma: PrismaClient,
  userId: string,
  month: string,
  monthsBack: number,
): Promise<number> {
  const totals = await Promise.all(
    Array.from({ length: monthsBack }, (_, i) => shiftMonth(month, -(i + 1))).map((m) =>
      sumPeriodTotals(prisma, userId, monthRange(m)),
    ),
  );
  const sum = totals.reduce((acc, t) => acc + fromMinorUnits(t.expenseMinor), 0);
  return sum / monthsBack;
}

export interface MonthlySummary {
  month: string;
  total: { expense: number; income: number; netCashFlow: number };
  adjusted: { expense: number; income: number; netCashFlow: number };
  excludedAmount: number;
  comparison: {
    previousMonth: { expense: number; percentChange: number | null };
    threeMonthAvg: { expense: number; percentChange: number | null };
    sixMonthAvg: { expense: number; percentChange: number | null };
    twelveMonthAvg: { expense: number; percentChange: number | null };
  };
}

export async function getMonthlySummary(
  prisma: PrismaClient,
  userId: string,
  month: string,
  excludeEventIds: string[],
): Promise<MonthlySummary> {
  const period = monthRange(month);
  const [raw, adjusted, previousMonthRaw, avg3, avg6, avg12] = await Promise.all([
    sumPeriodTotals(prisma, userId, period),
    excludeEventIds.length > 0
      ? sumPeriodTotals(prisma, userId, period, excludeEventIds)
      : Promise.resolve(null),
    sumPeriodTotals(prisma, userId, monthRange(shiftMonth(month, -1))),
    averageExpenseOverTrailingMonths(prisma, userId, month, 3),
    averageExpenseOverTrailingMonths(prisma, userId, month, 6),
    averageExpenseOverTrailingMonths(prisma, userId, month, 12),
  ]);

  const totalExpense = fromMinorUnits(raw.expenseMinor);
  const totalIncome = fromMinorUnits(raw.incomeMinor);
  const adjustedExpense = adjusted ? fromMinorUnits(adjusted.expenseMinor) : totalExpense;
  const adjustedIncome = adjusted ? fromMinorUnits(adjusted.incomeMinor) : totalIncome;
  const previousMonthExpense = fromMinorUnits(previousMonthRaw.expenseMinor);

  return {
    month,
    total: { expense: totalExpense, income: totalIncome, netCashFlow: totalIncome - totalExpense },
    adjusted: {
      expense: adjustedExpense,
      income: adjustedIncome,
      netCashFlow: adjustedIncome - adjustedExpense,
    },
    excludedAmount: totalExpense - adjustedExpense,
    comparison: {
      previousMonth: {
        expense: previousMonthExpense,
        percentChange: percentChange(adjustedExpense, previousMonthExpense),
      },
      threeMonthAvg: { expense: avg3, percentChange: percentChange(adjustedExpense, avg3) },
      sixMonthAvg: { expense: avg6, percentChange: percentChange(adjustedExpense, avg6) },
      twelveMonthAvg: { expense: avg12, percentChange: percentChange(adjustedExpense, avg12) },
    },
  };
}

export async function getByBucket(
  prisma: PrismaClient,
  userId: string,
  month: string,
  excludeEventIds: string[],
) {
  const rows = await sumByBucket(prisma, userId, monthRange(month), excludeEventIds);
  return rows.map((b) => ({
    bucketId: b.bucketId,
    bucketName: b.bucketName,
    total: fromMinorUnits(b.totalMinor),
    subBuckets: b.subBuckets.map((s) => ({
      subBucketId: s.subBucketId,
      subBucketName: s.subBucketName,
      total: fromMinorUnits(s.totalMinor),
    })),
  }));
}

export async function getTrend(
  prisma: PrismaClient,
  userId: string,
  from: string,
  to: string,
  granularity: "daily" | "monthly",
) {
  const rows = await sumTrend(
    prisma,
    userId,
    { gte: new Date(from), lt: new Date(to) },
    granularity,
  );
  return rows.map((r) => ({
    date: r.bucketKey,
    expense: fromMinorUnits(r.expenseMinor),
    income: fromMinorUnits(r.incomeMinor),
  }));
}

/**
 * Textual insights, generated exclusively from figures already computed
 * above — never fabricated, never LLM-sourced (Rule 11). Each insight
 * string is built from a number this function itself calculated.
 */
export async function getInsights(
  prisma: PrismaClient,
  userId: string,
  month: string,
): Promise<string[]> {
  const insights: string[] = [];
  const period = monthRange(month);
  const previousMonth = shiftMonth(month, -1);

  const [currentByBucket, previousByBucket, events, sixMonthAvgExpense] = await Promise.all([
    sumByBucket(prisma, userId, period),
    sumByBucket(prisma, userId, monthRange(previousMonth)),
    sumEventSpend(prisma, userId, period),
    averageExpenseOverTrailingMonths(prisma, userId, month, 6),
  ]);

  const previousByBucketId = new Map(previousByBucket.map((b) => [b.bucketId, b]));

  const MIN_ABS_CHANGE_PERCENT = 15;
  const MIN_ABS_CHANGE_RUPEES = 500;
  const bucketChanges = currentByBucket
    .map((b) => {
      const prev = previousByBucketId.get(b.bucketId);
      const prevAmount = fromMinorUnits(prev?.totalMinor ?? 0n);
      const currentAmount = fromMinorUnits(b.totalMinor);
      const change = percentChange(currentAmount, prevAmount);
      return { name: b.bucketName, currentAmount, prevAmount, change };
    })
    .filter(
      (c) =>
        c.change !== null &&
        Math.abs(c.change) >= MIN_ABS_CHANGE_PERCENT &&
        Math.abs(c.currentAmount - c.prevAmount) >= MIN_ABS_CHANGE_RUPEES,
    )
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
    .slice(0, 3);

  for (const c of bucketChanges) {
    const direction = c.change! > 0 ? "increased" : "decreased";
    insights.push(
      `${c.name} spending ${direction} ${Math.abs(Math.round(c.change!))}% compared with last month.`,
    );
  }

  const totalExpenseMinor = currentByBucket.reduce((sum, b) => sum + b.totalMinor, 0n);
  const totalExpense = fromMinorUnits(totalExpenseMinor);
  if (sixMonthAvgExpense > 0 && totalExpense - sixMonthAvgExpense >= MIN_ABS_CHANGE_RUPEES) {
    const topOverBucket = [...currentByBucket].sort((a, b) =>
      b.totalMinor > a.totalMinor ? 1 : -1,
    )[0];
    if (topOverBucket) {
      const amountOver = totalExpense - sixMonthAvgExpense;
      insights.push(
        `You spent ${amountOver >= 0 ? "₹" + Math.round(amountOver).toLocaleString("en-IN") : ""} more than your 6-month average this month, largely on ${topOverBucket.bucketName}.`,
      );
    }
  }

  if (events.length > 0 && totalExpenseMinor > 0n) {
    const topEvent = events[0]!;
    const eventShare = (Number(topEvent.totalMinor) / Number(totalExpenseMinor)) * 100;
    if (eventShare >= 20) {
      insights.push(
        `${topEvent.eventName} accounts for ${Math.round(eventShare)}% of this month's spending.`,
      );
    }
  }

  return insights;
}
