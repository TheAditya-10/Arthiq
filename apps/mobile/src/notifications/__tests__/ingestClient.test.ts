import { NotificationProviderKey } from "@arthiq/types";
import type { ParsedTransaction as WireParsedTransaction } from "@arthiq/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIngestSendFn } from "../ingestClient.js";

function payload(): WireParsedTransaction {
  return {
    accountId: "11111111-1111-1111-1111-111111111111",
    amountMinor: "48000",
    direction: "DEBIT",
    merchantRaw: "Zomato",
    occurredAt: "2026-08-20T10:00:00.000Z",
    provider: NotificationProviderKey.GOOGLE_PAY,
    sourcePackage: "com.google.android.apps.nbu.paisa.user",
    rawTextHash: "abcd1234",
  };
}

describe("createIngestSendFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns not-ok without making a request when there's no access token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { send, sendRich } = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => null,
    });

    expect(await sendRich(payload())).toMatchObject({ ok: false });
    expect(await send(payload())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to /notifications/ingest with a bearer token and the mobile client header, returning the parsed result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dedupOutcome: "NEW",
        transaction: { id: "txn-1", bucketId: "b1", subBucketId: null, amount: 480 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { send, sendRich } = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => "token123",
    });

    expect(await send(payload())).toBe(true);
    const result = await sendRich(payload());
    expect(result).toEqual({
      ok: true,
      dedupOutcome: "NEW",
      transaction: { id: "txn-1", bucketId: "b1", subBucketId: null, amount: 480 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.arthiq.app/notifications/ingest",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token123",
          "X-Client": "mobile",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      accountId: "11111111-1111-1111-1111-111111111111",
      amountMinor: "48000",
    });
  });

  it("returns not-ok on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const { send, sendRich } = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => "token123",
    });

    expect(await send(payload())).toBe(false);
    expect(await sendRich(payload())).toMatchObject({ ok: false });
  });

  it("returns not-ok, without throwing, on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network request failed")));
    const { sendRich } = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => "token123",
    });

    expect(await sendRich(payload())).toMatchObject({ ok: false });
  });

  it("refreshes the token and retries once when the server answers 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ dedupOutcome: "NEW" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { sendRich } = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => "stale",
      refreshAccessToken: async () => "fresh",
    });

    expect(await sendRich(payload())).toMatchObject({ ok: true, dedupOutcome: "NEW" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1].headers.Authorization).toBe("Bearer fresh");
  });
});
