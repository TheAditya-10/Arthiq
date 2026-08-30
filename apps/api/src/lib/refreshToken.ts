import { createHash, randomBytes } from "node:crypto";

/** Opaque, high-entropy refresh token — never a JWT, never decodable, only comparable by hash. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTtlMs(): number {
  const ttl = process.env.JWT_REFRESH_TTL ?? "30d";
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as "s" | "m" | "h" | "d"
  ];
  return value * unitMs;
}
