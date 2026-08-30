import type { KeyValueStorage } from "../dedupCache.js";

/** In-memory fake satisfying the same contract as AsyncStorage, for tests. */
export function createInMemoryStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    async getItem(key: string) {
      return store.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}
