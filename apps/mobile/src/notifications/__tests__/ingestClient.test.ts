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

  it("returns false without making a request when there's no access token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const send = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => null,
    });

    const result = await send(payload());
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to /notifications/ingest with a bearer token and the mobile client header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const send = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => "token123",
    });

    const result = await send(payload());
    expect(result).toBe(true);
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

  it("returns false on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const send = createIngestSendFn({
      baseUrl: "https://api.arthiq.app",
      getAccessToken: async () => "token123",
    });

    expect(await send(payload())).toBe(false);
  });
});
