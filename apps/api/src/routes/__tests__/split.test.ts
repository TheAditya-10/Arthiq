import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

describe("POST /transactions/split", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setup() {
    const { accessToken } = await registerTestUser(app);
    const headers = authHeader(accessToken);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers,
      payload: {
        name: "HDFC",
        type: "BANK",
        openingBalance: 5000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const bucket = await app.inject({
      method: "POST",
      url: "/buckets",
      headers,
      payload: { name: "Outing" },
    });
    const anurag = await app.inject({
      method: "POST",
      url: "/people",
      headers,
      payload: { name: "Anurag" },
    });
    const akshay = await app.inject({
      method: "POST",
      url: "/people",
      headers,
      payload: { name: "Akshay" },
    });
    return {
      headers,
      accountId: account.json().id as string,
      bucketId: bucket.json().id as string,
      anurag: anurag.json().id as string,
      akshay: akshay.json().id as string,
    };
  }

  it("books only the payer's share as spending, debits the full amount, and tracks what each friend owes", async () => {
    const s = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/transactions/split",
      headers: s.headers,
      payload: {
        accountId: s.accountId,
        amount: 1000,
        occurredAt: "2026-08-23T10:00:00+05:30",
        merchantRaw: "Radha Mohan Corners",
        bucketId: s.bucketId,
        shares: [
          { personId: s.anurag, amount: 250 },
          { personId: s.akshay, amount: 250 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().expense.amount).toBe(500);
    expect(res.json().expense.bucketId).toBe(s.bucketId);
    expect(res.json().lent).toHaveLength(2);

    const balance = await app.inject({
      method: "GET",
      url: `/accounts/${s.accountId}/balance`,
      headers: s.headers,
    });
    expect(balance.json().balance).toBe(5000 - 1000);

    const anurag = await app.inject({
      method: "GET",
      url: `/people/${s.anurag}`,
      headers: s.headers,
    });
    expect(anurag.json().outstanding).toBe(250);

    // Anurag pays her share back -> settled, and the account is made whole for that share.
    const repay = await app.inject({
      method: "POST",
      url: "/people-ledger",
      headers: s.headers,
      payload: {
        personId: s.anurag,
        accountId: s.accountId,
        entryType: "REPAYMENT_RECEIVED",
        amount: 250,
        occurredAt: "2026-08-24T10:00:00+05:30",
      },
    });
    expect(repay.statusCode).toBe(201);
    const after = await app.inject({
      method: "GET",
      url: `/people/${s.anurag}`,
      headers: s.headers,
    });
    expect(after.json().outstanding).toBe(0);
    const akshay = await app.inject({
      method: "GET",
      url: `/people/${s.akshay}`,
      headers: s.headers,
    });
    expect(akshay.json().outstanding).toBe(250);
  });

  it("allows the payer to cover everyone else entirely (no own-share expense)", async () => {
    const s = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/transactions/split",
      headers: s.headers,
      payload: {
        accountId: s.accountId,
        amount: 300,
        occurredAt: "2026-08-23T10:00:00+05:30",
        shares: [{ personId: s.anurag, amount: 300 }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().expense).toBeNull();
    expect(res.json().lent).toHaveLength(1);
  });

  it("rejects shares that exceed the payment, duplicate people, and someone else's person — writing nothing", async () => {
    const s = await setup();
    const other = await registerTestUser(app);
    const strangerPerson = await app.inject({
      method: "POST",
      url: "/people",
      headers: authHeader(other.accessToken),
      payload: { name: "Stranger" },
    });
    const base = { accountId: s.accountId, amount: 100, occurredAt: "2026-08-23T10:00:00+05:30" };

    const tooMuch = await app.inject({
      method: "POST",
      url: "/transactions/split",
      headers: s.headers,
      payload: {
        ...base,
        shares: [
          { personId: s.anurag, amount: 60 },
          { personId: s.akshay, amount: 60 },
        ],
      },
    });
    expect(tooMuch.statusCode).toBe(400);

    const dup = await app.inject({
      method: "POST",
      url: "/transactions/split",
      headers: s.headers,
      payload: {
        ...base,
        shares: [
          { personId: s.anurag, amount: 10 },
          { personId: s.anurag, amount: 10 },
        ],
      },
    });
    expect(dup.statusCode).toBe(400);

    const foreign = await app.inject({
      method: "POST",
      url: "/transactions/split",
      headers: s.headers,
      payload: { ...base, shares: [{ personId: strangerPerson.json().id, amount: 10 }] },
    });
    expect(foreign.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: "/transactions", headers: s.headers });
    expect(list.json().total).toBe(0);
  });
});
