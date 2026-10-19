package dev.arthiq.notificationlistener

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * Expo Modules API bridge for [ArthiqNotificationListenerService]. The
 * service and the module are different Android component instances (the
 * service is system-bound, the module is created per JS runtime), so state
 * shared between them — whether processing is enabled and which packages are
 * currently allow-listed — lives on this class's companion object, and
 * events flow service -> module via the static [emitNotificationPosted] entry
 * point rather than a direct reference.
 *
 * That state is also persisted to SharedPreferences: the listener keeps
 * running after the app is swiped away, and when Android restarts the process
 * just to rebind the service there is no JS around to re-sync it.
 */
class NotificationListenerModule : Module() {

  companion object {
    private const val PREFS = "arthiq.notificationListener"
    private const val KEY_ENABLED = "processingEnabled"
    private const val KEY_PACKAGES = "allowedPackages"
    private const val KEY_PENDING = "pending"
    private const val MAX_PENDING = 50

    @Volatile private var moduleRef: WeakReference<NotificationListenerModule>? = null
    // True only while the UI's JS has an onNotificationPosted subscription.
    // Without one, sendEvent goes nowhere, so the headless task is used instead.
    @Volatile private var jsObserving = false
    @Volatile private var processingEnabled: Boolean? = null
    @Volatile private var allowedPackages: Set<String>? = null

    // Counters surfaced via getStatus() so a "nothing is captured" report can
    // be narrowed down to: service never connected, notifications seen but
    // filtered, or forwarded but not handled in JS.
    @Volatile private var serviceConnected = false
    @Volatile private var seenCount = 0
    @Volatile private var forwardedCount = 0
    @Volatile private var headlessCount = 0
    @Volatile private var lastSeenPackage = ""

    private fun prefs(context: Context): SharedPreferences =
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun recordSeen(packageName: String) {
      seenCount += 1
      lastSeenPackage = packageName
    }

    fun isProcessingEnabled(context: Context): Boolean =
      processingEnabled ?: prefs(context).getBoolean(KEY_ENABLED, false).also { processingEnabled = it }

    fun isPackageAllowed(context: Context, packageName: String): Boolean {
      val packages = allowedPackages
        ?: (prefs(context).getStringSet(KEY_PACKAGES, emptySet()) ?: emptySet()).toSet()
          .also { allowedPackages = it }
      return packages.contains(packageName)
    }

    private fun setProcessingEnabled(context: Context, enabled: Boolean) {
      processingEnabled = enabled
      prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    private fun setAllowedPackages(context: Context, packages: Set<String>) {
      allowedPackages = packages
      prefs(context).edit().putStringSet(KEY_PACKAGES, packages).apply()
    }

    fun onServiceConnected(service: ArthiqNotificationListenerService) {
      serviceConnected = true
    }

    fun onServiceDisconnected(service: ArthiqNotificationListenerService) {
      serviceConnected = false
    }

    fun emitNotificationPosted(
      context: Context,
      packageName: String,
      title: String,
      text: String,
      postTime: Long,
    ) {
      forwardedCount += 1
      val module = moduleRef?.get()
      if (module != null && jsObserving) {
        module.sendEvent(
          "onNotificationPosted",
          mapOf(
            "packageName" to packageName,
            "title" to title,
            "text" to text,
            "postTime" to postTime.toDouble(),
          ),
        )
        return
      }
      headlessCount += 1
      if (!ArthiqNotificationTaskService.start(context, packageName, title, text, postTime)) {
        // Last resort: keep it until the app next opens and drains it.
        addPending(context, packageName, title, text, postTime)
      }
    }

    @Synchronized
    private fun addPending(context: Context, packageName: String, title: String, text: String, postTime: Long) {
      val prefs = prefs(context)
      val current = JSONArray(prefs.getString(KEY_PENDING, "[]"))
      current.put(
        JSONObject()
          .put("packageName", packageName)
          .put("title", title)
          .put("text", text)
          .put("postTime", postTime),
      )
      val trimmed = JSONArray()
      for (i in maxOf(0, current.length() - MAX_PENDING) until current.length()) {
        trimmed.put(current.get(i))
      }
      prefs.edit().putString(KEY_PENDING, trimmed.toString()).apply()
    }

    @Synchronized
    private fun drainPending(context: Context): List<Map<String, Any>> {
      val prefs = prefs(context)
      val current = JSONArray(prefs.getString(KEY_PENDING, "[]"))
      prefs.edit().remove(KEY_PENDING).apply()
      return (0 until current.length()).map { i ->
        val item = current.getJSONObject(i)
        mapOf(
          "packageName" to item.getString("packageName"),
          "title" to item.getString("title"),
          "text" to item.getString("text"),
          "postTime" to item.getLong("postTime").toDouble(),
        )
      }
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context unavailable")

  override fun definition() = ModuleDefinition {
    Name("ArthiqNotificationListener")

    Events("onNotificationPosted")

    OnCreate {
      moduleRef = WeakReference(this@NotificationListenerModule)
    }

    OnDestroy {
      if (moduleRef?.get() === this@NotificationListenerModule) {
        moduleRef = null
        jsObserving = false
      }
    }

    OnStartObserving {
      moduleRef = WeakReference(this@NotificationListenerModule)
      jsObserving = true
    }

    OnStopObserving {
      if (moduleRef?.get() === this@NotificationListenerModule) {
        jsObserving = false
      }
    }

    // Enables/disables forwarding notifications to JS. The system-level
    // listener binding is controlled entirely by the user's notification
    // access grant (see getAccessStatus/openSettings) — start/stop only
    // toggle whether an already-bound listener is allowed to emit events,
    // so the app can pause ingestion (e.g. the user signed out) without
    // revoking OS-level access. Persisted, so it survives process death.
    Function("start") {
      setProcessingEnabled(context, true)
    }

    Function("stop") {
      setProcessingEnabled(context, false)
    }

    // Mirrors the user's enabled-provider settings (Google Pay/PhonePe/
    // Paytm/Generic UPI toggles) so the native allow-list check can discard
    // disabled providers' notifications before they ever reach JS.
    Function("setEnabledPackages") { packages: List<String> ->
      setAllowedPackages(context, packages.toSet())
    }

    // Notifications that arrived while neither the UI nor a headless task
    // could take them. Returned once, then cleared.
    Function("drainPending") {
      drainPending(context)
    }

    Function("getStatus") {
      mapOf(
        "serviceConnected" to serviceConnected,
        "processingEnabled" to isProcessingEnabled(context),
        "allowedPackages" to (allowedPackages ?: emptySet()).joinToString(","),
        "seenCount" to seenCount,
        "forwardedCount" to forwardedCount,
        "headlessCount" to headlessCount,
        "lastSeenPackage" to lastSeenPackage,
      )
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
      val context = appContext.reactContext ?: return@Function Unit
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      Unit
    }

    // Battery optimisation (and OEM "auto-start"/"background" restrictions)
    // is what kills capture after the app is swiped away on many phones.
    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    // App info screen: where "Battery > Unrestricted" (stock Android 12+) and
    // most OEMs' auto-start / background-activity toggles live. Deliberately
    // not ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, which Play restricts.
    Function("openAppSettings") {
      val context = appContext.reactContext ?: return@Function Unit
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.fromParts("package", context.packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      Unit
    }
  }
}
