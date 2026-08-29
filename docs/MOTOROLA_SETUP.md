# Motorola Edge 50 Fusion Setup

The Motorola Edge 50 Fusion ships with a near-stock Android skin (Motorola calls their overlay "Hello UI" / "My UX" depending on marketing materials and OS version — Motorola's skin is much closer to stock Android than, say, Samsung's One UI or Xiaomi's MIUI/HyperOS, which is good news: fewer aggressive custom battery-killer subsystems than some other OEMs, but Motorola devices still ship an OS-level Doze/App Standby implementation plus Motorola's own background-process management that can affect a `NotificationListenerService`).

> **Verify before relying on exact labels**: Motorola's settings wording shifts between Android versions (this device ships/updates across Android 14 and later). Every step below gives you the setting's *purpose* and at least one way to search for it, not just a fixed tap-path, so it stays useful across an OS update.

Do the generic steps in `docs/ANDROID_SETUP.md` first, then apply the following Motorola-specific hardening so the listener survives being idle in your pocket for hours.

## 1. Notification Access
Same as the generic guide — Settings → search "notification access" → enable Arthiq. No Motorola-specific deviation here.

## 2. Enable Developer Options & USB Debugging (needed once, for `adb install`)
1. **Settings → About phone** → tap **Build number** 7 times (standard Android mechanism, present on Motorola devices) until it says "You are now a developer."
2. **Settings → System → Developer options** → enable **USB debugging**.
3. Connect via USB; accept the "Allow USB debugging?" prompt on the device when `adb` first connects.

## 3. Battery Optimization Exemption (the most important step)
Android's Doze mode and Motorola's own battery manager can both suspend background work, including — in some Android versions/OEM configurations — the process hosting a `NotificationListenerService` if the device considers the app "inactive."

1. **Settings → Apps → Arthiq → Battery** (path may also appear as **Settings → Battery → Battery optimization**, then find Arthiq in the app list).
2. Set battery usage to **Unrestricted** (sometimes labeled "Not optimized" / "Don't optimize"). Avoid "Optimized"/"Restricted" for this app specifically.
3. If your OS version exposes a separate **"Adaptive Battery"** or per-app **"Manage battery usage"** toggle, ensure Arthiq is excluded/allow-listed there too.

## 4. Background App Restrictions
1. **Settings → Apps → Arthiq → Mobile data & Wi-Fi** (or **Data usage**) → ensure **Background data** is allowed (not restricted) so the sync queue can actually reach the backend once a transaction is parsed.
2. If present on your OS version, check **Settings → Apps → Arthiq → App battery usage** or a similar **"Allow background activity"** toggle and ensure it's enabled.

## 5. Autostart / "Start at boot"
Some Motorola software builds include an autostart manager (more commonly a Xiaomi/Huawei-style feature; less universal on Motorola's near-stock skin, but check anyway since it varies by region/carrier build). If you find a setting like **Settings → Apps → Special access → "Auto-start apps"** or similar, ensure Arthiq is allowed to start automatically after a reboot — otherwise the notification listener won't be active again until you manually reopen the app after a restart.

## 6. Notification Permissions
Android 13+ (which this device runs) requires a separate runtime permission for an app to *post* notifications, distinct from *listening* to others'. Ensure:
**Settings → Apps → Arthiq → Notifications** → allowed. This governs Arthiq's own "Correct/Change" prompts, not the notification-listening capability itself (that's the "Notification access" special grant from step 1).

## 7. Testing the Listener End-to-End on This Device
1. Complete steps 1–6.
2. Lock the phone and leave it idle (screen off, not touched) for at least 15–20 minutes — long enough for Doze mode to potentially engage — to genuinely test persistence rather than just the immediately-after-setup happy path.
3. Make a real UPI payment.
4. Confirm the Arthiq capture notification still appears promptly. If it does, your exemptions are working. If it's delayed by minutes or missing, revisit step 3 (battery optimization) first — it's the most common cause on any Android 12+ device with aggressive Doze behavior, Motorola included.

## 8. What To Do If Android Still Kills the Listener
Even with every exemption above set correctly, Android's Doze mode operates system-wide and can still defer non-exempt background work under sustained idle+low-battery conditions, and no app-level setting fully overrides this by design (it's intentional OS behavior, not a bug to "fix" around). If you observe missed notifications despite the above:
1. Re-open the Arthiq app periodically (bringing it to the foreground briefly resets some Doze whitelisting timers on some OS versions) — not a real fix, but a known mitigating habit.
2. Treat notification ingestion as best-effort, exactly as documented in `docs/ARCHITECTURE.md`/ADR-005 — use **CSV/bank statement import** (`docs/API_SPECIFICATION.md` `/imports`) to backfill anything missed before running a monthly reconciliation, so your reconciliation numbers stay accurate even if a few notifications were dropped by the OS.
3. If missed notifications are frequent enough to be a real problem, file it as a signal that this specific software build's battery manager needs a more specific exemption path than documented here — Motorola's exact battery-manager UI has changed across software updates, and this document should be updated once verified against your specific build's actual menu wording (Settings → About phone → Android version, to identify which build you're on when reporting this).

## 9. Generic Fallback for a Different Device
If you switch to a non-Motorola Android phone later, the underlying capability (`NotificationListenerService` + battery-optimization exemption) is universal Android behavior — repeat `docs/ANDROID_SETUP.md`'s generic flow, then search that device's Settings app for **"battery optimization"** and **"background restriction"** to find the equivalent of steps 3–4 above under that OEM's own wording.
