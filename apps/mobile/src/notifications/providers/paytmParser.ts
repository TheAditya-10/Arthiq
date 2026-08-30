import { NotificationProviderKey } from "@arthiq/types";
import { creditPatterns, debitPatterns, tryPatterns } from "../patternUtils.js";
import type { NotificationProvider, ParsedTransaction, RawNotification } from "../types.js";

const PATTERNS = [
  ...debitPatterns(["Paid", "You paid", "Sent"]),
  ...creditPatterns(["Received", "You have received", "You received"]),
];

export const PaytmParser: NotificationProvider = {
  key: NotificationProviderKey.PAYTM,
  packageNames: ["net.one97.paytm"],
  parse(notification: RawNotification): ParsedTransaction | null {
    return tryPatterns(notification, PATTERNS);
  },
};
