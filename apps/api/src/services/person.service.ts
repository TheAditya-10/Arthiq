import type { Person, PrismaClient } from "@arthiq/database";
import { fromMinorUnits } from "@arthiq/types";
import type { UpdatePersonInput } from "@arthiq/validation";

import {
  archivePerson,
  createPerson,
  findPersonById,
  getPersonBalance,
  listPeople,
  updatePerson,
} from "../repositories/person.repository.js";
import { NotFoundError } from "../lib/errors.js";

export const getPeople = listPeople;

export async function requirePerson(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Person> {
  const person = await findPersonById(prisma, userId, id);
  if (!person) throw new NotFoundError("Person");
  return person;
}

export const addPerson = createPerson;

export async function editPerson(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: UpdatePersonInput,
): Promise<Person> {
  await requirePerson(prisma, userId, id);
  return updatePerson(prisma, userId, id, input);
}

export async function removePerson(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<Person> {
  await requirePerson(prisma, userId, id);
  return archivePerson(prisma, userId, id);
}

export async function getPersonWithBalance(prisma: PrismaClient, userId: string, id: string) {
  const person = await requirePerson(prisma, userId, id);
  const { receivableMinor, payableMinor, outstandingMinor } = await getPersonBalance(
    prisma,
    userId,
    id,
  );
  return {
    ...person,
    receivable: fromMinorUnits(receivableMinor),
    payable: fromMinorUnits(payableMinor),
    outstanding: fromMinorUnits(outstandingMinor),
  };
}
