import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Bucket, SubBucket, TransactionRow } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";

/**
 * Reached either from the Transactions list or from tapping "Change" on the
 * local "Correct/Change" notification (docs/MOBILE_ARCHITECTURE.md §3) — in
 * the notification case the tap currently lands on the Transactions list
 * rather than here directly (see src/app/_layout.tsx), so this screen's job
 * is the actual per-transaction correction flow either way.
 */
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiClient } = useAuth();
  const router = useRouter();

  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [subBuckets, setSubBuckets] = useState<SubBucket[]>([]);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txn, bucketList] = await Promise.all([
        apiClient.transactions.get(id),
        apiClient.buckets.list(),
      ]);
      setTransaction(txn);
      setBuckets(bucketList);
      setSelectedBucketId(txn.bucketId);
      if (txn.bucketId) {
        setSubBuckets(await apiClient.subBuckets.list(txn.bucketId));
      }
    } finally {
      setLoading(false);
    }
  }, [apiClient, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectBucket(bucketId: string) {
    setSelectedBucketId(bucketId);
    setSubBuckets(await apiClient.subBuckets.list(bucketId));
  }

  async function selectSubBucket(subBucketId: string | null) {
    if (!transaction || !selectedBucketId) return;
    setSaving(true);
    try {
      await apiClient.transactions.update(transaction.id, {
        bucketId: selectedBucketId,
        subBucketId: subBucketId ?? undefined,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !transaction) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>
        {transaction.merchantRaw ?? transaction.description ?? "Transaction"}
      </Text>
      <Text style={styles.amount}>
        {transaction.direction === "DEBIT" ? "-" : "+"}₹{transaction.amount.toFixed(2)}
      </Text>
      <Text style={styles.meta}>{new Date(transaction.occurredAt).toLocaleString()}</Text>

      <Text style={styles.sectionTitle}>Category</Text>
      <View style={styles.chipRow}>
        {buckets.map((bucket) => (
          <Pressable
            key={bucket.id}
            style={[styles.chip, selectedBucketId === bucket.id && styles.chipSelected]}
            onPress={() => void selectBucket(bucket.id)}
          >
            <Text
              style={selectedBucketId === bucket.id ? styles.chipTextSelected : styles.chipText}
            >
              {bucket.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {selectedBucketId ? (
        <>
          <Text style={styles.sectionTitle}>Sub-category</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !transaction.subBucketId && styles.chipSelected]}
              onPress={() => void selectSubBucket(null)}
              disabled={saving}
            >
              <Text style={styles.chipText}>None</Text>
            </Pressable>
            {subBuckets.map((subBucket) => (
              <Pressable
                key={subBucket.id}
                style={[
                  styles.chip,
                  transaction.subBucketId === subBucket.id && styles.chipSelected,
                ]}
                onPress={() => void selectSubBucket(subBucket.id)}
                disabled={saving}
              >
                <Text
                  style={
                    transaction.subBucketId === subBucket.id
                      ? styles.chipTextSelected
                      : styles.chipText
                  }
                >
                  {subBucket.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {saving ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", color: "#0F172A" },
  amount: { fontSize: 24, fontWeight: "700", marginTop: 4, color: "#0F172A" },
  meta: { fontSize: 13, color: "#94A3B8", marginTop: 4 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 8,
    color: "#0F172A",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { color: "#334155" },
  chipTextSelected: { color: "#fff" },
});
