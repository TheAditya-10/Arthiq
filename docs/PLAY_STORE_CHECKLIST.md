# Play Store & Public-Release Checklist

Everything Google Play (and Indian law) expects before Arth-IQ is published, mapped to where it lives in this repo. Items marked **YOU** need a human decision or an account only the operator has.

## 1. Before you build the release

- [ ] **Release keystore** — generated at `~/.arthiq-signing/arthiq-release.keystore`; credentials in `~/.arthiq-signing/signing.env`. **Back both up somewhere safe (password manager + offline copy). Losing the key means you can never update the app under the same listing.** Prefer _Play App Signing_: upload this as the _upload key_, and Google holds the real app-signing key.
- [ ] Build with `source ~/.arthiq-signing/signing.env` so the release APK/AAB isn't debug-signed. (See `build-apk-howto` memory / `plugins/withReleaseSigning.js`.)
- [ ] Build an **AAB** (`./gradlew bundleRelease`) for Play; APKs are for sideloading only.
- [ ] Set `EXPO_PUBLIC_WEB_URL` (public website base URL) so in-app legal links appear.
- [ ] **YOU** Set the web env vars: `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_GRIEVANCE_OFFICER`, `NEXT_PUBLIC_OPERATOR_ADDRESS`. The pages show obvious `[placeholder]` text until you do — do not publish with placeholders.
- [ ] **YOU** Read the Privacy Policy and Terms (`apps/web/src/app/(legal)`), correct anything that doesn't match reality (e.g. whether `AI_PROVIDER_API_KEY` is set in production, the 48 h / 30 day grievance timelines — only promise what you'll do), and have a lawyer check them against the DPDP Act, 2023.
- [ ] Production env: `NODE_ENV=production` (HSTS), `CORS_ALLOWED_ORIGINS` set to the real web origin only.
- [ ] `DEBUG_STORE_RAW_NOTIFICATIONS` must be off in every release build.

## 2. Play Console declarations

**Privacy policy URL** → `https://<web-url>/privacy`.
**Account deletion URL** (required for apps with accounts) → `https://<web-url>/delete-account`. In-app deletion: Settings → Delete account.

### Data safety form (answers that match the code)

| Question                        | Answer                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collects personal info?         | Yes — email address, name                                                                                                                                                                                                               |
| Collects financial info?        | Yes — "other financial info" (transactions, account balances the user enters) and "user payment info" is **No** (no card/bank credentials)                                                                                              |
| Collects messages?              | **Declare** "SMS or MMS"/"other in-app messages" cautiously: notification text is parsed on-device and only extracted fields leave the phone. Review Google's current wording; when in doubt, declare it and explain in the description |
| Data shared with third parties? | No (hosting/database processors don't count as sharing). If the optional AI categoriser is enabled: merchant name, amount, direction and category names go to Anthropic — declare accordingly                                           |
| Data encrypted in transit?      | Yes (HTTPS)                                                                                                                                                                                                                             |
| Users can request deletion?     | Yes — in-app and web page above                                                                                                                                                                                                         |
| Data used for ads / sold?       | No                                                                                                                                                                                                                                      |
| Purpose                         | App functionality, account management (not advertising, not analytics)                                                                                                                                                                  |

### Permissions & sensitive access

- **Manifest permissions**: `INTERNET`, `POST_NOTIFICATIONS`, plus the `BIND_NOTIFICATION_LISTENER_SERVICE` service. No `READ_SMS`, `RECEIVE_SMS`, contacts, call-log, location or accessibility.
- **Notification access justification (use in review notes)**: "Core feature. Reads notifications only from payment apps and bank-alert messages the user explicitly enables, to log UPI payments. Shows a prominent in-app disclosure and requires consent before enabling. Drops OTPs. Only amount/direction/merchant/time/reference leave the device."
- **Financial features declaration**: select _"Personal finance management / tracking"_; not a bank, loan, payments or trading app; no money movement.

### Review materials to prepare

- [ ] **Demo video** (30–60 s, unlisted YouTube): fresh install → sign up → the prominent disclosure screen → Agree → Android Notification access toggle → a payment captured → Settings: "What Arth-IQ reads", Pause, Download data, Delete account. Reviewers frequently ask for this.
- [ ] A **test account** (email + password) for reviewers, with sample data.
- [ ] Screenshots, feature graphic, short and full description — state plainly that it tracks expenses by reading notifications you enable.
- [ ] Use **internal testing → closed testing (≥ 12 testers for 14 days, if your account type requires it) → production**.

## 3. What the app already does for trust

| Promise (in disclosure, policy and `/trust`) | Where enforced                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Only the apps you enable are read            | Native allow-list, `NotificationSettingsContext` → `resolveEnabledPackages`                             |
| Nothing read before consent / while paused   | `hasValidConsent`, `paused` in `notifications/settings.ts`                                              |
| OTPs/codes dropped instantly                 | `notifications/sensitive.ts`, first step of `pipeline.handle`                                           |
| Message text never kept for non-payments     | `diagnostics.ts` (`CONTENT_NOT_KEPT`)                                                                   |
| Only parsed fields leave the phone           | `wireFormat.ts` (`includeRawText` off)                                                                  |
| Export everything                            | `GET /users/me/export`                                                                                  |
| Delete everything                            | `DELETE /users/me` (password-confirmed, cascade)                                                        |
| Secure transport & hardening                 | HTTPS, headers hook in `apps/api/src/app.ts`, scrypt, rotating refresh tokens in Android secure storage |

## 4. Play Protect / sideloading notes

- A sideloaded APK may still show "unrecognised app" until it has install reputation; Play distribution, a real signing key (done) and a consistent package id (`dev.arthiq.app`) are what reduce this.
- Don't add Accessibility Service, `READ_SMS`, `SYSTEM_ALERT_WINDOW`, or "install packages" permissions — each invites heavy scrutiny.
- Keep `targetSdkVersion` current (Expo's default per SDK; check Play's yearly deadline).

## 5. Later hardening

- Independent security review; publish a short summary on `/trust`.
- 2FA / passkeys; email verification and password reset (not in V1).
- Open-source `modules/notification-listener` + `notifications/` so users can audit what leaves the phone.
- Local-first mode (server sync optional).
- Breach-response runbook (DPDP Act requires notifying the Board and affected users).
