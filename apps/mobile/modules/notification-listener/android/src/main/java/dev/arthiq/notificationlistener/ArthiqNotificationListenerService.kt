package dev.arthiq.notificationlistener

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * System-bound notification listener. Deliberately dumb: it only (a) checks
 * the incoming notification's package against the enabled-provider allow-list
 * synced from JS, and (b) if allowed, hands {packageName, title, text, postTime}
 * off to [NotificationListenerModule], which routes it to JS — the live UI
 * runtime if one is listening, otherwise a headless JS task.
 *
 * No parsing and no network I/O happens here — see
 * docs/MOBILE_ARCHITECTURE.md ("Why parsing logic lives in TypeScript, not
 * Kotlin") and docs/ADR/005-notification-ingestion.md. Anything not on the
 * allow-list is discarded in-process and never reaches JS or disk.
 */
class ArthiqNotificationListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    super.onListenerConnected()
    NotificationListenerModule.onServiceConnected(this)
  }

  override fun onListenerDisconnected() {
    NotificationListenerModule.onServiceDisconnected(this)
    super.onListenerDisconnected()
    // Some OEM task killers unbind the listener when the app is swiped away;
    // ask the system to bind it again rather than waiting for a reboot.
    requestRebind(ComponentName(this, ArthiqNotificationListenerService::class.java))
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    NotificationListenerModule.recordSeen(sbn.packageName)
    if (!NotificationListenerModule.isProcessingEnabled(this)) return
    if (!NotificationListenerModule.isPackageAllowed(this, sbn.packageName)) return
    // Group summaries repeat a child notification's text — forwarding both is
    // one source of the same payment being captured twice.
    if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

    val extras = sbn.notification.extras
    // Payment apps often put the detail in EXTRA_BIG_TEXT (expanded style)
    // and leave EXTRA_TEXT empty, so fall back through the variants rather
    // than dropping the notification.
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = (
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_SUB_TEXT)
    )?.toString().orEmpty()
    if (title.isEmpty() && text.isEmpty()) return

    NotificationListenerModule.emitNotificationPosted(
      context = this,
      packageName = sbn.packageName,
      title = title,
      text = text,
      postTime = sbn.postTime,
    )
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    // Intentionally ignored — Arthiq only ever reacts to notifications being
    // posted, never to their removal.
  }
}
