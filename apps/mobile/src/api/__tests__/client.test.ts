import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenStore, type SecureStorageAdapter } from "../../auth/secureTokenStore.js";
import { ApiClientError, createApiClient } from "../client.js";

function fakeStorage(): SecureStorageAdapter {
  const store = new Map<string, string>();
  return {
    async getItemAsync(key) {
      return store.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      store.set(key, value);
    },
    async deleteItemAsync(key) {
      store.delete(key);
    },
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("createApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login stores the access token in memory and the refresh token in secure storage", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        accessToken: "access1",
        refreshToken: "refresh1",
        user: { id: "u1", email: "a@b.com", displayName: "A", timezone: "Asia/Kolkata" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokenStore = createTokenStore(fakeStorage());
    const client = createApiClient({ baseUrl: "https://api.arthiq.app", tokenStore });

    const result = await client.auth.login({ email: "a@b.com", password: "secret" });
    expect(result.user.id).toBe("u1");
    expect(tokenStore.getAccessToken()).toBe("access1");
    expect(await tokenStore.getRefreshToken()).toBe("refresh1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.arthiq.app/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Client": "mobile" }),
      }),
    );
  });

  it("attaches the bearer token and X-Client header on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    const tokenStore = createTokenStore(fakeStorage());
    tokenStore.setAccessToken("access1");
    const client = createApiClient({ baseUrl: "https://api.arthiq.app", tokenStore });

    await client.accounts.list();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.arthiq.app/accounts",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Client": "mobile",
          authorization: "Bearer access1",
        }),
      }),
    );
  });

  it("on a 401, refreshes using the stored refresh token and retries exactly once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "access2", refreshToken: "refresh2" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, [{ id: "acc1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const tokenStore = createTokenStore(fakeStorage());
    tokenStore.setAccessToken("expired");
    await tokenStore.setRefreshToken("refresh1");
    const client = createApiClient({ baseUrl: "https://api.arthiq.app", tokenStore });

    const result = await client.accounts.list();
    expect(result).toEqual([{ id: "acc1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(tokenStore.getAccessToken()).toBe("access2");
    expect(await tokenStore.getRefreshToken()).toBe("refresh2");
  });

  it("clears tokens and throws when refresh itself fails after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x" } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x" } }));
    vi.stubGlobal("fetch", fetchMock);

    const tokenStore = createTokenStore(fakeStorage());
    tokenStore.setAccessToken("expired");
    await tokenStore.setRefreshToken("bad-refresh");
    const client = createApiClient({ baseUrl: "https://api.arthiq.app", tokenStore });

    await expect(client.accounts.list()).rejects.toBeInstanceOf(ApiClientError);
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });

  it("ensureAccessToken refreshes from the stored refresh token on a cold start (no cached access token)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { accessToken: "access2", refreshToken: "refresh2" }));
    vi.stubGlobal("fetch", fetchMock);

    const tokenStore = createTokenStore(fakeStorage());
    await tokenStore.setRefreshToken("refresh1");
    const client = createApiClient({ baseUrl: "https://api.arthiq.app", tokenStore });

    expect(await client.ensureAccessToken()).toBe("access2");
  });

  it("ensureAccessToken returns null when there's no refresh token at all (never signed in)", async () => {
    const tokenStore = createTokenStore(fakeStorage());
    const client = createApiClient({ baseUrl: "https://api.arthiq.app", tokenStore });
    expect(await client.ensureAccessToken()).toBeNull();
  });
});
