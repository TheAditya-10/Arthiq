import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

describe("people ledger (via /transactions)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lending money decreases the account balance, creates a receivable, and never touches expense totals", async () => {
    const { accessToken } = await registerTestUser(app);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "HDFC",
        type: "BANK",
        openingBalance: 10000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const person = await app.inject({
      method: "POST",
      url: "/people",
      headers: authHeader(accessToken),
      payload: { name: "Rahul" },
    });

    const lent = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "LENT",
        amount: 2000,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
        personId: person.json().id,
      },
    });
    expect(lent.statusCode).toBe(201);

    const balance = await app.inject({
      method: "GET",
      url: `/accounts/${account.json().id}/balance`,
      headers: authHeader(accessToken),
    });
    expect(balance.json().balance).toBe(10000 - 2000);

    const personDetail = await app.inject({
      method: "GET",
      url: `/people/${person.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(personDetail.json().outstanding).toBe(2000);
    expect(personDetail.json().receivable).toBe(2000);
    expect(personDetail.json().payable).toBe(0);

    const ledger = await app.inject({
      method: "GET",
      url: `/people/${person.json().id}/ledger`,
      headers: authHeader(accessToken),
    });
    expect(ledger.json()).toHaveLength(1);
    expect(ledger.json()[0].entryType).toBe("LENT");
    expect(ledger.json()[0].amount).toBe(2000);
  });

  it("a partial repayment reduces outstanding without appearing as income", async () => {
    const { accessToken } = await registerTestUser(app);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "HDFC",
        type: "BANK",
        openingBalance: 10000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const person = await app.inject({
      method: "POST",
      url: "/people",
      headers: authHeader(accessToken),
      payload: { name: "Rahul" },
    });
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "LENT",
        amount: 2000,
        direction: "DEBIT",
        occurredAt: "2026-01-05T10:00:00Z",
        personId: person.json().id,
      },
    });

    const repayment = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "LENT_REPAYMENT",
        amount: 1000,
        direction: "CREDIT",
        occurredAt: "2026-01-10T10:00:00Z",
        personId: person.json().id,
      },
    });
    expect(repayment.statusCode).toBe(201);

    const personDetail = await app.inject({
      method: "GET",
      url: `/people/${person.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(personDetail.json().outstanding).toBe(1000);

    const balance = await app.inject({
      method: "GET",
      url: `/accounts/${account.json().id}/balance`,
      headers: authHeader(accessToken),
    });
    // 10000 - 2000 (lent) + 1000 (repaid) = 9000
    expect(balance.json().balance).toBe(9000);
  });

  it("borrowing increases the account balance and creates a payable", async () => {
    const { accessToken } = await registerTestUser(app);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "HDFC",
        type: "BANK",
        openingBalance: 10000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const person = await app.inject({
      method: "POST",
      url: "/people",
      headers: authHeader(accessToken),
      payload: { name: "Priya" },
    });

    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId: account.json().id,
        type: "BORROWED",
        amount: 5000,
        direction: "CREDIT",
        occurredAt: "2026-01-05T10:00:00Z",
        personId: person.json().id,
      },
    });

    const balance = await app.inject({
      method: "GET",
      url: `/accounts/${account.json().id}/balance`,
      headers: authHeader(accessToken),
    });
    expect(balance.json().balance).toBe(15000);

    const personDetail = await app.inject({
      method: "GET",
      url: `/people/${person.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(personDetail.json().payable).toBe(5000);
    expect(personDetail.json().outstanding).toBe(-5000);
  });

  it("POST /people-ledger maps entryType to the right transaction shape and persists notes/dueDate", async () => {
    const { accessToken, userId } = await registerTestUser(app);
    const account = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: authHeader(accessToken),
      payload: {
        name: "HDFC",
        type: "BANK",
        openingBalance: 10000,
        openingBalanceDate: "2026-01-01",
      },
    });
    const person = await app.inject({
      method: "POST",
      url: "/people",
      headers: authHeader(accessToken),
      payload: { name: "Rahul" },
    });

    const lent = await app.inject({
      method: "POST",
      url: "/people-ledger",
      headers: authHeader(accessToken),
      payload: {
        personId: person.json().id,
        entryType: "LENT",
        accountId: account.json().id,
        amount: 2000,
        occurredAt: "2026-01-05T10:00:00Z",
        dueDate: "2026-02-05",
        notes: "For rent",
      },
    });
    expect(lent.statusCode).toBe(201);
    expect(lent.json().type).toBe("LENT");
    expect(lent.json().direction).toBe("DEBIT");

    const ledger = await app.inject({
      method: "GET",
      url: `/people/${person.json().id}/ledger`,
      headers: authHeader(accessToken),
    });
    expect(ledger.json()[0].notes).toBe("For rent");
    expect(ledger.json()[0].dueDate).toContain("2026-02-05");

    const balance = await app.inject({
      method: "GET",
      url: `/accounts/${account.json().id}/balance`,
      headers: authHeader(accessToken),
    });
    expect(balance.json().balance).toBe(8000);

    const repayment = await app.inject({
      method: "POST",
      url: "/people-ledger",
      headers: authHeader(accessToken),
      payload: {
        personId: person.json().id,
        entryType: "REPAYMENT_RECEIVED",
        accountId: account.json().id,
        amount: 2000,
        occurredAt: "2026-01-20T10:00:00Z",
      },
    });
    expect(repayment.json().type).toBe("LENT_REPAYMENT");
    expect(repayment.json().direction).toBe("CREDIT");

    // Repayments (not the original lending) get an audit trail entry —
    // docs/SECURITY.md §5.
    const auditRows = await app.prisma.auditLog.findMany({
      where: { userId, action: "REPAYMENT_RECORDED", transactionId: repayment.json().id },
    });
    expect(auditRows).toHaveLength(1);
    const lentAuditRows = await app.prisma.auditLog.findMany({
      where: { userId, action: "REPAYMENT_RECORDED", transactionId: lent.json().id },
    });
    expect(lentAuditRows).toHaveLength(0);

    const finalPerson = await app.inject({
      method: "GET",
      url: `/people/${person.json().id}`,
      headers: authHeader(accessToken),
    });
    expect(finalPerson.json().outstanding).toBe(0);
  });
});
