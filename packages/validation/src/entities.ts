import { z } from "zod";
import {
  AccountType,
  ClassificationSource,
  Direction,
  NotificationProviderKey,
  PeopleLedgerEntryType,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from "@arthiq/types";

const nameSchema = z.string().trim().min(1).max(100);
const notesSchema = z.string().trim().max(2000).optional();
/** Rupees as the API boundary type — converted to/from amountMinor by the service layer. */
const amountSchema = z.number().finite().positive();
const isoDate = z.string().date(); // "YYYY-MM-DD"
const isoDateTime = z.string().datetime({ offset: true });

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const createAccountSchema = z.object({
  name: nameSchema,
  type: z.enum([
    AccountType.BANK,
    AccountType.CASH,
    AccountType.CREDIT_CARD,
    AccountType.WALLET,
    AccountType.INVESTMENT,
  ]),
  openingBalance: z.number().finite(),
  openingBalanceDate: isoDate,
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: nameSchema.optional(),
  openingBalance: z.number().finite().optional(),
  openingBalanceDate: isoDate.optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// ---------------------------------------------------------------------------
// Buckets / Sub-buckets
// ---------------------------------------------------------------------------

export const createBucketSchema = z.object({ name: nameSchema });
export type CreateBucketInput = z.infer<typeof createBucketSchema>;

export const updateBucketSchema = z.object({ name: nameSchema });
export type UpdateBucketInput = z.infer<typeof updateBucketSchema>;

export const mergeBucketSchema = z.object({ intoBucketId: z.string().uuid() });
export type MergeBucketInput = z.infer<typeof mergeBucketSchema>;

export const createSubBucketSchema = z.object({ bucketId: z.string().uuid(), name: nameSchema });
export type CreateSubBucketInput = z.infer<typeof createSubBucketSchema>;

export const updateSubBucketSchema = z.object({ name: nameSchema });
export type UpdateSubBucketInput = z.infer<typeof updateSubBucketSchema>;

export const mergeSubBucketSchema = z.object({ intoSubBucketId: z.string().uuid() });
export type MergeSubBucketInput = z.infer<typeof mergeSubBucketSchema>;

// ---------------------------------------------------------------------------
// Merchant rules
// ---------------------------------------------------------------------------

export const createMerchantRuleSchema = z.object({
  merchantId: z.string().uuid(),
  bucketId: z.string().uuid(),
  subBucketId: z.string().uuid().optional(),
});
export type CreateMerchantRuleInput = z.infer<typeof createMerchantRuleSchema>;

export const updateMerchantRuleSchema = z.object({
  bucketId: z.string().uuid(),
  subBucketId: z.string().uuid().optional(),
});
export type UpdateMerchantRuleInput = z.infer<typeof updateMerchantRuleSchema>;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const createEventSchema = z.object({
  name: nameSchema,
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  notes: notesSchema,
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const createPersonSchema = z.object({ name: nameSchema, notes: notesSchema });
export type CreatePersonInput = z.infer<typeof createPersonSchema>;

export const updatePersonSchema = createPersonSchema.partial();
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

// ---------------------------------------------------------------------------
// Transactions — see docs/ADR/004-transaction-model.md for the per-type
// field-requirement rules encoded below via .superRefine.
// ---------------------------------------------------------------------------

const baseTransactionFields = {
  accountId: z.string().uuid(),
  toAccountId: z.string().uuid().optional(),
  type: z.enum([
    TransactionType.EXPENSE,
    TransactionType.INCOME,
    TransactionType.TRANSFER,
    TransactionType.LENT,
    TransactionType.BORROWED,
    TransactionType.LENT_REPAYMENT,
    TransactionType.BORROWED_REPAYMENT,
    TransactionType.CASH_EXPENSE,
    TransactionType.REFUND,
    TransactionType.FEE,
    TransactionType.UNKNOWN,
  ]),
  amount: amountSchema,
  direction: z.enum([Direction.DEBIT, Direction.CREDIT]),
  occurredAt: isoDateTime,
  merchantRaw: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  bucketId: z.string().uuid().optional(),
  subBucketId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
};

const CATEGORIZABLE_TYPES: readonly string[] = [
  TransactionType.EXPENSE,
  TransactionType.INCOME,
  TransactionType.CASH_EXPENSE,
  TransactionType.REFUND,
  TransactionType.FEE,
  TransactionType.UNKNOWN,
];
const PEOPLE_LEDGER_TYPES: readonly string[] = [
  TransactionType.LENT,
  TransactionType.BORROWED,
  TransactionType.LENT_REPAYMENT,
  TransactionType.BORROWED_REPAYMENT,
];
const BALANCE_ONLY_TYPES: readonly string[] = [TransactionType.TRANSFER, ...PEOPLE_LEDGER_TYPES];

const transactionObjectSchema = z.object(baseTransactionFields);
type TransactionShape = z.infer<typeof transactionObjectSchema>;

function refineTransactionShape(data: TransactionShape, ctx: z.RefinementCtx) {
  if (data.type === TransactionType.TRANSFER) {
    if (!data.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "toAccountId is required for TRANSFER",
        path: ["toAccountId"],
      });
    } else if (data.toAccountId === data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "toAccountId must differ from accountId",
        path: ["toAccountId"],
      });
    }
  } else if (data.toAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "toAccountId is only valid for TRANSFER",
      path: ["toAccountId"],
    });
  }

  if (PEOPLE_LEDGER_TYPES.includes(data.type) && !data.personId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `personId is required for ${data.type}`,
      path: ["personId"],
    });
  }
  if (!PEOPLE_LEDGER_TYPES.includes(data.type) && data.personId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "personId is only valid for LENT/BORROWED/LENT_REPAYMENT/BORROWED_REPAYMENT",
      path: ["personId"],
    });
  }

  if (BALANCE_ONLY_TYPES.includes(data.type) && (data.bucketId || data.subBucketId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TRANSFER/lending transactions are not categorized into buckets",
      path: ["bucketId"],
    });
  }
  if (data.subBucketId && !data.bucketId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "subBucketId requires bucketId",
      path: ["bucketId"],
    });
  }
  if (!CATEGORIZABLE_TYPES.includes(data.type) && !BALANCE_ONLY_TYPES.includes(data.type)) {
    // exhaustiveness guard — every TransactionType must be in one of the two lists
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unhandled transaction type: ${data.type}`,
      path: ["type"],
    });
  }
}

export const createTransactionSchema = transactionObjectSchema.superRefine(refineTransactionShape);
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    ...baseTransactionFields,
    type: baseTransactionFields.type.optional(),
    // null clears the field (undefined leaves it unchanged)
    merchantRaw: baseTransactionFields.merchantRaw.nullable(),
    description: baseTransactionFields.description.nullable(),
    bucketId: baseTransactionFields.bucketId.nullable(),
    subBucketId: baseTransactionFields.subBucketId.nullable(),
    eventId: baseTransactionFields.eventId.nullable(),
    personId: baseTransactionFields.personId.nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  bucketId: z.string().uuid().optional(),
  subBucketId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  type: z.nativeEnum(TransactionType).optional(),
  source: z.nativeEnum(TransactionSource).optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
  classificationSource: z.nativeEnum(ClassificationSource).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const TRANSACTION_SUMMARY_GROUPS = ["none", "bucket", "month", "event", "type"] as const;
export const transactionSummaryQuerySchema = listTransactionsQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({ groupBy: z.enum(TRANSACTION_SUMMARY_GROUPS).default("none") });
export type TransactionSummaryQuery = z.infer<typeof transactionSummaryQuerySchema>;

export const createCashExpenseSchema = z.object({
  accountId: z.string().uuid(),
  amount: amountSchema,
  occurredAt: isoDateTime,
  description: z.string().trim().max(500).optional(),
  bucketId: z.string().uuid().optional(),
  subBucketId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
});
export type CreateCashExpenseInput = z.infer<typeof createCashExpenseSchema>;

/**
 * A payment made on behalf of a group: `amount` is the full amount that left
 * the account, `shares` is what each other person owes back. The remainder
 * (amount − Σshares) is the payer's own expense; 0 is allowed when the payer
 * covered everyone else entirely.
 */
export const createSplitExpenseSchema = z
  .object({
    accountId: z.string().uuid(),
    amount: amountSchema,
    occurredAt: isoDateTime,
    merchantRaw: z.string().trim().max(200).optional(),
    description: z.string().trim().max(500).optional(),
    bucketId: z.string().uuid().optional(),
    subBucketId: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
    shares: z
      .array(z.object({ personId: z.string().uuid(), amount: amountSchema }))
      .min(1)
      .max(50),
  })
  .superRefine((data, ctx) => {
    if (data.subBucketId && !data.bucketId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subBucketId requires bucketId",
        path: ["bucketId"],
      });
    }
    const personIds = data.shares.map((s) => s.personId);
    if (new Set(personIds).size !== personIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each person can appear only once in shares",
        path: ["shares"],
      });
    }
    const sharesMinor = data.shares.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
    if (sharesMinor > Math.round(data.amount * 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Shares add up to more than the payment amount",
        path: ["shares"],
      });
    }
  });
export type CreateSplitExpenseInput = z.infer<typeof createSplitExpenseSchema>;

// ---------------------------------------------------------------------------
// People Ledger
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

export const columnMappingSchema = z.object({
  date: z.number().int().min(0),
  description: z.number().int().min(0).optional(),
  amount: z.number().int().min(0),
  direction: z.number().int().min(0).optional(),
});
export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;

export const commitImportSchema = z.object({
  columnMapping: columnMappingSchema,
});
export type CommitImportInput = z.infer<typeof commitImportSchema>;

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export const runReconciliationSchema = z
  .object({
    accountId: z.string().uuid(),
    periodStart: isoDate,
    periodEnd: isoDate,
    actualClosingBalance: z.number().finite(),
  })
  .refine((data) => data.periodStart < data.periodEnd, {
    message: "periodStart must be before periodEnd",
    path: ["periodEnd"],
  });
export type RunReconciliationInput = z.infer<typeof runReconciliationSchema>;

export const updateReconciliationSchema = z.object({
  resolutionNotes: z.string().trim().max(2000).optional(),
  status: z.literal("RESOLVED").optional(),
});
export type UpdateReconciliationInput = z.infer<typeof updateReconciliationSchema>;

export const listReconciliationsQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
});
export type ListReconciliationsQuery = z.infer<typeof listReconciliationsQuerySchema>;

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM");

export const monthlySummaryQuerySchema = z.object({
  month: monthSchema,
  excludeEventIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : [])),
});
export type MonthlySummaryQuery = z.infer<typeof monthlySummaryQuerySchema>;

export const byBucketQuerySchema = monthlySummaryQuerySchema;
export const insightsQuerySchema = z.object({ month: monthSchema });

export const trendQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  granularity: z.enum(["daily", "monthly"]).default("daily"),
});
export type TrendQuery = z.infer<typeof trendQuerySchema>;

export const createPeopleLedgerEntrySchema = z.object({
  personId: z.string().uuid(),
  entryType: z.enum([
    PeopleLedgerEntryType.LENT,
    PeopleLedgerEntryType.BORROWED,
    PeopleLedgerEntryType.REPAYMENT_RECEIVED,
    PeopleLedgerEntryType.REPAYMENT_MADE,
  ]),
  accountId: z.string().uuid(),
  amount: amountSchema,
  occurredAt: isoDateTime,
  dueDate: isoDate.optional(),
  notes: notesSchema,
});
export type CreatePeopleLedgerEntryInput = z.infer<typeof createPeopleLedgerEntrySchema>;

// ---------------------------------------------------------------------------
// Notification Ingestion — see docs/ADR/005-notification-ingestion.md. The
// mobile client sends amountMinor directly (it's already an integer paise
// count on-device) rather than a rupee `amount`, unlike the manual/CSV entry
// points, since re-deriving it from a rupee float would be a pointless
// lossy-then-lossless round trip for a value that was already exact.
// ---------------------------------------------------------------------------

export const ingestNotificationSchema = z.object({
  accountId: z.string().uuid(),
  amountMinor: z.string().regex(/^\d+$/, "Expected a non-negative integer string"),
  direction: z.enum([Direction.DEBIT, Direction.CREDIT]),
  merchantRaw: z.string().trim().max(200).optional(),
  occurredAt: isoDateTime,
  referenceId: z.string().trim().max(200).optional(),
  provider: z.enum([
    NotificationProviderKey.GOOGLE_PAY,
    NotificationProviderKey.PHONEPE,
    NotificationProviderKey.PAYTM,
    NotificationProviderKey.GENERIC_UPI,
  ]),
  sourcePackage: z.string().trim().min(1).max(200),
  rawTextHash: z.string().trim().min(1).max(128),
  /** Only ever populated when the device has debug-storage explicitly enabled — see docs/SECURITY.md. */
  rawText: z.string().max(2000).optional(),
});
export type IngestNotificationInput = z.infer<typeof ingestNotificationSchema>;

export const listNotificationSourcesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListNotificationSourcesQuery = z.infer<typeof listNotificationSourcesQuerySchema>;
