import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ApiClient, CurrentUser } from "../api/client.js";
import { apiClient, tokenStore } from "./session.js";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  apiClient: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Permanently deletes the account and all its data, then signs out locally. */
  deleteAccount: (password: string) => Promise<void>;
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

  const deleteAccount = useCallback(async (password: string) => {
    await apiClient.users.deleteMe(password);
    // The server session is already gone; this just clears the local tokens.
    await apiClient.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, apiClient, login, register, logout, deleteAccount }),
    [user, loading, login, register, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
