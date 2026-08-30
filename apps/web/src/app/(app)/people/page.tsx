"use client";

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
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">People</h1>

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
        <p className="text-sm text-slate-500">Loading...</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-slate-500">
          No people yet. Add someone to start tracking lending/borrowing.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => {
            const outstanding = balances[p.id] ?? 0;
            return (
              <Link key={p.id} href={`/people/${p.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardBody>
                    <p className="font-medium text-slate-900">{p.name}</p>
                    {outstanding === 0 ? (
                      <p className="mt-1 text-sm text-slate-500">Settled up</p>
                    ) : outstanding > 0 ? (
                      <p className="mt-1 text-sm text-emerald-700">
                        Owes you {formatINR(outstanding)}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-red-600">You owe {formatINR(-outstanding)}</p>
                    )}
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
