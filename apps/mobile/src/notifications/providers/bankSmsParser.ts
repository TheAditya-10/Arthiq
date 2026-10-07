import { NotificationProviderKey } from "@arthiq/types";
import type { NotificationProvider, ParsedTransaction, RawNotification } from "../types.js";

/**
 * Bank debit/credit SMS alerts, read from the notification the messaging app
 * posts. Works for any UPI app (the bank alert arrives regardless of which app
 * made the payment) and carries the real account. Deliberately strict: every
 * SMS notification from these apps is forwarded here, so anything that isn't
 * clearly a completed transaction alert (OTPs, chats, promos, payment
 * requests) must return null. Wire provider key is GENERIC_UPI.
 */
const AMOUNT = /(?:Rs\.?|INR|₹)\s?(?<amount>[\d,]+(?:\.\d{1,2})?)/i;
const BANK_MARKER =
  /\b(?:a\/c|acct?|account|upi|avl\.?\s*bal|available\s+bal(?:ance)?|ref(?:erence)?)\b/i;
const REJECT =
  /\b(?:otp|one[\s-]?time|password|request(?:s|ed)?|reminder|cashback|offer|reward|win|failed|declined|unsuccessful|pending|refund(?:ed)?|due|expires?|click|link)\b/i;
const DEBIT = /\b(?:dr|debited|debit|paid|sent|withdrawn|spent|transferred|trf)\b/i;
const CREDIT = /\b(?:cr|credited|received|deposited)\b/i;
const REFERENCE = /\bRef(?:erence)?\.?\s*(?:no\.?|number)?\s*[:-]?\s*(?<ref>\d{6,})/i;

const MERCHANT_DEBIT =
  /\b(?:Cr\.?\s+to|paid\s+to|sent\s+to|trf\s+to|transferred\s+to|credited\s+to|to)\s+(?<merchant>[A-Za-z0-9@._&' -]+?)(?=\.?\s+(?:Ref|UPI|on|via|from|Avl|Bal|Not|If|Call|-)\b|\.?\s*$)/i;
const MERCHANT_CREDIT_FROM =
  /\bfrom\s+(?<merchant>[A-Za-z0-9@._&' -]+?)(?=\.?\s+(?:Ref|UPI|on|via|to|Avl|Bal|Not|If|Call|-)\b|\.?\s*$)/i;
const MERCHANT_CREDIT_BY =
  /\bcredited\s+by\s+(?<merchant>[A-Za-z0-9@._&' -]+?)(?=\.?\s+(?:Ref|UPI|on|via|to|Avl|Bal|Not|If|Call|-)\b|\.?\s*$)/i;

function parseAmountMinor(raw: string): bigint {
  const [rupees = "0", paise = "0"] = raw.replace(/,/g, "").split(".");
  return BigInt(rupees) * 100n + BigInt(paise.padEnd(2, "0").slice(0, 2));
}

export const BankSmsParser: NotificationProvider = {
  key: NotificationProviderKey.GENERIC_UPI,
  packageNames: [
    "com.truecaller",
    "com.google.android.apps.messaging",
    "com.android.mms",
    "com.android.messaging",
    "com.samsung.android.messaging",
  ],
  parse(notification: RawNotification): ParsedTransaction | null {
    const combined = `${notification.title} ${notification.text}`.replace(/\s+/g, " ").trim();
    if (REJECT.test(combined) || !BANK_MARKER.test(combined)) return null;

    const amountMatch = AMOUNT.exec(combined);
    if (!amountMatch?.groups?.amount) return null;

    const debitAt = combined.search(DEBIT);
    const creditAt = combined.search(CREDIT);
    if (debitAt < 0 && creditAt < 0) return null;
    const isCredit = creditAt >= 0 && (debitAt < 0 || creditAt < debitAt);

    const merchantMatch = isCredit
      ? (MERCHANT_CREDIT_FROM.exec(combined) ?? MERCHANT_CREDIT_BY.exec(combined))
      : MERCHANT_DEBIT.exec(combined);
    const merchantRaw = merchantMatch?.groups?.merchant?.trim().replace(/\.$/, "");

    return {
      amountMinor: parseAmountMinor(amountMatch.groups.amount),
      direction: isCredit ? "CREDIT" : "DEBIT",
      merchantRaw: merchantRaw || undefined,
      occurredAt: new Date(notification.postTime),
      referenceId: REFERENCE.exec(combined)?.groups?.ref,
    };
  },
};
