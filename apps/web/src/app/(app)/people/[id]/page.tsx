"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Alert, Avatar, EmptyState, Loading, Stat } from "@/components/ui/feedback";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { type Account, type PeopleLedgerEntryRow, type PersonWithBalance, api } from "@/lib/api";

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ENTRY_TYPE_LABEL: Record<string, string> = {
  LENT: "Lent",
  BORROWED: "Borrowed",
  REPAYMENT_RECEIVED: "Repayment received",
  REPAYMENT_MADE: "Repayment made",
};

const ENTRY_TYPE_TONE: Record<string, "warning" | "info" | "success" | "neutral"> = {
  LENT: "warning",
  BORROWED: "info",
  REPAYMENT_RECEIVED: "success",
  REPAYMENT_MADE: "neutral",
};

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const personId = params.id;

  const [person, setPerson] = useState<PersonWithBalance | null>(null);
  const [ledger, setLedger] = useState<PeopleLedgerEntryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const [entryType, setEntryType] = useState<
    "LENT" | "BORROWED" | "REPAYMENT_RECEIVED" | "REPAYMENT_MADE"
  >("LENT");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [p, l, accts] = await Promise.all([
      api.people.get(personId),
      api.people.ledger(personId),
      api.accounts.list(),
    ]);
    setPerson(p);
    setLedger(l);
    setAccounts(accts);
    if (!accountId && accts.length > 0) setAccountId(accts[0]!.id);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNumber = Number(amount);
    if (!accountId || !amountNumber || amountNumber <= 0) {
      setError("Choose an account and enter a positive amount.");
      return;
    }
    setSubmitting(true);
    try {
      await api.people.addLedgerEntry({
        personId,
        entryType,
        accountId,
        amount: amountNumber,
        occurredAt: new Date(occurredAt).toISOString(),
        notes: notes || undefined,
      });
      setAmount("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record entry");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !person) {
    return <Loading />;
  }

  return (
    <div>
      <Link
        href="/people"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={15} /> People
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={person.name} size={56} />
        <div>
          <h1 className="page-title">{person.name}</h1>
          <p
            className={`mt-0.5 text-sm font-semibold ${
              person.outstanding > 0
                ? "text-emerald-700"
                : person.outstanding < 0
                  ? "text-red-600"
                  : "text-slate-500"
            }`}
          >
            {person.outstanding === 0
              ? "Settled up"
              : person.outstanding > 0
                ? `Owes you ${formatINR(person.outstanding)}`
                : `You owe ${formatINR(-person.outstanding)}`}
          </p>
        </div>
        <div className="ml-auto flex gap-6">
          <Stat label="Lent" value={formatINR(person.receivable)} />
          <Stat label="Borrowed" value={formatINR(person.payable)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="text-sm font-bold text-slate-900">
            Record lending / borrowing / repayment
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="entryType">Type</Label>
                <Select
                  id="entryType"
                  className="w-full"
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as typeof entryType)}
                >
                  <option value="LENT">Lent to {person.name}</option>
                  <option value="BORROWED">Borrowed from {person.name}</option>
                  <option value="REPAYMENT_RECEIVED">{person.name} repaid me</option>
                  <option value="REPAYMENT_MADE">I repaid {person.name}</option>
                </Select>
              </div>
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
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Saving..." : "Record"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="text-sm font-bold text-slate-900">History</CardHeader>
          <CardBody className="p-0">
            {ledger.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={BookOpen} title="No entries yet">
                  Record a loan or repayment to start the ledger.
                </EmptyState>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-2 text-slate-600">{formatDate(entry.occurredAt)}</td>
                      <td className="px-4 py-2">
                        <Badge tone={ENTRY_TYPE_TONE[entry.entryType]}>
                          {ENTRY_TYPE_LABEL[entry.entryType]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatINR(entry.amount)}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{entry.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
