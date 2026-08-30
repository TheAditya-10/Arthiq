import type { Person, PrismaClient } from "@arthiq/database";

export function listPeople(
  prisma: PrismaClient,
  userId: string,
  includeArchived = false,
): Promise<Person[]> {
  return prisma.person.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
  });
}

export function findPersonById(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Person | null> {
  return prisma.person.findFirst({ where: { id, userId } });
}

export function createPerson(
  prisma: PrismaClient,
  userId: string,
  data: { name: string; notes?: string },
): Promise<Person> {
  return prisma.person.create({ data: { ...data, userId } });
}

export function updatePerson(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: { name?: string; notes?: string },
): Promise<Person> {
  return prisma.person.update({ where: { id, userId }, data });
}

export function archivePerson(prisma: PrismaClient, userId: string, id: string): Promise<Person> {
  return prisma.person.update({ where: { id, userId }, data: { archivedAt: new Date() } });
}

/**
 * Outstanding balance formula (docs/DATABASE_DESIGN.md §"PeopleLedgerEntry"):
 *   receivable = Σ LENT − Σ REPAYMENT_RECEIVED
 *   payable    = Σ BORROWED − Σ REPAYMENT_MADE
 *   outstanding = receivable − payable   (positive = they owe the user)
 * Always computed from the ledger, never stored, so it can never drift.
 */
export async function getPersonBalance(
  prisma: PrismaClient,
  userId: string,
  personId: string,
): Promise<{ receivableMinor: bigint; payableMinor: bigint; outstandingMinor: bigint }> {
  const sums = await prisma.peopleLedgerEntry.groupBy({
    by: ["entryType"],
    where: { userId, personId },
    _sum: { amountMinor: true },
  });
  const byType = Object.fromEntries(sums.map((s) => [s.entryType, s._sum.amountMinor ?? 0n]));
  const lent = byType.LENT ?? 0n;
  const borrowed = byType.BORROWED ?? 0n;
  const repaymentReceived = byType.REPAYMENT_RECEIVED ?? 0n;
  const repaymentMade = byType.REPAYMENT_MADE ?? 0n;
  const receivableMinor = lent - repaymentReceived;
  const payableMinor = borrowed - repaymentMade;
  return { receivableMinor, payableMinor, outstandingMinor: receivableMinor - payableMinor };
}
