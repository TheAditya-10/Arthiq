-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'CREDIT_CARD', 'WALLET', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'LENT', 'BORROWED', 'LENT_REPAYMENT', 'BORROWED_REPAYMENT', 'CASH_EXPENSE', 'REFUND', 'FEE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('ANDROID_NOTIFICATION', 'MANUAL', 'CSV_IMPORT', 'ACCOUNT_AGGREGATOR');

-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM ('RULE', 'HISTORICAL', 'HEURISTIC', 'AI', 'MANUAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CONFIRMED', 'NEEDS_REVIEW', 'DUPLICATE_SUSPECTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PeopleLedgerEntryType" AS ENUM ('LENT', 'BORROWED', 'REPAYMENT_RECEIVED', 'REPAYMENT_MADE');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'DISCREPANCY', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING_MAPPING', 'PREVIEWED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationProviderKey" AS ENUM ('GOOGLE_PAY', 'PHONEPE', 'PAYTM', 'GENERIC_UPI');

-- CreateEnum
CREATE TYPE "DedupOutcome" AS ENUM ('NEW', 'DUPLICATE', 'REJECTED_UNPARSEABLE');

-- CreateEnum
CREATE TYPE "MerchantRuleOrigin" AS ENUM ('USER_CORRECTION', 'SEED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordSalt" TEXT,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "openingBalanceMinor" BIGINT NOT NULL,
    "openingBalanceDate" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buckets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_buckets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "subBucketId" TEXT,
    "createdFrom" "MerchantRuleOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "entryType" "PeopleLedgerEntryType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dueDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "direction" "Direction" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "merchantId" TEXT,
    "merchantRaw" TEXT,
    "description" TEXT,
    "bucketId" TEXT,
    "subBucketId" TEXT,
    "eventId" TEXT,
    "personId" TEXT,
    "source" "TransactionSource" NOT NULL,
    "classificationSource" "ClassificationSource" NOT NULL DEFAULT 'UNKNOWN',
    "classificationConfidence" DOUBLE PRECISION,
    "classifiedAt" TIMESTAMP(3),
    "classifiedBy" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "dedupHash" TEXT NOT NULL,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "openingBalanceMinor" BIGINT NOT NULL,
    "expectedClosingBalanceMinor" BIGINT NOT NULL,
    "actualClosingBalanceMinor" BIGINT,
    "differenceMinor" BIGINT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING_MAPPING',
    "columnMapping" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT,
    "sourcePackage" TEXT NOT NULL,
    "provider" "NotificationProviderKey" NOT NULL,
    "rawTextHash" TEXT NOT NULL,
    "rawText" TEXT,
    "parseSucceeded" BOOLEAN NOT NULL,
    "dedupOutcome" "DedupOutcome" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "transactionId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_archivedAt_idx" ON "accounts"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "buckets_userId_archivedAt_idx" ON "buckets"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "sub_buckets_userId_bucketId_archivedAt_idx" ON "sub_buckets"("userId", "bucketId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_userId_normalizedName_key" ON "merchants"("userId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_rules_userId_merchantId_key" ON "merchant_rules"("userId", "merchantId");

-- CreateIndex
CREATE INDEX "events_userId_archivedAt_idx" ON "events"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "people_userId_archivedAt_idx" ON "people"("userId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "people_ledger_entries_transactionId_key" ON "people_ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "people_ledger_entries_userId_personId_idx" ON "people_ledger_entries"("userId", "personId");

-- CreateIndex
CREATE INDEX "transactions_userId_occurredAt_idx" ON "transactions"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_userId_type_idx" ON "transactions"("userId", "type");

-- CreateIndex
CREATE INDEX "transactions_userId_bucketId_idx" ON "transactions"("userId", "bucketId");

-- CreateIndex
CREATE INDEX "transactions_userId_eventId_idx" ON "transactions"("userId", "eventId");

-- CreateIndex
CREATE INDEX "transactions_userId_personId_idx" ON "transactions"("userId", "personId");

-- CreateIndex
CREATE INDEX "transactions_userId_dedupHash_idx" ON "transactions"("userId", "dedupHash");

-- CreateIndex
CREATE INDEX "transactions_accountId_occurredAt_idx" ON "transactions"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "reconciliations_userId_accountId_idx" ON "reconciliations"("userId", "accountId");

-- CreateIndex
CREATE INDEX "imports_userId_accountId_idx" ON "imports"("userId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_sources_transactionId_key" ON "notification_sources"("transactionId");

-- CreateIndex
CREATE INDEX "notification_sources_userId_receivedAt_idx" ON "notification_sources"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_entityType_entityId_idx" ON "audit_logs"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_buckets" ADD CONSTRAINT "sub_buckets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_buckets" ADD CONSTRAINT "sub_buckets_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "buckets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_subBucketId_fkey" FOREIGN KEY ("subBucketId") REFERENCES "sub_buckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_ledger_entries" ADD CONSTRAINT "people_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_ledger_entries" ADD CONSTRAINT "people_ledger_entries_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people_ledger_entries" ADD CONSTRAINT "people_ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "buckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subBucketId_fkey" FOREIGN KEY ("subBucketId") REFERENCES "sub_buckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_sources" ADD CONSTRAINT "notification_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_sources" ADD CONSTRAINT "notification_sources_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
