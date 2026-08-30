import type {
  NotificationProviderKey,
  ParsedTransaction as WireParsedTransaction,
} from "@arthiq/types";
import { createHash } from "./hash.js";
import type { ParsedTransaction } from "./types.js";

/** Converts a parser's local (bigint-amount) result into the wire shape POST /notifications/ingest expects. */
export function toWirePayload(
  parsed: ParsedTransaction,
  meta: {
    provider: NotificationProviderKey;
    sourcePackage: string;
    rawText: string;
    includeRawText: boolean;
  },
): WireParsedTransaction {
  return {
    amountMinor: parsed.amountMinor.toString(),
    direction: parsed.direction,
    merchantRaw: parsed.merchantRaw,
    occurredAt: parsed.occurredAt.toISOString(),
    referenceId: parsed.referenceId,
    provider: meta.provider,
    sourcePackage: meta.sourcePackage,
    rawTextHash: createHash(meta.rawText),
    rawText: meta.includeRawText ? meta.rawText : undefined,
  };
}
