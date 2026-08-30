import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

describe("event routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates an event and summarizes attached transaction spend", async () => {
    const { accessToken } = await registerTestUser(app);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "HDFC",
        type: "BANK",
        openingBalance: 50000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const event = await app.inject({
      method: "POST",
      url: "/events",
      headers: authHeader(accessToken),
      payload: { name: "Goa Trip 2026", startDate: "2026-01-10", endDate: "2026-01-14" },
    });
    expect(event.statusCode).toBe(201);

    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 12000,
        direction: "DEBIT",
        occurredAt: "2026-01-11T10:00:00Z",
        eventId: event.json().id,
      },
    });
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 5600,
        direction: "DEBIT",
        occurredAt: "2026-01-10T10:00:00Z",
        eventId: event.json().id,
      },
    });
    // Unrelated transaction, not attached to the event — must not count.
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 300,
        direction: "DEBIT",
        occurredAt: "2026-01-20T10:00:00Z",
      },
    });

    const summary = await app.inject({
      method: "GET",
      url: `/events/${event.json().id}/summary`,
      headers: authHeader(accessToken),
    });
    expect(summary.json().total).toBe(12000 + 5600);
    expect(summary.json().transactionCount).toBe(2);
  });
});
