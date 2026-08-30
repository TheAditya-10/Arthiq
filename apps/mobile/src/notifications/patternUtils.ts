import type { ParsedTransaction, RawNotification } from "./types.js";

/**
 * A single candidate pattern: matches on the combined "title text" string,
 * with named capture groups `amount` and `merchant`. Multiple patterns per
 * provider are tried in order so a minor wording change (e.g. "paid to" ->
 * "sent to") only requires adding one more pattern here, never rewriting
 * the parser — see docs/ADR/005-notification-ingestion.md.
 */
export interface NotificationPattern {
  regex: RegExp;
  direction: "DEBIT" | "CREDIT";
}

const AMOUNT = String.raw`(?:Rs\.?|INR|₹)\s?(?<amount>[\d,]+(?:\.\d{1,2})?)`;
const MERCHANT = String.raw`(?<merchant>[A-Za-z0-9 &.'_-]+?)`;
// Stops the merchant capture before common trailing qualifiers that
// providers append after the merchant name (discovered via real sample
// wording, not guessed — see docs/ADR/005 on refining patterns from actual
// notification text), as well as at a sentence-ending period or the end
// of the string.
const TERMINATOR = String.raw`(?=\s+(?:via|successfully|using|in\s+your)\b|[.\n]|$)`;

/** Builds the standard "paid ... to <merchant>" family of patterns for a DEBIT. */
export function debitPatterns(verbs: string[]): NotificationPattern[] {
  return verbs.map((verb) => ({
    regex: new RegExp(`${verb}\\s+${AMOUNT}\\s+to\\s+${MERCHANT}${TERMINATOR}`, "i"),
    direction: "DEBIT",
  }));
}

/** Builds the standard "received ... from <merchant>" family of patterns for a CREDIT. */
export function creditPatterns(verbs: string[]): NotificationPattern[] {
  return verbs.map((verb) => ({
    regex: new RegExp(`${verb}\\s+${AMOUNT}\\s+from\\s+${MERCHANT}${TERMINATOR}`, "i"),
    direction: "CREDIT",
  }));
}

function parseAmountString(raw: string): bigint {
  const cleaned = raw.replace(/,/g, "");
  const [rupees = "0", paise = "0"] = cleaned.split(".");
  const paisePadded = paise.padEnd(2, "0").slice(0, 2);
  return BigInt(rupees) * 100n + BigInt(paisePadded);
}

const REFERENCE_PATTERN = /\b(?:UPI\s*Ref(?:erence)?(?:\s*No\.?)?|Txn\s*ID)[:\s]*([A-Za-z0-9]+)/i;

/** Tries each pattern in order against the notification's title+text; returns the first match. */
export function tryPatterns(
  notification: RawNotification,
  patterns: NotificationPattern[],
): ParsedTransaction | null {
  const combined = `${notification.title} ${notification.text}`.replace(/\s+/g, " ").trim();

  for (const pattern of patterns) {
    const match = pattern.regex.exec(combined);
    if (!match?.groups?.amount) continue;

    const amountMinor = parseAmountString(match.groups.amount);
    const merchantRaw = match.groups.merchant?.trim();
    const referenceMatch = REFERENCE_PATTERN.exec(combined);

    return {
      amountMinor,
      direction: pattern.direction,
      merchantRaw: merchantRaw || undefined,
      occurredAt: new Date(notification.postTime),
      referenceId: referenceMatch?.[1],
    };
  }

  return null;
}
