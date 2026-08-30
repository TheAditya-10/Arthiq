import type { PrismaClient } from "@arthiq/database";
import type { LoginInput, RegisterInput } from "@arthiq/validation";

import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import { generateRefreshToken, hashRefreshToken, refreshTtlMs } from "../lib/refreshToken.js";
import {
  createSession,
  findActiveSessionByHash,
  revokeSession,
} from "../repositories/session.repository.js";
import { createUser, findUserByEmail, findUserById } from "../repositories/user.repository.js";

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string };
}

async function issueTokens(
  prisma: PrismaClient,
  userId: string,
  email: string,
  displayName: string,
  userAgent?: string,
): Promise<AuthTokens> {
  const accessToken = await signAccessToken({ userId });
  const refreshToken = generateRefreshToken();
  await createSession(prisma, {
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    userAgent,
    expiresAt: new Date(Date.now() + refreshTtlMs()),
  });
  return { accessToken, refreshToken, user: { id: userId, email, displayName } };
}

export async function register(
  prisma: PrismaClient,
  input: RegisterInput,
  userAgent?: string,
): Promise<AuthTokens> {
  const existing = await findUserByEmail(prisma, input.email);
  if (existing) {
    throw new AuthError("An account with this email already exists", 409);
  }
  const { hash, salt } = await hashPassword(input.password);
  const user = await createUser(prisma, {
    email: input.email,
    passwordHash: hash,
    passwordSalt: salt,
    displayName: input.displayName,
  });
  return issueTokens(prisma, user.id, user.email, user.displayName, userAgent);
}

export async function login(
  prisma: PrismaClient,
  input: LoginInput,
  userAgent?: string,
): Promise<AuthTokens> {
  const user = await findUserByEmail(prisma, input.email);
  // Same error/timing shape whether the email doesn't exist or the password
  // is wrong — never reveal which one it was.
  if (!user || !user.passwordHash || !user.passwordSalt) {
    throw new AuthError("Invalid email or password", 401);
  }
  const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt);
  if (!valid) {
    throw new AuthError("Invalid email or password", 401);
  }
  return issueTokens(prisma, user.id, user.email, user.displayName, userAgent);
}

export async function refresh(
  prisma: PrismaClient,
  presentedRefreshToken: string,
  userAgent?: string,
): Promise<AuthTokens> {
  const tokenHash = hashRefreshToken(presentedRefreshToken);
  const session = await findActiveSessionByHash(prisma, tokenHash);
  if (!session) {
    throw new AuthError("Invalid or expired refresh token", 401);
  }
  // Rotate: the presented token is immediately revoked, whether or not the
  // rest of this call succeeds — a refresh token is single-use.
  await revokeSession(prisma, session.id);

  const user = await findUserById(prisma, session.userId);
  if (!user) {
    throw new AuthError("Invalid or expired refresh token", 401);
  }
  return issueTokens(prisma, user.id, user.email, user.displayName, userAgent);
}

export async function logout(prisma: PrismaClient, presentedRefreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(presentedRefreshToken);
  const session = await findActiveSessionByHash(prisma, tokenHash);
  if (session) {
    await revokeSession(prisma, session.id);
  }
}
