import type { Account, PrismaClient } from "@arthiq/database";
import { toMinorUnits } from "@arthiq/types";
import type { CreateAccountInput, UpdateAccountInput } from "@arthiq/validation";

import {
  archiveAccount,
  createAccount,
  findAccountById,
  listAccounts,
  updateAccount,
} from "../repositories/account.repository.js";
import { NotFoundError } from "../lib/errors.js";

export function getAccounts(
  prisma: PrismaClient,
  userId: string,
  includeArchived: boolean,
): Promise<Account[]> {
  return listAccounts(prisma, userId, includeArchived);
}

export async function requireAccount(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Account> {
  const account = await findAccountById(prisma, userId, id);
  if (!account) throw new NotFoundError("Account");
  return account;
}

export function addAccount(
  prisma: PrismaClient,
  userId: string,
  input: CreateAccountInput,
): Promise<Account> {
  return createAccount(prisma, userId, {
    name: input.name,
    type: input.type,
    openingBalanceMinor: toMinorUnits(input.openingBalance),
    openingBalanceDate: new Date(input.openingBalanceDate),
  });
}

export async function editAccount(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: UpdateAccountInput,
): Promise<Account> {
  await requireAccount(prisma, userId, id);
  return updateAccount(prisma, userId, id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.openingBalance !== undefined
      ? { openingBalanceMinor: toMinorUnits(input.openingBalance) }
      : {}),
    ...(input.openingBalanceDate !== undefined
      ? { openingBalanceDate: new Date(input.openingBalanceDate) }
      : {}),
  });
}

export async function removeAccount(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Account> {
  await requireAccount(prisma, userId, id);
  return archiveAccount(prisma, userId, id);
}

/** Current balance = opening balance + every effect a Transaction has had on this account. */
export async function getAccountBalance(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<{ balanceMinor: bigint }> {
  const account = await requireAccount(prisma, userId, id);
  // Direction-based sum: CREDIT adds, DEBIT subtracts, on the primary accountId
  // leg; a transfer's destination leg (toAccountId) is always an inbound
  // credit. See docs/RECONCILIATION_ENGINE.md §1 for why this single
  // direction-based formula is used instead of enumerating transaction types.
  const [debits, credits, incoming] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, accountId: id, direction: "DEBIT", status: { not: "VOIDED" } },
      _sum: { amountMinor: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, accountId: id, direction: "CREDIT", status: { not: "VOIDED" } },
      _sum: { amountMinor: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, toAccountId: id, status: { not: "VOIDED" } },
      _sum: { amountMinor: true },
    }),
  ]);
  const balanceMinor =
    account.openingBalanceMinor +
    (credits._sum.amountMinor ?? 0n) -
    (debits._sum.amountMinor ?? 0n) +
    (incoming._sum.amountMinor ?? 0n);
  return { balanceMinor };
}
