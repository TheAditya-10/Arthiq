"use client";

import { ArrowDownLeft, ArrowUpRight, Loader2, ReceiptText, Upload, Wallet } from "lucide-react";
import { Alert, Stat } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { TransactionEditDialog } from "@/components/transaction-edit-dialog";
import {
  type Account,
  type Bucket,
  type EventItem,
  type Person,
  type SubBucket,
  type TransactionRow,
  type TransactionSummary,
  api,
} from "@/lib/api";

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

const GROUP_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "bucket", label: "By category" },
  { value: "month", label: "By month" },
  { value: "event", label: "By event" },
  { value: "type", label: "By type" },
];

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

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [groupBy, setGroupBy] = useState("none");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingTxn, setEditingTxn] = useState<TransactionRow | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.buckets.list(),
      api.subBuckets.list(),
      api.events.list(),
      api.accounts.list(),
      api.people.list(),
    ])
      .then(([b, sb, e, a, p]) => {
        setBuckets(b);
        setSubBuckets(sb);
        setEvents(e);
        setAccounts(a);
        setPeople(p);
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
  }, [page, search, type, bucketId, eventId, from, to, refreshKey]);

  // Totals/subtotals cover every row matching the filters, not just this page.
  useEffect(() => {
    api.transactions
      .summary({
        search: search || undefined,
        type: type || undefined,
        bucketId: bucketId || undefined,
        eventId: eventId || undefined,
        from: from || undefined,
        to: to || undefined,
        groupBy,
      })
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [search, type, bucketId, eventId, from, to, groupBy, refreshKey]);

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
    setRefreshKey((k) => k + 1);
  }

  async function handleEventChange(txn: TransactionRow, newEventId: string) {
    const updated = await api.transactions.update(txn.id, { eventId: newEventId || null });
    setItems((prev) => prev.map((t) => (t.id === txn.id ? updated : t)));
    setEditingEventId(null);
    setRefreshKey((k) => k + 1);
  }

  async function handleDelete(txn: TransactionRow) {
    const label = txn.merchantRaw ?? txn.description ?? txn.type;
    if (
      !window.confirm(
        `Delete "${label}" (${formatINR(txn.amount)})? This removes it from your totals.`,
      )
    ) {
      return;
    }
    try {
      await api.transactions.remove(txn.id);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the transaction");
    }
  }

  const pageIn = items
    .filter((t) => t.direction === "CREDIT")
    .reduce((sum, t) => sum + t.amount, 0);
  const pageOut = items
    .filter((t) => t.direction === "DEBIT")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every payment in one place. Search, filter and fix categories."
        actions={
          <Link href="/transactions/import">
            <Button variant="secondary">
              <Upload size={15} /> Import CSV
            </Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
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
          className="!w-auto"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setPage(1);
            setTo(e.target.value);
          }}
          className="!w-auto"
        />
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      {summary && (
        <div className="mb-5 rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-card">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="transaction-totals">
            <Stat
              label="Income"
              icon={ArrowDownLeft}
              tone="good"
              value={formatINR(summary.totals.income)}
            />
            <Stat label="Spending" icon={ArrowUpRight} value={formatINR(summary.totals.spending)} />
            <Stat
              label="Income − spending"
              icon={Wallet}
              tone={summary.totals.income - summary.totals.spending >= 0 ? "good" : "bad"}
              value={formatINR(summary.totals.income - summary.totals.spending)}
            />
            <Stat label="Transactions" value={summary.totals.count} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            All money in {formatINR(summary.totals.moneyIn)} · all money out{" "}
            {formatINR(summary.totals.moneyOut)} (includes loans, repayments and transfers). Totals
            cover everything matching your filters, not only this page.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <label htmlFor="group-by" className="text-sm font-medium text-slate-600">
              Subtotals
            </label>
            <Select id="group-by" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          {groupBy !== "none" && summary.groups.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm" data-testid="transaction-subtotals">
                <thead className="text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">Group</th>
                    <th className="px-3 py-1 text-right">Count</th>
                    <th className="px-3 py-1 text-right">Income</th>
                    <th className="px-3 py-1 text-right">Spending</th>
                    <th className="py-1 pl-3 text-right">Money in / out</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.groups.map((g) => (
                    <tr key={g.key || "none"} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3">{g.label}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{g.count}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {g.income ? formatINR(g.income) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {g.spending ? formatINR(g.spending) : "—"}
                      </td>
                      <td className="py-1.5 pl-3 text-right tabular-nums text-slate-500">
                        +{formatINR(g.moneyIn)} / −{formatINR(g.moneyOut)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface shadow-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Merchant / Description</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Event</th>
              <th className="px-3 py-3">Classification</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Loading...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-slate-500">
                  <ReceiptText size={28} className="mx-auto mb-2 text-slate-400" />
                  No transactions match these filters.
                </td>
              </tr>
            ) : (
              items.map((txn) => (
                <tr
                  key={txn.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
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
                          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-ink">
                            Uncategorized
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {editingEventId === txn.id ? (
                      <Select
                        autoFocus
                        defaultValue={txn.eventId ?? ""}
                        onBlur={() => setEditingEventId(null)}
                        onChange={(e) => handleEventChange(txn, e.target.value)}
                      >
                        <option value="">No event</option>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <button
                        onClick={() => setEditingEventId(txn.id)}
                        className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                        title="Click to attach an event"
                      >
                        {txn.eventId ? eventNameById.get(txn.eventId) : "—"}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={CLASSIFICATION_TONE[txn.classificationSource] ?? "neutral"}>
                      {txn.classificationSource}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{txn.status}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      className="px-2 py-1"
                      onClick={() => setEditingTxn(txn)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(txn)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && items.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <td colSpan={3} className="px-3 py-2">
                  This page ({items.length})
                </td>
                <td colSpan={6} className="px-3 py-2 text-left">
                  <span className="text-emerald-700">+{formatINR(pageIn)}</span>
                  {" · "}
                  <span>−{formatINR(pageOut)}</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editingTxn && (
        <TransactionEditDialog
          txn={editingTxn}
          accounts={accounts}
          buckets={buckets}
          subBuckets={subBuckets}
          events={events}
          people={people}
          onClose={() => setEditingTxn(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setEditingTxn(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

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
