import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

async function createBucketAndSub(
  app: FastifyInstance,
  accessToken: string,
  bucketName: string,
  subName: string,
) {
  const bucket = await app.inject({
    method: "POST",
    url: "/buckets",
    headers: authHeader(accessToken),
    payload: { name: bucketName },
  });
  const sub = await app.inject({
    method: "POST",
    url: "/sub-buckets",
    headers: authHeader(accessToken),
    payload: { bucketId: bucket.json().id, name: subName },
  });
  return { bucketId: bucket.json().id as string, subBucketId: sub.json().id as string };
}

describe("classification wired into transaction creation/correction (the Croma demo scenario)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("auto-classifies a known merchant via the deterministic heuristic when no bucket is given", async () => {
    const { accessToken } = await registerTestUser(app);
    const { bucketId, subBucketId } = await createBucketAndSub(
      app,
      accessToken,
      "Food",
      "Delivery",
    );
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

    const txn = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 480,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
        merchantRaw: "ZOMATO ONLINE ORDER",
      },
    });
    expect(txn.statusCode).toBe(201);
    expect(txn.json().bucketId).toBe(bucketId);
    expect(txn.json().subBucketId).toBe(subBucketId);
    expect(txn.json().classificationSource).toBe("HEURISTIC");
    expect(txn.json().classifiedBy).toBe("system");
  });

  it("leaves bucketId null (classificationSource UNKNOWN) for a merchant with no rule/history/heuristic match", async () => {
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

    const txn = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 300,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
        merchantRaw: "Totally Unrecognized Local Shop",
      },
    });
    expect(txn.statusCode).toBe(201);
    expect(txn.json().bucketId).toBeNull();
    expect(txn.json().classificationSource).toBe("UNKNOWN");
  });

  it("the full demo scenario: correction learns a rule, next transaction from the same merchant auto-applies it", async () => {
    const { accessToken } = await registerTestUser(app);
    // Croma's heuristic seed maps to Household > Electronics.
    await createBucketAndSub(app, accessToken, "Household", "Electronics");
    const personal = await createBucketAndSub(app, accessToken, "Personal", "Electronics");
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

    // Step 1: first Croma transaction auto-classifies via the heuristic.
    const first = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 1250,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
        merchantRaw: "Croma",
      },
    });
    expect(first.json().classificationSource).toBe("HEURISTIC");

    // Step 2: user corrects it to Personal > Electronics.
    const corrected = await app.inject({
      method: "PATCH",
      url: `/transactions/${first.json().id}`,
      headers: authHeader(accessToken),
      payload: { bucketId: personal.bucketId, subBucketId: personal.subBucketId },
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json().classificationSource).toBe("MANUAL");

    // Step 3: a second, later Croma transaction (same raw merchant string —
    // normalization is deliberately literal, not fuzzy, per
    // docs/CLASSIFICATION_ENGINE.md §3, so "Croma" and "Croma Retail Store"
    // are NOT guaranteed to normalize identically) now classifies via the
    // learned RULE — not the heuristic — at full confidence.
    const second = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 899,
        direction: "DEBIT",
        occurredAt: "2026-01-20T10:00:00Z",
        merchantRaw: "Croma",
      },
    });
    expect(second.json().classificationSource).toBe("RULE");
    expect(second.json().bucketId).toBe(personal.bucketId);
    expect(second.json().subBucketId).toBe(personal.subBucketId);

    const rules = await app.inject({
      method: "GET",
      url: "/merchant-rules",
      headers: authHeader(accessToken),
    });
    expect(rules.json()).toHaveLength(1);
    expect(rules.json()[0].bucketId).toBe(personal.bucketId);
  });
});
