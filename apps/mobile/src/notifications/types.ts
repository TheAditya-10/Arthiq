import type { NotificationProviderKey } from "@arthiq/types";

/** Raw payload bridged from the native Kotlin listener — see modules/notification-listener. */
export interface RawNotification {
  packageName: string;
  title: string;
  text: string;
  postTime: number; // epoch millis
}

export interface ParsedTransaction {
  amountMinor: bigint;
  direction: "DEBIT" | "CREDIT";
  merchantRaw?: string;
  occurredAt: Date;
  referenceId?: string;
}

/**
 * One parser per provider. A pure function: string in, structured data or
 * null out — unit-testable with recorded sample strings, no device or
 * emulator required. See docs/ADR/005-notification-ingestion.md.
 */
export interface NotificationProvider {
  key: NotificationProviderKey;
  /** Package names this parser is responsible for. */
  packageNames: string[];
  parse(notification: RawNotification): ParsedTransaction | null;
}
