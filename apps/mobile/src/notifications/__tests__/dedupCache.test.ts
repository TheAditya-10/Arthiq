import { describe, expect, it } from "vitest";
import { DedupCache, computeLocalDedupHash } from "../dedupCache.js";
import type { ParsedTransaction } from "../types.js";
import { createInMemoryStorage } from "./testStorage.js";

function txn(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    amountMinor: 48000n,
    direction: "DEBIT",
    merchantRaw: "Zomato",
    occurredAt: new Date("2026-08-20T10:00:00Z"),
    ...overrides,
  };
}

describe("computeLocalDedupHash", () => {
  it("produces the same hash for the same transaction posted twice within the same minute", () => {
    const a = computeLocalDedupHash("com.google.android.apps.nbu.paisa.user", txn());
    const b = computeLocalDedupHash(
      "com.google.android.apps.nbu.paisa.user",
      txn({ occurredAt: new Date("2026-08-20T10:00:45Z") }),
    );
    expect(a).toBe(b);
  });

  it("produces different hashes for different amounts", () => {
    const a = computeLocalDedupHash("com.google.android.apps.nbu.paisa.user", txn());
    const b = computeLocalDedupHash(
      "com.google.android.apps.nbu.paisa.user",
      txn({ amountMinor: 50000n }),
    );
    expect(a).not.toBe(b);
  });
});

describe("DedupCache", () => {
  it("reports a hash as unseen until it is added, then seen", async () => {
    const cache = new DedupCache(createInMemoryStorage());
    const hash = computeLocalDedupHash("pkg", txn());
    expect(await cache.has(hash)).toBe(false);
    await cache.add(hash);
    expect(await cache.has(hash)).toBe(true);
  });

  it("persists across separate DedupCache instances sharing the same storage", async () => {
    const storage = createInMemoryStorage();
    const hash = computeLocalDedupHash("pkg", txn());
    await new DedupCache(storage).add(hash);
    const secondInstance = new DedupCache(storage);
    expect(await secondInstance.has(hash)).toBe(true);
  });

  it("caps the buffer size so it never grows without bound", async () => {
    const storage = createInMemoryStorage();
    const cache = new DedupCache(storage);
    for (let i = 0; i < 250; i++) {
      await cache.add(`hash-${i}`);
    }
    const raw = await storage.getItem("arthiq.notificationDedupCache.v1");
    const entries = JSON.parse(raw!);
    expect(entries.length).toBeLessThanOrEqual(200);
    // The oldest entries should have been evicted, newest retained.
    expect(entries).toContain("hash-249");
    expect(entries).not.toContain("hash-0");
  });
});
