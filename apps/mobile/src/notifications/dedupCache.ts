import type { ParsedTransaction } from "./types.js";

/** Minimal storage contract — satisfied by AsyncStorage on-device, an in-memory fake in tests. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const STORAGE_KEY = "arthiq.notificationDedupCache.v1";
const MAX_ENTRIES = 200;

/** Buckets to the nearest minute — handles the OS re-posting/updating the same notification within a short window. */
export function computeLocalDedupHash(packageName: string, parsed: ParsedTransaction): string {
  const bucketedMinute = Math.floor(parsed.occurredAt.getTime() / 60_000);
  return [
    packageName,
    parsed.direction,
    parsed.amountMinor.toString(),
    bucketedMinute,
    parsed.merchantRaw ?? "",
  ].join("|");
}

/**
 * A small ring buffer of recently-seen local dedup hashes, persisted across
 * app restarts. This is a device-local, best-effort duplicate filter for
 * the same notification being re-delivered — NOT the authoritative dedup
 * (that happens server-side, since only the server can see CSV imports and
 * other devices too). See docs/MOBILE_ARCHITECTURE.md §3.
 */
export class DedupCache {
  constructor(private readonly storage: KeyValueStorage) {}

  private async readEntries(): Promise<string[]> {
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async has(hash: string): Promise<boolean> {
    const entries = await this.readEntries();
    return entries.includes(hash);
  }

  async add(hash: string): Promise<void> {
    const entries = await this.readEntries();
    if (entries.includes(hash)) return;
    entries.push(hash);
    const trimmed =
      entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
}
