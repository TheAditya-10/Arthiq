import type {
  ClassificationSource,
  Prisma,
  PeopleLedgerEntryType,
  PrismaClient,
  Transaction,
} from "@arthiq/database";
import {
  CATEGORIZABLE_TRANSACTION_TYPES,
  PEOPLE_LEDGER_TRANSACTION_TYPES,
  fromMinorUnits,
  toMinorUnits,
} from "@arthiq/types";
import { classifyTransaction } from "@arthiq/classification";
import type {
  CreateCashExpenseInput,
  CreateSplitExpenseInput,
  CreateTransactionInput,
  ListTransactionsQuery,
  TransactionSummaryQuery,
  UpdateTransactionInput,
} from "@arthiq/validation";

import {
  createTransaction,
  findTransactionById,
  listForSummary,
  listTransactions as listTransactionsRepo,
  updateTransaction,
  voidTransaction,
} from "../repositories/transaction.repository.js";
import { upsertMerchant, upsertMerchantRule } from "../repositories/merchant.repository.js";
import { computeDedupHash, normalizeMerchant } from "../lib/dedup.js";
import { ApiError, NotFoundError } from "../lib/errors.js";
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

export interface SplitExpenseResult {
  /** The payer's own share; null when the payer covered everyone else entirely. */
  expense: Transaction | null;
  /** One LENT transaction (and ledger entry) per person who owes a share back. */
  lent: Transaction[];
}

/**
 * Records one payment made on behalf of a group as the payer's own EXPENSE
 * (amount − Σshares) plus one LENT per other person, all in a single database
 * transaction so a partial split can never be left behind. The account is
 * debited by the full amount; each friend's share shows up as a receivable that
 * the normal repayment flow (POST /people-ledger, REPAYMENT_RECEIVED) settles.
 */
export async function addSplitExpense(
  prisma: PrismaClient,
  userId: string,
  input: CreateSplitExpenseInput,
): Promise<SplitExpenseResult> {
  await validateReferences(prisma, userId, input);
  for (const share of input.shares) await requirePerson(prisma, userId, share.personId);

  const totalMinor = toMinorUnits(input.amount);
  const shareMinors = input.shares.map((s) => toMinorUnits(s.amount));
  const ownMinor = totalMinor - shareMinors.reduce((sum, m) => sum + m, 0n);
  const occurredAt = new Date(input.occurredAt);
  const merchantId = await resolveMerchantId(prisma, userId, input.merchantRaw);
  const normalizedMerchant = input.merchantRaw ? normalizeMerchant(input.merchantRaw) : undefined;

  const classification =
    ownMinor > 0n
      ? await resolveClassification(prisma, userId, {
          type: "EXPENSE",
          bucketId: input.bucketId,
          subBucketId: input.subBucketId,
          merchantRaw: input.merchantRaw,
          amountMinor: ownMinor,
          direction: "DEBIT",
        })
      : null;

  return prisma.$transaction(async (tx) => {
    const expense =
      ownMinor > 0n && classification
        ? await createTransaction(tx, {
            userId,
            accountId: input.accountId,
            type: "EXPENSE",
            amountMinor: ownMinor,
            direction: "DEBIT",
            occurredAt,
            merchantId,
            merchantRaw: input.merchantRaw,
            description: input.description,
            bucketId: classification.bucketId,
            subBucketId: classification.subBucketId,
            eventId: input.eventId,
            source: "MANUAL",
            classificationSource: classification.source,
            classificationConfidence: classification.confidence,
            classifiedAt: classification.classifiedAt,
            classifiedBy: classification.classifiedBy,
            status: "CONFIRMED",
            dedupHash: computeDedupHash({
              userId,
              accountId: input.accountId,
              type: "EXPENSE",
              amountMinor: ownMinor,
              occurredAt,
              normalizedMerchant,
            }),
          })
        : null;

    const lent: Transaction[] = [];
    for (const [i, share] of input.shares.entries()) {
      const amountMinor = shareMinors[i]!;
      const created = await createTransaction(tx, {
        userId,
        accountId: input.accountId,
        type: "LENT",
        amountMinor,
        direction: "DEBIT",
        occurredAt,
        merchantRaw: input.merchantRaw,
        description: input.description,
        eventId: input.eventId,
        personId: share.personId,
        source: "MANUAL",
        classificationSource: "UNKNOWN",
        status: "CONFIRMED",
        dedupHash: computeDedupHash({
          userId,
          accountId: input.accountId,
          type: "LENT",
          amountMinor,
          occurredAt,
          normalizedMerchant: `${normalizedMerchant ?? ""}|${share.personId}`,
        }),
      });
      await tx.peopleLedgerEntry.create({
        data: {
          userId,
          personId: share.personId,
          transactionId: created.id,
          entryType: "LENT",
          amountMinor,
          occurredAt,
          notes: input.description,
        },
      });
      lent.push(created);
    }
    return { expense, lent };
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

const DIRECTION_FOR_TYPE: Partial<Record<string, "DEBIT" | "CREDIT">> = {
  EXPENSE: "DEBIT",
  CASH_EXPENSE: "DEBIT",
  FEE: "DEBIT",
  LENT: "DEBIT",
  BORROWED_REPAYMENT: "DEBIT",
  INCOME: "CREDIT",
  REFUND: "CREDIT",
  BORROWED: "CREDIT",
  LENT_REPAYMENT: "CREDIT",
};

const isLedgerType = (type: string) =>
  (PEOPLE_LEDGER_TRANSACTION_TYPES as readonly string[]).includes(type);

function invalid(message: string): never {
  throw new ApiError(message, 400, "VALIDATION_ERROR");
}

/**
 * Edits any field of a transaction and keeps everything derived from it
 * consistent in one database transaction: the people-ledger entry (amount,
 * person, date, type — created or removed if the type crosses the
 * lending/non-lending line), the dedup hash, and an audit trail of what changed.
 * The same shape rules as creation apply to the merged result.
 */
export async function editTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<Transaction> {
  const existing = await requireTransaction(prisma, userId, id);
  if (existing.status === "VOIDED") invalid("A deleted transaction cannot be edited");

  const type = input.type ?? existing.type;
  const pick = <K extends keyof UpdateTransactionInput & keyof Transaction>(key: K) =>
    (input[key] !== undefined ? input[key] : existing[key]) as Transaction[K] | null;

  const next = {
    accountId: input.accountId ?? existing.accountId,
    toAccountId: pick("toAccountId") as string | null,
    type,
    direction:
      input.direction ??
      (input.type !== undefined
        ? (DIRECTION_FOR_TYPE[type] ?? existing.direction)
        : existing.direction),
    amountMinor: input.amount !== undefined ? toMinorUnits(input.amount) : existing.amountMinor,
    occurredAt: input.occurredAt !== undefined ? new Date(input.occurredAt) : existing.occurredAt,
    merchantRaw: pick("merchantRaw") as string | null,
    description: pick("description") as string | null,
    bucketId: pick("bucketId") as string | null,
    subBucketId: pick("subBucketId") as string | null,
    eventId: pick("eventId") as string | null,
    personId: pick("personId") as string | null,
  };

  const balanceOnly = type === "TRANSFER" || isLedgerType(type);
  if (type === "TRANSFER") {
    if (!next.toAccountId) invalid("toAccountId is required for TRANSFER");
    if (next.toAccountId === next.accountId) invalid("toAccountId must differ from accountId");
  } else {
    next.toAccountId = null;
  }
  if (isLedgerType(type)) {
    if (!next.personId) invalid(`personId is required for ${type}`);
  } else {
    next.personId = null;
  }
  if (balanceOnly) {
    next.bucketId = null;
    next.subBucketId = null;
  } else {
    // Picking a new category without a sub-category clears the old sub-category.
    if (input.bucketId !== undefined && input.subBucketId === undefined) next.subBucketId = null;
    if (next.subBucketId && !next.bucketId) invalid("subBucketId requires bucketId");
  }

  await validateReferences(prisma, userId, {
    accountId: next.accountId,
    toAccountId: next.toAccountId ?? undefined,
    bucketId: next.bucketId ?? undefined,
    subBucketId: next.subBucketId ?? undefined,
    eventId: next.eventId ?? undefined,
    personId: next.personId ?? undefined,
  });

  const merchantRawChanged = input.merchantRaw !== undefined;
  const merchantId = merchantRawChanged
    ? next.merchantRaw
      ? await resolveMerchantId(prisma, userId, next.merchantRaw)
      : null
    : existing.merchantId;
  const normalizedMerchant = next.merchantRaw ? normalizeMerchant(next.merchantRaw) : undefined;
  const bucketTouched = input.bucketId !== undefined || balanceOnly;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.transaction.update({
      where: { id, userId },
      data: {
        accountId: next.accountId,
        toAccountId: next.toAccountId,
        type: next.type,
        direction: next.direction,
        amountMinor: next.amountMinor,
        occurredAt: next.occurredAt,
        merchantRaw: next.merchantRaw,
        merchantId,
        description: next.description,
        bucketId: next.bucketId,
        subBucketId: next.subBucketId,
        eventId: next.eventId,
        personId: next.personId,
        dedupHash: computeDedupHash({
          userId,
          accountId: next.accountId,
          type: next.type,
          amountMinor: next.amountMinor,
          occurredAt: next.occurredAt,
          normalizedMerchant,
        }),
        ...(bucketTouched
          ? next.bucketId
            ? {
                classificationSource: "MANUAL" as const,
                classificationConfidence: null,
                classifiedAt: new Date(),
                classifiedBy: userId,
              }
            : { classificationSource: "UNKNOWN" as const, classificationConfidence: null }
          : {}),
      },
    });

    if (isLedgerType(type)) {
      const entry = {
        personId: next.personId!,
        entryType: PEOPLE_LEDGER_ENTRY_TYPE_FOR_TRANSACTION_TYPE[type]!,
        amountMinor: next.amountMinor,
        occurredAt: next.occurredAt,
      };
      await tx.peopleLedgerEntry.upsert({
        where: { transactionId: id },
        create: { userId, transactionId: id, ...entry },
        update: entry,
      });
    } else {
      await tx.peopleLedgerEntry.deleteMany({ where: { transactionId: id } });
    }

    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => {
      const a = existing[key as keyof Transaction];
      const b = next[key];
      return (
        (a instanceof Date ? a.getTime() : (a ?? null)) !==
        (b instanceof Date ? b.getTime() : (b ?? null))
      );
    });
    if (changed.length > 0) {
      const show = (src: Record<string, unknown>) =>
        Object.fromEntries(
          changed.map((key) => {
            const v = src[key];
            return [
              key,
              typeof v === "bigint"
                ? v.toString()
                : v instanceof Date
                  ? v.toISOString()
                  : (v ?? null),
            ];
          }),
        ) as Prisma.InputJsonObject;
      await tx.auditLog.create({
        data: {
          userId,
          entityType: "Transaction",
          entityId: id,
          transactionId: id,
          action: "TRANSACTION_EDITED",
          before: show(existing as unknown as Record<string, unknown>),
          after: show(next as unknown as Record<string, unknown>),
        },
      });
    }
    return row;
  });

  // The learning loop (docs/ADR/006, docs/CLASSIFICATION_ENGINE.md §4): a
  // manual category correction on a transaction with a resolved merchant
  // becomes a permanent MerchantRule, so future transactions from that
  // merchant classify via RULE (step 1) without ever re-asking.
  const effectiveMerchantId = merchantId ?? existing.merchantId;
  if (input.bucketId && effectiveMerchantId) {
    await upsertMerchantRule(prisma, userId, {
      merchantId: effectiveMerchantId,
      bucketId: input.bucketId,
      subBucketId: next.subBucketId,
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
        after: { bucketId: input.bucketId, subBucketId: next.subBucketId },
      },
    });
  }

  return updated;
}

/**
 * Deletes a transaction (soft: status VOIDED, so history and audit survive).
 * Its people-ledger entry is removed too — otherwise a deleted loan would keep
 * counting toward what the person owes.
 */
export async function removeTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Transaction> {
  const existing = await requireTransaction(prisma, userId, id);
  return prisma.$transaction(async (tx) => {
    await tx.peopleLedgerEntry.deleteMany({ where: { transactionId: id } });
    const voided = await tx.transaction.update({
      where: { id, userId },
      data: { status: "VOIDED" },
    });
    await tx.auditLog.create({
      data: {
        userId,
        entityType: "Transaction",
        entityId: id,
        transactionId: id,
        action: "TRANSACTION_DELETED",
        before: {
          type: existing.type,
          amountMinor: existing.amountMinor.toString(),
          occurredAt: existing.occurredAt.toISOString(),
          personId: existing.personId,
        },
      },
    });
    return voided;
  });
}

/** A date-only `to` filter means "through the end of that day", not "up to its midnight". */
function endOfDay(date?: string): Date | undefined {
  return date ? new Date(`${date}T23:59:59.999Z`) : undefined;
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
      to: endOfDay(query.to),
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
      excludeVoided: true,
    },
    query.page,
    query.pageSize,
  );
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export interface SummaryTotals {
  count: number;
  /** Everything credited to the account(s): income, refunds, borrowed, repayments received. */
  moneyIn: number;
  /** Everything debited: spending, lent, repayments made. */
  moneyOut: number;
  /** INCOME-type transactions only. */
  income: number;
  /** EXPENSE + CASH_EXPENSE + FEE, less REFUNDs. */
  spending: number;
}
export interface SummaryGroup extends SummaryTotals {
  key: string;
  label: string;
}

const SPENDING_TYPES = ["EXPENSE", "CASH_EXPENSE", "FEE"];

/**
 * Totals — and optional subtotals by bucket / month / event / type — over every
 * transaction matching the filters (not just one page of them).
 */
export async function getTransactionSummary(
  prisma: PrismaClient,
  userId: string,
  query: TransactionSummaryQuery,
): Promise<{ totals: SummaryTotals; groups: SummaryGroup[] }> {
  const rows = await listForSummary(prisma, userId, {
    from: query.from ? new Date(query.from) : undefined,
    to: endOfDay(query.to),
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
    excludeVoided: true,
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const monthFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: user?.timezone ?? "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  });
  const monthKey = (d: Date) => {
    const parts = monthFormat.formatToParts(d);
    return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
  };

  type Acc = { count: number; moneyIn: bigint; moneyOut: bigint; income: bigint; spending: bigint };
  const blank = (): Acc => ({ count: 0, moneyIn: 0n, moneyOut: 0n, income: 0n, spending: 0n });
  const add = (acc: Acc, row: (typeof rows)[number]) => {
    acc.count += 1;
    if (row.direction === "CREDIT") acc.moneyIn += row.amountMinor;
    else acc.moneyOut += row.amountMinor;
    if (row.type === "INCOME") acc.income += row.amountMinor;
    if (SPENDING_TYPES.includes(row.type)) acc.spending += row.amountMinor;
    if (row.type === "REFUND") acc.spending -= row.amountMinor;
  };
  const finish = (acc: Acc): SummaryTotals => ({
    count: acc.count,
    moneyIn: fromMinorUnits(acc.moneyIn),
    moneyOut: fromMinorUnits(acc.moneyOut),
    income: fromMinorUnits(acc.income),
    spending: fromMinorUnits(acc.spending),
  });

  const totals = blank();
  const byKey = new Map<string, Acc>();
  const keyOf = (row: (typeof rows)[number]): string => {
    switch (query.groupBy) {
      case "bucket":
        return row.bucketId ?? "";
      case "event":
        return row.eventId ?? "";
      case "month":
        return monthKey(row.occurredAt);
      case "type":
        return row.type;
      default:
        return "";
    }
  };
  for (const row of rows) {
    add(totals, row);
    if (query.groupBy !== "none") {
      const key = keyOf(row);
      const acc = byKey.get(key) ?? blank();
      add(acc, row);
      byKey.set(key, acc);
    }
  }

  const ids = [...byKey.keys()].filter(Boolean);
  const names = new Map<string, string>();
  if (query.groupBy === "bucket" && ids.length > 0) {
    for (const b of await prisma.bucket.findMany({ where: { userId, id: { in: ids } } })) {
      names.set(b.id, b.name);
    }
  }
  if (query.groupBy === "event" && ids.length > 0) {
    for (const e of await prisma.event.findMany({ where: { userId, id: { in: ids } } })) {
      names.set(e.id, e.name);
    }
  }
  const labelOf = (key: string): string => {
    if (query.groupBy === "bucket") return key ? (names.get(key) ?? "Unknown") : "Uncategorized";
    if (query.groupBy === "event") return key ? (names.get(key) ?? "Unknown") : "No event";
    return key;
  };

  const groups = [...byKey.entries()]
    .map(([key, acc]) => ({ key, label: labelOf(key), ...finish(acc) }))
    // months read chronologically; everything else, biggest spend first
    .sort((a, b) =>
      query.groupBy === "month"
        ? a.key.localeCompare(b.key)
        : b.spending - a.spending || b.moneyOut - a.moneyOut,
    );
  return { totals: finish(totals), groups };
}
