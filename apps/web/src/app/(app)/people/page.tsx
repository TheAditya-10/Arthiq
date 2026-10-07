"use client";

import { ChevronRight, Users } from "lucide-react";
import { Avatar, EmptyState, Loading } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type Person, api } from "@/lib/api";

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const list = await api.people.list();
    setPeople(list);
    const entries = await Promise.all(
      list.map(async (p) => [p.id, (await api.people.get(p.id)).outstanding] as const),
    );
    setBalances(Object.fromEntries(entries));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await api.people.create({ name: newName.trim() });
      setNewName("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="People"
        description="Friends you lend to, borrow from or split bills with."
      />

      <form onSubmit={handleAddPerson} className="mb-6 flex max-w-sm gap-2">
        <Input
          placeholder="Add a person..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" disabled={adding}>
          Add
        </Button>
      </form>

      {loading ? (
        <Loading />
      ) : people.length === 0 ? (
        <EmptyState icon={Users} title="No people yet">
          No people yet. Add someone to start tracking lending/borrowing.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => {
            const outstanding = balances[p.id] ?? 0;
            return (
              <Link key={p.id} href={`/people/${p.id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:border-brand-200">
                  <CardBody className="flex items-center gap-3">
                    <Avatar name={p.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900">{p.name}</p>
                      {outstanding === 0 ? (
                        <p className="mt-0.5 text-sm text-slate-500">Settled up</p>
                      ) : outstanding > 0 ? (
                        <p className="mt-0.5 text-sm font-semibold text-emerald-700">
                          Owes you {formatINR(outstanding)}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm font-semibold text-red-600">
                          You owe {formatINR(-outstanding)}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-slate-400" />
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
