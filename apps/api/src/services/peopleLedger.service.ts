import type { Direction, PrismaClient, Transaction, TransactionType } from "@arthiq/database";
import type { CreatePeopleLedgerEntryInput } from "@arthiq/validation";

import { addTransaction } from "./transaction.service.js";

const SHAPE_FOR_ENTRY_TYPE: Record<string, { type: TransactionType; direction: Direction }> = {
  LENT: { type: "LENT", direction: "DEBIT" },
  BORROWED: { type: "BORROWED", direction: "CREDIT" },
  REPAYMENT_RECEIVED: { type: "LENT_REPAYMENT", direction: "CREDIT" },
  REPAYMENT_MADE: { type: "BORROWED_REPAYMENT", direction: "DEBIT" },
};

/**
 * Convenience endpoint (docs/API_SPECIFICATION.md `/people-ledger`) that
 * maps the person-ledger vocabulary (lent/borrowed/repaid) onto the same
 * Transaction + PeopleLedgerEntry creation path used by POST /transactions
 * — there is exactly one place a lending-type Transaction is ever created
 * (transaction.service.ts's addTransaction), so the two entrypoints can
 * never drift on the atomicity/classification guarantees it provides.
 */
export async function addPeopleLedgerEntry(
  prisma: PrismaClient,
  userId: string,
  input: CreatePeopleLedgerEntryInput,
): Promise<Transaction> {
  const shape = SHAPE_FOR_ENTRY_TYPE[input.entryType]!;
  const transaction = await addTransaction(prisma, userId, {
    accountId: input.accountId,
    type: shape.type,
    amount: input.amount,
    direction: shape.direction,
    occurredAt: input.occurredAt,
    personId: input.personId,
    description: input.notes,
  });

  if (input.dueDate || input.notes) {
    await prisma.peopleLedgerEntry.update({
      where: { transactionId: transaction.id },
      data: {
        ...(input.dueDate ? { dueDate: new Date(input.dueDate) } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });
  }

  // Repayments specifically (not the original lending/borrowing) get an
  // audit trail entry — docs/SECURITY.md §5's "financial-state-changing
  // actions are traceable to a user and a time."
  if (input.entryType === "REPAYMENT_RECEIVED" || input.entryType === "REPAYMENT_MADE") {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType: "PeopleLedgerEntry",
        entityId: transaction.id,
        transactionId: transaction.id,
        action: "REPAYMENT_RECORDED",
        after: {
          personId: input.personId,
          entryType: input.entryType,
          amountMinor: transaction.amountMinor.toString(),
        },
      },
    });
  }

  return transaction;
}
