import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { type ApiClient, type CurrentUser, createApiClient } from "../api/client.js";
import { createTokenStore } from "./secureTokenStore.js";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000";

// expo-secure-store's namespace export already structurally matches the
// SecureStorageAdapter interface (getItemAsync/setItemAsync/deleteItemAsync)
// — no wrapper needed. This is the one place in the app that actually
// imports it; everything else depends on the interface (see
// secureTokenStore.ts's doc comment).
const tokenStore = createTokenStore(SecureStore);
const apiClient = createApiClient({ baseUrl: API_URL, tokenStore });

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  apiClient: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On cold start there's no in-memory access token yet — try refreshing
    // from the stored refresh token before giving up (mirrors apps/web's
    // AuthProvider, adapted for mobile's explicit-refresh-token transport).
    (async () => {
      const token = await apiClient.ensureAccessToken();
      if (token) {
        try {
          setUser(await apiClient.auth.me());
        } catch {
          await tokenStore.clear();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiClient.auth.login({ email, password });
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const result = await apiClient.auth.register({ email, password, displayName });
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, apiClient, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
