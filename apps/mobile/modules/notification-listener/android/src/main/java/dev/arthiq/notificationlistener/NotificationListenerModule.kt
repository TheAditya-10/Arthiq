package dev.arthiq.notificationlistener

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Expo Modules API bridge for [ArthiqNotificationListenerService]. The
 * service and the module are different Android component instances (the
 * service is system-bound, the module is created per JS runtime), so state
 * shared between them — whether processing is enabled and which packages are
 * currently allow-listed — lives on this class's companion object, and
 * events flow service -> module via the static [emitNotificationPosted] entry
 * point rather than a direct reference.
 */
class NotificationListenerModule : Module() {

  companion object {
    @Volatile private var moduleRef: WeakReference<NotificationListenerModule>? = null
    @Volatile private var processingEnabled = false
    @Volatile private var allowedPackages: Set<String> = emptySet()

    fun isProcessingEnabled(): Boolean = processingEnabled

    fun isPackageAllowed(packageName: String): Boolean = allowedPackages.contains(packageName)

    fun onServiceConnected(service: ArthiqNotificationListenerService) {
      // No state to capture from the service itself today — connection is
      // tracked here only as a hook for future access-status refinement.
    }

    fun onServiceDisconnected(service: ArthiqNotificationListenerService) {
      // See onServiceConnected.
    }

    fun emitNotificationPosted(packageName: String, title: String, text: String, postTime: Long) {
      moduleRef?.get()?.sendEvent(
        "onNotificationPosted",
        mapOf(
          "packageName" to packageName,
          "title" to title,
          "text" to text,
          "postTime" to postTime.toDouble(),
        ),
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ArthiqNotificationListener")

    Events("onNotificationPosted")

    OnCreate {
      moduleRef = WeakReference(this@NotificationListenerModule)
    }

    OnDestroy {
      if (moduleRef?.get() === this@NotificationListenerModule) {
        moduleRef = null
      }
    }

    // Enables/disables forwarding notifications to JS. The system-level
    // listener binding is controlled entirely by the user's notification
    // access grant (see getAccessStatus/openSettings) — start/stop only
    // toggle whether an already-bound listener is allowed to emit events,
    // so the app can pause ingestion (e.g. user disabled it in Settings)
    // without revoking OS-level access.
    Function("start") {
      processingEnabled = true
    }

    Function("stop") {
      processingEnabled = false
    }

    // Mirrors the user's enabled-provider settings (Google Pay/PhonePe/
    // Paytm/Generic UPI toggles) so the native allow-list check can discard
    // disabled providers' notifications before they ever reach JS.
    Function("setEnabledPackages") { packages: List<String> ->
      allowedPackages = packages.toSet()
    }

    Function("getAccessStatus") {
      val context = appContext.reactContext
        ?: return@Function "unknown"
      val enabledListeners = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners",
      ) ?: ""
      val granted = enabledListeners.split(":").any { it.contains(context.packageName) }
      if (granted) "granted" else "denied"
    }

    // Notification access cannot be requested via a runtime permission
    // dialog — this deep-links the user to the system settings screen
    // where they must enable it manually. See docs/ANDROID_SETUP.md.
    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
  }
}
