import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

async function setup(app: FastifyInstance) {
  const { accessToken } = await registerTestUser(app);
  const account = await app.inject({
    method: "POST",
    url: "/accounts",
    headers: authHeader(accessToken),
    payload: {
      name: "HDFC",
      type: "BANK",
      openingBalance: 100000,
      openingBalanceDate: "2026-01-01",
    },
  });
  const food = await app.inject({
    method: "POST",
    url: "/buckets",
    headers: authHeader(accessToken),
    payload: { name: "Food" },
  });
  return {
    accessToken,
    accountId: account.json().id as string,
    foodBucketId: food.json().id as string,
  };
}

async function createTxn(
  app: FastifyInstance,
  accessToken: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: "/transactions",
    headers: authHeader(accessToken),
    payload,
  });
}

describe("analytics", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sums expense/income for the month and never counts a transfer", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 5000,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "INCOME",
      amount: 20000,
      direction: "CREDIT",
      occurredAt: "2026-08-06T10:00:00Z",
    });
    const account2 = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: { name: "SBI", type: "BANK", openingBalance: 0, openingBalanceDate: "2026-01-01" },
    });
    await createTxn(app, accessToken, {
      accountId,
      toAccountId: account2.json().id,
      type: "TRANSFER",
      amount: 9999,
      direction: "DEBIT",
      occurredAt: "2026-08-07T10:00:00Z",
    });

    const res = await app.inject({
      method: "GET",
      url: "/analytics/summary?month=2026-08",
      headers: authHeader(accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total.expense).toBe(5000);
    expect(res.json().total.income).toBe(20000);
    expect(res.json().total.netCashFlow).toBe(15000);
  });

  it("a REFUND reduces the expense total rather than being ignored or added to income", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 2000,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "REFUND",
      amount: 500,
      direction: "CREDIT",
      occurredAt: "2026-08-06T10:00:00Z",
    });

    const res = await app.inject({
      method: "GET",
      url: "/analytics/summary?month=2026-08",
      headers: authHeader(accessToken),
    });
    expect(res.json().total.expense).toBe(1500);
    expect(res.json().total.income).toBe(0);
  });

  it("excludeEventIds produces an adjusted total excluding only that event's transactions", async () => {
    const { accessToken, accountId } = await setup(app);
    const event = await app.inject({
      method: "POST",
      url: "/events",
      headers: authHeader(accessToken),
      payload: { name: "Goa Trip" },
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 1000,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 17600,
      direction: "DEBIT",
      occurredAt: "2026-08-10T10:00:00Z",
      eventId: event.json().id,
    });

    const res = await app.inject({
      method: "GET",
      url: `/analytics/summary?month=2026-08&excludeEventIds=${event.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(res.json().total.expense).toBe(18600);
    expect(res.json().adjusted.expense).toBe(1000);
    expect(res.json().excludedAmount).toBe(17600);
  });

  it("percentChange is null (not NaN/Infinity) against a zero baseline, and an empty month returns zeroes", async () => {
    const { accessToken, accountId } = await setup(app);
    // No transactions at all in July or August — a genuinely empty month.
    const res = await app.inject({
      method: "GET",
      url: "/analytics/summary?month=2026-08",
      headers: authHeader(accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total.expense).toBe(0);
    expect(res.json().comparison.previousMonth.percentChange).toBeNull();
    expect(res.json().comparison.threeMonthAvg.percentChange).toBeNull();
    void accountId; // account created but unused in this empty-month case
  });

  it("computes a correct month-over-month percentChange for a non-zero baseline", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 1000,
      direction: "DEBIT",
      occurredAt: "2026-07-15T10:00:00Z",
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 1230,
      direction: "DEBIT",
      occurredAt: "2026-08-15T10:00:00Z",
    });

    const res = await app.inject({
      method: "GET",
      url: "/analytics/summary?month=2026-08",
      headers: authHeader(accessToken),
    });
    expect(res.json().comparison.previousMonth.expense).toBe(1000);
    expect(res.json().comparison.previousMonth.percentChange).toBe(23);
  });

  it("groups spend by bucket, and tenant-scopes results", async () => {
    const { accessToken, accountId, foodBucketId } = await setup(app);
    const otherUser = await registerTestUser(app);
    const otherAccount = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(otherUser.accessToken),
      payload: { name: "Other", type: "BANK", openingBalance: 0, openingBalanceDate: "2026-01-01" },
    });
    await createTxn(app, otherUser.accessToken, {
      accountId: otherAccount.json().id,
      type: "EXPENSE",
      amount: 99999,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });

    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 480,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
      bucketId: foodBucketId,
    });

    const res = await app.inject({
      method: "GET",
      url: "/analytics/by-bucket?month=2026-08",
      headers: authHeader(accessToken),
    });
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].bucketName).toBe("Food");
    expect(res.json()[0].total).toBe(480);
  });

  it("returns a daily trend series", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 100,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 200,
      direction: "DEBIT",
      occurredAt: "2026-08-05T18:00:00Z",
    });
    const res = await app.inject({
      method: "GET",
      url: "/analytics/trend?from=2026-08-01&to=2026-08-31&granularity=daily",
      headers: authHeader(accessToken),
    });
    expect(res.json()).toEqual([{ date: "2026-08-05", expense: 300, income: 0 }]);
  });

  it("insights are derived only from real stored data, never fabricated", async () => {
    const { accessToken, accountId, foodBucketId } = await setup(app);
    // July: 1000 in Food. August: 2000 in Food — a real, large jump.
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 1000,
      direction: "DEBIT",
      occurredAt: "2026-07-10T10:00:00Z",
      bucketId: foodBucketId,
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 2000,
      direction: "DEBIT",
      occurredAt: "2026-08-10T10:00:00Z",
      bucketId: foodBucketId,
    });

    const res = await app.inject({
      method: "GET",
      url: "/analytics/insights?month=2026-08",
      headers: authHeader(accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(
      res.json().insights.some((s: string) => s.includes("Food") && s.includes("increased")),
    ).toBe(true);
  });
});
