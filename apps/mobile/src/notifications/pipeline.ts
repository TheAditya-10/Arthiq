import type {
  NotificationProviderKey,
  ParsedTransaction as WireParsedTransaction,
} from "@arthiq/types";
import { recordDiagnostic } from "./diagnostics.js";
import { computeLocalDedupHash, DedupCache, type KeyValueStorage } from "./dedupCache.js";
import type { IngestSendResult } from "./ingestClient.js";
import { resolveNotificationProvider } from "./providers/index.js";
import { SyncQueue } from "./syncQueue.js";
import type { RawNotification } from "./types.js";
import { toWirePayload } from "./wireFormat.js";

/**
 * Maps a notification's provider/package to the account the user has told
 * the app that provider draws from — notification text doesn't reliably
 * state this (see packages/types' ParsedTransaction doc comment). Returns
 * null when the user hasn't configured a mapping yet (Phase 13's Settings
 * screen), in which case the notification is dropped rather than guessed at.
 */
export type AccountResolver = (info: {
  provider: NotificationProviderKey;
  sourcePackage: string;
}) => string | null;

/** Matches expo-modules-core's `EventSubscription` structurally, without importing that package here — see the `subscribe` option below. */
export interface ListenerSubscription {
  remove(): void;
}

export interface NotificationPipelineOptions {
  storage: KeyValueStorage;
  /** The rich sender (`ingestClient.ts`'s `createIngestSendFn().sendRich`) — used directly for the immediate/online path, and adapted into `SyncQueue`'s boolean `SendFn` for the offline-retry path. */
  sendRich: (payload: WireParsedTransaction) => Promise<IngestSendResult>;
  resolveAccountId: AccountResolver;
  /**
   * Fired after a successful *immediate* send (not a later queued retry) —
   * this is what drives the local "Correct/Change" notification
   * (docs/MOBILE_ARCHITECTURE.md §3), since only the immediate path has a
   * moment worth notifying about and a classification result to show.
   */
  onIngested?: (result: IngestSendResult) => void;
  /**
   * Starts the native listener and returns a subscription. Injected rather
   * than importing `modules/notification-listener` directly, so this class
   * — the actually-testable orchestration logic — has no dependency on a
   * native module that only exists inside an Android runtime. The real app
   * wiring passes `addNotificationListener` from that module; tests pass a
   * fake that calls the listener with recorded sample notifications.
   */
  subscribe: (listener: (notification: RawNotification) => void) => ListenerSubscription;
  /** Only true on a debug build with DEBUG_STORE_RAW_NOTIFICATIONS explicitly enabled — see docs/ADR/005. */
  includeRawText?: boolean;
  genericUpiEnabled?: boolean;
}

/**
 * Wires together every piece built in Phases 10-12: the native listener
 * (Phase 11) posts a raw notification, a provider parser (Phase 10) turns it
 * into a `ParsedTransaction`, the local dedup cache (Phase 10) drops re-posts
 * of the same notification, and the sync queue (Phase 10) durably delivers
 * it to `POST /notifications/ingest` (Phase 12). See docs/MOBILE_ARCHITECTURE.md §3
 * for the full flow this class implements end to end.
 */
export class NotificationPipeline {
  private readonly dedupCache: DedupCache;
  private readonly syncQueue: SyncQueue;
  private subscription: ListenerSubscription | null = null;

  constructor(private readonly options: NotificationPipelineOptions) {
    this.dedupCache = new DedupCache(options.storage);
    this.syncQueue = new SyncQueue(
      options.storage,
      async (payload) => (await options.sendRich(payload)).ok,
    );
  }

  /** Starts listening for native notification events. No-op if already started. */
  start(): void {
    if (this.subscription) return;
    this.subscription = this.options.subscribe((notification) => {
      void this.handle(notification);
    });
  }

  /** Stops listening. The sync queue keeps whatever was already persisted. */
  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }

  /**
   * Processes a single raw notification through parse -> dedup -> resolve
   * account -> send. Tries an immediate direct send first (the common
   * online case — no storage round-trip needed, and it's the only path
   * that can drive `onIngested`'s local notification with a real
   * classification result); only falls back to the persisted `SyncQueue`
   * when that immediate send fails, e.g. offline. Exposed directly (not
   * just via `start`'s event subscription) so it's unit-testable without a
   * native listener.
   */
  async handle(notification: RawNotification): Promise<{ sent: number; remaining: number } | null> {
    const provider = resolveNotificationProvider(notification.packageName, {
      genericUpiEnabled: this.options.genericUpiEnabled ?? true,
    });
    if (!provider) return null;

    const parsed = provider.parse(notification);
    if (!parsed) {
      recordDiagnostic(notification, "no-parser-match");
      return null;
    }

    const localHash = computeLocalDedupHash(notification.packageName, parsed);
    if (await this.dedupCache.has(localHash)) {
      recordDiagnostic(notification, "duplicate");
      return null;
    }

    const accountId = this.options.resolveAccountId({
      provider: provider.key,
      sourcePackage: notification.packageName,
    });
    if (!accountId) {
      recordDiagnostic(notification, "no-account-mapped");
      return null;
    }

    await this.dedupCache.add(localHash);

    const payload = toWirePayload(parsed, {
      accountId,
      provider: provider.key,
      sourcePackage: notification.packageName,
      rawText: `${notification.title}\n${notification.text}`,
      includeRawText: this.options.includeRawText ?? false,
    });

    const result = await this.options.sendRich(payload);
    recordDiagnostic(notification, result.ok ? "sent" : "queued-send-failed");
    if (result.ok) {
      this.options.onIngested?.(result);
      return { sent: 1, remaining: await this.syncQueue.size() };
    }

    await this.syncQueue.enqueue(payload);
    return this.syncQueue.flush();
  }

  /** Retries whatever's queued — call on app foreground / connectivity-restored. */
  flush(): Promise<{ sent: number; remaining: number }> {
    return this.syncQueue.flush();
  }

  queueSize(): Promise<number> {
    return this.syncQueue.size();
  }
}
