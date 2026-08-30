/**
 * Minimal, dependency-free CSV parser — handles quoted fields (with escaped
 * "" inside quotes), commas inside quotes, and both \n and \r\n line
 * endings, which covers the vast majority of real bank-statement exports.
 * Deliberately not a full RFC 4180 implementation (e.g. no embedded
 * newlines inside quoted fields) — sufficient for tabular bank statements,
 * and avoids taking on a new dependency for something this contained.
 */
export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.length > 0);
  return lines.map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

export interface SuggestedColumnMapping {
  date?: number;
  description?: number;
  amount?: number;
  direction?: number;
}

const HEADER_PATTERNS: { field: keyof SuggestedColumnMapping; patterns: RegExp[] }[] = [
  { field: "date", patterns: [/^date$/i, /txn.?date/i, /transaction.?date/i, /value.?date/i] },
  { field: "description", patterns: [/narration/i, /description/i, /particulars/i, /details/i] },
  { field: "amount", patterns: [/^amount$/i, /debit.?\/.?credit/i] },
  { field: "direction", patterns: [/^type$/i, /dr.?\/.?cr/i, /transaction.?type/i] },
];

/** Best-effort guess at which CSV column is which field, by header name. Never guaranteed — always shown to the user for confirmation before commit. */
export function guessColumnMapping(headers: string[]): SuggestedColumnMapping {
  const mapping: SuggestedColumnMapping = {};
  headers.forEach((header, index) => {
    for (const { field, patterns } of HEADER_PATTERNS) {
      if (mapping[field] !== undefined) continue;
      if (patterns.some((p) => p.test(header))) {
        mapping[field] = index;
      }
    }
  });
  return mapping;
}

/** Parses common bank-statement date formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. Falls back to Date.parse. */
export function parseCsvDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month <= 12 && day <= 31) return new Date(Date.UTC(year, month - 1, day));
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Parses a bank-statement amount cell: strips currency symbols/commas, treats parentheses as negative. */
export function parseCsvAmount(raw: string): number | null {
  let trimmed = raw.trim().replace(/[₹$,]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(trimmed)) {
    negative = true;
    trimmed = trimmed.slice(1, -1);
  }
  const value = Number.parseFloat(trimmed);
  if (Number.isNaN(value)) return null;
  return negative ? -Math.abs(value) : value;
}
