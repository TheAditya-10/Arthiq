import { describe, expect, it } from "vitest";
import { createTokenStore, type SecureStorageAdapter } from "../secureTokenStore.js";

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

describe("createTokenStore", () => {
  it("keeps the access token in memory only", async () => {
    const store = createTokenStore(fakeStorage());
    expect(store.getAccessToken()).toBeNull();
    store.setAccessToken("access123");
    expect(store.getAccessToken()).toBe("access123");
  });

  it("persists the refresh token to the injected storage", async () => {
    const storage = fakeStorage();
    const store = createTokenStore(storage);
    await store.setRefreshToken("refresh123");
    expect(await store.getRefreshToken()).toBe("refresh123");

    // A second store instance sharing the same storage sees it too (survives "app restart").
    const secondInstance = createTokenStore(storage);
    expect(await secondInstance.getRefreshToken()).toBe("refresh123");
  });

  it("setting the refresh token to null deletes it from storage", async () => {
    const store = createTokenStore(fakeStorage());
    await store.setRefreshToken("refresh123");
    await store.setRefreshToken(null);
    expect(await store.getRefreshToken()).toBeNull();
  });

  it("clear() wipes both the in-memory access token and the persisted refresh token", async () => {
    const store = createTokenStore(fakeStorage());
    store.setAccessToken("access123");
    await store.setRefreshToken("refresh123");

    await store.clear();
    expect(store.getAccessToken()).toBeNull();
    expect(await store.getRefreshToken()).toBeNull();
  });
});
