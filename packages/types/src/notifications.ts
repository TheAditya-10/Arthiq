import type { Direction, NotificationProviderKey } from "./enums.js";

/**
 * The normalized shape a mobile notification parser produces, and the
 * shape the API's /notifications/ingest endpoint expects. Shared so the
 * mobile app and the API can never drift on this contract.
 * See docs/ADR/005-notification-ingestion.md and docs/MOBILE_ARCHITECTURE.md.
 */
export interface ParsedTransaction {
  /**
   * Notification text doesn't reliably identify which bank account a UPI
   * app drew from, so — same as CSV import's explicit accountId — the
   * client supplies it (from a per-provider account mapping the user sets
   * up, mirroring the provider-enable toggles in docs/MOBILE_ARCHITECTURE.md §5).
   */
  accountId: string;
  amountMinor: string; // bigint serialized as a string over the wire
  direction: Direction;
  merchantRaw?: string;
  occurredAt: string; // ISO 8601
  referenceId?: string;
  provider: NotificationProviderKey;
  sourcePackage: string;
  rawTextHash: string;
  /** Only present when the device has DEBUG_STORE_RAW_NOTIFICATIONS explicitly enabled. */
  rawText?: string;
}
