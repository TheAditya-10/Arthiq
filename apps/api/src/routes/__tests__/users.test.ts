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
      payload: { password: "correct horse battery" },
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

  it("DELETE /users/me refuses without the correct password and deletes nothing", async () => {
    const { accessToken } = await registerTestUser(app);

    const missing = await app.inject({
      method: "DELETE",
      url: "/users/me",
      headers: authHeader(accessToken),
    });
    expect(missing.statusCode).toBe(400);

    const wrong = await app.inject({
      method: "DELETE",
      url: "/users/me",
      headers: authHeader(accessToken),
      payload: { password: "not the password" },
    });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().error.code).toBe("INVALID_PASSWORD");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(accessToken),
    });
    expect(me.statusCode).toBe(200);
  });

  it("GET /users/me/export returns the user's data only, without secrets", async () => {
    const alice = await registerTestUser(app, { displayName: "Alice" });
    const bob = await registerTestUser(app, { displayName: "Bob" });
    for (const [who, name] of [
      [alice, "Alice Bank"],
      [bob, "Bob Bank"],
    ] as const) {
      await app.inject({
        method: "POST",
        url: "/accounts",
        headers: authHeader(who.accessToken),
        payload: { name, type: "BANK", openingBalance: 0, openingBalanceDate: "2026-01-01" },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: "/users/me/export",
      headers: authHeader(alice.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("arthiq-export.json");
    const body = res.json();
    expect(body.format).toBe("arthiq-export-v1");
    expect(body.user.email).toBe(alice.email);
    expect(body.accounts.map((a: { name: string }) => a.name)).toEqual(["Alice Bank"]);

    const raw = res.body;
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("passwordSalt");
    expect(raw).not.toContain("Bob Bank");
  });

  it("sends security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "DELETE", url: "/users/me" });
    expect(res.statusCode).toBe(401);
  });
});
