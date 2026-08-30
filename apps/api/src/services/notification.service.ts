import type { NotificationSource, PrismaClient, Transaction } from "@arthiq/database";
import { fromMinorUnits } from "@arthiq/types";
import type { IngestNotificationInput } from "@arthiq/validation";

import { findTransactionsByDedupHash } from "../repositories/transaction.repository.js";
import {
  createNotificationSource,
  listNotificationSources as listNotificationSourcesRepo,
} from "../repositories/notification.repository.js";
import { computeDedupHash, normalizeMerchant } from "../lib/dedup.js";
import { requireAccount } from "./account.service.js";
import { addTransaction } from "./transaction.service.js";

export interface IngestResult {
  dedupOutcome: "NEW" | "DUPLICATE";
  transaction: Transaction | null;
  notificationSource: NotificationSource;
}

/**
 * Ingests one already-parsed, on-device notification (docs/ADR/005). The
 * device is the only place unparseable notifications get filtered out — by
 * the time a payload reaches here, parsing has already succeeded, so
 * `parseSucceeded` is always true and `dedupOutcome` can only end up NEW or
 * DUPLICATE (never REJECTED_UNPARSEABLE, which has no reachable path from
 * this endpoint).
 *
 * Dedup uses the exact same composite hash as manual entry and CSV import
 * (docs/DATABASE_DESIGN.md §3), so a transaction already recorded through
 * either of those sources is correctly recognized as a duplicate here too —
 * the "never assume notification ID alone is sufficient" cross-source dedup
 * this system is built around.
 */
export async function ingestNotification(
  prisma: PrismaClient,
  userId: string,
  input: IngestNotificationInput,
): Promise<IngestResult> {
  await requireAccount(prisma, userId, input.accountId);

  const amountMinor = BigInt(input.amountMinor);
  const occurredAt = new Date(input.occurredAt);
  const normalizedMerchant = input.merchantRaw ? normalizeMerchant(input.merchantRaw) : undefined;
  const type = input.direction === "DEBIT" ? "EXPENSE" : "INCOME";
  const dedupHash = computeDedupHash({
    userId,
    accountId: input.accountId,
    type,
    amountMinor,
    occurredAt,
    normalizedMerchant,
  });

  const existing = await findTransactionsByDedupHash(prisma, userId, dedupHash);
  if (existing.length > 0) {
    const notificationSource = await createNotificationSource(prisma, userId, {
      sourcePackage: input.sourcePackage,
      provider: input.provider,
      rawTextHash: input.rawTextHash,
      rawText: input.rawText,
      parseSucceeded: true,
      dedupOutcome: "DUPLICATE",
    });
    return { dedupOutcome: "DUPLICATE", transaction: null, notificationSource };
  }

  const transaction = await addTransaction(
    prisma,
    userId,
    {
      accountId: input.accountId,
      type,
      amount: fromMinorUnits(amountMinor),
      direction: input.direction,
      occurredAt: input.occurredAt,
      merchantRaw: input.merchantRaw,
    },
    { source: "ANDROID_NOTIFICATION" },
  );

  const notificationSource = await createNotificationSource(prisma, userId, {
    transactionId: transaction.id,
    sourcePackage: input.sourcePackage,
    provider: input.provider,
    rawTextHash: input.rawTextHash,
    rawText: input.rawText,
    parseSucceeded: true,
    dedupOutcome: "NEW",
  });

  return { dedupOutcome: "NEW", transaction, notificationSource };
}

export async function listNotificationSources(
  prisma: PrismaClient,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ items: NotificationSource[]; total: number; page: number; pageSize: number }> {
  const { items, total } = await listNotificationSourcesRepo(prisma, userId, page, pageSize);
  return { items, total, page, pageSize };
}
