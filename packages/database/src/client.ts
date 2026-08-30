import { PrismaClient } from "@prisma/client";

// Standard singleton pattern to avoid exhausting the connection pool from
// repeated module reloads in dev-mode watchers (tsx watch, Next.js dev).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
