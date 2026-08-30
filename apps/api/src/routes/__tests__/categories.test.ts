import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

describe("category routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a bucket and a sub-bucket under it", async () => {
    const { accessToken } = await registerTestUser(app);
    const bucket = await app.inject({
      method: "POST",
      url: "/buckets",
      headers: authHeader(accessToken),
      payload: { name: "Food" },
    });
    expect(bucket.statusCode).toBe(201);

    const subBucket = await app.inject({
      method: "POST",
      url: "/sub-buckets",
      headers: authHeader(accessToken),
      payload: { bucketId: bucket.json().id, name: "Delivery" },
    });
    expect(subBucket.statusCode).toBe(201);
    expect(subBucket.json().bucketId).toBe(bucket.json().id);
  });

  it("archives a bucket without deleting historical transactions", async () => {
    const { accessToken } = await registerTestUser(app);
    const bucket = await app.inject({
      method: "POST",
      url: "/buckets",
      headers: authHeader(accessToken),
      payload: { name: "Household" },
    });
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "Cash",
        type: "CASH",
        openingBalance: 1000,
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
        amount: 200,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
        bucketId: bucket.json().id,
      },
    });

    const archive = await app.inject({
      method: "DELETE",
      url: `/buckets/${bucket.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(archive.statusCode).toBe(204);

    const stillThere = await app.inject({
      method: "GET",
      url: `/transactions/${txn.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.json().bucketId).toBe(bucket.json().id);
  });

  it("merges one bucket into another, reassigning transactions", async () => {
    const { accessToken } = await registerTestUser(app);
    const from = await app.inject({
      method: "POST",
      url: "/buckets",
      headers: authHeader(accessToken),
      payload: { name: "Misc" },
    });
    const into = await app.inject({
      method: "POST",
      url: "/buckets",
      headers: authHeader(accessToken),
      payload: { name: "Other" },
    });
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "Cash",
        type: "CASH",
        openingBalance: 1000,
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
        amount: 100,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
        bucketId: from.json().id,
      },
    });

    const merge = await app.inject({
      method: "POST",
      url: `/buckets/${from.json().id}/merge`,
      headers: authHeader(accessToken),
      payload: { intoBucketId: into.json().id },
    });
    expect(merge.statusCode).toBe(200);

    const reassigned = await app.inject({
      method: "GET",
      url: `/transactions/${txn.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(reassigned.json().bucketId).toBe(into.json().id);
  });
});
