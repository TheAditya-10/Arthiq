import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

describe("account routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates an account and lists it back with rupee amounts (not paise)", async () => {
    const { accessToken } = await registerTestUser(app);
    const create = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "HDFC Bank",
        type: "BANK",
        openingBalance: 15000,
        openingBalanceDate: "2026-01-01",
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().openingBalance).toBe(15000);
    expect(create.json().openingBalanceMinor).toBeUndefined();

    const list = await app.inject({
      method: "GET",
      url: "/accounts",
      headers: authHeader(accessToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
  });

  it("never returns another user's accounts", async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);
    await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(alice.accessToken),
      payload: {
        name: "Alice's Account",
        type: "BANK",
        openingBalance: 1000,
        openingBalanceDate: "2026-01-01",
      },
    });

    const bobsList = await app.inject({
      method: "GET",
      url: "/accounts",
      headers: authHeader(bob.accessToken),
    });
    expect(bobsList.json()).toHaveLength(0);
  });

  it("404s when fetching an account belonging to another user (not a leaked 200)", async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);
    const created = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(alice.accessToken),
      payload: {
        name: "Alice's Account",
        type: "BANK",
        openingBalance: 1000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const accountId = created.json().id;

    const bobFetch = await app.inject({
      method: "GET",
      url: `/accounts/${accountId}`,
      headers: authHeader(bob.accessToken),
    });
    expect(bobFetch.statusCode).toBe(404);
  });

  it("computes balance from opening balance + transaction effects", async () => {
    const { accessToken } = await registerTestUser(app);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "HDFC Bank",
        type: "BANK",
        openingBalance: 10000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const accountId = account.json().id;

    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        type: "EXPENSE",
        amount: 500,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
      },
    });
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        type: "INCOME",
        amount: 2000,
        direction: "CREDIT",
        occurredAt: "2026-01-06T10:00:00Z",
      },
    });

    const balance = await app.inject({
      method: "GET",
      url: `/accounts/${accountId}/balance`,
      headers: authHeader(accessToken),
    });
    expect(balance.json().balance).toBe(10000 - 500 + 2000);
  });
});
