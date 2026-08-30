import { NotificationProviderKey } from "@arthiq/types";
import { creditPatterns, debitPatterns, tryPatterns } from "../patternUtils.js";
import type { NotificationProvider, ParsedTransaction, RawNotification } from "../types.js";

const PATTERNS = [
  ...debitPatterns(["You paid", "Paid"]),
  ...creditPatterns(["You received", "Received"]),
];

export const GooglePayParser: NotificationProvider = {
  key: NotificationProviderKey.GOOGLE_PAY,
  packageNames: ["com.google.android.apps.nbu.paisa.user"],
  parse(notification: RawNotification): ParsedTransaction | null {
    return tryPatterns(notification, PATTERNS);
  },
};
