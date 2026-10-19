import { createHash } from "./hash.js";
import type { ParsedTransaction, RawNotification } from "./types.js";

/** Minimal storage contract — satisfied by AsyncStorage on-device, an in-memory fake in tests. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const STORAGE_KEY = "arthiq.notificationDedupCache.v2";
const MAX_ENTRIES = 200;

/**
 * One payment usually produces several notifications: the UPI app's, the
 * bank's SMS (shown by the SMS app's notification), sometimes a second one
 * from the same app a few seconds later. Their merchant text rarely matches
 * ("Paid to ZOMATO" vs "VPA zomato@okicici"), so amount + direction within
 * this window is what identifies them as the same payment.
 */
export const SAME_PAYMENT_WINDOW_MS = 3 * 60_000;
/** An identical notification re-posted by the same app (an update, a re-delivery) is a duplicate for this long. */
export const SAME_TEXT_WINDOW_MS = 30 * 60_000;
/** Matching UPI/bank reference numbers mean the same payment regardless of timing. */
const SAME_REFERENCE_WINDOW_MS = 24 * 60 * 60_000;

export interface DedupFingerprint {
  packageName: string;
  amountMinor: string;
  direction: ParsedTransaction["direction"];
  at: number;
  referenceId?: string;
  textHash: string;
}

export function computeDedupFingerprint(
  notification: RawNotification,
  parsed: ParsedTransaction,
): DedupFingerprint {
  return {
    packageName: notification.packageName,
    amountMinor: parsed.amountMinor.toString(),
    direction: parsed.direction,
    at: parsed.occurredAt.getTime(),
    referenceId: parsed.referenceId || undefined,
    textHash: createHash(`${notification.title}\n${notification.text}`),
  };
}

/** Whether two fingerprints describe the same real payment. */
export function isSamePayment(a: DedupFingerprint, b: DedupFingerprint): boolean {
  const gap = Math.abs(a.at - b.at);
  if (a.packageName === b.packageName && a.textHash === b.textHash && gap <= SAME_TEXT_WINDOW_MS) {
    return true;
  }
  if (a.amountMinor !== b.amountMinor || a.direction !== b.direction) return false;
  if (a.referenceId && b.referenceId) {
    // Two different reference numbers are two different payments, even if
    // they're for the same amount a minute apart.
    return a.referenceId === b.referenceId && gap <= SAME_REFERENCE_WINDOW_MS;
  }
  return gap <= SAME_PAYMENT_WINDOW_MS;
}

/**
 * A small ring buffer of recently-seen payment fingerprints, persisted
 * across app restarts and shared by the foreground and headless pipelines.
 * This is the device-local duplicate filter for the same payment arriving
 * through several notifications — the server still runs its own dedup
 * (only it can see CSV imports and manual entries). See
 * docs/MOBILE_ARCHITECTURE.md §3.
 */
export class DedupCache {
  constructor(private readonly storage: KeyValueStorage) {}

  private async readEntries(): Promise<DedupFingerprint[]> {
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async has(fingerprint: DedupFingerprint): Promise<boolean> {
    const entries = await this.readEntries();
    return entries.some((entry) => isSamePayment(entry, fingerprint));
  }

  async add(fingerprint: DedupFingerprint): Promise<void> {
    const entries = await this.readEntries();
    entries.push(fingerprint);
    const trimmed =
      entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
}
