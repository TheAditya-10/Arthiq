import { config as loadEnv } from "dotenv";
import path from "node:path";
import { afterAll, afterEach, beforeAll } from "vitest";
import { PrismaClient } from "@arthiq/database";

loadEnv({ path: path.join(__dirname, "../../../.env") });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. See .env.example and docs/TESTING_STRATEGY.md — " +
      "integration tests require a dedicated test Postgres database, never the dev database.",
  );
}

export const testPrisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });

/** Order matters — children before parents, to satisfy FK constraints. */
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

export async function truncateAll(): Promise<void> {
  for (const table of TABLES_IN_DELETE_ORDER) {
    await testPrisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}

beforeAll(async () => {
  await testPrisma.$connect();
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
