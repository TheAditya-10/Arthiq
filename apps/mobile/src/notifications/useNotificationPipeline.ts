import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as NativeListener from "../../modules/notification-listener/index.js";
import { useAuth } from "../auth/AuthContext.js";
import { createNotificationPipeline } from "./createPipeline.js";
import { useNotificationSettings } from "./NotificationSettingsContext.js";

/**
 * Turns native forwarding on/off as the user signs in and out, and while the
 * UI is mounted handles notifications in this JS runtime. Rebuilds whenever
 * the provider/account mapping changes (Settings screen) so a mapping edit
 * takes effect immediately. Rebuilding is cheap and safe — the pipeline's
 * dedup cache and sync queue keep their actual state in AsyncStorage, not on
 * the class instance, so tearing down and recreating it loses nothing.
 *
 * Unmounting (the app swiped away from recents) deliberately does NOT stop
 * native forwarding: the listener keeps running and hands notifications to
 * the headless task (headlessTask.ts) instead. Only signing out stops it.
 */
export function useNotificationPipeline(): void {
  const { user, loading: authLoading } = useAuth();
  const { settings, loading } = useNotificationSettings();

  // Stop only on an actual sign-out, not on every cold start that happens to
  // have no user yet — the headless task already refuses to send without a
  // session, and stopping here would leave capture off after a failed refresh.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      NativeListener.start();
      wasSignedIn.current = true;
    } else if (wasSignedIn.current) {
      NativeListener.stop();
      wasSignedIn.current = false;
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || loading) return;

    const pipeline = createNotificationPipeline(settings, NativeListener.addNotificationListener);
    pipeline.start();

    // Catch up on anything that couldn't be delivered while the UI was away:
    // notifications the native side had to buffer, then the retry queue.
    const catchUp = async () => {
      for (const notification of NativeListener.drainPending()) {
        await pipeline.handle(notification);
      }
      await pipeline.flush();
    };
    void catchUp();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void catchUp();
    });

    return () => {
      appState.remove();
      pipeline.stop();
    };
  }, [user, settings, loading]);
}
