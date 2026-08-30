import { expect, test } from "@playwright/test";

/**
 * Implements the full demo scenario (spec §44 / docs/TESTING_STRATEGY.md §3)
 * as the project's acceptance test. Setup (register, account, categories) is
 * done via direct API calls — fast and deterministic, and exactly what the
 * strategy doc itself does for notification ingestion ("simulating the
 * mobile app, since Playwright drives the web, not the Android app"). The
 * scenario-specific steps (category correction, event creation/attachment,
 * exclude-event toggling, lending/repayment, reconciliation) are driven
 * through the real browser UI, since those are exactly the code paths this
 * test exists to protect.
 */

const API_URL = "http://localhost:4100";

interface Transaction {
  id: string;
  bucketId: string | null;
  subBucketId: string | null;
  classificationSource: string;
}

interface IngestResult {
  dedupOutcome: "NEW" | "DUPLICATE";
  transaction: Transaction | null;
}

test("full demo scenario: classification, correction, events, lending, reconciliation", async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  // --- Setup via direct API calls ---
  const registerRes = await request.post(`${API_URL}/auth/register`, {
    data: { email, password, displayName: "E2E Demo" },
  });
  expect(registerRes.ok()).toBeTruthy();
  const { accessToken } = await registerRes.json();
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const accountRes = await request.post(`${API_URL}/accounts`, {
    headers: authHeaders,
    data: {
      name: "HDFC Bank",
      type: "BANK",
      openingBalance: 100000,
      openingBalanceDate: "2020-01-01",
    },
  });
  const account = await accountRes.json();

  async function createBucket(name: string) {
    const res = await request.post(`${API_URL}/buckets`, { headers: authHeaders, data: { name } });
    return res.json();
  }
  async function createSubBucket(bucketId: string, name: string) {
    const res = await request.post(`${API_URL}/sub-buckets`, {
      headers: authHeaders,
      data: { bucketId, name },
    });
    return res.json();
  }
  const household = await createBucket("Household");
  const householdElectronics = await createSubBucket(household.id, "Electronics");
  const personal = await createBucket("Personal");
  const personalElectronics = await createSubBucket(personal.id, "Electronics");

  async function ingestCroma(amountMinor: string, rawTextHash: string): Promise<IngestResult> {
    const res = await request.post(`${API_URL}/notifications/ingest`, {
      headers: authHeaders,
      data: {
        accountId: account.id,
        amountMinor,
        direction: "DEBIT",
        merchantRaw: "CROMA",
        occurredAt: new Date().toISOString(),
        provider: "GOOGLE_PAY",
        sourcePackage: "com.google.android.apps.nbu.paisa.user",
        rawTextHash,
      },
    });
    expect(res.status()).toBe(201);
    return res.json();
  }

  // Step 1: ingest a Croma notification-shaped transaction -> auto-classified Household > Electronics.
  const firstIngest = await ingestCroma("150000", "e2e-hash-1");
  expect(firstIngest.dedupOutcome).toBe("NEW");
  expect(firstIngest.transaction?.bucketId).toBe(household.id);
  expect(firstIngest.transaction?.subBucketId).toBe(householdElectronics.id);

  // --- Sign in via the real UI for the rest of the scenario ---
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/transactions");

  // Step 2: edit it in the web ledger to Personal > Electronics -> a MerchantRule now exists.
  const row = page.locator("tr", { hasText: "CROMA" });
  await row.getByTitle("Click to edit category").click();
  await row.getByRole("combobox").selectOption(personalElectronics.id);
  await expect(row.getByTitle("Click to edit category")).toContainText("Personal");

  const rulesRes = await request.get(`${API_URL}/merchant-rules`, { headers: authHeaders });
  const rules = await rulesRes.json();
  expect(rules.some((r: { subBucketId: string }) => r.subBucketId === personalElectronics.id)).toBe(
    true,
  );

  // Step 3: ingest a second Croma transaction -> auto-classifies to Personal > Electronics via RULE.
  const secondIngest = await ingestCroma("80000", "e2e-hash-2");
  expect(secondIngest.transaction?.bucketId).toBe(personal.id);
  expect(secondIngest.transaction?.subBucketId).toBe(personalElectronics.id);
  expect(secondIngest.transaction?.classificationSource).toBe("RULE");

  // Step 4: create event "Goa Trip 2026," attach the second Croma transaction to it.
  await page.goto("/events");
  await page.getByLabel("Name").fill("Goa Trip 2026");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Goa Trip 2026")).toBeVisible();

  await page.goto("/transactions");
  const secondRow = page.locator("tr", { hasText: "₹800" });
  await secondRow.getByTitle("Click to attach an event").click();
  await secondRow.getByRole("combobox").selectOption({ label: "Goa Trip 2026" });
  await expect(secondRow.getByTitle("Click to attach an event")).toContainText("Goa Trip 2026");

  // Step 5: load dashboard for this month -> assert total.
  await page.goto("/dashboard");
  await expect(page.getByText("Total Spending", { exact: false })).toBeVisible();
  await expect(page.getByTestId("total-spending")).toHaveText("₹2,300");

  // Step 6: toggle "exclude Goa Trip" -> adjusted total matches manual arithmetic (2300 - 800 = 1500).
  await page.getByRole("checkbox").first().check();
  await expect(page.getByText("Total Spending (adjusted)")).toBeVisible();
  await expect(page.getByTestId("total-spending")).toHaveText("₹1,500");

  // Step 7: record lending ₹2,000 to "Rahul" -> People Ledger shows ₹2,000 outstanding,
  // dashboard expense total unchanged.
  await page.goto("/people");
  await page.getByPlaceholder("Add a person...").fill("Rahul");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByText("Rahul").click();
  await page.waitForURL("**/people/*");

  await page.getByLabel("Type").selectOption("LENT");
  await page.getByLabel("Amount (₹)").fill("2000");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Owes you", { exact: false })).toBeVisible();
  await expect(page.getByText("₹2,000.00", { exact: false }).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByTestId("total-spending")).toHaveText("₹2,300"); // unchanged by LENT

  // Step 8: record ₹1,000 repayment from Rahul -> outstanding is ₹1,000.
  await page.goto("/people");
  await page.getByText("Rahul").click();
  await page.waitForURL("**/people/*");
  await page.getByLabel("Type").selectOption("REPAYMENT_RECEIVED");
  await page.getByLabel("Amount (₹)").fill("1000");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Owes you ₹1,000.00")).toBeVisible();

  // Step 9: run reconciliation for the account/period -> expected vs actual renders correctly.
  // Balance = 100000 opening - 1500 - 800 (Croma) - 2000 (lent) + 1000 (repaid) = 96700.
  await page.goto("/reconciliation");
  await page.getByLabel("Actual closing balance (₹, from your bank statement)").fill("96700");
  await page.getByRole("button", { name: "Run reconciliation" }).click();
  await expect(page.getByText("MATCHED").first()).toBeVisible();
  await expect(page.locator("dt:has-text('Difference') + dd")).toHaveText("₹0.00");
});
