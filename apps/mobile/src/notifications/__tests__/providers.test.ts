import { describe, expect, it } from "vitest";
import { GenericUPIParser } from "../providers/genericUpiParser.js";
import { GooglePayParser } from "../providers/googlePayParser.js";
import { parseNotification } from "../providers/index.js";
import { PaytmParser } from "../providers/paytmParser.js";
import { PhonePeParser } from "../providers/phonePeParser.js";
import type { RawNotification } from "../types.js";

function raw(packageName: string, title: string, text: string): RawNotification {
  return { packageName, title, text, postTime: Date.UTC(2026, 7, 20, 10, 0, 0) };
}

describe("GooglePayParser", () => {
  it("parses a debit — 'You paid' wording", () => {
    const result = GooglePayParser.parse(
      raw("com.google.android.apps.nbu.paisa.user", "Google Pay", "You paid ₹480 to Zomato."),
    );
    expect(result).toMatchObject({
      amountMinor: 48000n,
      direction: "DEBIT",
      merchantRaw: "Zomato",
    });
  });

  it("parses a debit — shorter 'Paid' wording variant", () => {
    const result = GooglePayParser.parse(
      raw(
        "com.google.android.apps.nbu.paisa.user",
        "Payment sent",
        "Paid Rs.1,250.50 to Croma Retail.",
      ),
    );
    expect(result).toMatchObject({
      amountMinor: 125050n,
      direction: "DEBIT",
      merchantRaw: "Croma Retail",
    });
  });

  it("parses a credit — 'You received' wording", () => {
    const result = GooglePayParser.parse(
      raw(
        "com.google.android.apps.nbu.paisa.user",
        "Money received",
        "You received ₹2,000 from Rahul.",
      ),
    );
    expect(result).toMatchObject({
      amountMinor: 200000n,
      direction: "CREDIT",
      merchantRaw: "Rahul",
    });
  });

  it("extracts a UPI reference number when present", () => {
    const result = GooglePayParser.parse(
      raw(
        "com.google.android.apps.nbu.paisa.user",
        "Google Pay",
        "You paid ₹480 to Zomato. UPI Ref No: 123456789012",
      ),
    );
    expect(result?.referenceId).toBe("123456789012");
  });

  it("returns null for an unrelated notification", () => {
    const result = GooglePayParser.parse(
      raw(
        "com.google.android.apps.nbu.paisa.user",
        "Google Pay",
        "Your weekly spending summary is ready.",
      ),
    );
    expect(result).toBeNull();
  });
});

describe("PhonePeParser", () => {
  it("parses a debit — 'Paid' wording", () => {
    const result = PhonePeParser.parse(
      raw("com.phonepe.app", "PhonePe", "Paid ₹350 to Swiggy via PhonePe."),
    );
    expect(result).toMatchObject({
      amountMinor: 35000n,
      direction: "DEBIT",
      merchantRaw: "Swiggy",
    });
  });

  it("parses a debit — 'You sent' wording variant", () => {
    const result = PhonePeParser.parse(
      raw("com.phonepe.app", "Payment", "You sent Rs.99 to Amit Kumar."),
    );
    expect(result).toMatchObject({
      amountMinor: 9900n,
      direction: "DEBIT",
      merchantRaw: "Amit Kumar",
    });
  });

  it("parses a credit — 'Money received' wording", () => {
    const result = PhonePeParser.parse(
      raw("com.phonepe.app", "PhonePe", "Money received ₹500 from Priya in your PhonePe account."),
    );
    expect(result).toMatchObject({
      amountMinor: 50000n,
      direction: "CREDIT",
      merchantRaw: "Priya",
    });
  });
});

describe("PaytmParser", () => {
  it("parses a debit — 'Paid' wording with Rs. prefix", () => {
    const result = PaytmParser.parse(
      raw("net.one97.paytm", "Paytm", "Paid Rs.480.00 to Zomato successfully."),
    );
    expect(result).toMatchObject({
      amountMinor: 48000n,
      direction: "DEBIT",
      merchantRaw: "Zomato",
    });
  });

  it("parses a credit — 'You have received' wording", () => {
    const result = PaytmParser.parse(
      raw("net.one97.paytm", "Paytm", "You have received Rs.1000 from Anjali."),
    );
    expect(result).toMatchObject({
      amountMinor: 100000n,
      direction: "CREDIT",
      merchantRaw: "Anjali",
    });
  });
});

describe("GenericUPIParser", () => {
  it("requires the word UPI to be present, to avoid false positives on unrelated apps", () => {
    const withoutUpi = GenericUPIParser.parse(
      raw("com.somebank.app", "Bank Alert", "Paid ₹500 to Store."),
    );
    expect(withoutUpi).toBeNull();

    const withUpi = GenericUPIParser.parse(
      raw("com.somebank.app", "UPI Alert", "Paid ₹500 to Store via UPI."),
    );
    expect(withUpi).toMatchObject({ amountMinor: 50000n, direction: "DEBIT" });
  });
});

describe("parseNotification (provider dispatch)", () => {
  it("routes to the correct named provider by package name", () => {
    const result = parseNotification(raw("com.phonepe.app", "PhonePe", "Paid ₹100 to Cafe."));
    expect(result).toMatchObject({ amountMinor: 10000n, direction: "DEBIT" });
  });

  it("falls back to the generic UPI parser for an unrecognized-but-enabled package", () => {
    const result = parseNotification(
      raw("com.unknownupi.app", "Payment", "Paid ₹200 to Store via UPI."),
      {
        genericUpiEnabled: true,
      },
    );
    expect(result).toMatchObject({ amountMinor: 20000n });
  });

  it("does not fall back when the generic UPI parser is disabled", () => {
    const result = parseNotification(
      raw("com.unknownupi.app", "Payment", "Paid ₹200 to Store via UPI."),
      {
        genericUpiEnabled: false,
      },
    );
    expect(result).toBeNull();
  });
});

describe("loose fallback parsing (wording the exact patterns don't cover)", () => {
  const paytm = (title: string, text: string) =>
    PaytmParser.parse(raw("net.one97.paytm", title, text));

  it("parses amount-first wording", () => {
    const result = paytm("Payment Successful", "₹250 paid to Swiggy via UPI");
    expect(result?.amountMinor).toBe(25000n);
    expect(result?.direction).toBe("DEBIT");
    expect(result?.merchantRaw).toBe("Swiggy");
  });

  it("parses a credit with the amount before the verb", () => {
    const result = paytm("Paytm", "Rs 1,200.50 received from Rahul Sharma");
    expect(result?.amountMinor).toBe(120050n);
    expect(result?.direction).toBe("CREDIT");
  });

  it("rejects payment requests, promos and failures", () => {
    expect(paytm("Paytm", "Rahul requested ₹500 from you")).toBeNull();
    expect(paytm("Paytm", "Get ₹100 cashback when you paid your bill")).toBeNull();
    expect(paytm("Paytm", "Payment of ₹300 failed")).toBeNull();
  });

  it("rejects text with no amount", () => {
    expect(paytm("Paytm", "You paid a visit to your wallet")).toBeNull();
  });
});
