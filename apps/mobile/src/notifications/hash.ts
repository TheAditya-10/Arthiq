/**
 * A simple, fast, dependency-free string hash (FNV-1a, 32-bit) — used only
 * to fingerprint raw notification text for exact-duplicate detection
 * (NotificationSource.rawTextHash), never for anything security-sensitive.
 * Deliberately not Node's `crypto` module, which isn't available in the
 * React Native runtime without an extra native polyfill.
 */
export function createHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
