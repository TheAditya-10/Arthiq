import type { PrismaClient, User } from "@arthiq/database";

/**
 * Repository functions for User. Note that user lookup by email/id here is
 * intentionally NOT userId-scoped the way every other repository in this
 * codebase must be (see docs/ARCHITECTURE.md §3) — a User repository's
 * whole job is finding/creating the user record itself, which is what
 * establishes userId in the first place. Every OTHER repository (accounts,
 * transactions, etc.) takes userId as a required parameter; this one is
 * the deliberate, documented exception at the root of the auth flow.
 */

export function findUserByEmail(prisma: PrismaClient, email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(prisma: PrismaClient, id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function createUser(
  prisma: PrismaClient,
  data: { email: string; passwordHash: string; passwordSalt: string; displayName: string },
): Promise<User> {
  return prisma.user.create({ data });
}

export function updateUser(
  prisma: PrismaClient,
  userId: string,
  data: { displayName?: string; timezone?: string },
): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data });
}

/** Hard-deletes a user and (via onDelete: Cascade in the schema) everything they own. */
export function deleteUser(prisma: PrismaClient, userId: string): Promise<User> {
  return prisma.user.delete({ where: { id: userId } });
}
