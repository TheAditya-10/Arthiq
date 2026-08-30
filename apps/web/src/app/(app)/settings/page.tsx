"use client";

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

  async function handleDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.users.deleteMe();
      await logout();
      router.push("/login");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader className="text-sm font-medium">Profile</CardHeader>
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
            {saved && <p className="text-sm text-emerald-700">Saved.</p>}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-sm font-medium text-red-600">Delete account</CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-slate-600">
            Permanently deletes your account and everything in it — accounts, transactions, people,
            ledger entries, categories, and history. This cannot be undone.
          </p>
          <Label htmlFor="confirmDelete">Type DELETE to confirm</Label>
          <Input
            id="confirmDelete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mb-3"
          />
          {deleteError && <p className="mb-3 text-sm text-red-600">{deleteError}</p>}
          <Button
            variant="danger"
            disabled={confirmText !== "DELETE" || deleting}
            onClick={handleDeleteAccount}
          >
            {deleting ? "Deleting..." : "Delete my account"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
