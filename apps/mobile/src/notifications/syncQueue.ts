import type { ParsedTransaction as WireParsedTransaction } from "@arthiq/types";
import type { KeyValueStorage } from "./dedupCache.js";

/** Local-only id for queue bookkeeping — not `crypto.randomUUID()`, whose availability across React Native/Hermes versions isn't guaranteed without a device to verify against. */
function generateLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface QueuedIngestItem {
  id: string;
  payload: WireParsedTransaction;
  attempts: number;
  createdAt: number;
}

export type SendFn = (payload: WireParsedTransaction) => Promise<boolean>;

const STORAGE_KEY = "arthiq.notificationSyncQueue.v1";

/**
 * Persists queued /notifications/ingest payloads to disk so an app kill
 * doesn't lose them, and retries in order with a simple stop-on-first-
 * failure policy (if the network is down, every subsequent send in this
 * flush would fail too — no point burning attempts on all of them; the
 * next flush trigger, e.g. connectivity restored, tries again from the
 * front). See docs/MOBILE_ARCHITECTURE.md §3.
 */
export class SyncQueue {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly send: SendFn,
  ) {}

  private async readQueue(): Promise<QueuedIngestItem[]> {
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeQueue(queue: QueuedIngestItem[]): Promise<void> {
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }

  async enqueue(payload: WireParsedTransaction): Promise<void> {
    const queue = await this.readQueue();
    queue.push({ id: generateLocalId(), payload, attempts: 0, createdAt: Date.now() });
    await this.writeQueue(queue);
  }

  async size(): Promise<number> {
    return (await this.readQueue()).length;
  }

  /** Attempts to send every queued item in order; stops at the first failure. Returns how many were sent successfully and how many remain. */
  async flush(): Promise<{ sent: number; remaining: number }> {
    const queue = await this.readQueue();
    let sent = 0;
    let i = 0;
    for (; i < queue.length; i++) {
      const item = queue[i]!;
      let succeeded: boolean;
      try {
        succeeded = await this.send(item.payload);
      } catch {
        succeeded = false;
      }
      if (!succeeded) {
        item.attempts += 1;
        break;
      }
      sent += 1;
    }
    const remaining = queue.slice(i);
    await this.writeQueue(remaining);
    return { sent, remaining: remaining.length };
  }
}
