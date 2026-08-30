import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@arthiq/database";

/**
 * Truncates the dedicated E2E test database before the suite runs, so a
 * previous run's leftover data (or a failed run's partial state) never
 * leaks into this one — the same isolation principle as
 * apps/api/tests/setup.ts's `truncateAll`, duplicated here rather than
 * imported since it lives in apps/api's test-only sources, not a shared
 * package. NEVER points at the dev database — see docs/TESTING_STRATEGY.md.
 */
const TABLES_IN_DELETE_ORDER = [
  "audit_logs",
  "notification_sources",
  "people_ledger_entries",
  "transactions",
  "imports",
  "reconciliations",
  "merchant_rules",
  "merchants",
  "events",
  "people",
  "sub_buckets",
  "buckets",
  "accounts",
  "sessions",
  "users",
];

export default async function globalSetup(): Promise<void> {
  loadEnv({ path: path.join(__dirname, "../../../.env") });

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. See .env.example — the E2E suite requires the same " +
        "dedicated test Postgres database used by apps/api's integration tests.",
    );
  }

  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  try {
    for (const table of TABLES_IN_DELETE_ORDER) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
