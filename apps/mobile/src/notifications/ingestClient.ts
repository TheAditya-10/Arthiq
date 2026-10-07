import type { ParsedTransaction as WireParsedTransaction } from "@arthiq/types";
import type { SendFn } from "./syncQueue.js";

export interface IngestClientOptions {
  /** e.g. `https://api.arthiq.app` — no trailing slash. */
  baseUrl: string;
  /**
   * Returns the current access token, or null if the user isn't signed in.
   * A getter rather than a fixed string so a token refreshed by the auth
   * layer (`src/auth/`, `src/api/client.ts`'s `ensureAccessToken`) is always
   * picked up without this client needing to know anything about how
   * refresh works.
   */
  getAccessToken: () => Promise<string | null>;
  /** Forces a token refresh; called once when the server answers 401 (access tokens are short-lived). */
  refreshAccessToken?: () => Promise<string | null>;
}

export interface IngestedTransaction {
  id: string;
  bucketId: string | null;
  subBucketId: string | null;
  amount: number;
  merchantRaw: string | null;
}

export interface IngestSendResult {
  ok: boolean;
  /** Why the send failed — shown in the diagnostics list. Absent when `ok`. */
  error?: string;
  dedupOutcome?: "NEW" | "DUPLICATE";
  transaction?: IngestedTransaction | null;
}

/**
 * The real sender for a parsed notification, split into two shapes for two
 * different callers (see docs/MOBILE_ARCHITECTURE.md §3's flow diagram,
 * "bucket/sub-bucket/confidence come back in the ingest response"):
 *
 * - `send` — `Promise<boolean>`, the shape `SyncQueue` needs for its
 *   durable-retry bookkeeping (it only cares whether to advance or stop).
 * - `sendRich` — the full parsed response, which `NotificationPipeline`
 *   uses for the immediate/online path so it can show a local
 *   "Correct/Change" notification with the actual classification result,
 *   something a bare boolean can't carry.
 *
 * A network error, missing token, or non-2xx all collapse to `{ ok: false }`
 * — the caller's job either way is "retry later," not to distinguish why.
 */
export function createIngestSendFn(options: IngestClientOptions): {
  send: SendFn;
  sendRich: (payload: WireParsedTransaction) => Promise<IngestSendResult>;
} {
  const post = (token: string, payload: WireParsedTransaction) =>
    fetch(`${options.baseUrl}/notifications/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Client": "mobile",
      },
      body: JSON.stringify(payload),
    });

  const sendRich = async (payload: WireParsedTransaction): Promise<IngestSendResult> => {
    let token = await options.getAccessToken();
    if (!token) return { ok: false, error: "not signed in (no access token)" };

    try {
      let response = await post(token, payload);
      if (response.status === 401 && options.refreshAccessToken) {
        token = await options.refreshAccessToken();
        if (!token) return { ok: false, error: "session expired — sign in again" };
        response = await post(token, payload);
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return { ok: false, error: `HTTP ${response.status} ${detail.slice(0, 160)}`.trim() };
      }

      const body = (await response.json().catch(() => null)) as {
        dedupOutcome?: "NEW" | "DUPLICATE";
        transaction?: IngestedTransaction | null;
      } | null;
      return { ok: true, dedupOutcome: body?.dedupOutcome, transaction: body?.transaction };
    } catch (err) {
      return { ok: false, error: `network: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  return {
    sendRich,
    send: async (payload) => (await sendRich(payload)).ok,
  };
}
