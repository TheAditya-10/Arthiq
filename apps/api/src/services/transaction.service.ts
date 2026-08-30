import type {
  ClassificationSource,
  PeopleLedgerEntryType,
  PrismaClient,
  Transaction,
} from "@arthiq/database";
import {
  CATEGORIZABLE_TRANSACTION_TYPES,
  PEOPLE_LEDGER_TRANSACTION_TYPES,
  toMinorUnits,
} from "@arthiq/types";
import { classifyTransaction } from "@arthiq/classification";
import type {
  CreateCashExpenseInput,
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from "@arthiq/validation";

import {
  createTransaction,
  findTransactionById,
  listTransactions as listTransactionsRepo,
  updateTransaction,
  voidTransaction,
} from "../repositories/transaction.repository.js";
import { upsertMerchant, upsertMerchantRule } from "../repositories/merchant.repository.js";
import { computeDedupHash, normalizeMerchant } from "../lib/dedup.js";
import { NotFoundError } from "../lib/errors.js";
import { buildClassificationContext } from "./classification.context.js";
import { getAIConfidenceThreshold, getConfiguredAIClassifier } from "./classification.provider.js";
import { requireAccount } from "./account.service.js";
import { requireBucket, requireSubBucket } from "./category.service.js";
import { requireEvent } from "./event.service.js";
import { requirePerson } from "./person.service.js";

interface ResolvedClassification {
  bucketId: string | null;
  subBucketId: string | null;
  source: ClassificationSource;
  confidence: number | null;
  classifiedAt: Date | null;
  classifiedBy: string | null;
}

/**
 * Resolves the bucket/sub-bucket for a categorizable transaction: a
 * user-supplied bucketId is always MANUAL and authoritative; otherwise the
 * layered classifier (packages/classification, docs/CLASSIFICATION_ENGINE.md)
 * runs, and UNKNOWN results leave bucketId null rather than guessing.
 */
async function resolveClassification(
  prisma: PrismaClient,
  userId: string,
  input: {
    type: string;
    bucketId?: string;
    subBucketId?: string;
    merchantRaw?: string;
    amountMinor: bigint;
    direction: "DEBIT" | "CREDIT";
  },
): Promise<ResolvedClassification> {
  if (input.bucketId) {
    return {
      bucketId: input.bucketId,
      subBucketId: input.subBucketId ?? null,
      source: "MANUAL",
      confidence: null,
      classifiedAt: new Date(),
      classifiedBy: userId,
    };
  }
  if (!(CATEGORIZABLE_TRANSACTION_TYPES as readonly string[]).includes(input.type)) {
    return {
      bucketId: null,
      subBucketId: null,
      source: "UNKNOWN",
      confidence: null,
      classifiedAt: null,
      classifiedBy: null,
    };
  }

  const ctx = buildClassificationContext(prisma, userId, getConfiguredAIClassifier());
  const result = await classifyTransaction(
    { merchantRaw: input.merchantRaw, amountMinor: input.amountMinor, direction: input.direction },
    ctx,
    { aiConfidenceThreshold: getAIConfidenceThreshold() },
  );
  if (result.source === "UNKNOWN") {
    return {
      bucketId: null,
      subBucketId: null,
      source: "UNKNOWN",
      confidence: null,
      classifiedAt: null,
      classifiedBy: null,
    };
  }
  return {
    bucketId: result.bucketId,
    subBucketId: result.subBucketId,
    source: result.source,
    confidence: result.confidence,
    classifiedAt: new Date(),
    classifiedBy: "system",
  };
}

async function validateReferences(
  prisma: PrismaClient,
  userId: string,
  input: {
    accountId: string;
    toAccountId?: string;
    bucketId?: string;
    subBucketId?: string;
    eventId?: string;
    personId?: string;
  },
): Promise<void> {
  await requireAccount(prisma, userId, input.accountId);
  if (input.toAccountId) await requireAccount(prisma, userId, input.toAccountId);
  if (input.bucketId) await requireBucket(prisma, userId, input.bucketId);
  if (input.subBucketId) await requireSubBucket(prisma, userId, input.subBucketId);
  if (input.eventId) await requireEvent(prisma, userId, input.eventId);
  if (input.personId) await requirePerson(prisma, userId, input.personId);
}

async function resolveMerchantId(
  prisma: PrismaClient,
  userId: string,
  merchantRaw?: string,
): Promise<string | undefined> {
  if (!merchantRaw) return undefined;
  const normalized = normalizeMerchant(merchantRaw);
  if (!normalized) return undefined;
  const merchant = await upsertMerchant(prisma, userId, normalized, merchantRaw);
  return merchant.id;
}

const PEOPLE_LEDGER_ENTRY_TYPE_FOR_TRANSACTION_TYPE: Record<string, PeopleLedgerEntryType> = {
  LENT: "LENT",
  BORROWED: "BORROWED",
  LENT_REPAYMENT: "REPAYMENT_RECEIVED",
  BORROWED_REPAYMENT: "REPAYMENT_MADE",
};

export interface AddTransactionOptions {
  /** Internal-only override — never settable via the public POST /transactions route, which is always MANUAL. Used by the CSV import service (Phase 14). */
  source?: "MANUAL" | "CSV_IMPORT" | "ANDROID_NOTIFICATION" | "ACCOUNT_AGGREGATOR";
  importId?: string;
}

export async function addTransaction(
  prisma: PrismaClient,
  userId: string,
  input: CreateTransactionInput,
  options: AddTransactionOptions = {},
): Promise<Transaction> {
  await validateReferences(prisma, userId, input);
  const merchantId = await resolveMerchantId(prisma, userId, input.merchantRaw);
  const amountMinor = toMinorUnits(input.amount);
  const occurredAt = new Date(input.occurredAt);
  const normalizedMerchant = input.merchantRaw ? normalizeMerchant(input.merchantRaw) : undefined;
  const dedupHash = computeDedupHash({
    userId,
    accountId: input.accountId,
    type: input.type,
    amountMinor,
    occurredAt,
    normalizedMerchant,
  });

  const isPeopleLedgerType = (PEOPLE_LEDGER_TRANSACTION_TYPES as readonly string[]).includes(
    input.type,
  );
  const classification = await resolveClassification(prisma, userId, {
    type: input.type,
    bucketId: input.bucketId,
    subBucketId: input.subBucketId,
    merchantRaw: input.merchantRaw,
    amountMinor,
    direction: input.direction,
  });

  const transaction = await prisma.$transaction(async (tx) => {
    const created = await createTransaction(tx, {
      userId,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      type: input.type,
      amountMinor,
      direction: input.direction,
      occurredAt,
      merchantId,
      merchantRaw: input.merchantRaw,
      description: input.description,
      bucketId: classification.bucketId,
      subBucketId: classification.subBucketId,
      eventId: input.eventId,
      personId: input.personId,
      source: options.source ?? "MANUAL",
      importId: options.importId,
      classificationSource: classification.source,
      classificationConfidence: classification.confidence,
      classifiedAt: classification.classifiedAt,
      classifiedBy: classification.classifiedBy,
      status: "CONFIRMED",
      dedupHash,
    });

    if (isPeopleLedgerType && input.personId) {
      await tx.peopleLedgerEntry.create({
        data: {
          userId,
          personId: input.personId,
          transactionId: created.id,
          entryType: PEOPLE_LEDGER_ENTRY_TYPE_FOR_TRANSACTION_TYPE[input.type]!,
          amountMinor,
          occurredAt,
        },
      });
    }

    return created;
  });

  return transaction;
}

export async function addCashExpense(
  prisma: PrismaClient,
  userId: string,
  input: CreateCashExpenseInput,
): Promise<Transaction> {
  return addTransaction(prisma, userId, {
    accountId: input.accountId,
    type: "CASH_EXPENSE",
    amount: input.amount,
    direction: "DEBIT",
    occurredAt: input.occurredAt,
    description: input.description,
    bucketId: input.bucketId,
    subBucketId: input.subBucketId,
    eventId: input.eventId,
  });
}

export async function requireTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Transaction> {
  const transaction = await findTransactionById(prisma, userId, id);
  if (!transaction) throw new NotFoundError("Transaction");
  return transaction;
}

export async function editTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<Transaction> {
  const existing = await requireTransaction(prisma, userId, id);
  await validateReferences(prisma, userId, {
    accountId: input.accountId ?? existing.accountId,
    toAccountId: input.toAccountId,
    bucketId: input.bucketId,
    subBucketId: input.subBucketId,
    eventId: input.eventId,
    personId: input.personId,
  });

  const merchantId = input.merchantRaw
    ? await resolveMerchantId(prisma, userId, input.merchantRaw)
    : undefined;

  const updated = await updateTransaction(prisma, userId, id, {
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    ...(input.toAccountId !== undefined ? { toAccountId: input.toAccountId } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.amount !== undefined ? { amountMinor: toMinorUnits(input.amount) } : {}),
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.occurredAt !== undefined ? { occurredAt: new Date(input.occurredAt) } : {}),
    ...(input.merchantRaw !== undefined ? { merchantRaw: input.merchantRaw, merchantId } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.bucketId !== undefined
      ? {
          bucketId: input.bucketId,
          classificationSource: "MANUAL",
          classificationConfidence: null,
          classifiedAt: new Date(),
          classifiedBy: userId,
        }
      : {}),
    ...(input.subBucketId !== undefined ? { subBucketId: input.subBucketId } : {}),
    ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
    ...(input.personId !== undefined ? { personId: input.personId } : {}),
  });

  // The learning loop (docs/ADR/006, docs/CLASSIFICATION_ENGINE.md §4): a
  // manual category correction on a transaction with a resolved merchant
  // becomes a permanent MerchantRule, so future transactions from that
  // merchant classify via RULE (step 1) without ever re-asking.
  const effectiveMerchantId = merchantId ?? existing.merchantId;
  if (input.bucketId !== undefined && effectiveMerchantId) {
    await upsertMerchantRule(prisma, userId, {
      merchantId: effectiveMerchantId,
      bucketId: input.bucketId,
      subBucketId: input.subBucketId ?? null,
      createdFrom: "USER_CORRECTION",
    });
    await prisma.auditLog.create({
      data: {
        userId,
        entityType: "Transaction",
        entityId: id,
        transactionId: id,
        action: "CLASSIFICATION_OVERRIDDEN",
        before: { bucketId: existing.bucketId, subBucketId: existing.subBucketId },
        after: { bucketId: input.bucketId, subBucketId: input.subBucketId ?? null },
      },
    });
  }

  return updated;
}

export async function removeTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Transaction> {
  await requireTransaction(prisma, userId, id);
  return voidTransaction(prisma, userId, id);
}

export async function getTransactions(
  prisma: PrismaClient,
  userId: string,
  query: ListTransactionsQuery,
): Promise<{ items: Transaction[]; total: number; page: number; pageSize: number }> {
  const { items, total } = await listTransactionsRepo(
    prisma,
    userId,
    {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      bucketId: query.bucketId,
      subBucketId: query.subBucketId,
      eventId: query.eventId,
      accountId: query.accountId,
      personId: query.personId,
      type: query.type,
      source: query.source,
      status: query.status,
      classificationSource: query.classificationSource,
      search: query.search,
    },
    query.page,
    query.pageSize,
  );
  return { items, total, page: query.page, pageSize: query.pageSize };
}
