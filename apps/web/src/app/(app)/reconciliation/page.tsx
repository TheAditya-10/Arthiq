"use client";

import { Scale } from "lucide-react";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { type Account, type ReconciliationRow, api } from "@/lib/api";

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function firstOfNextMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "info"> = {
  MATCHED: "success",
  DISCREPANCY: "warning",
  RESOLVED: "info",
  PENDING: "neutral",
};

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(firstOfNextMonth());
  const [actualBalance, setActualBalance] = useState("");
  const [result, setResult] = useState<(ReconciliationRow & { candidateCauses: string[] }) | null>(
    null,
  );
  const [history, setHistory] = useState<ReconciliationRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts.list().then((accts) => {
      setAccounts(accts);
      if (accts.length > 0) setAccountId(accts[0]!.id);
    });
  }, []);

  useEffect(() => {
    if (accountId) api.reconciliation.list(accountId).then(setHistory);
  }, [accountId, result]);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const actual = Number(actualBalance);
    if (!accountId || Number.isNaN(actual)) {
      setError("Choose an account and enter the actual closing balance.");
      return;
    }
    setRunning(true);
    try {
      const res = await api.reconciliation.run({
        accountId,
        periodStart,
        periodEnd,
        actualClosingBalance: actual,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run reconciliation");
    } finally {
      setRunning(false);
    }
  }

  async function handleResolve(id: string) {
    await api.reconciliation.resolve(id);
    if (accountId) setHistory(await api.reconciliation.list(accountId));
  }

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        description="Check your records against your bank statement and find what is missing."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="text-sm font-bold text-slate-900">Run a reconciliation</CardHeader>
          <CardBody>
            <form onSubmit={handleRun} className="space-y-3">
              <div>
                <Label htmlFor="account">Account</Label>
                <Select
                  id="account"
                  className="w-full"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="periodStart">Period start</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="periodEnd">Period end</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="actual">Actual closing balance (₹, from your bank statement)</Label>
                <Input
                  id="actual"
                  type="number"
                  step="0.01"
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                />
              </div>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" className="w-full" disabled={running}>
                {running ? "Running..." : "Run reconciliation"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {result && (
            <Card>
              <CardHeader className="flex items-center justify-between text-sm font-bold text-slate-900">
                <span>Result</span>
                <Badge tone={STATUS_TONE[result.status]}>{result.status}</Badge>
              </CardHeader>
              <CardBody>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-slate-500">Opening</dt>
                    <dd className="text-lg font-extrabold tracking-tight tabular-nums">
                      {formatINR(result.openingBalance)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Expected</dt>
                    <dd className="text-lg font-extrabold tracking-tight tabular-nums">
                      {formatINR(result.expectedClosingBalance)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Actual</dt>
                    <dd className="text-lg font-extrabold tracking-tight tabular-nums">
                      {formatINR(result.actualClosingBalance)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Difference</dt>
                    <dd
                      className={`text-lg font-extrabold tracking-tight tabular-nums ${result.difference !== 0 ? "text-red-600" : "text-emerald-700"}`}
                    >
                      {formatINR(result.difference)}
                    </dd>
                  </div>
                </dl>
                {result.candidateCauses.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500">
                      Possible causes
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {result.candidateCauses.map((cause, i) => (
                        <li key={i}>{cause}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader className="text-sm font-bold text-slate-900">History</CardHeader>
            <CardBody className="p-0">
              {history.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={Scale} title="Nothing reconciled yet">
                    No reconciliations run yet for this account.
                  </EmptyState>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Period</th>
                      <th className="px-4 py-2 text-right">Difference</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-2 text-slate-600">
                          {r.periodStart.slice(0, 10)} → {r.periodEnd.slice(0, 10)}
                        </td>
                        <td className="px-4 py-2 text-right">{formatINR(r.difference)}</td>
                        <td className="px-4 py-2">
                          <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                        </td>
                        <td className="px-4 py-2">
                          {r.status === "DISCREPANCY" && (
                            <button
                              onClick={() => handleResolve(r.id)}
                              className="text-xs font-semibold text-brand-600 hover:underline"
                            >
                              Mark resolved
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
