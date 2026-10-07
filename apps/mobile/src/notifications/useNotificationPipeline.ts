import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import * as NativeListener from "../../modules/notification-listener/index.js";
import { useAuth } from "../auth/AuthContext.js";
import { createIngestSendFn } from "./ingestClient.js";
import { showTransactionCapturedNotification } from "./localNotify.js";
import { NotificationPipeline } from "./pipeline.js";
import { useNotificationSettings } from "./NotificationSettingsContext.js";
import { accountResolverFromSettings } from "./settings.js";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000";

/**
 * Starts/stops the notification pipeline (Phase 12) as the user signs in
 * and out, and rebuilds it whenever the provider/account mapping changes
 * (Settings screen) so a mapping edit takes effect immediately rather than
 * only after the next app restart. Rebuilding is cheap and safe — the
 * pipeline's dedup cache and sync queue keep their actual state in
 * AsyncStorage, not on the class instance, so tearing down and recreating
 * it loses nothing in flight.
 */
export function useNotificationPipeline(): void {
  const { user, apiClient } = useAuth();
  const { settings, loading } = useNotificationSettings();

  useEffect(() => {
    if (!user || loading) return;

    const { sendRich } = createIngestSendFn({
      baseUrl: API_URL,
      getAccessToken: apiClient.ensureAccessToken,
      refreshAccessToken: apiClient.refreshAccessToken,
    });

    const pipeline = new NotificationPipeline({
      storage: AsyncStorage,
      sendRich,
      resolveAccountId: accountResolverFromSettings(settings),
      onIngested: (result) => {
        void showTransactionCapturedNotification(result);
      },
      subscribe: NativeListener.addNotificationListener,
    });

    NativeListener.start();
    pipeline.start();

    return () => {
      pipeline.stop();
      NativeListener.stop();
    };
  }, [user, apiClient, settings, loading]);
}
