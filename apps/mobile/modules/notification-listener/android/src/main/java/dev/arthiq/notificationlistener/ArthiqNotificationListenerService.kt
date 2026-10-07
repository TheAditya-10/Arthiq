package dev.arthiq.notificationlistener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * System-bound notification listener. Deliberately dumb: it only (a) checks
 * the incoming notification's package against the enabled-provider allow-list
 * synced from JS, and (b) if allowed, hands {packageName, title, text, postTime}
 * off to [NotificationListenerModule] for bridging to JS as an event.
 *
 * No parsing, no persistence, no network I/O happens here — see
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
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    NotificationListenerModule.recordSeen(sbn.packageName)
    if (!NotificationListenerModule.isProcessingEnabled()) return
    if (!NotificationListenerModule.isPackageAllowed(sbn.packageName)) return

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
