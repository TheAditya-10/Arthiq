import { describe, expect, it } from "vitest";
import { containsSecret } from "../sensitive.js";

describe("containsSecret", () => {
  it.each([
    "123456 is your OTP for login. Do not share it.",
    "Your OTP is 482913. Valid for 10 minutes.",
    "Use verification code 7391 to sign in",
    "G-482913 is your Google verification code",
    "One Time Password: 556677 for txn of Rs.500",
    "Your login PIN is 1234",
  ])("flags %s", (text) => {
    expect(containsSecret(text)).toBe(true);
  });

  it.each([
    "Rs.20.00 Dr. from A/C XXXXXX8457 and Cr. to q557889836@ybl. Ref:628054375910. AvlBal:Rs48788.89. Not you? Call 18005700/5000-BOB",
    "You paid ₹480 to Zomato.",
    "Never share your OTP, PIN or CVV with anyone. Rs 500 debited from A/C 1234.",
    "Hey, are we meeting at 5?",
  ])("does not flag %s", (text) => {
    expect(containsSecret(text)).toBe(false);
  });
});
