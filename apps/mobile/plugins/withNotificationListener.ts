import { AndroidConfig, withAndroidManifest, type ConfigPlugin } from "@expo/config-plugins";

const SERVICE_NAME = "dev.arthiq.notificationlistener.ArthiqNotificationListenerService";
const LISTENER_PERMISSION = "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE";
const LISTENER_ACTION = "android.service.notification.NotificationListenerService";

/**
 * Local Expo Config Plugin that wires ArthiqNotificationListenerService into
 * the generated `android/` project on every `expo prebuild`, so the manifest
 * entry survives regeneration instead of being a hand-edit someone forgets
 * to redo. The Kotlin module itself lives in
 * `modules/notification-listener` and is picked up by Expo autolinking via
 * its `expo-module.config.json` — this plugin only handles the
 * <service>/<intent-filter> manifest wiring that autolinking doesn't cover.
 *
 * See docs/MOBILE_ARCHITECTURE.md §1/§4 and docs/ADR/005-notification-ingestion.md.
 */
const withNotificationListener: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);

    mainApplication.service = mainApplication.service ?? [];

    const alreadyPresent = mainApplication.service.some(
      (service) => service.$?.["android:name"] === SERVICE_NAME,
    );
    if (alreadyPresent) return config;

    mainApplication.service.push({
      $: {
        "android:name": SERVICE_NAME,
        "android:permission": LISTENER_PERMISSION,
        "android:exported": "false",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": LISTENER_ACTION } }],
        },
      ],
    });

    return config;
  });
};

export default withNotificationListener;
