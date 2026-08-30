import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

async function setupTwoAccounts(app: FastifyInstance, accessToken: string) {
  const hdfc = await app.inject({
    method: "POST",
    url: "/accounts",
    headers: authHeader(accessToken),
    payload: {
      name: "HDFC",
      type: "BANK",
      openingBalance: 10000,
      openingBalanceDate: "2026-01-01",
    },
  });
  const sbi = await app.inject({
    method: "POST",
    url: "/accounts",
    headers: authHeader(accessToken),
    payload: { name: "SBI", type: "BANK", openingBalance: 5000, openingBalanceDate: "2026-01-01" },
  });
  return { hdfcId: hdfc.json().id as string, sbiId: sbi.json().id as string };
}

describe("transaction routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a TRANSFER without toAccountId", async () => {
    const { accessToken } = await registerTestUser(app);
    const { hdfcId } = await setupTwoAccounts(app, accessToken);
    const res = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: hdfcId,
        type: "TRANSFER",
        amount: 100,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("a TRANSFER between own accounts nets to zero across both balances", async () => {
    const { accessToken } = await registerTestUser(app);
    const { hdfcId, sbiId } = await setupTwoAccounts(app, accessToken);

    const transfer = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: hdfcId,
        toAccountId: sbiId,
        type: "TRANSFER",
        amount: 3000,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
      },
    });
    expect(transfer.statusCode).toBe(201);

    const hdfcBalance = await app.inject({
      method: "GET",
      url: `/accounts/${hdfcId}/balance`,
      headers: authHeader(accessToken),
    });
    const sbiBalance = await app.inject({
      method: "GET",
      url: `/accounts/${sbiId}/balance`,
      headers: authHeader(accessToken),
    });
    expect(hdfcBalance.json().balance).toBe(10000 - 3000);
    expect(sbiBalance.json().balance).toBe(5000 + 3000);
    // Total money across both accounts is unchanged — the defining property
    // of a transfer (never double-counted, never a net expense/income).
    expect(hdfcBalance.json().balance + sbiBalance.json().balance).toBe(10000 + 5000);
  });

  it("rejects LENT without personId, and BORROWED with a bucketId", async () => {
    const { accessToken } = await registerTestUser(app);
    const { hdfcId } = await setupTwoAccounts(app, accessToken);
    const bucket = await app.inject({
      method: "POST",
      url: "/buckets",
      headers: authHeader(accessToken),
      payload: { name: "Household" },
    });

    const lentNoPerson = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: hdfcId,
        type: "LENT",
        amount: 500,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
      },
    });
    expect(lentNoPerson.statusCode).toBe(400);

    const person = await app.inject({
      method: "POST",
      url: "/people",
      headers: authHeader(accessToken),
      payload: { name: "Rahul" },
    });

    const borrowedWithBucket = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: hdfcId,
        type: "BORROWED",
        amount: 500,
        direction: "CREDIT",
        occurredAt: "2026-01-05T10:00:00Z",
        personId: person.json().id,
        bucketId: bucket.json().id,
      },
    });
    expect(borrowedWithBucket.statusCode).toBe(400);
  });

  it("filters the ledger by type, and paginates", async () => {
    const { accessToken } = await registerTestUser(app);
    const { hdfcId } = await setupTwoAccounts(app, accessToken);
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST",
        url: "/transactions",
        headers: authHeader(accessToken),
        payload: {
          accountId: hdfcId,
          type: "EXPENSE",
          amount: 100 + i,
          direction: "DEBIT",
          occurredAt: "2026-01-05T10:00:00Z",
        },
      });
    }
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: hdfcId,
        type: "INCOME",
        amount: 5000,
        direction: "CREDIT",
        occurredAt: "2026-01-06T10:00:00Z",
      },
    });

    const expensesOnly = await app.inject({
      method: "GET",
      url: "/transactions?type=EXPENSE",
      headers: authHeader(accessToken),
    });
    expect(expensesOnly.json().total).toBe(3);
    expect(expensesOnly.json().items).toHaveLength(3);

    const page1 = await app.inject({
      method: "GET",
      url: "/transactions?pageSize=2&page=1",
      headers: authHeader(accessToken),
    });
    expect(page1.json().items).toHaveLength(2);
    expect(page1.json().total).toBe(4);
  });

  it("voiding a transaction removes it from balance computation", async () => {
    const { accessToken } = await registerTestUser(app);
    const { hdfcId } = await setupTwoAccounts(app, accessToken);
    const txn = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: hdfcId,
        type: "EXPENSE",
        amount: 500,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
      },
    });

    const beforeVoid = await app.inject({
      method: "GET",
      url: `/accounts/${hdfcId}/balance`,
      headers: authHeader(accessToken),
    });
    expect(beforeVoid.json().balance).toBe(10000 - 500);

    await app.inject({
      method: "DELETE",
      url: `/transactions/${txn.json().id}`,
      headers: authHeader(accessToken),
    });

    const afterVoid = await app.inject({
      method: "GET",
      url: `/accounts/${hdfcId}/balance`,
      headers: authHeader(accessToken),
    });
    expect(afterVoid.json().balance).toBe(10000);
  });

  it("a cash expense via the convenience endpoint appears in the ledger", async () => {
    const { accessToken } = await registerTestUser(app);
    const cash = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "Cash",
        type: "CASH",
        openingBalance: 2000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/transactions/cash",
      headers: authHeader(accessToken),
      payload: {
        accountId: cash.json().id,
        amount: 150,
        occurredAt: "2026-01-05T10:00:00Z",
        description: "Vegetables",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe("CASH_EXPENSE");
    expect(res.json().direction).toBe("DEBIT");
  });
});
