/**
 * `expo-secure-store` calls `requireNativeModule` at import time, which
 * throws outside an actual Android/iOS runtime — importing it directly here
 * would make this store's logic untestable in Vitest, the same lesson
 * already applied to the notification pipeline (see pipeline.ts's
 * `subscribe` injection). Instead this module depends only on a minimal
 * structural interface that `expo-secure-store`'s namespace import already
 * satisfies exactly (`getItemAsync`/`setItemAsync`/`deleteItemAsync`), so
 * the real app wiring passes the package in with no adapter code needed,
 * while tests pass an in-memory fake.
 */
export interface SecureStorageAdapter {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const REFRESH_TOKEN_KEY = "arthiq.refreshToken";

export interface TokenStore {
  /** Access tokens are short-lived and only ever needed in-process, so they're kept in memory only — never persisted. */
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  /** Refresh tokens must survive app restarts, so they live in Keystore-backed secure storage. */
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
  clear(): Promise<void>;
}

export function createTokenStore(storage: SecureStorageAdapter): TokenStore {
  let accessToken: string | null = null;

  return {
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
    getRefreshToken: () => storage.getItemAsync(REFRESH_TOKEN_KEY),
    setRefreshToken: async (token) => {
      if (token) {
        await storage.setItemAsync(REFRESH_TOKEN_KEY, token);
      } else {
        await storage.deleteItemAsync(REFRESH_TOKEN_KEY);
      }
    },
    clear: async () => {
      accessToken = null;
      await storage.deleteItemAsync(REFRESH_TOKEN_KEY);
    },
  };
}
