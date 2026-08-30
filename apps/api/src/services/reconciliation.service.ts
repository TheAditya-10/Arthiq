import type { PrismaClient, Reconciliation } from "@arthiq/database";
import { fromMinorUnits, toMinorUnits } from "@arthiq/types";
import type { RunReconciliationInput, UpdateReconciliationInput } from "@arthiq/validation";

import {
  computeBalanceAsOf,
  countFeeTransactions,
  countNotificationSourced,
  createReconciliation,
  findDuplicateCandidates,
  findReconciliationById,
  listReconciliations as listReconciliationsRepo,
  updateReconciliation,
} from "../repositories/reconciliation.repository.js";
import { NotFoundError } from "../lib/errors.js";
import { requireAccount } from "./account.service.js";

const FEE_LIKE_THRESHOLD_MINOR = 100_00n; // ₹100
const LOW_NOTIFICATION_RATIO = 0.3; // fewer than 30% of the trailing-3-month average

/**
 * Advisory candidate causes for a discrepancy — never auto-applied, never
 * mutates a transaction. See docs/RECONCILIATION_ENGINE.md §3.
 */
async function computeCandidateCauses(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  period: { gte: Date; lt: Date },
  differenceMinor: bigint,
): Promise<string[]> {
  const causes: string[] = [];

  const duplicates = await findDuplicateCandidates(prisma, userId, accountId, period);
  if (duplicates.length > 0) {
    causes.push(
      `Possible duplicate transactions detected (${duplicates.length} group${duplicates.length > 1 ? "s" : ""} of identical-looking entries) — review the ledger for this period.`,
    );
  }

  const absDifference = differenceMinor < 0n ? -differenceMinor : differenceMinor;
  if (absDifference > 0n && absDifference <= FEE_LIKE_THRESHOLD_MINOR) {
    const feeCount = await countFeeTransactions(prisma, userId, accountId, period);
    if (feeCount === 0) {
      causes.push(
        `The difference (${fromMinorUnits(absDifference)}) is small enough to resemble an unrecorded bank fee — check your statement for a fee not yet logged as a FEE transaction.`,
      );
    }
  }

  const [thisMonthCount, threeMonthsAgo1, threeMonthsAgo2, threeMonthsAgo3] = await Promise.all([
    countNotificationSourced(prisma, userId, accountId, period),
    countNotificationSourced(prisma, userId, accountId, shiftPeriod(period, -1)),
    countNotificationSourced(prisma, userId, accountId, shiftPeriod(period, -2)),
    countNotificationSourced(prisma, userId, accountId, shiftPeriod(period, -3)),
  ]);
  const trailingAvg = (threeMonthsAgo1 + threeMonthsAgo2 + threeMonthsAgo3) / 3;
  if (trailingAvg >= 3 && thisMonthCount < trailingAvg * LOW_NOTIFICATION_RATIO) {
    causes.push(
      "Notification-sourced transactions this period are unusually low compared to recent months — the Android notification listener may have been disabled or killed by the OS. See docs/MOTOROLA_SETUP.md.",
    );
  }

  if (differenceMinor !== 0n && causes.length === 0) {
    causes.push(
      "No specific pattern matched — check for a missing manual entry, an unrecorded cash withdrawal/expense, or an incorrect opening balance.",
    );
  }

  return causes;
}

function shiftPeriod(period: { gte: Date; lt: Date }, monthsBack: number): { gte: Date; lt: Date } {
  const shift = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsBack, d.getUTCDate()));
  return { gte: shift(period.gte), lt: shift(period.lt) };
}

export async function runReconciliation(
  prisma: PrismaClient,
  userId: string,
  input: RunReconciliationInput,
): Promise<Reconciliation & { candidateCauses: string[] }> {
  await requireAccount(prisma, userId, input.accountId);

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  const period = { gte: periodStart, lt: periodEnd };

  const [openingBalanceMinor, expectedClosingBalanceMinor] = await Promise.all([
    computeBalanceAsOf(prisma, userId, input.accountId, periodStart),
    computeBalanceAsOf(prisma, userId, input.accountId, periodEnd),
  ]);

  const actualClosingBalanceMinor = toMinorUnits(input.actualClosingBalance);
  const differenceMinor = actualClosingBalanceMinor - expectedClosingBalanceMinor;
  const status = differenceMinor === 0n ? "MATCHED" : "DISCREPANCY";

  const [reconciliation, candidateCauses] = await Promise.all([
    createReconciliation(prisma, userId, {
      accountId: input.accountId,
      periodStart,
      periodEnd,
      openingBalanceMinor,
      expectedClosingBalanceMinor,
      actualClosingBalanceMinor,
      differenceMinor,
      status,
    }),
    status === "DISCREPANCY"
      ? computeCandidateCauses(prisma, userId, input.accountId, period, differenceMinor)
      : Promise.resolve([]),
  ]);

  return { ...reconciliation, candidateCauses };
}

export function getReconciliations(
  prisma: PrismaClient,
  userId: string,
  accountId?: string,
): Promise<Reconciliation[]> {
  return listReconciliationsRepo(prisma, userId, accountId);
}

export async function editReconciliation(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: UpdateReconciliationInput,
): Promise<Reconciliation> {
  const existing = await findReconciliationById(prisma, userId, id);
  if (!existing) throw new NotFoundError("Reconciliation");
  return updateReconciliation(prisma, userId, id, input);
}
