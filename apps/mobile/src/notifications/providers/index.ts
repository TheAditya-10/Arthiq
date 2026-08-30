import type { NotificationProvider, ParsedTransaction, RawNotification } from "../types.js";
import { GooglePayParser } from "./googlePayParser.js";
import { PhonePeParser } from "./phonePeParser.js";
import { PaytmParser } from "./paytmParser.js";
import { GenericUPIParser } from "./genericUpiParser.js";

export { GooglePayParser, PhonePeParser, PaytmParser, GenericUPIParser };

/** Named-provider parsers, matched by exact package name. GenericUPIParser is tried separately, only for packages the user has explicitly enabled but that don't match one of these. */
export const NAMED_PROVIDERS: NotificationProvider[] = [
  GooglePayParser,
  PhonePeParser,
  PaytmParser,
];

/**
 * Picks the right parser for a notification's package name and parses it.
 * Returns null if the package isn't a named provider and the generic
 * fallback also can't confidently extract a transaction — the caller
 * (dedup/sync layer) must already have filtered to enabled packages only,
 * per docs/MOBILE_ARCHITECTURE.md's privacy-by-filtering design.
 */
export function parseNotification(
  notification: RawNotification,
  options: { genericUpiEnabled: boolean } = { genericUpiEnabled: true },
): ParsedTransaction | null {
  const namedProvider = NAMED_PROVIDERS.find((p) =>
    p.packageNames.includes(notification.packageName),
  );
  if (namedProvider) return namedProvider.parse(notification);
  if (options.genericUpiEnabled) return GenericUPIParser.parse(notification);
  return null;
}
