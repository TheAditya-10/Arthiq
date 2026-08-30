import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as NativeListener from "../../modules/notification-listener/index.js";
import {
  defaultNotificationSettings,
  loadNotificationSettings,
  resolveEnabledPackages,
  saveNotificationSettings,
  type NotificationSettings,
} from "./settings.js";

interface NotificationSettingsContextValue {
  settings: NotificationSettings;
  loading: boolean;
  updateSettings: (next: NotificationSettings) => Promise<void>;
}

const NotificationSettingsContext = createContext<NotificationSettingsContextValue | null>(null);

/**
 * Owns the persisted provider/account mapping and keeps the native
 * allow-list in sync with it. Deliberately re-syncs `setEnabledPackages` on
 * every load and every save rather than trusting whatever the native side
 * already had, since the native module's in-memory allow-list (Phase 11)
 * doesn't itself persist across app restarts — this is the one place
 * responsible for restoring it.
 */
export function NotificationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(defaultNotificationSettings());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const loaded = await loadNotificationSettings(AsyncStorage);
      NativeListener.setEnabledPackages(resolveEnabledPackages(loaded));
      setSettings(loaded);
      setLoading(false);
    })();
  }, []);

  const updateSettings = useCallback(async (next: NotificationSettings) => {
    await saveNotificationSettings(AsyncStorage, next);
    NativeListener.setEnabledPackages(resolveEnabledPackages(next));
    setSettings(next);
  }, []);

  return (
    <NotificationSettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </NotificationSettingsContext.Provider>
  );
}

export function useNotificationSettings(): NotificationSettingsContextValue {
  const ctx = useContext(NotificationSettingsContext);
  if (!ctx) {
    throw new Error("useNotificationSettings must be used within NotificationSettingsProvider");
  }
  return ctx;
}
