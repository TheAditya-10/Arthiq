import * as Notifications from "expo-notifications";
import type { IngestSendResult } from "./ingestClient.js";
import {
  buildTransactionCapturedContent,
  TRANSACTION_CAPTURED_CATEGORY,
} from "./notificationContent.js";

/**
 * Thin `expo-notifications` wrapper — unverified beyond typecheck/lint in
 * this sandbox (no Android SDK/emulator, same standing limitation as
 * Phase 11's native module). All the actually-testable logic lives in
 * `notificationContent.ts`; this file only calls the native API with its
 * output. Call `registerTransactionCapturedCategory` once at app startup,
 * before any `showTransactionCapturedNotification` call.
 */
export async function registerTransactionCapturedCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(TRANSACTION_CAPTURED_CATEGORY, [
    { identifier: "correct", buttonTitle: "Correct" },
    { identifier: "change", buttonTitle: "Change" },
  ]);
}

/** Shows the local "Correct/Change" notification for a just-ingested transaction, if there's anything worth showing (see buildTransactionCapturedContent). */
export async function showTransactionCapturedNotification(result: IngestSendResult): Promise<void> {
  const content = buildTransactionCapturedContent(result);
  if (!content) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      categoryIdentifier: content.categoryIdentifier,
    },
    trigger: null,
  });
}
