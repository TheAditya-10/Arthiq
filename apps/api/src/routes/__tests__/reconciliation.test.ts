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
      openingBalance: 10000,
      openingBalanceDate: "2026-01-01",
    },
  });
  return { accessToken, accountId: account.json().id as string };
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

describe("reconciliation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("MATCHED when the actual balance equals expected exactly", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 500,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });

    const res = await app.inject({
      method: "POST",
      url: "/reconciliation/run",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        actualClosingBalance: 9500,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("MATCHED");
    expect(res.json().expectedClosingBalance).toBe(9500);
    expect(res.json().difference).toBe(0);
    expect(res.json().candidateCauses).toEqual([]);
  });

  it("DISCREPANCY when actual differs, with the exact difference computed", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 500,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });

    const res = await app.inject({
      method: "POST",
      url: "/reconciliation/run",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        actualClosingBalance: 9100,
      },
    });
    expect(res.json().status).toBe("DISCREPANCY");
    expect(res.json().expectedClosingBalance).toBe(9500);
    expect(res.json().difference).toBe(-400);
  });

  it("opening balance for the period reflects only transactions before periodStart", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 1000,
      direction: "DEBIT",
      occurredAt: "2026-07-15T10:00:00Z", // before the period
    });
    await createTxn(app, accessToken, {
      accountId,
      type: "EXPENSE",
      amount: 300,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z", // inside the period
    });

    const res = await app.inject({
      method: "POST",
      url: "/reconciliation/run",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        actualClosingBalance: 8700,
      },
    });
    expect(res.json().openingBalance).toBe(9000); // 10000 - 1000 (July)
    expect(res.json().expectedClosingBalance).toBe(8700); // 9000 - 300 (August)
    expect(res.json().status).toBe("MATCHED");
  });

  it("flags a small difference as resembling an unrecorded bank fee", async () => {
    const { accessToken, accountId } = await setup(app);
    const res = await app.inject({
      method: "POST",
      url: "/reconciliation/run",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        actualClosingBalance: 9975, // 25 short of the 10000 expected — fee-sized
      },
    });
    expect(res.json().status).toBe("DISCREPANCY");
    expect(res.json().candidateCauses.some((c: string) => c.includes("bank fee"))).toBe(true);
  });

  it("does not flag a bank-fee-sized difference if a FEE transaction already accounts for it", async () => {
    const { accessToken, accountId } = await setup(app);
    await createTxn(app, accessToken, {
      accountId,
      type: "FEE",
      amount: 25,
      direction: "DEBIT",
      occurredAt: "2026-08-05T10:00:00Z",
    });
    const res = await app.inject({
      method: "POST",
      url: "/reconciliation/run",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        actualClosingBalance: 9975,
      },
    });
    // Expected is already 9975 (10000 - 25 fee), so actual matches exactly.
    expect(res.json().status).toBe("MATCHED");
  });

  it("lists past reconciliations and allows resolving one with notes", async () => {
    const { accessToken, accountId } = await setup(app);
    const run = await app.inject({
      method: "POST",
      url: "/reconciliation/run",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        periodStart: "2026-08-01",
        periodEnd: "2026-09-01",
        actualClosingBalance: 9000,
      },
    });

    const resolved = await app.inject({
      method: "PATCH",
      url: `/reconciliation/${run.json().id}`,
      headers: authHeader(accessToken),
      payload: { status: "RESOLVED", resolutionNotes: "Missing cash withdrawal, now logged." },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().status).toBe("RESOLVED");

    const list = await app.inject({
      method: "GET",
      url: `/reconciliation?accountId=${accountId}`,
      headers: authHeader(accessToken),
    });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].resolutionNotes).toBe("Missing cash withdrawal, now logged.");
  });

  it("rejects periodStart >= periodEnd", async () => {
    const { accessToken, accountId } = await setup(app);
    const res = await app.inject({
      method: "POST",
      url: "/reconciliation/run",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        periodStart: "2026-09-01",
        periodEnd: "2026-08-01",
        actualClosingBalance: 9000,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
