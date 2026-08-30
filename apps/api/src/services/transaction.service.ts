import type { PeopleLedgerEntryType, PrismaClient, Transaction } from "@arthiq/database";
import { PEOPLE_LEDGER_TRANSACTION_TYPES, toMinorUnits } from "@arthiq/types";
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
import { upsertMerchant } from "../repositories/merchant.repository.js";
import { computeDedupHash, normalizeMerchant } from "../lib/dedup.js";
import { NotFoundError } from "../lib/errors.js";
import { requireAccount } from "./account.service.js";
import { requireBucket, requireSubBucket } from "./category.service.js";
import { requireEvent } from "./event.service.js";
import { requirePerson } from "./person.service.js";

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

export async function addTransaction(
  prisma: PrismaClient,
  userId: string,
  input: CreateTransactionInput,
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
      bucketId: input.bucketId,
      subBucketId: input.subBucketId,
      eventId: input.eventId,
      personId: input.personId,
      source: "MANUAL",
      classificationSource: input.bucketId ? "MANUAL" : "UNKNOWN",
      classifiedAt: input.bucketId ? new Date() : null,
      classifiedBy: input.bucketId ? userId : null,
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

  return updateTransaction(prisma, userId, id, {
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
          classifiedAt: new Date(),
          classifiedBy: userId,
        }
      : {}),
    ...(input.subBucketId !== undefined ? { subBucketId: input.subBucketId } : {}),
    ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
    ...(input.personId !== undefined ? { personId: input.personId } : {}),
  });
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
