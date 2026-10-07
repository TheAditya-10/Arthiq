import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

describe("editing, deleting and totalling transactions", () => {
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
    const post = async (url: string, payload: Record<string, unknown>) =>
      (await app.inject({ method: "POST", url, headers, payload })).json();
    const account = await post("/accounts", {
      name: "HDFC",
      type: "BANK",
      openingBalance: 10000,
      openingBalanceDate: "2026-01-01",
    });
    const food = await post("/buckets", { name: "Food" });
    const travel = await post("/buckets", { name: "Travel" });
    const event = await post("/events", { name: "Trip" });
    const rahul = await post("/people", { name: "Rahul" });
    const sita = await post("/people", { name: "Sita" });
    const txn = (payload: Record<string, unknown>) =>
      post("/transactions", {
        accountId: account.id,
        direction: "DEBIT",
        occurredAt: "2026-08-10T10:00:00+05:30",
        ...payload,
      });
    const patch = async (
      id: string,
      payload: Record<string, unknown>,
    ): Promise<LightMyRequestResponse> =>
      await app.inject({ method: "PATCH", url: `/transactions/${id}`, headers, payload });
    const get = async (url: string) => (await app.inject({ method: "GET", url, headers })).json();
    return { headers, account, food, travel, event, rahul, sita, txn, patch, get };
  }

  it("editing a loan's amount and person moves the ledger with it", async () => {
    const s = await setup();
    const loan = await s.txn({ type: "LENT", amount: 1000, personId: s.rahul.id });
    expect((await s.get(`/people/${s.rahul.id}`)).outstanding).toBe(1000);

    const res = await s.patch(loan.id, { amount: 1500 });
    expect(res.statusCode).toBe(200);
    expect(res.json().amount).toBe(1500);
    expect((await s.get(`/people/${s.rahul.id}`)).outstanding).toBe(1500);
    expect((await s.get(`/accounts/${s.account.id}/balance`)).balance).toBe(10000 - 1500);

    await s.patch(loan.id, { personId: s.sita.id });
    expect((await s.get(`/people/${s.rahul.id}`)).outstanding).toBe(0);
    expect((await s.get(`/people/${s.sita.id}`)).outstanding).toBe(1500);
  });

  it("turning a loan into an expense removes the ledger entry, and back again recreates it", async () => {
    const s = await setup();
    const loan = await s.txn({ type: "LENT", amount: 400, personId: s.rahul.id });

    const toExpense = await s.patch(loan.id, { type: "EXPENSE", bucketId: s.food.id });
    expect(toExpense.statusCode).toBe(200);
    expect(toExpense.json().personId).toBeNull();
    expect((await s.get(`/people/${s.rahul.id}`)).outstanding).toBe(0);

    const missingPerson = await s.patch(loan.id, { type: "LENT" });
    expect(missingPerson.statusCode).toBe(400);

    const back = await s.patch(loan.id, { type: "LENT", personId: s.rahul.id });
    expect(back.statusCode).toBe(200);
    expect(back.json().bucketId).toBeNull();
    expect((await s.get(`/people/${s.rahul.id}`)).outstanding).toBe(400);
  });

  it("changing type flips the direction; null clears event and category", async () => {
    const s = await setup();
    const t = await s.txn({
      type: "EXPENSE",
      amount: 250,
      bucketId: s.food.id,
      eventId: s.event.id,
      merchantRaw: "Cafe",
    });
    const income = await s.patch(t.id, { type: "INCOME" });
    expect(income.json().direction).toBe("CREDIT");

    const cleared = await s.patch(t.id, { eventId: null, bucketId: null });
    expect(cleared.json().eventId).toBeNull();
    expect(cleared.json().bucketId).toBeNull();
    expect(cleared.json().subBucketId).toBeNull();
  });

  it("deleting a loan hides it and drops it from what the person owes", async () => {
    const s = await setup();
    const loan = await s.txn({ type: "LENT", amount: 700, personId: s.rahul.id });
    const del = await app.inject({
      method: "DELETE",
      url: `/transactions/${loan.id}`,
      headers: s.headers,
    });
    expect(del.statusCode).toBe(204);
    expect((await s.get(`/people/${s.rahul.id}`)).outstanding).toBe(0);
    expect((await s.get("/transactions")).total).toBe(0);
    expect((await s.get(`/accounts/${s.account.id}/balance`)).balance).toBe(10000);
    const editDeleted = await s.patch(loan.id, { amount: 5 });
    expect(editDeleted.statusCode).toBe(400);
  });

  it("totals and subtotals cover every matching row, with an inclusive end date", async () => {
    const s = await setup();
    await s.txn({
      type: "EXPENSE",
      amount: 100,
      bucketId: s.food.id,
      occurredAt: "2026-08-10T10:00:00+05:30",
    });
    await s.txn({
      type: "EXPENSE",
      amount: 300,
      bucketId: s.travel.id,
      occurredAt: "2026-08-31T14:00:00+05:30",
    });
    await s.txn({
      type: "REFUND",
      direction: "CREDIT",
      amount: 50,
      bucketId: s.travel.id,
      occurredAt: "2026-09-02T10:00:00+05:30",
    });
    await s.txn({
      type: "INCOME",
      direction: "CREDIT",
      amount: 5000,
      occurredAt: "2026-09-01T10:00:00+05:30",
    });
    await s.txn({
      type: "LENT",
      amount: 200,
      personId: s.rahul.id,
      occurredAt: "2026-09-03T10:00:00+05:30",
    });

    const all = await s.get("/transactions/summary");
    expect(all.totals).toMatchObject({
      count: 5,
      income: 5000,
      spending: 350, // 100 + 300 − 50 refund; the loan is not spending
      moneyIn: 5050,
      moneyOut: 600,
    });

    const byBucket = await s.get("/transactions/summary?groupBy=bucket");
    const travel = byBucket.groups.find((g: { label: string }) => g.label === "Travel");
    expect(travel.spending).toBe(250);
    expect(
      byBucket.groups.find((g: { label: string }) => g.label === "Uncategorized"),
    ).toBeTruthy();

    const byMonth = await s.get("/transactions/summary?groupBy=month");
    expect(byMonth.groups.map((g: { key: string }) => g.key)).toEqual(["2026-08", "2026-09"]);

    const upToAug31 = await s.get("/transactions/summary?to=2026-08-31");
    expect(upToAug31.totals.count).toBe(2); // the 31 Aug expense is included
    expect((await s.get("/transactions?to=2026-08-31")).total).toBe(2);
  });
});
