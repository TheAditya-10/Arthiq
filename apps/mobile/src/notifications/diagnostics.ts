import type { RawNotification } from "./types.js";

export type DiagnosticOutcome =
  | "sent"
  | "duplicate"
  | "queued-send-failed"
  | "no-parser-match"
  | "no-account-mapped"
  | "dropped-sensitive";

/**
 * Outcomes where the notification was NOT recognised as a payment. For these
 * the content is never kept — not even in memory — so the list can't turn
 * into a log of someone's chats, OTPs or promotions. Only the sending app
 * and the outcome are shown.
 */
const CONTENT_NOT_KEPT: ReadonlySet<DiagnosticOutcome> = new Set([
  "no-parser-match",
  "dropped-sensitive",
]);

export interface DiagnosticEntry {
  at: number;
  packageName: string;
  title: string;
  text: string;
  outcome: DiagnosticOutcome;
  /** Failure reason for `queued-send-failed`. */
  detail?: string;
}

const MAX_ENTRIES = 15;
let entries: DiagnosticEntry[] = [];
const listeners = new Set<() => void>();

/**
 * In-memory only (never persisted) record of the last few notifications
 * from enabled payment apps and what became of each (content kept only for
 * ones recognised as payments, see CONTENT_NOT_KEPT). Exists so a user can
 * see why a payment wasn't captured instead of it vanishing silently; it is
 * cleared when the app process ends.
 */
export function recordDiagnostic(
  notification: RawNotification,
  outcome: DiagnosticOutcome,
  detail?: string,
): void {
  entries = [
    {
      at: Date.now(),
      packageName: notification.packageName,
      title: CONTENT_NOT_KEPT.has(outcome) ? "" : notification.title,
      text: CONTENT_NOT_KEPT.has(outcome) ? "" : notification.text,
      outcome,
      detail,
    },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  listeners.forEach((listener) => listener());
}

export function getDiagnostics(): DiagnosticEntry[] {
  return entries;
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
