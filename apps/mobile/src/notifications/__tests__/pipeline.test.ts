import { describe, expect, it } from "vitest";
import { NotificationPipeline, type ListenerSubscription } from "../pipeline.js";
import type { RawNotification } from "../types.js";
import { createInMemoryStorage } from "./testStorage.js";

function raw(packageName: string, title: string, text: string): RawNotification {
  return { packageName, title, text, postTime: Date.UTC(2026, 7, 20, 10, 0, 0) };
}

const GPAY_DEBIT = raw(
  "com.google.android.apps.nbu.paisa.user",
  "Google Pay",
  "You paid ₹480 to Zomato.",
);

function fakeSubscribe(): {
  subscribe: (listener: (n: RawNotification) => void) => ListenerSubscription;
  emit: (n: RawNotification) => void;
  removed: boolean;
} {
  let currentListener: ((n: RawNotification) => void) | null = null;
  const state = {
    subscribe: (listener: (n: RawNotification) => void) => {
      currentListener = listener;
      return { remove: () => (state.removed = true) };
    },
    emit: (n: RawNotification) => currentListener?.(n),
    removed: false,
  };
  return state;
}

describe("NotificationPipeline.handle", () => {
  it("parses and sends a valid notification immediately when an account is mapped, firing onIngested", async () => {
    const sent: unknown[] = [];
    const ingested: unknown[] = [];
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async (payload) => {
        sent.push(payload);
        return { ok: true, dedupOutcome: "NEW", transaction: { id: "txn-1" } as never };
      },
      onIngested: (result) => ingested.push(result),
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
    });

    const result = await pipeline.handle(GPAY_DEBIT);
    expect(result).toEqual({ sent: 1, remaining: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      accountId: "11111111-1111-1111-1111-111111111111",
      amountMinor: "48000",
      direction: "DEBIT",
      provider: "GOOGLE_PAY",
    });
    expect(ingested).toHaveLength(1);
    expect(await pipeline.queueSize()).toBe(0);
  });

  it("falls back to the persisted queue when the immediate send fails, without firing onIngested", async () => {
    let ingestedCount = 0;
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async () => ({ ok: false }),
      onIngested: () => ingestedCount++,
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
    });

    const result = await pipeline.handle(GPAY_DEBIT);
    expect(result).toEqual({ sent: 0, remaining: 1 });
    expect(ingestedCount).toBe(0);
    expect(await pipeline.queueSize()).toBe(1);
  });

  it("drops the notification when no account is mapped for that provider yet", async () => {
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async () => ({ ok: true }),
      resolveAccountId: () => null,
      subscribe: () => ({ remove: () => {} }),
    });

    const result = await pipeline.handle(GPAY_DEBIT);
    expect(result).toBeNull();
    expect(await pipeline.queueSize()).toBe(0);
  });

  it("drops a notification from an unparseable/unallowed package without enqueueing", async () => {
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async () => ({ ok: true }),
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
      genericUpiEnabled: false,
    });

    const result = await pipeline.handle(raw("com.somebank.app", "Alert", "Not a UPI message."));
    expect(result).toBeNull();
  });

  it("does not re-send a notification already seen (local dedup cache)", async () => {
    const storage = createInMemoryStorage();
    let sendCount = 0;
    const pipeline = new NotificationPipeline({
      storage,
      sendRich: async () => {
        sendCount += 1;
        return { ok: true };
      },
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
    });

    await pipeline.handle(GPAY_DEBIT);
    const second = await pipeline.handle(GPAY_DEBIT);
    expect(second).toBeNull();
    expect(sendCount).toBe(1);
  });

  it("sends once when two notifications for the same payment arrive at the same moment", async () => {
    let sendCount = 0;
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async () => {
        sendCount += 1;
        return { ok: true };
      },
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
    });

    const results = await Promise.all([pipeline.handle(GPAY_DEBIT), pipeline.handle(GPAY_DEBIT)]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(sendCount).toBe(1);
  });

  it("sends once when the UPI app and the bank SMS both report the same payment", async () => {
    let sendCount = 0;
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async () => {
        sendCount += 1;
        return { ok: true };
      },
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
    });

    await pipeline.handle(GPAY_DEBIT);
    const sms = await pipeline.handle({
      packageName: "com.google.android.apps.messaging",
      title: "AX-HDFCBK",
      text: "Rs 480.00 debited from A/c XX1234 on 20-08-26 to VPA zomato@okicici. UPI Ref 612345678901",
      postTime: GPAY_DEBIT.postTime + 45_000,
    });
    expect(sms).toBeNull();
    expect(sendCount).toBe(1);
  });

  it("never checks account mapping or sends for a duplicate — the dedup check runs before account resolution", async () => {
    let resolveCalls = 0;
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async () => ({ ok: true }),
      resolveAccountId: () => {
        resolveCalls += 1;
        return "11111111-1111-1111-1111-111111111111";
      },
      subscribe: () => ({ remove: () => {} }),
    });

    await pipeline.handle(GPAY_DEBIT);
    await pipeline.handle(GPAY_DEBIT);
    expect(resolveCalls).toBe(1);
  });

  it("start() subscribes to the injected listener and routes emitted notifications through handle", async () => {
    const fake = fakeSubscribe();
    const sent: unknown[] = [];
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async (payload) => {
        sent.push(payload);
        return { ok: true };
      },
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: fake.subscribe,
    });

    pipeline.start();
    fake.emit(GPAY_DEBIT);
    // handle() runs asynchronously (fire-and-forget from the listener callback).
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(1);

    pipeline.stop();
    expect(fake.removed).toBe(true);
  });
});

describe("NotificationPipeline sensitive-content handling", () => {
  it("drops OTP messages before parsing, sending or keeping their text", async () => {
    const { getDiagnostics } = await import("../diagnostics.js");
    const sent: unknown[] = [];
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async (payload) => {
        sent.push(payload);
        return { ok: true };
      },
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
    });

    await pipeline.handle(
      raw("com.google.android.apps.messaging", "JM-HDFCBK", "482913 is your OTP for Rs.500 txn"),
    );

    expect(sent).toHaveLength(0);
    const latest = getDiagnostics()[0];
    expect(latest?.outcome).toBe("dropped-sensitive");
    expect(latest?.text).toBe("");
    expect(JSON.stringify(getDiagnostics())).not.toContain("482913");
  });

  it("keeps no content for notifications that are not payments", async () => {
    const { getDiagnostics } = await import("../diagnostics.js");
    const pipeline = new NotificationPipeline({
      storage: createInMemoryStorage(),
      sendRich: async () => ({ ok: true }),
      resolveAccountId: () => "11111111-1111-1111-1111-111111111111",
      subscribe: () => ({ remove: () => {} }),
    });
    await pipeline.handle(
      raw("com.google.android.apps.messaging", "Friend", "see you at 5, bring the keys"),
    );
    const latest = getDiagnostics()[0];
    expect(latest?.outcome).toBe("no-parser-match");
    expect(latest?.text).toBe("");
    expect(latest?.title).toBe("");
  });
});
