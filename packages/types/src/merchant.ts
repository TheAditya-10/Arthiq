/**
 * Uppercases, strips punctuation/legal suffixes and reference-number noise.
 * Shared by the classification engine (merchant-rule/historical lookups) and
 * the API's deduplication hashing — both need the exact same normalization
 * or a merchant could silently classify differently than it dedups.
 * See docs/CLASSIFICATION_ENGINE.md §3.
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC)\b\.?/g, "")
    .replace(/\bUPI\/?[A-Z0-9]*\b/g, "")
    .replace(/\bREF\.?\s*(NO)?\.?\s*[A-Z0-9]+\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
