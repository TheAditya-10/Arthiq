import type { ParsedTransaction as WireParsedTransaction } from "@arthiq/types";
import type { SendFn } from "./syncQueue.js";

export interface IngestClientOptions {
  /** e.g. `https://api.arthiq.app` — no trailing slash. */
  baseUrl: string;
  /**
   * Returns the current access token, or null if the user isn't signed in.
   * A getter rather than a fixed string so a token refreshed by the auth
   * layer (Phase 13's `src/auth/`, not yet built) is always picked up
   * without this client needing to know anything about how refresh works.
   */
  getAccessToken: () => Promise<string | null>;
}

/**
 * Builds the real `SyncQueue` `SendFn` that POSTs a parsed notification to
 * `/notifications/ingest`. Deliberately a plain `fetch` call rather than a
 * shared typed API client (apps/web's `src/lib/api.ts` pattern) — that
 * client's auto-refresh-on-401 machinery is tied to browser cookies and
 * doesn't apply here, and this endpoint's contract is a single POST with no
 * response shape the sync queue needs to inspect beyond ok/not-ok. `SyncQueue`
 * only needs `Promise<boolean>` (see docs/MOBILE_ARCHITECTURE.md §3): `true`
 * lets it advance to the next queued item, `false` (no token, network error,
 * 4xx/5xx) stops the flush and leaves this item queued for the next retry.
 */
export function createIngestSendFn(options: IngestClientOptions): SendFn {
  return async (payload: WireParsedTransaction): Promise<boolean> => {
    const token = await options.getAccessToken();
    if (!token) return false;

    const response = await fetch(`${options.baseUrl}/notifications/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Client": "mobile",
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  };
}
