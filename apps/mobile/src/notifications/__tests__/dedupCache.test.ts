import { describe, expect, it } from "vitest";
import {
  DedupCache,
  computeDedupFingerprint,
  isSamePayment,
  type DedupFingerprint,
} from "../dedupCache.js";
import type { ParsedTransaction, RawNotification } from "../types.js";
import { createInMemoryStorage } from "./testStorage.js";

const GPAY = "com.google.android.apps.nbu.paisa.user";
const SMS = "com.google.android.apps.messaging";
const T0 = Date.UTC(2026, 7, 20, 10, 0, 0);

function fp(
  overrides: Partial<ParsedTransaction> = {},
  notification: Partial<RawNotification> = {},
): DedupFingerprint {
  return computeDedupFingerprint(
    {
      packageName: GPAY,
      title: "Google Pay",
      text: "You paid ₹480 to Zomato.",
      postTime: T0,
      ...notification,
    },
    {
      amountMinor: 48000n,
      direction: "DEBIT",
      merchantRaw: "Zomato",
      occurredAt: new Date(T0),
      ...overrides,
    },
  );
}

describe("isSamePayment", () => {
  it("matches the UPI app's notification and the bank SMS for the same payment", () => {
    const app = fp();
    const sms = fp(
      {
        merchantRaw: "zomato@okicici",
        occurredAt: new Date(T0 + 40_000),
        referenceId: "612345678901",
      },
      {
        packageName: SMS,
        title: "AX-HDFCBK",
        text: "Rs 480.00 debited from a/c **1234 to VPA zomato@okicici",
      },
    );
    expect(isSamePayment(app, sms)).toBe(true);
  });

  it("matches across a minute boundary", () => {
    expect(isSamePayment(fp(), fp({ occurredAt: new Date(T0 - 5_000) }))).toBe(true);
  });

  it("does not match different amounts or directions", () => {
    expect(
      isSamePayment(fp(), fp({ amountMinor: 50000n }, { text: "You paid ₹500 to Zomato." })),
    ).toBe(false);
    expect(isSamePayment(fp(), fp({ direction: "CREDIT" }, { text: "You received ₹480." }))).toBe(
      false,
    );
  });

  it("does not match the same amount once it's outside the window", () => {
    expect(
      isSamePayment(
        fp(),
        fp({ occurredAt: new Date(T0 + 10 * 60_000) }, { text: "₹480 paid to Swiggy" }),
      ),
    ).toBe(false);
  });

  it("treats two different reference numbers as two payments even seconds apart", () => {
    const a = fp({ referenceId: "111" }, { packageName: SMS, text: "Rs 480 debited Ref 111" });
    const b = fp(
      { referenceId: "222", occurredAt: new Date(T0 + 20_000) },
      { packageName: SMS, text: "Rs 480 debited Ref 222" },
    );
    expect(isSamePayment(a, b)).toBe(false);
  });

  it("treats an identical re-post from the same app as a duplicate for longer than the amount window", () => {
    expect(isSamePayment(fp(), fp({ occurredAt: new Date(T0 + 10 * 60_000) }))).toBe(true);
  });
});

describe("DedupCache", () => {
  it("reports a payment as unseen until it is added, then seen", async () => {
    const cache = new DedupCache(createInMemoryStorage());
    expect(await cache.has(fp())).toBe(false);
    await cache.add(fp());
    expect(await cache.has(fp())).toBe(true);
  });

  it("persists across separate DedupCache instances sharing the same storage", async () => {
    const storage = createInMemoryStorage();
    await new DedupCache(storage).add(fp());
    expect(await new DedupCache(storage).has(fp())).toBe(true);
  });

  it("caps the buffer size so it never grows without bound", async () => {
    const storage = createInMemoryStorage();
    const cache = new DedupCache(storage);
    for (let i = 0; i < 250; i++) {
      await cache.add(fp({ amountMinor: BigInt(i + 1) }, { text: `paid ${i}` }));
    }
    const entries = JSON.parse((await storage.getItem("arthiq.notificationDedupCache.v2"))!);
    expect(entries.length).toBeLessThanOrEqual(200);
    // The oldest entries should have been evicted, newest retained.
    expect(await cache.has(fp({ amountMinor: 250n }, { text: "paid 249" }))).toBe(true);
    expect(await cache.has(fp({ amountMinor: 1n }, { text: "paid 0" }))).toBe(false);
  });
});
