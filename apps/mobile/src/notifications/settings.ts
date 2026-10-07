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
}

export function defaultNotificationSettings(): NotificationSettings {
  return { accountByProvider: {}, genericPackages: [] };
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
