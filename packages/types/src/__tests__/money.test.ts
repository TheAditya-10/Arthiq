import { describe, expect, it } from "vitest";
import { formatMinorUnitsAsINR, fromMinorUnits, toMinorUnits } from "../money.js";

describe("toMinorUnits", () => {
  it("converts whole rupees to paise", () => {
    expect(toMinorUnits(480)).toBe(48_000n);
  });

  it("converts fractional rupees to paise without float drift", () => {
    // 480.1 * 100 === 48009.999999999993 in IEEE 754 — must round correctly.
    expect(toMinorUnits(480.1)).toBe(48_010n);
    expect(toMinorUnits(0.1)).toBe(10n);
    expect(toMinorUnits(19.99)).toBe(1_999n);
  });

  it("throws on non-finite input", () => {
    expect(() => toMinorUnits(Number.NaN)).toThrow(RangeError);
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("fromMinorUnits", () => {
  it("converts paise (bigint) back to rupees", () => {
    expect(fromMinorUnits(48_000n)).toBe(480);
    expect(fromMinorUnits(48_010n)).toBe(480.1);
  });

  it("accepts a plain number too", () => {
    expect(fromMinorUnits(1_999)).toBe(19.99);
  });

  it("round-trips through toMinorUnits", () => {
    expect(fromMinorUnits(toMinorUnits(1250))).toBe(1250);
    expect(fromMinorUnits(toMinorUnits(2000.5))).toBe(2000.5);
  });
});

describe("formatMinorUnitsAsINR", () => {
  it("formats as an INR currency string", () => {
    expect(formatMinorUnitsAsINR(1_250_00n)).toBe("₹1,250.00");
    expect(formatMinorUnitsAsINR(0n)).toBe("₹0.00");
  });
});
