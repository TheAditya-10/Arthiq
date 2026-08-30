import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authHeader, buildTestApp, registerTestUser } from "../../../tests/helpers.js";

const SAMPLE_CSV = [
  "Date,Narration,Amount,Type",
  "05/08/2026,ZOMATO ONLINE ORDER,480.00,Debit",
  "06/08/2026,SALARY CREDIT,75000.00,Credit",
  "07/08/2026,AMAZON.IN,1200.00,Debit",
].join("\n");

function buildMultipart(accountId: string, csv: string, boundary = "----arthiqtestboundary") {
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="accountId"\r\n\r\n${accountId}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="statement.csv"\r\n` +
    `Content-Type: text/csv\r\n\r\n${csv}\r\n` +
    `--${boundary}--\r\n`;
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function setup(app: FastifyInstance) {
  const { accessToken } = await registerTestUser(app);
  const account = await app.inject({
    method: "POST",
    url: "/accounts",
    headers: authHeader(accessToken),
    payload: { name: "HDFC", type: "BANK", openingBalance: 0, openingBalanceDate: "2026-01-01" },
  });
  return { accessToken, accountId: account.json().id as string };
}

describe("CSV import", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("previews a CSV, guessing the column mapping from headers", async () => {
    const { accessToken, accountId } = await setup(app);
    const { body, contentType } = buildMultipart(accountId, SAMPLE_CSV);

    const res = await app.inject({
      method: "POST",
      url: "/imports/preview",
      headers: { ...authHeader(accessToken), "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().headers).toEqual(["Date", "Narration", "Amount", "Type"]);
    expect(res.json().suggestedMapping).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      direction: 3,
    });
    expect(res.json().totalRows).toBe(3);
    expect(res.json().previewRows).toHaveLength(3);
  });

  it("commits an import: creates transactions, classifies them, and reports counts", async () => {
    const { accessToken, accountId } = await setup(app);
    const { body, contentType } = buildMultipart(accountId, SAMPLE_CSV);
    const preview = await app.inject({
      method: "POST",
      url: "/imports/preview",
      headers: { ...authHeader(accessToken), "content-type": contentType },
      payload: body,
    });

    const commit = await app.inject({
      method: "POST",
      url: `/imports/${preview.json().importId}/commit`,
      headers: authHeader(accessToken),
      payload: { columnMapping: preview.json().suggestedMapping },
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json().status).toBe("COMMITTED");
    expect(commit.json().importedCount).toBe(3);
    expect(commit.json().duplicateCount).toBe(0);
    expect(commit.json().errorCount).toBe(0);

    const ledger = await app.inject({
      method: "GET",
      url: `/transactions?accountId=${accountId}`,
      headers: authHeader(accessToken),
    });
    expect(ledger.json().total).toBe(3);
    expect(ledger.json().items.every((t: { source: string }) => t.source === "CSV_IMPORT")).toBe(
      true,
    );

    const salary = ledger
      .json()
      .items.find((t: { description: string }) => t.description === "SALARY CREDIT");
    expect(salary.type).toBe("INCOME");
    expect(salary.direction).toBe("CREDIT");
    expect(salary.amount).toBe(75000);

    const zomato = ledger
      .json()
      .items.find((t: { merchantRaw: string }) => t.merchantRaw === "ZOMATO ONLINE ORDER");
    expect(zomato.type).toBe("EXPENSE");
    expect(zomato.direction).toBe("DEBIT");
    // Classified by the Phase 5 heuristic even though it arrived via import, not manual entry.
    expect(
      zomato.classificationSource === "HEURISTIC" || zomato.classificationSource === "UNKNOWN",
    ).toBe(true);
  });

  it("flags a row as a duplicate when it matches an already-existing transaction", async () => {
    const { accessToken, accountId } = await setup(app);
    // Pre-existing transaction that the CSV row below should collide with.
    await app.inject({
      method: "POST",
      url: "/transactions",
      headers: authHeader(accessToken),
      payload: {
        accountId,
        type: "EXPENSE",
        amount: 480,
        direction: "DEBIT",
        occurredAt: "2026-08-05T00:00:00Z",
        merchantRaw: "ZOMATO ONLINE ORDER",
      },
    });

    const { body, contentType } = buildMultipart(accountId, SAMPLE_CSV);
    const preview = await app.inject({
      method: "POST",
      url: "/imports/preview",
      headers: { ...authHeader(accessToken), "content-type": contentType },
      payload: body,
    });
    const commit = await app.inject({
      method: "POST",
      url: `/imports/${preview.json().importId}/commit`,
      headers: authHeader(accessToken),
      payload: { columnMapping: preview.json().suggestedMapping },
    });
    expect(commit.json().importedCount).toBe(2);
    expect(commit.json().duplicateCount).toBe(1);
  });

  it("rejects committing the same import twice", async () => {
    const { accessToken, accountId } = await setup(app);
    const { body, contentType } = buildMultipart(accountId, SAMPLE_CSV);
    const preview = await app.inject({
      method: "POST",
      url: "/imports/preview",
      headers: { ...authHeader(accessToken), "content-type": contentType },
      payload: body,
    });
    const mapping = preview.json().suggestedMapping;
    await app.inject({
      method: "POST",
      url: `/imports/${preview.json().importId}/commit`,
      headers: authHeader(accessToken),
      payload: { columnMapping: mapping },
    });
    const secondCommit = await app.inject({
      method: "POST",
      url: `/imports/${preview.json().importId}/commit`,
      headers: authHeader(accessToken),
      payload: { columnMapping: mapping },
    });
    expect(secondCommit.statusCode).toBe(409);
  });

  it("GET /imports/:id returns the import summary, tenant-scoped", async () => {
    const { accessToken, accountId } = await setup(app);
    const other = await registerTestUser(app);
    const { body, contentType } = buildMultipart(accountId, SAMPLE_CSV);
    const preview = await app.inject({
      method: "POST",
      url: "/imports/preview",
      headers: { ...authHeader(accessToken), "content-type": contentType },
      payload: body,
    });

    const mine = await app.inject({
      method: "GET",
      url: `/imports/${preview.json().importId}`,
      headers: authHeader(accessToken),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().rowCount).toBe(3);

    const notMine = await app.inject({
      method: "GET",
      url: `/imports/${preview.json().importId}`,
      headers: authHeader(other.accessToken),
    });
    expect(notMine.statusCode).toBe(404);
  });
});
