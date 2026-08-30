import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp } from "../../../tests/helpers.js";

describe("auth routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers a new user and returns an access token + sets a refresh cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "alice@example.com",
        password: "correct horse battery",
        displayName: "Alice",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.user).toMatchObject({ email: "alice@example.com", displayName: "Alice" });
    expect(res.cookies.some((c) => c.name === "arthiq_refresh_token")).toBe(true);
  });

  it("rejects registering the same email twice", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "bob@example.com", password: "correct horse battery", displayName: "Bob" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "bob@example.com", password: "another password", displayName: "Bob 2" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects invalid registration input", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "short", displayName: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "carol@example.com",
        password: "correct horse battery",
        displayName: "Carol",
      },
    });

    const good = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "carol@example.com", password: "correct horse battery" },
    });
    expect(good.statusCode).toBe(200);

    const bad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "carol@example.com", password: "wrong password" },
    });
    expect(bad.statusCode).toBe(401);

    const nonexistent = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "whatever12345" },
    });
    // Same shape/status for "no such user" and "wrong password" — never
    // reveal which one it was.
    expect(nonexistent.statusCode).toBe(401);
    expect(nonexistent.json().error.message).toBe(bad.json().error.message);
  });

  it("rejects /auth/me without a token, accepts it with a valid one", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/auth/me" });
    expect(noAuth.statusCode).toBe(401);

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "frank@example.com",
        password: "correct horse battery",
        displayName: "Frank",
      },
    });
    const { accessToken } = register.json();

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("frank@example.com");
  });

  it("rotates the refresh token: old one becomes invalid, new one works", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "dave@example.com",
        password: "correct horse battery",
        displayName: "Dave",
      },
    });
    const refreshCookie = register.cookies.find((c) => c.name === "arthiq_refresh_token")!;

    const firstRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { arthiq_refresh_token: refreshCookie.value },
    });
    expect(firstRefresh.statusCode).toBe(200);

    // The rotated-out token must no longer work.
    const reuseOldToken = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { arthiq_refresh_token: refreshCookie.value },
    });
    expect(reuseOldToken.statusCode).toBe(401);

    // But the newly issued one does.
    const newRefreshCookie = firstRefresh.cookies.find((c) => c.name === "arthiq_refresh_token")!;
    const secondRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { arthiq_refresh_token: newRefreshCookie.value },
    });
    expect(secondRefresh.statusCode).toBe(200);
  });

  it("logs out and revokes the refresh token", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "erin@example.com",
        password: "correct horse battery",
        displayName: "Erin",
      },
    });
    const refreshCookie = register.cookies.find((c) => c.name === "arthiq_refresh_token")!;

    const logoutRes = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { arthiq_refresh_token: refreshCookie.value },
    });
    expect(logoutRes.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { arthiq_refresh_token: refreshCookie.value },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("issues a mobile-shaped response (refresh token in body, not just cookie) for X-Client: mobile", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { "x-client": "mobile" },
      payload: {
        email: "mobile-user@example.com",
        password: "correct horse battery",
        displayName: "M",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().refreshToken).toBeTypeOf("string");
  });
});
