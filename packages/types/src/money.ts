/**
 * Money is always an integer count of paise (INR's smallest unit) once it
 * crosses into storage or calculation code — see docs/ADR/002-database.md.
 * These are the only two functions allowed to convert between that and a
 * human-facing rupee amount; nothing else in the codebase should do ad hoc
 * `* 100` / `/ 100` arithmetic.
 */

/** Rupees (as a user would type them, e.g. 480.5) -> integer paise. */
export function toMinorUnits(rupees: number): bigint {
  if (!Number.isFinite(rupees)) {
    throw new RangeError(`toMinorUnits: amount must be a finite number, got ${rupees}`);
  }
  // Round at the paisa boundary before converting to avoid float drift
  // (e.g. 480.1 * 100 === 48009.999999999993 in IEEE 754).
  return BigInt(Math.round(rupees * 100));
}

/** Integer paise -> rupees, for display only. */
export function fromMinorUnits(paise: bigint | number): number {
  const value = typeof paise === "bigint" ? Number(paise) : paise;
  return value / 100;
}

/** Formats integer paise as an INR display string, e.g. "₹1,250.00". */
export function formatMinorUnitsAsINR(paise: bigint | number): string {
  const rupees = fromMinorUnits(paise);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(rupees);
}
