import type { RawNotification } from "./types.js";

/**
 * Detects notifications that carry a secret the app must never keep or send:
 * one-time passcodes, verification codes, PINs and passwords. Because "Bank
 * SMS alerts" forwards every notification from the messaging app, this runs
 * BEFORE parsing, dedup, diagnostics, storage and networking, so a matching
 * message is dropped on the spot and its text is never retained anywhere.
 *
 * A bare keyword match is not enough: legitimate bank debit alerts often
 * end with "never share your OTP/PIN with anyone". The secret is only
 * considered present when a numeric code sits right next to the keyword.
 */
const KEYWORD = String.raw`(?:otp|one[\s-]?time(?:\s+(?:password|passcode|pin))?|verification\s+code|security\s+code|passcode|login\s+code|auth(?:entication)?\s+code|cvv|pin|password)`;
const CODE = String.raw`\b[A-Z0-9]?\d{4,8}\b`;
const KEYWORD_THEN_CODE = new RegExp(`${KEYWORD}[^.\\n]{0,40}?${CODE}`, "i");
const CODE_THEN_KEYWORD = new RegExp(`${CODE}[^.\\n]{0,40}?${KEYWORD}`, "i");

export function containsSecret(text: string): boolean {
  return KEYWORD_THEN_CODE.test(text) || CODE_THEN_KEYWORD.test(text);
}

export function isSensitiveNotification(notification: RawNotification): boolean {
  return containsSecret(notification.title) || containsSecret(notification.text);
}
