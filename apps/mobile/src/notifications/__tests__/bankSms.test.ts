import { describe, expect, it } from "vitest";
import { BankSmsParser } from "../providers/bankSmsParser.js";
import { resolveNotificationProvider } from "../providers/index.js";

const sms = (title: string, text: string) =>
  BankSmsParser.parse({
    packageName: "com.truecaller",
    title,
    text,
    postTime: Date.UTC(2026, 9, 7, 9, 0, 0),
  });

describe("BankSmsParser", () => {
  it("parses a Bank-of-Baroda style 'Dr. from A/C ... Cr. to' debit", () => {
    const r = sms(
      "Bank of Baroda",
      "Rs.2.00 Dr. from A/C XXXXXX0057 and Cr. to someone128@okhdfcbank. Ref:628012345678. AvlBal:Rs120.50",
    );
    expect(r).toMatchObject({
      amountMinor: 200n,
      direction: "DEBIT",
      merchantRaw: "someone128@okhdfcbank",
      referenceId: "628012345678",
    });
  });

  it("parses a 'debited for ... credited to' debit", () => {
    const r = sms(
      "HDFC Bank",
      "Your a/c no. XX0057 is debited for Rs.450.00 on 07-10-26 and credited to a/c Zomato (UPI Ref no 628011111111).",
    );
    expect(r).toMatchObject({ amountMinor: 45000n, direction: "DEBIT" });
  });

  it("parses a credit", () => {
    const r = sms(
      "SBI",
      "Rs 1,200.50 credited to your A/C XX0057 by UPI from Rahul Sharma. Ref 628099999999",
    );
    expect(r).toMatchObject({
      amountMinor: 120050n,
      direction: "CREDIT",
      merchantRaw: "Rahul Sharma",
    });
  });

  it("rejects OTPs, requests, promos and chats", () => {
    expect(sms("Bank", "123456 is your OTP for Rs.500 payment to A/C XX0057")).toBeNull();
    expect(sms("Rahul", "Rahul requested Rs.500 from you on UPI")).toBeNull();
    expect(sms("Offer", "Get Rs.100 cashback on your A/C when you pay by UPI")).toBeNull();
    expect(sms("Friend", "I paid 500 for dinner, send me Rs 250")).toBeNull();
  });

  it("is chosen for messaging-app packages", () => {
    expect(resolveNotificationProvider("com.truecaller")).toBe(BankSmsParser);
  });
});
