import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, apiClient } from "../auth/session.js";
import { createIngestSendFn } from "./ingestClient.js";
import { showTransactionCapturedNotification } from "./localNotify.js";
import { NotificationPipeline, type NotificationPipelineOptions } from "./pipeline.js";
import { accountResolverFromSettings, type NotificationSettings } from "./settings.js";

/**
 * The one place the real (device) pipeline is assembled, shared by the UI
 * hook and the headless task so both send, dedup and notify identically.
 * They also share the same AsyncStorage-backed dedup cache and sync queue.
 */
export function createNotificationPipeline(
  settings: NotificationSettings,
  subscribe: NotificationPipelineOptions["subscribe"],
): NotificationPipeline {
  const { sendRich } = createIngestSendFn({
    baseUrl: API_URL,
    getAccessToken: apiClient.ensureAccessToken,
    refreshAccessToken: apiClient.refreshAccessToken,
  });

  return new NotificationPipeline({
    storage: AsyncStorage,
    sendRich,
    resolveAccountId: accountResolverFromSettings(settings),
    onIngested: (result) => {
      void showTransactionCapturedNotification(result);
    },
    subscribe,
  });
}
