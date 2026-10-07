const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");

const SERVICE_NAME = "dev.arthiq.notificationlistener.ArthiqNotificationListenerService";
const LISTENER_PERMISSION = "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE";
const LISTENER_ACTION = "android.service.notification.NotificationListenerService";

/**
 * Local Expo Config Plugin that wires ArthiqNotificationListenerService into
 * the generated `android/` project on every `expo prebuild`, so the manifest
 * entry survives regeneration. The Kotlin module itself lives in
 * `modules/notification-listener` and is picked up by Expo autolinking; this
 * plugin only adds the <service>/<intent-filter> manifest entry.
 *
 * Plain CommonJS because Expo loads config plugins without a TS transpiler.
 * The service must be exported="true": the system process binds to it, and
 * the BIND_NOTIFICATION_LISTENER_SERVICE permission is what keeps other apps out.
 *
 * See docs/MOBILE_ARCHITECTURE.md §1/§4 and docs/ADR/005-notification-ingestion.md.
 */
const withNotificationListener = (config) =>
  withAndroidManifest(config, (config) => {
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
        "android:exported": "true",
        "android:label": "Arthiq",
      },
      "intent-filter": [{ action: [{ $: { "android:name": LISTENER_ACTION } }] }],
    });

    return config;
  });

module.exports = withNotificationListener;
