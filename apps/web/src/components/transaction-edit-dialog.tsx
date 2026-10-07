"use client";

import { Alert } from "@/components/ui/feedback";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  type Account,
  type Bucket,
  type EventItem,
  type Person,
  type SubBucket,
  type TransactionRow,
  type TransactionUpdate,
  api,
} from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  EXPENSE: "Expense",
  CASH_EXPENSE: "Cash expense",
  FEE: "Fee",
  INCOME: "Income",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  LENT: "Lent (they owe me)",
  BORROWED: "Borrowed (I owe them)",
  LENT_REPAYMENT: "Repayment received",
  BORROWED_REPAYMENT: "Repayment made",
  UNKNOWN: "Unknown",
};
const LEDGER_TYPES = ["LENT", "BORROWED", "LENT_REPAYMENT", "BORROWED_REPAYMENT"];
const BALANCE_ONLY_TYPES = ["TRANSFER", ...LEDGER_TYPES];

/** ISO instant -> the value a <input type="datetime-local"> expects, in the browser's zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TransactionEditDialog({
  txn,
  accounts,
  buckets,
  subBuckets,
  events,
  people,
  onClose,
  onSaved,
}: {
  txn: TransactionRow;
  accounts: Account[];
  buckets: Bucket[];
  subBuckets: SubBucket[];
  events: EventItem[];
  people: Person[];
  onClose: () => void;
  onSaved: (updated: TransactionRow) => void;
}) {
  const [type, setType] = useState(txn.type);
  const [amount, setAmount] = useState(String(txn.amount));
  const [occurredAt, setOccurredAt] = useState(toLocalInput(txn.occurredAt));
  const [merchantRaw, setMerchantRaw] = useState(txn.merchantRaw ?? "");
  const [description, setDescription] = useState(txn.description ?? "");
  const [accountId, setAccountId] = useState(txn.accountId);
  const [bucketId, setBucketId] = useState(txn.bucketId ?? "");
  const [subBucketId, setSubBucketId] = useState(txn.subBucketId ?? "");
  const [eventId, setEventId] = useState(txn.eventId ?? "");
  const [personId, setPersonId] = useState(txn.personId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLedger = LEDGER_TYPES.includes(type);
  const hasCategory = !BALANCE_ONLY_TYPES.includes(type);
  const subOptions = useMemo(
    () => subBuckets.filter((sb) => sb.bucketId === bucketId),
    [subBuckets, bucketId],
  );

  async function save() {
    setError(null);
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (isLedger && !personId) {
      setError("Choose the person for this entry.");
      return;
    }
    if (!occurredAt || Number.isNaN(new Date(occurredAt).getTime())) {
      setError("Enter a valid date and time.");
      return;
    }

    // Send only what changed, so untouched fields (and the category the app
    // learned from) are never rewritten by a simple amount fix.
    const changes: TransactionUpdate = {};
    if (type !== txn.type) changes.type = type;
    if (parsedAmount !== txn.amount) changes.amount = parsedAmount;
    if (occurredAt !== toLocalInput(txn.occurredAt)) {
      changes.occurredAt = new Date(occurredAt).toISOString();
    }
    if (accountId !== txn.accountId) changes.accountId = accountId;
    if (merchantRaw.trim() !== (txn.merchantRaw ?? ""))
      changes.merchantRaw = merchantRaw.trim() || null;
    if (description.trim() !== (txn.description ?? ""))
      changes.description = description.trim() || null;
    if (hasCategory) {
      if (bucketId !== (txn.bucketId ?? "")) changes.bucketId = bucketId || null;
      if (subBucketId !== (txn.subBucketId ?? "")) changes.subBucketId = subBucketId || null;
    }
    if (eventId !== (txn.eventId ?? "")) changes.eventId = eventId || null;
    if (isLedger && personId !== (txn.personId ?? "")) changes.personId = personId;
    if (isLedger && type !== txn.type && !changes.personId) changes.personId = personId;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      onSaved(await api.transactions.update(txn.id, changes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the changes.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Edit transaction"
    >
      <div className="my-8 w-full max-w-xl rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">Edit transaction</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit-type">Type</Label>
            <Select
              id="edit-type"
              className="w-full"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-amount">Amount (₹)</Label>
            <Input
              id="edit-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-date">Date and time</Label>
            <Input
              id="edit-date"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-account">Account</Label>
            <Select
              id="edit-account"
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
            <Label htmlFor="edit-merchant">Merchant / person paid</Label>
            <Input
              id="edit-merchant"
              value={merchantRaw}
              onChange={(e) => setMerchantRaw(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-description">Note</Label>
            <Input
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {hasCategory && (
            <>
              <div>
                <Label htmlFor="edit-bucket">Category</Label>
                <Select
                  id="edit-bucket"
                  className="w-full"
                  value={bucketId}
                  onChange={(e) => {
                    setBucketId(e.target.value);
                    setSubBucketId("");
                  }}
                >
                  <option value="">Uncategorized</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-sub">Sub-category</Label>
                <Select
                  id="edit-sub"
                  className="w-full"
                  value={subBucketId}
                  disabled={!bucketId || subOptions.length === 0}
                  onChange={(e) => setSubBucketId(e.target.value)}
                >
                  <option value="">None</option>
                  {subOptions.map((sb) => (
                    <option key={sb.id} value={sb.id}>
                      {sb.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="edit-event">Event</Label>
            <Select
              id="edit-event"
              className="w-full"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">No event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </Select>
          </div>
          {isLedger && (
            <div>
              <Label htmlFor="edit-person">Person</Label>
              <Select
                id="edit-person"
                className="w-full"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                <option value="">Choose a person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {type !== txn.type && (
          <p className="mt-4 text-xs text-slate-500">
            Changing the type also updates the money direction
            {LEDGER_TYPES.includes(txn.type) !== isLedger
              ? " and adds or removes the entry in the person's ledger."
              : "."}
          </p>
        )}
        {error && <Alert className="mt-4">{error}</Alert>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
