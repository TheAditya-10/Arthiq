import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

async function setup(app: FastifyInstance) {
  const { accessToken } = await registerTestUser(app);
  const account = await app.inject({
    method: "POST",
    url: "/accounts",
    headers: authHeader(accessToken),
    payload: { name: "HDFC", type: "BANK", openingBalance: 0, openingBalanceDate: "2026-01-01" },
  });
  return { accessToken, accountId: account.json().id as string };
}

function ingestPayload(accountId: string, overrides: Record<string, unknown> = {}) {
  return {
    accountId,
    amountMinor: "48000",
    direction: "DEBIT",
    merchantRaw: "Zomato",
    occurredAt: "2026-08-10T12:30:00Z",
    provider: "GOOGLE_PAY",
    sourcePackage: "com.google.android.apps.nbu.paisa.user",
    rawTextHash: "abc123hash",
    ...overrides,
  };
}

describe("POST /notifications/ingest", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a classified transaction and an audit NotificationSource row", async () => {
    const { accessToken, accountId } = await setup(app);

    const res = await app.inject({
      method: "POST",
      url: "/notifications/ingest",
      headers: authHeader(accessToken),
      payload: ingestPayload(accountId),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().dedupOutcome).toBe("NEW");
    expect(res.json().transaction.type).toBe("EXPENSE");
    expect(res.json().transaction.direction).toBe("DEBIT");
    expect(res.json().transaction.amount).toBe(480);
    expect(res.json().transaction.source).toBe("ANDROID_NOTIFICATION");

    const sources = await app.inject({
      method: "GET",
      url: "/notifications/sources",
      headers: authHeader(accessToken),
    });
    expect(sources.json().total).toBe(1);
    expect(sources.json().items[0].dedupOutcome).toBe("NEW");
    expect(sources.json().items[0].provider).toBe("GOOGLE_PAY");
  });

  it("classifies a CREDIT notification as INCOME", async () => {
    const { accessToken, accountId } = await setup(app);
    const res = await app.inject({
      method: "POST",
      url: "/notifications/ingest",
      headers: authHeader(accessToken),
      payload: ingestPayload(accountId, {
        direction: "CREDIT",
        merchantRaw: undefined,
        amountMinor: "500000",
      }),
    });
    expect(res.json().transaction.type).toBe("INCOME");
    expect(res.json().transaction.direction).toBe("CREDIT");
    expect(res.json().transaction.amount).toBe(5000);
  });

  it("reports DUPLICATE and creates no second transaction when it matches an existing one", async () => {
    const { accessToken, accountId } = await setup(app);
    const first = await app.inject({
      method: "POST",
      url: "/notifications/ingest",
      headers: authHeader(accessToken),
      payload: ingestPayload(accountId),
    });
    expect(first.json().dedupOutcome).toBe("NEW");

    const second = await app.inject({
      method: "POST",
      url: "/notifications/ingest",
      headers: authHeader(accessToken),
      payload: ingestPayload(accountId, { rawTextHash: "differenthash" }),
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().dedupOutcome).toBe("DUPLICATE");
    expect(second.json().transaction).toBeNull();

    const ledger = await app.inject({
      method: "GET",
      url: `/transactions?accountId=${accountId}`,
      headers: authHeader(accessToken),
    });
    expect(ledger.json().total).toBe(1);

    const sources = await app.inject({
      method: "GET",
      url: "/notifications/sources",
      headers: authHeader(accessToken),
    });
    expect(sources.json().total).toBe(2);
  });

  it("recognizes a duplicate of a transaction that arrived via manual entry, not just another notification", async () => {
    const { accessToken, accountId } = await setup(app);
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        type: "EXPENSE",
        amount: 480,
        direction: "DEBIT",
        occurredAt: "2026-08-10T12:30:00Z",
        merchantRaw: "Zomato",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/notifications/ingest",
      headers: authHeader(accessToken),
      payload: ingestPayload(accountId),
    });
    expect(res.json().dedupOutcome).toBe("DUPLICATE");

    const ledger = await app.inject({
      method: "GET",
      url: `/transactions?accountId=${accountId}`,
      headers: authHeader(accessToken),
    });
    expect(ledger.json().total).toBe(1);
  });

  it("rejects a malformed amountMinor", async () => {
    const { accessToken, accountId } = await setup(app);
    const res = await app.inject({
      method: "POST",
      url: "/notifications/ingest",
      headers: authHeader(accessToken),
      payload: ingestPayload(accountId, { amountMinor: "48.00" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an accountId the caller doesn't own", async () => {
    const { accessToken } = await setup(app);
    const other = await setup(app);
    const res = await app.inject({
      method: "POST",
      url: "/notifications/ingest",
      headers: authHeader(accessToken),
      payload: ingestPayload(other.accountId),
    });
    expect(res.statusCode).toBe(404);
  });
});
