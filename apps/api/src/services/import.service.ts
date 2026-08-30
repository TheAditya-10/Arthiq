import type { Import, PrismaClient } from "@arthiq/database";
import { toMinorUnits } from "@arthiq/types";

import { guessColumnMapping, parseCsv, parseCsvAmount, parseCsvDate } from "../lib/csv.js";
import { computeDedupHash, normalizeMerchant } from "../lib/dedup.js";
import { findTransactionsByDedupHash } from "../repositories/transaction.repository.js";
import { createImport, findImportById, finalizeImport } from "../repositories/import.repository.js";
import { ApiError, NotFoundError } from "../lib/errors.js";
import { requireAccount } from "./account.service.js";
import { addTransaction } from "./transaction.service.js";

export interface ColumnMapping {
  date: number;
  description?: number;
  amount: number;
  direction?: number;
}

const PREVIEW_ROW_LIMIT = 20;

export async function previewImport(
  prisma: PrismaClient,
  userId: string,
  accountId: string,
  fileName: string,
  csvText: string,
): Promise<{
  importId: string;
  headers: string[];
  suggestedMapping: ReturnType<typeof guessColumnMapping>;
  previewRows: string[][];
  totalRows: number;
}> {
  await requireAccount(prisma, userId, accountId);

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new ApiError("CSV file is empty", 400, "VALIDATION_ERROR");
  }
  const [headers, ...dataRows] = rows;
  const suggestedMapping = guessColumnMapping(headers!);

  const record = await createImport(prisma, userId, {
    accountId,
    fileName,
    columnMapping: suggestedMapping as unknown as Record<string, number>,
    stagedRows: dataRows,
    rowCount: dataRows.length,
  });

  return {
    importId: record.id,
    headers: headers!,
    suggestedMapping,
    previewRows: dataRows.slice(0, PREVIEW_ROW_LIMIT),
    totalRows: dataRows.length,
  };
}

interface RowResult {
  rowIndex: number;
  status: "IMPORTED" | "DUPLICATE" | "ERROR";
  transactionId?: string;
  error?: string;
}

export async function commitImport(
  prisma: PrismaClient,
  userId: string,
  importId: string,
  mapping: ColumnMapping,
): Promise<{ import: Import; results: RowResult[] }> {
  const record = await findImportById(prisma, userId, importId);
  if (!record) throw new NotFoundError("Import");
  if (record.status === "COMMITTED") {
    throw new ApiError("This import has already been committed", 409, "CONFLICT");
  }
  const rows = (record.stagedRows as unknown as string[][]) ?? [];

  const results: RowResult[] = [];
  let importedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const dateCell = row[mapping.date];
      const amountCell = row[mapping.amount];
      if (!dateCell || !amountCell) throw new Error("Missing date or amount cell");

      const occurredAt = parseCsvDate(dateCell);
      const parsedAmount = parseCsvAmount(amountCell);
      if (!occurredAt || parsedAmount === null) throw new Error("Could not parse date or amount");

      const description =
        mapping.description !== undefined ? row[mapping.description]?.trim() : undefined;
      const directionCell = mapping.direction !== undefined ? row[mapping.direction] : undefined;

      const direction: "DEBIT" | "CREDIT" = directionCell
        ? /^(cr|credit)/i.test(directionCell.trim())
          ? "CREDIT"
          : "DEBIT"
        : parsedAmount < 0
          ? "DEBIT"
          : "CREDIT";

      const amountMinor = toMinorUnits(Math.abs(parsedAmount));
      const normalizedMerchant = description ? normalizeMerchant(description) : undefined;
      const dedupHash = computeDedupHash({
        userId,
        accountId: record.accountId,
        type: direction === "DEBIT" ? "EXPENSE" : "INCOME",
        amountMinor,
        occurredAt,
        normalizedMerchant,
      });

      const existing = await findTransactionsByDedupHash(prisma, userId, dedupHash);
      if (existing.length > 0) {
        duplicateCount++;
        results.push({ rowIndex: i, status: "DUPLICATE" });
        continue;
      }

      const transaction = await addTransaction(
        prisma,
        userId,
        {
          accountId: record.accountId,
          type: direction === "DEBIT" ? "EXPENSE" : "INCOME",
          amount: Math.abs(parsedAmount),
          direction,
          occurredAt: occurredAt.toISOString(),
          merchantRaw: description,
          description,
        },
        { source: "CSV_IMPORT", importId: record.id },
      );
      importedCount++;
      results.push({ rowIndex: i, status: "IMPORTED", transactionId: transaction.id });
    } catch (err) {
      errorCount++;
      results.push({
        rowIndex: i,
        status: "ERROR",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const finalized = await finalizeImport(prisma, userId, importId, {
    status: "COMMITTED",
    importedCount,
    duplicateCount,
    errorCount,
  });

  return { import: finalized, results };
}

export async function getImport(prisma: PrismaClient, userId: string, id: string): Promise<Import> {
  const record = await findImportById(prisma, userId, id);
  if (!record) throw new NotFoundError("Import");
  return record;
}
