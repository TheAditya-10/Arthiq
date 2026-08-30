import { NotificationProviderKey } from "@arthiq/types";
import type { ParsedTransaction as WireParsedTransaction } from "@arthiq/types";
import { describe, expect, it } from "vitest";
import { SyncQueue } from "../syncQueue.js";
import { createInMemoryStorage } from "./testStorage.js";

function payload(overrides: Partial<WireParsedTransaction> = {}): WireParsedTransaction {
  return {
    amountMinor: "48000",
    direction: "DEBIT",
    merchantRaw: "Zomato",
    occurredAt: "2026-08-20T10:00:00.000Z",
    provider: NotificationProviderKey.GOOGLE_PAY,
    sourcePackage: "com.google.android.apps.nbu.paisa.user",
    rawTextHash: "abcd1234",
    ...overrides,
  };
}

describe("SyncQueue", () => {
  it("enqueues and flushes successfully, leaving nothing queued", async () => {
    const queue = new SyncQueue(createInMemoryStorage(), async () => true);
    await queue.enqueue(payload());
    expect(await queue.size()).toBe(1);

    const result = await queue.flush();
    expect(result).toEqual({ sent: 1, remaining: 0 });
    expect(await queue.size()).toBe(0);
  });

  it("stops at the first failure and keeps the rest queued for the next flush", async () => {
    let callCount = 0;
    const queue = new SyncQueue(createInMemoryStorage(), async () => {
      callCount += 1;
      return callCount === 1; // first succeeds, second (simulating offline) fails
    });
    await queue.enqueue(payload({ merchantRaw: "First" }));
    await queue.enqueue(payload({ merchantRaw: "Second" }));
    await queue.enqueue(payload({ merchantRaw: "Third" }));

    const result = await queue.flush();
    expect(result).toEqual({ sent: 1, remaining: 2 });
    expect(await queue.size()).toBe(2);
  });

  it("survives a thrown network error without losing the queue", async () => {
    const queue = new SyncQueue(createInMemoryStorage(), async () => {
      throw new Error("network down");
    });
    await queue.enqueue(payload());
    const result = await queue.flush();
    expect(result).toEqual({ sent: 0, remaining: 1 });
    expect(await queue.size()).toBe(1);
  });

  it("persists the queue across separate SyncQueue instances sharing the same storage", async () => {
    const storage = createInMemoryStorage();
    await new SyncQueue(storage, async () => false).enqueue(payload());
    const secondInstance = new SyncQueue(storage, async () => true);
    expect(await secondInstance.size()).toBe(1);
    await secondInstance.flush();
    expect(await secondInstance.size()).toBe(0);
  });

  it("retrying a later flush succeeds once connectivity is back", async () => {
    const storage = createInMemoryStorage();
    let online = false;
    const queue = new SyncQueue(storage, async () => online);
    await queue.enqueue(payload());

    const offlineAttempt = await queue.flush();
    expect(offlineAttempt.remaining).toBe(1);

    online = true;
    const onlineAttempt = await queue.flush();
    expect(onlineAttempt).toEqual({ sent: 1, remaining: 0 });
  });
});
