import type { IngestSendResult } from "./ingestClient.js";

/** Category id shared between category registration and the content that references it. */
export const TRANSACTION_CAPTURED_CATEGORY = "transaction-captured";

export interface TransactionCapturedNotificationData {
  transactionId: string;
  [key: string]: unknown;
}

export interface TransactionCapturedContent {
  title: string;
  body: string;
  data: TransactionCapturedNotificationData;
  categoryIdentifier: string;
}

/**
 * Pure content-building logic for the local "Correct/Change" notification
 * (docs/MOBILE_ARCHITECTURE.md §3), kept separate from `localNotify.ts`'s
 * actual `expo-notifications` calls so it can be unit-tested — importing
 * `expo-notifications` throws outside a real Android/iOS runtime (it calls
 * `requireNativeModule` at import time), the same reason `pipeline.ts`
 * injects its native `subscribe` dependency rather than importing it.
 *
 * Returns null when there's nothing worth notifying about: a failed send
 * (nothing landed, and it's already queued for retry — this only fires for
 * the immediate/online path, see pipeline.ts), or a DUPLICATE (nothing new
 * happened, so no confirmation prompt is useful).
 */
export function buildTransactionCapturedContent(
  result: IngestSendResult,
): TransactionCapturedContent | null {
  if (!result.ok || result.dedupOutcome !== "NEW" || !result.transaction) return null;

  const { transaction } = result;
  const amountText = `₹${transaction.amount.toFixed(2)}`;
  const merchantText = transaction.merchantRaw ? ` at ${transaction.merchantRaw}` : "";

  return {
    title: "Transaction captured",
    body: `${amountText}${merchantText}`,
    data: { transactionId: transaction.id },
    categoryIdentifier: TRANSACTION_CAPTURED_CATEGORY,
  };
}
