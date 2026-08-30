import { SignJWT, jwtVerify } from "jose";

function getAccessSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set — see .env.example");
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  userId: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const ttl = process.env.JWT_ACCESS_TTL ?? "15m";
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(getAccessSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getAccessSecret());
  if (typeof payload.userId !== "string") {
    throw new Error("Malformed access token payload");
  }
  return { userId: payload.userId };
}
