"use client";

import { FolderTree } from "lucide-react";
import { EmptyState, Loading } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type Bucket, type SubBucket, api } from "@/lib/api";

export default function CategoriesPage() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [subBucketsByBucket, setSubBucketsByBucket] = useState<Record<string, SubBucket[]>>({});
  const [loading, setLoading] = useState(true);
  const [newBucketName, setNewBucketName] = useState("");
  const [newSubBucketName, setNewSubBucketName] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const list = await api.buckets.list();
      setBuckets(list);
      const entries = await Promise.all(
        list.map(async (b) => [b.id, await api.subBuckets.list(b.id)] as const),
      );
      setSubBucketsByBucket(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAddBucket(e: React.FormEvent) {
    e.preventDefault();
    if (!newBucketName.trim()) return;
    await api.buckets.create(newBucketName.trim());
    setNewBucketName("");
    await load();
  }

  async function handleAddSubBucket(bucketId: string) {
    const name = (newSubBucketName[bucketId] ?? "").trim();
    if (!name) return;
    await api.subBuckets.create(bucketId, name);
    setNewSubBucketName((prev) => ({ ...prev, [bucketId]: "" }));
    await load();
  }

  async function handleArchiveBucket(id: string) {
    await api.buckets.archive(id);
    await load();
  }

  async function handleArchiveSubBucket(id: string) {
    await api.subBuckets.archive(id);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Group your spending into buckets and sub-categories."
      />

      <form onSubmit={handleAddBucket} className="mb-6 flex max-w-sm gap-2">
        <Input
          placeholder="Add a bucket (e.g. Food)..."
          value={newBucketName}
          onChange={(e) => setNewBucketName(e.target.value)}
        />
        <Button type="submit">Add</Button>
      </form>

      {loading ? (
        <Loading />
      ) : buckets.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet">
          No categories yet. Add a bucket above — rule/heuristic classification only matches buckets
          that already exist.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {buckets.map((bucket) => (
            <Card key={bucket.id}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-bold text-slate-900">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <FolderTree size={16} />
                    </span>
                    {bucket.name}
                  </h2>
                  <Button
                    variant="ghost"
                    className="px-0 text-red-600 hover:bg-transparent hover:underline"
                    onClick={() => handleArchiveBucket(bucket.id)}
                  >
                    Archive
                  </Button>
                </div>

                <ul className="mt-3 space-y-1">
                  {(subBucketsByBucket[bucket.id] ?? []).map((sub) => (
                    <li
                      key={sub.id}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {sub.name}
                      <button
                        className="text-xs text-red-500 hover:underline"
                        onClick={() => handleArchiveSubBucket(sub.id)}
                      >
                        Archive
                      </button>
                    </li>
                  ))}
                  {(subBucketsByBucket[bucket.id] ?? []).length === 0 ? (
                    <li className="text-sm text-slate-400">No sub-categories yet.</li>
                  ) : null}
                </ul>

                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Add sub-category..."
                    value={newSubBucketName[bucket.id] ?? ""}
                    onChange={(e) =>
                      setNewSubBucketName((prev) => ({ ...prev, [bucket.id]: e.target.value }))
                    }
                  />
                  <Button variant="secondary" onClick={() => handleAddSubBucket(bucket.id)}>
                    Add
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
