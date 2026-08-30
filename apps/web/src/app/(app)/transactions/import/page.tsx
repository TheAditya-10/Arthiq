"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import {
  type Account,
  type ColumnMapping,
  type ImportCommitResult,
  type ImportPreview,
  api,
} from "@/lib/api";

const FIELD_LABELS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "description", label: "Description / Narration", required: false },
  { key: "direction", label: "Debit/Credit indicator", required: false },
];

export default function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts.list().then((accts) => {
      setAccounts(accts);
      if (accts.length > 0) setAccountId(accts[0]!.id);
    });
  }, []);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accountId || !file) {
      setError("Choose an account and a CSV file.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.imports.preview(accountId, file);
      setPreview(res);
      setMapping(res.suggestedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview file");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!preview || mapping.date === undefined || mapping.amount === undefined) {
      setError("Map at least the Date and Amount columns.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.imports.commit(preview.importId, mapping as ColumnMapping);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to commit import");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Import complete</h1>
        <Card className="max-w-md">
          <CardBody className="space-y-2 text-sm">
            <p>
              <strong>{result.importedCount}</strong> transaction
              {result.importedCount === 1 ? "" : "s"} imported.
            </p>
            <p>
              <strong>{result.duplicateCount}</strong> duplicate
              {result.duplicateCount === 1 ? "" : "s"} skipped (already in your ledger).
            </p>
            {result.errorCount > 0 && (
              <p className="text-red-600">
                <strong>{result.errorCount}</strong> row{result.errorCount === 1 ? "" : "s"} could
                not be parsed.
              </p>
            )}
          </CardBody>
        </Card>
        <Link
          href="/transactions"
          className="mt-4 inline-block text-sm font-medium text-slate-900 underline"
        >
          Go to Transactions
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Import bank statement (CSV)</h1>

      {!preview ? (
        <Card className="max-w-md">
          <CardHeader className="text-sm font-medium">1. Choose file</CardHeader>
          <CardBody>
            <form onSubmit={handlePreview} className="space-y-3">
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
                <Label htmlFor="file">CSV file</Label>
                <input
                  id="file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Reading file..." : "Preview"}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="text-sm font-medium">2. Confirm column mapping</CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {FIELD_LABELS.map(({ key, label, required }) => (
                  <div key={key}>
                    <Label htmlFor={key}>
                      {label}
                      {required ? "" : " (optional)"}
                    </Label>
                    <Select
                      id={key}
                      className="w-full"
                      value={mapping[key] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [key]: e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                    >
                      <option value="">{required ? "Choose column..." : "None"}</option>
                      {preview.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="text-sm font-medium">
              3. Preview ({preview.totalRows} row{preview.totalRows === 1 ? "" : "s"} total)
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.previewRows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCommit} disabled={loading}>
              {loading ? "Importing..." : `Import ${preview.totalRows} transactions`}
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Start over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
