import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  toRawNotification,
  type NativeNotificationEvent,
} from "../../modules/notification-listener/index.js";
import { apiClient } from "../auth/session.js";
import { createNotificationPipeline } from "./createPipeline.js";
import { hasValidConsent, loadNotificationSettings } from "./settings.js";

const noSubscription = () => ({ remove: () => {} });

/**
 * Runs one notification through the pipeline when the app UI isn't open —
 * started by the native ArthiqNotificationTaskService, registered in
 * apps/mobile/index.js. Re-checks everything the UI would (signed in,
 * consent, not paused) from persisted state, since none of the React
 * context exists here.
 */
export async function notificationHeadlessTask(event: NativeNotificationEvent): Promise<void> {
  const settings = await loadNotificationSettings(AsyncStorage);
  if (settings.paused || !hasValidConsent(settings)) return;
  if (!(await apiClient.ensureAccessToken())) return;

  const pipeline = createNotificationPipeline(settings, noSubscription);
  await pipeline.handle(toRawNotification(event));
}
