# Android Setup (Generic — Any Android 8.0+ Device)

This is the device-agnostic version of the setup flow. If you're on a **Motorola Edge 50 Fusion**, read `docs/MOTOROLA_SETUP.md` as well — it layers device-specific battery/background-restriction steps on top of this generic flow.

> **Note on UI labels**: exact menu wording and navigation depth vary by Android version and OEM skin (stock Android vs. Samsung One UI vs. Motorola's "Hello UI" vs. others), and can shift between OS updates. Where a label is given below, treat it as "look for something worded like this" rather than an exact, guaranteed string. The one universal fallback that works on every Android version: search your phone's Settings app for **"notification access"**.

## 1. Install the APK

Building the APK is covered in `docs/DEVELOPMENT_GUIDE.md` §"Building the Android App" — produces `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (debug) or a release APK/AAB.

Install it with `adb` (device connected via USB, USB debugging enabled — see `docs/MOTOROLA_SETUP.md` §2 for the Motorola-specific path to enable Developer Options/USB debugging):
```bash
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```
`-r` reinstalls over a previous debug build without uninstalling first (preserves nothing app-specific since there's no local DB on-device beyond the sync queue, but avoids the extra step).

Alternatively, transfer the APK file to the device and open it from a file manager — Android will prompt to allow installs from that source ("Install unknown apps") the first time.

## 2. Enable Notification Access

1. Open **Settings** on the device.
2. Navigate to **Apps** (or **Apps & notifications**) → **Special app access** → **Notification access** — OR search "notification access" directly in the Settings search bar (fastest, version-independent path).
3. Find **Arthiq** in the list and toggle it on.
4. A system dialog will warn that this grants the app access to read notification content — this is expected and required; confirm/allow.

You can also trigger this flow from inside the app: **Settings → Notification Access → "Open System Settings"** deep-links directly to the same screen (`Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`), skipping steps 1–2.

## 3. Enable the Payment Apps You Want Tracked

Inside the Arthiq app, go to **Settings → Notification Providers** and toggle on the UPI apps you actually use (Google Pay, PhonePe, Paytm, or "Generic UPI" for anything else). Only enabled providers' notifications are ever processed — this is a deliberate privacy control (see `docs/SECURITY.md`), not a limitation to work around.

## 4. Perform a Test UPI Transaction

Make a small real (or, if your payment app supports it, sandbox/test-mode) UPI payment — even ₹1 to yourself or a known contact works. The goal is just to trigger a real payment-success notification from one of your enabled apps.

## 5. Verify Detection

Within a few seconds of the notification appearing in your system notification shade, you should see an Arthiq notification appear:
```
₹<amount> at <merchant>
<Bucket> → <Sub-bucket>
[Correct] [Change]
```
If nothing appears after ~30 seconds, see Troubleshooting below.

## 6. Verify Classification

Tap into the notification or open the app's **Home**/**Transactions** screen — the captured transaction should show a bucket/sub-bucket and a classification source badge (Rule/Historical/Heuristic/AI/Unknown). If it's `Unknown`, that's expected for a merchant the system has never seen — classify it manually once and future transactions from that merchant will auto-classify (see `docs/CLASSIFICATION_ENGINE.md`).

## 7. Verify Backend Sync

Open the web dashboard (`docs/DEPLOYMENT.md` for the deployed URL, or `http://localhost:3000` in local dev) and check the **Transactions** ledger — the same transaction should appear there, confirming the mobile app successfully synced it to the backend.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No notification appears at all | Notification access not actually granted, or was revoked by the OS | Re-check Settings → Notification access; some OEMs silently revoke this on app update — re-toggle it |
| No notification appears, but access is granted | The paying app isn't in your enabled-providers list | Check **Settings → Notification Providers** in Arthiq |
| Works sometimes, stops after a while / after phone is idle | OEM battery optimization killing the background listener | See `docs/MOTOROLA_SETUP.md` (or your device's equivalent battery-optimization exemption steps) |
| Notification appears, but transaction is missing amount/merchant | The payment app changed its notification wording and no parser pattern matches it yet | This is exactly the scenario the parser abstraction (ADR-005) is designed to make cheap to fix — file the exact notification text (redact anything sensitive) so a new pattern can be added to that provider's parser |
| Transaction appears on-device but not in the web dashboard | Sync failed (offline at the time, or an API error) | Check **Settings → Sync Status** in the app; the sync queue retries with backoff automatically once connectivity returns |
| Classified as `Unknown` every time for a merchant you've corrected before | The merchant string varies enough between transactions that it normalizes differently each time (e.g. inconsistent reference numbers not being stripped) | Report the two differing raw merchant strings — this is a normalization-rule gap (`docs/CLASSIFICATION_ENGINE.md` §3), not expected behavior |

## 9. Uninstalling / Revoking Access
Toggling off notification access in Settings immediately stops all notification processing; uninstalling the app removes it entirely. Neither action deletes your data on the backend — use **Settings → Delete Account** in the app (or contact yourself, since this is a self-hosted personal instance) to fully delete backend data, per `docs/SECURITY.md` §6.
