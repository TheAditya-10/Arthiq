import { describe, expect, it } from "vitest";
import {
  buildTransactionCapturedContent,
  TRANSACTION_CAPTURED_CATEGORY,
} from "../notificationContent.js";

describe("buildTransactionCapturedContent", () => {
  it("builds a title/body/data payload for a NEW ingest with a transaction", () => {
    const content = buildTransactionCapturedContent({
      ok: true,
      dedupOutcome: "NEW",
      transaction: {
        id: "txn-1",
        bucketId: "b1",
        subBucketId: null,
        amount: 480,
        merchantRaw: "Zomato",
      },
    });
    expect(content).toEqual({
      title: "Transaction captured",
      body: "₹480.00 at Zomato",
      data: { transactionId: "txn-1" },
      categoryIdentifier: TRANSACTION_CAPTURED_CATEGORY,
    });
  });

  it("omits the merchant clause when there's no merchant", () => {
    const content = buildTransactionCapturedContent({
      ok: true,
      dedupOutcome: "NEW",
      transaction: {
        id: "txn-1",
        bucketId: null,
        subBucketId: null,
        amount: 5000,
        merchantRaw: null,
      },
    });
    expect(content?.body).toBe("₹5000.00");
  });

  it("returns null when the send failed", () => {
    expect(buildTransactionCapturedContent({ ok: false })).toBeNull();
  });

  it("returns null for a DUPLICATE outcome — nothing new happened", () => {
    expect(
      buildTransactionCapturedContent({
        ok: true,
        dedupOutcome: "DUPLICATE",
        transaction: null,
      }),
    ).toBeNull();
  });

  it("returns null when ok but no transaction is present", () => {
    expect(buildTransactionCapturedContent({ ok: true, dedupOutcome: "NEW" })).toBeNull();
  });
});
