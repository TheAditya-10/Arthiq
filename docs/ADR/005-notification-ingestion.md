# ADR 005: Notification Ingestion via `NotificationListenerService` + Provider/Parser Abstraction

## Status
Accepted

## Context
No public UPI transaction-history API exists for Google Pay, PhonePe, or Paytm that a third-party app can legitimately call. Android's `NotificationListenerService` is the only supported, publicly documented OS capability that lets an app (with explicit user-granted "Notification access" permission) observe notifications posted by other apps. This is an OS-level capability, not a payment-provider integration — it works identically regardless of which UPI app posted the notification, and requires no credentials or agreement with any payment provider.

Notification text format is provider-controlled, undocumented, unversioned, and can change without notice or vary by app version/region.

## Decision
1. Build a Kotlin `NotificationListenerService` (`ArthiqNotificationListener`) as a native Android module, exposed to the React Native/Expo layer via the Expo Modules API.
2. Filter incoming notifications immediately by package name against a **user-configurable allow-list** of supported provider package IDs (Google Pay `com.google.android.apps.nbu.paisa.user`, PhonePe `com.phonepe.app`, Paytm `net.one97.paytm`, plus a generic fallback for other apps the user explicitly enables). Anything not on the allow-list is discarded immediately, in-process, and never touches app storage or the network — satisfying "do not upload all phone notifications."
3. Define a `NotificationProvider` abstraction with one parser implementation per provider:
   ```
   NotificationProvider (interface: canHandle(packageName), parse(title, text, timestamp) -> ParsedTransaction | null)
   ├── GooglePayParser
   ├── PhonePeParser
   ├── PaytmParser
   ├── GenericUPIParser   (regex-based fallback: looks for ₹<amount> ... UPI keywords, used for any allow-listed-but-unmodeled app)
   └── (extension point for FutureProviderParser — e.g. a bank's own app, a wallet, Account Aggregator push events)
   ```
   Each parser is implemented with **pattern sets, not a single brittle regex** — an ordered list of candidate patterns tried in sequence, so a minor wording change (e.g., "paid to" → "sent to") only requires adding one more pattern, not rewriting the parser. Parsers are pure functions (`string -> ParsedTransaction | null`) so they are unit-testable with recorded sample notification strings, entirely without a device or emulator.
4. `ParsedTransaction` is normalized to `{ amountMinor, direction, merchantRaw, timestamp, referenceId?, sourcePackage }` before it ever leaves the device.
5. The device performs a lightweight local dedup pass (recent in-memory/SQLite ring buffer of recently-sent hashes) before POSTing to `/notifications/ingest`, then the backend performs the authoritative dedup (ADR/`docs/RECONCILIATION_ENGINE.md`'s dedup section) since the device cannot know about CSV-imported or other-device-sourced transactions.
6. Raw notification text is held in memory only long enough to parse; it is persisted to local storage only if `DEBUG_STORE_RAW_NOTIFICATIONS` is explicitly enabled (developer/troubleshooting builds), and is **never written to production logs** (enforced by using a redacting logger wrapper — see `docs/SECURITY.md`).

## Consequences
- Works with any UPI app without needing that app's cooperation, at the cost of being inherently best-effort (a notification the OS doesn't post, or the user swipes away before the listener processes it in some edge cases, is simply missed) — this is why notification ingestion is explicitly documented as an *event source*, never the reconciliation source of truth (CSV/bank statement import + user-entered actual balance fill that role).
- New provider support = new parser + tests, no architectural change.
- Requires the user to grant "Notification access" (a special, non-runtime-dialog Android permission) — documented step-by-step in `docs/ANDROID_SETUP.md` and `docs/MOTOROLA_SETUP.md`, including OEM battery-optimization pitfalls that can silently stop delivery.

## Rejected Alternatives
- **Direct Google Pay/PhonePe/Paytm API integration**: does not exist as a public, legitimately accessible API for this use case — rejected per Rule 6 (never silently invent external APIs).
- **Accessibility Service (reading screen content)**: technically possible but far more invasive (reads all on-screen content, not just notifications), a worse privacy posture, and against the "minimal data" principle — rejected in favor of the narrower `NotificationListenerService`.
- **SMS-based parsing**: many banks/UPI apps still send SMS confirmations; considered as an additional future source (would need `SMS` runtime permission, itself sensitive) but out of scope for V1 — noted in the roadmap.
