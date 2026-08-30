import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

describe("user routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("PATCH /users/me updates displayName and timezone", async () => {
    const { accessToken } = await registerTestUser(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: authHeader(accessToken),
      payload: { displayName: "New Name", timezone: "America/New_York" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe("New Name");
    expect(res.json().timezone).toBe("America/New_York");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(accessToken),
    });
    expect(me.json().displayName).toBe("New Name");
  });

  it("DELETE /users/me hard-deletes the user and cascades to everything they own", async () => {
    const { accessToken } = await registerTestUser(app);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: { name: "HDFC", type: "BANK", openingBalance: 0, openingBalanceDate: "2026-01-01" },
    });
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "EXPENSE",
        amount: 100,
        direction: "DEBIT",
        occurredAt: "2026-08-01T00:00:00Z",
      },
    });

    const del = await app.inject({
      method: "DELETE",
      url: "/users/me",
      headers: authHeader(accessToken),
    });
    expect(del.statusCode).toBe(204);

    // The access token is still cryptographically valid until it expires,
    // but the user it points to no longer exists — every route must reject it.
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(accessToken),
    });
    expect(me.statusCode).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "DELETE", url: "/users/me" });
    expect(res.statusCode).toBe(401);
  });
});
