import { NotificationProviderKey } from "@arthiq/types";
import { creditPatterns, debitPatterns, tryPatterns } from "../patternUtils.js";
import type { NotificationProvider, ParsedTransaction, RawNotification } from "../types.js";

/**
 * Fallback for any allow-listed-but-unmodeled payment app (docs/ADR/005 §
 * "GenericUPIParser"). Broader wording coverage than the named-provider
 * parsers, and requires the word "UPI" to appear somewhere in the
 * notification to reduce false-positive matches on unrelated apps a user
 * might enable here.
 */
const PATTERNS = [
  ...debitPatterns(["Paid", "You paid", "Sent", "Debited"]),
  ...creditPatterns(["Received", "You received", "Credited"]),
];

export const GenericUPIParser: NotificationProvider = {
  key: NotificationProviderKey.GENERIC_UPI,
  packageNames: [], // matched by user-enabled package list at runtime, not a fixed set
  parse(notification: RawNotification): ParsedTransaction | null {
    const combined = `${notification.title} ${notification.text}`;
    if (!/\bUPI\b/i.test(combined)) return null;
    return tryPatterns(notification, PATTERNS);
  },
};
