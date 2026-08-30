/**
 * Shared domain enums. These mirror the enums defined in
 * packages/database/prisma/schema.prisma exactly (Prisma generates its own
 * TS enum types from the schema for consumers of the Prisma client, but
 * apps/mobile cannot depend on @prisma/client at all — it needs these as
 * plain, dependency-free TypeScript). If you add/rename a value here, make
 * the identical change in schema.prisma, and vice versa.
 *
 * See docs/DATABASE_DESIGN.md and docs/ADR/004-transaction-model.md.
 */

export const TransactionType = {
  EXPENSE: "EXPENSE",
  INCOME: "INCOME",
  TRANSFER: "TRANSFER",
  LENT: "LENT",
  BORROWED: "BORROWED",
  LENT_REPAYMENT: "LENT_REPAYMENT",
  BORROWED_REPAYMENT: "BORROWED_REPAYMENT",
  CASH_EXPENSE: "CASH_EXPENSE",
  REFUND: "REFUND",
  FEE: "FEE",
  UNKNOWN: "UNKNOWN",
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

/** Transaction types that must never appear in expense/income analytics totals. */
export const BALANCE_ONLY_TRANSACTION_TYPES: readonly TransactionType[] = [
  TransactionType.TRANSFER,
  TransactionType.LENT,
  TransactionType.BORROWED,
  TransactionType.LENT_REPAYMENT,
  TransactionType.BORROWED_REPAYMENT,
];

/** Transaction types that require a bucket/sub-bucket categorization. */
export const CATEGORIZABLE_TRANSACTION_TYPES: readonly TransactionType[] = [
  TransactionType.EXPENSE,
  TransactionType.INCOME,
  TransactionType.CASH_EXPENSE,
  TransactionType.REFUND,
  TransactionType.FEE,
  TransactionType.UNKNOWN,
];

/** Transaction types that require a personId (People Ledger link). */
export const PEOPLE_LEDGER_TRANSACTION_TYPES: readonly TransactionType[] = [
  TransactionType.LENT,
  TransactionType.BORROWED,
  TransactionType.LENT_REPAYMENT,
  TransactionType.BORROWED_REPAYMENT,
];

export const Direction = {
  DEBIT: "DEBIT",
  CREDIT: "CREDIT",
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const AccountType = {
  BANK: "BANK",
  CASH: "CASH",
  CREDIT_CARD: "CREDIT_CARD",
  WALLET: "WALLET",
  INVESTMENT: "INVESTMENT",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const TransactionSource = {
  ANDROID_NOTIFICATION: "ANDROID_NOTIFICATION",
  MANUAL: "MANUAL",
  CSV_IMPORT: "CSV_IMPORT",
  ACCOUNT_AGGREGATOR: "ACCOUNT_AGGREGATOR",
} as const;
export type TransactionSource = (typeof TransactionSource)[keyof typeof TransactionSource];

export const ClassificationSource = {
  RULE: "RULE",
  HISTORICAL: "HISTORICAL",
  HEURISTIC: "HEURISTIC",
  AI: "AI",
  MANUAL: "MANUAL",
  UNKNOWN: "UNKNOWN",
} as const;
export type ClassificationSource = (typeof ClassificationSource)[keyof typeof ClassificationSource];

export const TransactionStatus = {
  CONFIRMED: "CONFIRMED",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  DUPLICATE_SUSPECTED: "DUPLICATE_SUSPECTED",
  VOIDED: "VOIDED",
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const PeopleLedgerEntryType = {
  LENT: "LENT",
  BORROWED: "BORROWED",
  REPAYMENT_RECEIVED: "REPAYMENT_RECEIVED",
  REPAYMENT_MADE: "REPAYMENT_MADE",
} as const;
export type PeopleLedgerEntryType =
  (typeof PeopleLedgerEntryType)[keyof typeof PeopleLedgerEntryType];

export const ReconciliationStatus = {
  PENDING: "PENDING",
  MATCHED: "MATCHED",
  DISCREPANCY: "DISCREPANCY",
  RESOLVED: "RESOLVED",
} as const;
export type ReconciliationStatus = (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];

export const ImportStatus = {
  PENDING_MAPPING: "PENDING_MAPPING",
  PREVIEWED: "PREVIEWED",
  COMMITTED: "COMMITTED",
  FAILED: "FAILED",
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const NotificationProviderKey = {
  GOOGLE_PAY: "GOOGLE_PAY",
  PHONEPE: "PHONEPE",
  PAYTM: "PAYTM",
  GENERIC_UPI: "GENERIC_UPI",
} as const;
export type NotificationProviderKey =
  (typeof NotificationProviderKey)[keyof typeof NotificationProviderKey];

export const DedupOutcome = {
  NEW: "NEW",
  DUPLICATE: "DUPLICATE",
  REJECTED_UNPARSEABLE: "REJECTED_UNPARSEABLE",
} as const;
export type DedupOutcome = (typeof DedupOutcome)[keyof typeof DedupOutcome];

export const MerchantRuleOrigin = {
  USER_CORRECTION: "USER_CORRECTION",
  SEED: "SEED",
} as const;
export type MerchantRuleOrigin = (typeof MerchantRuleOrigin)[keyof typeof MerchantRuleOrigin];
