"use client";

import { CalendarDays } from "lucide-react";
import { EmptyState, Loading } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { type EventItem, api } from "@/lib/api";

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [summaries, setSummaries] = useState<
    Record<string, { total: number; transactionCount: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await api.events.list();
      setEvents(list);
      const entries = await Promise.all(
        list.map(async (e) => [e.id, await api.events.summary(e.id)] as const),
      );
      setSummaries(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.events.create({
        name: name.trim(),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(id: string) {
    await api.events.archive(id);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Events"
        description="Trips and occasions you want to see on their own, apart from everyday spending."
      />

      <Card className="mb-6 max-w-lg">
        <CardBody>
          <h2 className="mb-4 text-base font-bold text-slate-900">Create an event</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Goa Trip 2026"
              />
            </div>
            <div>
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Button type="submit" disabled={creating}>
                Create event
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events yet">
          No events yet. Create one above, then attach transactions to it from the ledger.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const summary = summaries[event.id];
            return (
              <Card key={event.id}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 font-bold text-slate-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                        <CalendarDays size={16} />
                      </span>
                      {event.name}
                    </p>
                    {!event.archivedAt ? (
                      <button
                        className="text-xs text-red-500 hover:underline"
                        onClick={() => handleArchive(event.id)}
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                  {(event.startDate || event.endDate) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {event.startDate ?? "…"} – {event.endDate ?? "…"}
                    </p>
                  )}
                  <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums text-slate-900">
                    {formatINR(summary?.total ?? 0)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {summary?.transactionCount ?? 0} transaction
                    {summary?.transactionCount === 1 ? "" : "s"}
                  </p>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
