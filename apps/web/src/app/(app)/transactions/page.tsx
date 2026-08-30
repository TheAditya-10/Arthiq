"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { type Bucket, type EventItem, type SubBucket, type TransactionRow, api } from "@/lib/api";

const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "LENT",
  "BORROWED",
  "LENT_REPAYMENT",
  "BORROWED_REPAYMENT",
  "CASH_EXPENSE",
  "REFUND",
  "FEE",
  "UNKNOWN",
];

const CLASSIFICATION_TONE: Record<string, "success" | "info" | "warning" | "neutral"> = {
  RULE: "success",
  HISTORICAL: "info",
  HEURISTIC: "info",
  AI: "warning",
  MANUAL: "neutral",
  UNKNOWN: "warning",
};

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

export default function TransactionsPage() {
  const [items, setItems] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [subBuckets, setSubBuckets] = useState<SubBucket[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);

  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [eventId, setEventId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.buckets.list(), api.subBuckets.list(), api.events.list()])
      .then(([b, sb, e]) => {
        setBuckets(b);
        setSubBuckets(sb);
        setEvents(e);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.transactions
      .list({
        page,
        pageSize,
        search: search || undefined,
        type: type || undefined,
        bucketId: bucketId || undefined,
        eventId: eventId || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [page, search, type, bucketId, eventId, from, to]);

  const bucketNameById = useMemo(() => new Map(buckets.map((b) => [b.id, b.name])), [buckets]);
  const subBucketNameById = useMemo(
    () => new Map(subBuckets.map((sb) => [sb.id, sb.name])),
    [subBuckets],
  );
  const eventNameById = useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);

  async function handleCategoryChange(txn: TransactionRow, newSubBucketId: string) {
    const newSubBucket = subBuckets.find((sb) => sb.id === newSubBucketId);
    if (!newSubBucket) return;
    const updated = await api.transactions.update(txn.id, {
      bucketId: newSubBucket.bucketId,
      subBucketId: newSubBucket.id,
    });
    setItems((prev) => prev.map((t) => (t.id === txn.id ? updated : t)));
    setEditingId(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Transactions</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search merchant or description..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value);
          }}
        >
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          value={bucketId}
          onChange={(e) => {
            setPage(1);
            setBucketId(e.target.value);
          }}
        >
          <option value="">All buckets</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select
          value={eventId}
          onChange={(e) => {
            setPage(1);
            setEventId(e.target.value);
          }}
        >
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setPage(1);
            setFrom(e.target.value);
          }}
          className="w-auto"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setPage(1);
            setTo(e.target.value);
          }}
          className="w-auto"
        />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Merchant / Description</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Classification</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No transactions match these filters.
                </td>
              </tr>
            ) : (
              items.map((txn) => (
                <tr
                  key={txn.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {formatDate(txn.occurredAt)}
                  </td>
                  <td className="px-3 py-2">{txn.merchantRaw ?? txn.description ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{txn.type}</td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                      txn.direction === "CREDIT" ? "text-emerald-700" : "text-slate-900"
                    }`}
                  >
                    {txn.direction === "CREDIT" ? "+" : "−"}
                    {formatINR(txn.amount)}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === txn.id ? (
                      <Select
                        autoFocus
                        defaultValue={txn.subBucketId ?? ""}
                        onBlur={() => setEditingId(null)}
                        onChange={(e) => handleCategoryChange(txn, e.target.value)}
                      >
                        <option value="" disabled>
                          Choose category...
                        </option>
                        {buckets.map((b) => (
                          <optgroup key={b.id} label={b.name}>
                            {subBuckets
                              .filter((sb) => sb.bucketId === b.id)
                              .map((sb) => (
                                <option key={sb.id} value={sb.id}>
                                  {sb.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </Select>
                    ) : (
                      <button
                        onClick={() => setEditingId(txn.id)}
                        className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                        title="Click to edit category"
                      >
                        {txn.bucketId ? (
                          <>
                            {bucketNameById.get(txn.bucketId) ?? "—"}
                            {txn.subBucketId && (
                              <span className="text-slate-500">
                                {" "}
                                / {subBucketNameById.get(txn.subBucketId)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="italic text-slate-400">Uncategorized</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {txn.eventId ? eventNameById.get(txn.eventId) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={CLASSIFICATION_TONE[txn.classificationSource] ?? "neutral"}>
                      {txn.classificationSource}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{txn.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} transaction{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
