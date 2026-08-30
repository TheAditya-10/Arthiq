import { NotificationProviderKey } from "@arthiq/types";
import { creditPatterns, debitPatterns, tryPatterns } from "../patternUtils.js";
import type { NotificationProvider, ParsedTransaction, RawNotification } from "../types.js";

const PATTERNS = [
  ...debitPatterns(["You paid", "Paid", "You sent", "Sent"]),
  ...creditPatterns(["You received", "Received", "Money received"]),
];

export const PhonePeParser: NotificationProvider = {
  key: NotificationProviderKey.PHONEPE,
  packageNames: ["com.phonepe.app"],
  parse(notification: RawNotification): ParsedTransaction | null {
    return tryPatterns(notification, PATTERNS);
  },
};
