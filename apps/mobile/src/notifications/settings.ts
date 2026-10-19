import { NotificationProviderKey } from "@arthiq/types";
import type { KeyValueStorage } from "./dedupCache.js";
import type { AccountResolver } from "./pipeline.js";
import { BankSmsParser, GooglePayParser, PaytmParser, PhonePeParser } from "./providers/index.js";

const STORAGE_KEY = "arthiq.notificationSettings.v1";

/**
 * Which account each provider's notifications should be attributed to.
 * "Enabled" and "has a mapped account" are deliberately the same concept
 * here — ingest requires an accountId either way (see packages/types'
 * ParsedTransaction doc comment), so there's no useful state where a
 * provider is "enabled" but has nowhere to attribute its transactions to.
 * `null`/absent means disabled.
 */
export interface NotificationSettings {
  accountByProvider: Partial<Record<NotificationProviderKey, string>>;
  /** Extra package names (beyond the three named providers) the user has explicitly allow-listed for the generic UPI fallback parser — see docs/ADR/005's "extension point" note. */
  genericPackages: string[];
  /** Master switch: when true nothing is read, regardless of the per-app choices. */
  paused: boolean;
  /**
   * The user's acceptance of the in-app "what we read" disclosure
   * (screens/disclosure). Capture stays off until this exists for the CURRENT
   * disclosure version, so Notification access is never used on the strength
   * of the Android permission alone — Google Play requires prominent
   * disclosure and consent before sensitive data is accessed.
   */
  consent: { version: number; at: string } | null;
}

/** Bump when the disclosure text changes materially; users are asked again. */
export const DISCLOSURE_VERSION = 1;

export function hasValidConsent(settings: NotificationSettings): boolean {
  return settings.consent?.version === DISCLOSURE_VERSION;
}

export function defaultNotificationSettings(): NotificationSettings {
  return { accountByProvider: {}, genericPackages: [], paused: false, consent: null };
}

export async function loadNotificationSettings(
  storage: KeyValueStorage,
): Promise<NotificationSettings> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) return defaultNotificationSettings();
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      accountByProvider: parsed.accountByProvider ?? {},
      genericPackages: Array.isArray(parsed.genericPackages) ? parsed.genericPackages : [],
      paused: parsed.paused === true,
      consent:
        parsed.consent &&
        typeof parsed.consent.version === "number" &&
        typeof parsed.consent.at === "string"
          ? { version: parsed.consent.version, at: parsed.consent.at }
          : null,
    };
  } catch {
    return defaultNotificationSettings();
  }
}

export async function saveNotificationSettings(
  storage: KeyValueStorage,
  settings: NotificationSettings,
): Promise<void> {
  await storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** The package names the native listener should be allowed to forward, given the current settings. */
export function resolveEnabledPackages(settings: NotificationSettings): string[] {
  // Without consent, or while paused, the allow-list is empty, so the native
  // listener discards everything on arrival.
  if (settings.paused || !hasValidConsent(settings)) return [];
  const packages: string[] = [];
  if (settings.accountByProvider[NotificationProviderKey.GOOGLE_PAY]) {
    packages.push(...GooglePayParser.packageNames);
  }
  if (settings.accountByProvider[NotificationProviderKey.PHONEPE]) {
    packages.push(...PhonePeParser.packageNames);
  }
  if (settings.accountByProvider[NotificationProviderKey.PAYTM]) {
    packages.push(...PaytmParser.packageNames);
  }
  if (settings.accountByProvider[NotificationProviderKey.GENERIC_UPI]) {
    // GENERIC_UPI doubles as the "Bank SMS alerts" mapping in the UI.
    packages.push(...BankSmsParser.packageNames, ...settings.genericPackages);
  }
  return packages;
}

/** Builds the `AccountResolver` the notification pipeline needs, from the current settings. */
export function accountResolverFromSettings(settings: NotificationSettings): AccountResolver {
  return ({ provider }) => settings.accountByProvider[provider] ?? null;
}
