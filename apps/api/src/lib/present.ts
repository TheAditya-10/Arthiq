import { fromMinorUnits } from "@arthiq/types";

/**
 * Fastify's JSON serialization cannot handle BigInt — every route response
 * must convert *Minor bigint fields to rupee numbers via this helper before
 * calling reply.send(). This is the one place that conversion happens for
 * API responses (docs/ADR/002-database.md).
 */
export function presentAmounts<T extends Record<string, unknown>>(
  row: T,
  bigintFields: (keyof T)[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const field of bigintFields) {
    const value = row[field];
    if (typeof value === "bigint") {
      const key = String(field).replace(/Minor$/, "");
      out[key] = fromMinorUnits(value);
      delete out[field as string];
    }
  }
  return out;
}
