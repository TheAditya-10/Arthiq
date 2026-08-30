import { NotificationProviderKey } from "@arthiq/types";
import { describe, expect, it } from "vitest";
import { createHash } from "../hash.js";
import type { ParsedTransaction } from "../types.js";
import { toWirePayload } from "../wireFormat.js";

function parsed(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    amountMinor: 48000n,
    direction: "DEBIT",
    merchantRaw: "Zomato",
    occurredAt: new Date("2026-08-20T10:00:00.000Z"),
    ...overrides,
  };
}

describe("toWirePayload", () => {
  it("converts the local bigint-amount shape to the wire shape, hashing the raw text", () => {
    const wire = toWirePayload(parsed(), {
      accountId: "11111111-1111-1111-1111-111111111111",
      provider: NotificationProviderKey.GOOGLE_PAY,
      sourcePackage: "com.google.android.apps.nbu.paisa.user",
      rawText: "Google Pay\nYou paid ₹480 to Zomato.",
      includeRawText: false,
    });

    expect(wire).toEqual({
      accountId: "11111111-1111-1111-1111-111111111111",
      amountMinor: "48000",
      direction: "DEBIT",
      merchantRaw: "Zomato",
      occurredAt: "2026-08-20T10:00:00.000Z",
      referenceId: undefined,
      provider: NotificationProviderKey.GOOGLE_PAY,
      sourcePackage: "com.google.android.apps.nbu.paisa.user",
      rawTextHash: createHash("Google Pay\nYou paid ₹480 to Zomato."),
      rawText: undefined,
    });
  });

  it("only includes rawText when includeRawText is true (debug-storage opt-in)", () => {
    const withRawText = toWirePayload(parsed(), {
      accountId: "11111111-1111-1111-1111-111111111111",
      provider: NotificationProviderKey.GOOGLE_PAY,
      sourcePackage: "com.google.android.apps.nbu.paisa.user",
      rawText: "secret raw text",
      includeRawText: true,
    });
    expect(withRawText.rawText).toBe("secret raw text");

    const withoutRawText = toWirePayload(parsed(), {
      accountId: "11111111-1111-1111-1111-111111111111",
      provider: NotificationProviderKey.GOOGLE_PAY,
      sourcePackage: "com.google.android.apps.nbu.paisa.user",
      rawText: "secret raw text",
      includeRawText: false,
    });
    expect(withoutRawText.rawText).toBeUndefined();
  });
});
