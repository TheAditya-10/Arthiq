"use client";

import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await api.users.updateMe({ displayName, timezone });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const data = await api.users.exportMe();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `arthiq-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not export your data");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.users.deleteMe(deletePassword);
      await logout();
      router.push("/login");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6 [&>div:first-child]:mb-0">
      <PageHeader title="Settings" description="Your profile and account." />

      <Card>
        <CardHeader className="text-sm font-bold text-slate-900">Profile</CardHeader>
        <CardBody>
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div>
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
            {saved && <Alert tone="success">Saved.</Alert>}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-sm font-bold text-slate-900">Your data</CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-slate-600">
            Download a complete copy of everything we hold about you as a JSON file: accounts,
            transactions, people, categories and more. Your password and sessions are never
            included. You can do this a few times per hour.
          </p>
          {exportError && <Alert className="mb-3">{exportError}</Alert>}
          <Button variant="secondary" disabled={exporting} onClick={handleExport}>
            {exporting ? "Preparing..." : "Download my data"}
          </Button>
          <p className="mt-4 text-xs text-slate-500">
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            ·{" "}
            <Link href="/trust" className="underline">
              How we protect your data
            </Link>
          </p>
        </CardBody>
      </Card>

      <Card className="border-red-100">
        <CardHeader className="text-sm font-bold text-red-600">Delete account</CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-slate-600">
            Permanently deletes your account and everything in it — accounts, transactions, people,
            ledger entries, categories, and history. This cannot be undone.
          </p>
          <Label htmlFor="deletePassword">Your password</Label>
          <Input
            id="deletePassword"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="mb-3"
          />
          <Label htmlFor="confirmDelete">Type DELETE to confirm</Label>
          <Input
            id="confirmDelete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mb-3"
          />
          {deleteError && <Alert className="mb-3">{deleteError}</Alert>}
          <Button
            variant="danger"
            disabled={confirmText !== "DELETE" || !deletePassword || deleting}
            onClick={handleDeleteAccount}
          >
            {deleting ? "Deleting..." : "Delete my account"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
