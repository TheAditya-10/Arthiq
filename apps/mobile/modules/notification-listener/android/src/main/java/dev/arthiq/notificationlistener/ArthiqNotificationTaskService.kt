package dev.arthiq.notificationlistener

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS notification pipeline when no UI is attached — the app was
 * swiped away from recents, or the process was started by the system just to
 * bind [ArthiqNotificationListenerService]. React Native boots a JS runtime
 * without an Activity and invokes the task registered under [TASK_NAME]
 * (see apps/mobile/index.js), which parses, dedups and sends exactly like the
 * foreground path.
 */
class ArthiqNotificationTaskService : HeadlessJsTaskService() {

  companion object {
    const val TASK_NAME = "ArthiqNotificationTask"
    private const val TIMEOUT_MS = 60_000L

    /** Returns false if Android refused the start (background-start limits), so the caller can buffer instead. */
    fun start(context: Context, packageName: String, title: String, text: String, postTime: Long): Boolean {
      val intent = Intent(context, ArthiqNotificationTaskService::class.java).apply {
        putExtra("packageName", packageName)
        putExtra("title", title)
        putExtra("text", text)
        putExtra("postTime", postTime.toDouble())
      }
      return try {
        context.startService(intent) ?: return false
        acquireWakeLockNow(context)
        true
      } catch (e: IllegalStateException) {
        false
      } catch (e: SecurityException) {
        false
      }
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    // allowedInForeground: the UI may come back while the task is running.
    return HeadlessJsTaskConfig(TASK_NAME, Arguments.fromBundle(extras), TIMEOUT_MS, true)
  }
}
