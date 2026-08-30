/**
 * Development-only seed data. NEVER run against a production database —
 * see docs/DEVELOPMENT_GUIDE.md §"Database Migrations Workflow" and
 * package.json's "prisma.seed" entry (`pnpm db:seed`).
 *
 * Builds out the demo scenario described in the build spec §44 /
 * docs/PRODUCT_REQUIREMENTS.md §7: a Croma purchase that gets corrected
 * (creating a MerchantRule), a Goa Trip event with attached transactions,
 * and a Rahul lending/partial-repayment story — plus enough general
 * transaction volume across a few months for analytics to be meaningful.
 */
import { randomBytes, scryptSync } from "node:crypto";
import {
  PrismaClient,
  type AccountType,
  type TransactionType,
  type Direction,
} from "@prisma/client";

const prisma = new PrismaClient();

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding development data (DEV ONLY — never run against production)...");

  const { hash, salt } = hashPassword("password123");

  const user = await prisma.user.upsert({
    where: { email: "demo@arthiq.dev" },
    update: {},
    create: {
      email: "demo@arthiq.dev",
      passwordHash: hash,
      passwordSalt: salt,
      displayName: "Demo User",
      timezone: "Asia/Kolkata",
    },
  });

  // --- Accounts ------------------------------------------------------------
  const accountDefs: Array<{ name: string; type: AccountType; openingBalanceMinor: bigint }> = [
    { name: "HDFC Bank", type: "BANK", openingBalanceMinor: 15_000_00n },
    { name: "SBI Bank", type: "BANK", openingBalanceMinor: 8_000_00n },
    { name: "Cash", type: "CASH", openingBalanceMinor: 2_000_00n },
  ];
  const accounts: Record<string, { id: string }> = {};
  for (const def of accountDefs) {
    const existing = await prisma.account.findFirst({ where: { userId: user.id, name: def.name } });
    accounts[def.name] =
      existing ??
      (await prisma.account.create({
        data: {
          userId: user.id,
          name: def.name,
          type: def.type,
          openingBalanceMinor: def.openingBalanceMinor,
          openingBalanceDate: daysAgo(180),
        },
      }));
  }

  // --- Buckets / Sub-buckets -------------------------------------------------
  const categoryTree: Record<string, string[]> = {
    Household: ["Groceries", "Utilities", "Furniture", "Electronics", "Maintenance"],
    Food: ["Restaurant", "Delivery", "Cafe", "Daily Meals"],
    Transport: ["Fuel", "Cab", "Metro", "Public Transport"],
    Personal: ["Fitness", "Clothing", "Entertainment", "Electronics", "Shopping"],
    Travel: ["Hotel", "Flights", "Local Transport", "Activities"],
    Income: ["Salary", "Freelance", "Interest"],
    Fees: ["Bank Fee", "Late Fee"],
  };
  const buckets: Record<string, { id: string }> = {};
  const subBuckets: Record<string, { id: string }> = {}; // key: "Bucket:SubBucket"
  for (const [bucketName, subNames] of Object.entries(categoryTree)) {
    const bucket =
      (await prisma.bucket.findFirst({ where: { userId: user.id, name: bucketName } })) ??
      (await prisma.bucket.create({ data: { userId: user.id, name: bucketName } }));
    buckets[bucketName] = bucket;
    for (const subName of subNames) {
      const sub =
        (await prisma.subBucket.findFirst({
          where: { userId: user.id, bucketId: bucket.id, name: subName },
        })) ??
        (await prisma.subBucket.create({
          data: { userId: user.id, bucketId: bucket.id, name: subName },
        }));
      subBuckets[`${bucketName}:${subName}`] = sub;
    }
  }

  // --- Merchants -------------------------------------------------------------
  async function upsertMerchant(normalizedName: string, displayName: string) {
    return prisma.merchant.upsert({
      where: { userId_normalizedName: { userId: user.id, normalizedName } },
      update: {},
      create: { userId: user.id, normalizedName, displayName },
    });
  }
  const croma = await upsertMerchant("CROMA", "Croma");
  const zomato = await upsertMerchant("ZOMATO", "Zomato");
  const uber = await upsertMerchant("UBER", "Uber");

  // --- Merchant rule: Croma corrected to Personal > Electronics (demo scenario step 5) ---
  await prisma.merchantRule.upsert({
    where: { userId_merchantId: { userId: user.id, merchantId: croma.id } },
    update: {},
    create: {
      userId: user.id,
      merchantId: croma.id,
      bucketId: buckets.Personal!.id,
      subBucketId: subBuckets["Personal:Electronics"]!.id,
      createdFrom: "USER_CORRECTION",
    },
  });

  // --- Event: Goa Trip 2026 ---------------------------------------------------
  const goaTrip = await prisma.event.upsert({
    where: { id: "seed-goa-trip-2026" },
    update: {},
    create: {
      id: "seed-goa-trip-2026",
      userId: user.id,
      name: "Goa Trip 2026",
      startDate: daysAgo(20),
      endDate: daysAgo(16),
      notes: "Seeded demo event — see docs/PRODUCT_REQUIREMENTS.md §7",
    },
  });

  // --- Helper to create a categorized transaction -----------------------------
  function dedupHash(parts: (string | bigint | number)[]) {
    return parts.join("|");
  }

  async function createTxn(opts: {
    accountName: string;
    type: TransactionType;
    direction: Direction;
    amountMinor: bigint;
    occurredAt: Date;
    merchantId?: string;
    merchantRaw?: string;
    description?: string;
    bucketKey?: string; // "Bucket" or "Bucket:SubBucket"
    eventId?: string;
    classificationSource?: "RULE" | "HISTORICAL" | "HEURISTIC" | "AI" | "MANUAL" | "UNKNOWN";
  }) {
    const bucketName = (opts.bucketKey ?? "").split(":")[0];
    const bucket = bucketName ? buckets[bucketName] : undefined;
    const subBucket = opts.bucketKey ? subBuckets[opts.bucketKey] : undefined;
    return prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: accounts[opts.accountName]!.id,
        type: opts.type,
        amountMinor: opts.amountMinor,
        direction: opts.direction,
        occurredAt: opts.occurredAt,
        merchantId: opts.merchantId,
        merchantRaw: opts.merchantRaw,
        description: opts.description,
        bucketId: bucket?.id,
        subBucketId: subBucket?.id,
        eventId: opts.eventId,
        source: "MANUAL",
        classificationSource: opts.classificationSource ?? "MANUAL",
        classifiedAt: new Date(),
        classifiedBy: "seed",
        dedupHash: dedupHash([
          user.id,
          opts.accountName,
          opts.type,
          opts.amountMinor.toString(),
          opts.occurredAt.toISOString(),
        ]),
      },
    });
  }

  // Croma purchase, corrected classification (Personal > Electronics)
  await createTxn({
    accountName: "HDFC Bank",
    type: "EXPENSE",
    direction: "DEBIT",
    amountMinor: 1_250_00n,
    occurredAt: daysAgo(10),
    merchantId: croma.id,
    merchantRaw: "CROMA RETAIL",
    description: "Wireless earbuds",
    bucketKey: "Personal:Electronics",
    classificationSource: "RULE",
  });

  // Regular Food/Transport spending, this month and last month, for MoM analytics
  for (let i = 0; i < 6; i++) {
    await createTxn({
      accountName: "HDFC Bank",
      type: "EXPENSE",
      direction: "DEBIT",
      amountMinor: BigInt(300 + i * 40) * 100n,
      occurredAt: daysAgo(i * 5 + 1),
      merchantId: zomato.id,
      merchantRaw: "ZOMATO ONLINE ORDER",
      bucketKey: "Food:Delivery",
      classificationSource: "HEURISTIC",
    });
    await createTxn({
      accountName: "HDFC Bank",
      type: "EXPENSE",
      direction: "DEBIT",
      amountMinor: BigInt(150 + i * 20) * 100n,
      occurredAt: daysAgo(i * 6 + 2),
      merchantId: uber.id,
      merchantRaw: "UBER TRIP",
      bucketKey: "Transport:Cab",
      classificationSource: "HEURISTIC",
    });
  }
  for (let i = 0; i < 4; i++) {
    await createTxn({
      accountName: "HDFC Bank",
      type: "EXPENSE",
      direction: "DEBIT",
      amountMinor: BigInt(250 + i * 30) * 100n,
      occurredAt: daysAgo(35 + i * 5),
      merchantId: zomato.id,
      merchantRaw: "ZOMATO ONLINE ORDER",
      bucketKey: "Food:Delivery",
      classificationSource: "HEURISTIC",
    });
  }

  // Goa Trip event-tagged transactions
  await createTxn({
    accountName: "HDFC Bank",
    type: "EXPENSE",
    direction: "DEBIT",
    amountMinor: 12_000_00n,
    occurredAt: daysAgo(19),
    description: "Beach resort — 3 nights",
    bucketKey: "Travel:Hotel",
    eventId: goaTrip.id,
    classificationSource: "MANUAL",
  });
  await createTxn({
    accountName: "HDFC Bank",
    type: "EXPENSE",
    direction: "DEBIT",
    amountMinor: 5_600_00n,
    occurredAt: daysAgo(20),
    description: "Flights to Goa",
    bucketKey: "Travel:Flights",
    eventId: goaTrip.id,
    classificationSource: "MANUAL",
  });

  // Income
  await createTxn({
    accountName: "HDFC Bank",
    type: "INCOME",
    direction: "CREDIT",
    amountMinor: 75_000_00n,
    occurredAt: daysAgo(15),
    description: "Monthly salary",
    bucketKey: "Income:Salary",
    classificationSource: "MANUAL",
  });

  // A transfer between own accounts (must never appear as expense/income)
  await createTxn({
    accountName: "HDFC Bank",
    type: "TRANSFER",
    direction: "DEBIT",
    amountMinor: 5_000_00n,
    occurredAt: daysAgo(8),
    description: "Move to SBI savings",
    classificationSource: "MANUAL",
  });

  // A cash expense
  await createTxn({
    accountName: "Cash",
    type: "CASH_EXPENSE",
    direction: "DEBIT",
    amountMinor: 400_00n,
    occurredAt: daysAgo(3),
    description: "Local market vegetables",
    bucketKey: "Household:Groceries",
    classificationSource: "MANUAL",
  });

  // --- People Ledger: Rahul (demo scenario steps 12-16) -----------------------
  const rahul =
    (await prisma.person.findFirst({ where: { userId: user.id, name: "Rahul" } })) ??
    (await prisma.person.create({ data: { userId: user.id, name: "Rahul" } }));

  const lentTxn = await createTxn({
    accountName: "HDFC Bank",
    type: "LENT",
    direction: "DEBIT",
    amountMinor: 2_000_00n,
    occurredAt: daysAgo(12),
    description: "Lent to Rahul",
    classificationSource: "MANUAL",
  });
  await prisma.transaction.update({ where: { id: lentTxn.id }, data: { personId: rahul.id } });
  await prisma.peopleLedgerEntry.upsert({
    where: { transactionId: lentTxn.id },
    update: {},
    create: {
      userId: user.id,
      personId: rahul.id,
      transactionId: lentTxn.id,
      entryType: "LENT",
      amountMinor: 2_000_00n,
      occurredAt: lentTxn.occurredAt,
    },
  });

  const repaymentTxn = await createTxn({
    accountName: "HDFC Bank",
    type: "LENT_REPAYMENT",
    direction: "CREDIT",
    amountMinor: 1_000_00n,
    occurredAt: daysAgo(5),
    description: "Rahul partial repayment",
    classificationSource: "MANUAL",
  });
  await prisma.transaction.update({ where: { id: repaymentTxn.id }, data: { personId: rahul.id } });
  await prisma.peopleLedgerEntry.upsert({
    where: { transactionId: repaymentTxn.id },
    update: {},
    create: {
      userId: user.id,
      personId: rahul.id,
      transactionId: repaymentTxn.id,
      entryType: "REPAYMENT_RECEIVED",
      amountMinor: 1_000_00n,
      occurredAt: repaymentTxn.occurredAt,
    },
  });

  console.log("Seed complete.");
  console.log(`Demo login: demo@arthiq.dev / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
