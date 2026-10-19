import type { PrismaClient } from "@arthiq/database";

/**
 * Builds a complete, portable copy of everything the user owns, for the
 * "Download my data" feature (DPDP Act right of access / data portability).
 *
 * Deliberately EXCLUDED, because they are secrets or server-internal and not
 * the user's data: password hash/salt, sessions and refresh tokens, staged
 * import rows, and the raw notification text/hash (the server doesn't keep
 * raw text in production anyway — docs/ADR/005).
 */
export async function exportUserData(prisma: PrismaClient, userId: string) {
  const where = { userId };
  const [
    user,
    accounts,
    buckets,
    subBuckets,
    merchants,
    merchantRules,
    events,
    people,
    peopleLedger,
    transactions,
    reconciliations,
    imports,
    notifications,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, timezone: true, createdAt: true },
    }),
    prisma.account.findMany({ where }),
    prisma.bucket.findMany({ where }),
    prisma.subBucket.findMany({ where }),
    prisma.merchant.findMany({ where }),
    prisma.merchantRule.findMany({ where }),
    prisma.event.findMany({ where }),
    prisma.person.findMany({ where }),
    prisma.peopleLedgerEntry.findMany({ where }),
    prisma.transaction.findMany({ where, orderBy: { occurredAt: "asc" } }),
    prisma.reconciliation.findMany({ where }),
    prisma.import.findMany({
      where,
      select: {
        id: true,
        accountId: true,
        fileName: true,
        status: true,
        rowCount: true,
        importedCount: true,
        duplicateCount: true,
        errorCount: true,
        createdAt: true,
      },
    }),
    prisma.notificationSource.findMany({
      where,
      select: {
        id: true,
        transactionId: true,
        sourcePackage: true,
        provider: true,
        parseSucceeded: true,
        dedupOutcome: true,
        receivedAt: true,
      },
    }),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    format: "arthiq-export-v1",
    user,
    accounts,
    buckets,
    subBuckets,
    merchants,
    merchantRules,
    events,
    people,
    peopleLedger,
    transactions,
    reconciliations,
    imports,
    notificationSources: notifications,
  };

  // Money is stored as BigInt minor units; JSON can't carry BigInt, so
  // serialise them as strings (the same convention as the rest of the API).
  return JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  ) as Record<string, unknown>;
}
