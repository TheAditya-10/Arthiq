"use client";

import { Landmark } from "lucide-react";
import { EmptyState, Loading } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { type Account, api } from "@/lib/api";

const ACCOUNT_TYPES = ["BANK", "CASH", "CREDIT_CARD", "WALLET", "INVESTMENT"];

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState(ACCOUNT_TYPES[0]!);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(todayISODate());

  async function load() {
    setLoading(true);
    try {
      const list = await api.accounts.list(showArchived);
      setAccounts(list);
      const entries = await Promise.all(
        list.map(async (a) => [a.id, (await api.accounts.balance(a.id)).balance] as const),
      );
      setBalances(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.accounts.create({
        name: name.trim(),
        type,
        openingBalance: Number(openingBalance) || 0,
        openingBalanceDate,
      });
      setName("");
      setOpeningBalance("0");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(id: string) {
    await api.accounts.archive(id);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Bank accounts, cards and cash — where your money lives."
        actions={
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        }
      />

      <Card className="mb-6 max-w-lg">
        <CardBody>
          <h2 className="mb-4 text-base font-bold text-slate-900">Add an account</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="HDFC Bank"
              />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Select id="type" value={type} onChange={(e) => setType(e.target.value)}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="openingBalance">Opening balance</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="openingBalanceDate">As of</Label>
              <Input
                id="openingBalanceDate"
                type="date"
                value={openingBalanceDate}
                onChange={(e) => setOpeningBalanceDate(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Button type="submit" disabled={creating}>
                Add account
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {loading ? (
        <Loading />
      ) : accounts.length === 0 ? (
        <EmptyState icon={Landmark} title="No accounts yet">
          No accounts yet — add one above to get started.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardBody>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Landmark size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{account.name}</p>
                    <Badge tone={account.archivedAt ? "neutral" : "info"} className="mt-1">
                      {account.type.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <p className="mt-4 text-2xl font-extrabold tracking-tight tabular-nums text-slate-900">
                  {formatINR(balances[account.id] ?? 0)}
                </p>
                <p className="text-xs text-slate-500">Current balance</p>
                {!account.archivedAt ? (
                  <Button
                    variant="ghost"
                    className="mt-2 px-0 text-red-600 hover:bg-transparent hover:underline"
                    onClick={() => handleArchive(account.id)}
                  >
                    Archive
                  </Button>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Archived</p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
