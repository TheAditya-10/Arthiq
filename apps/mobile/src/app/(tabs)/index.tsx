import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { TransactionRow } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";

function formatAmount(row: TransactionRow): string {
  const sign = row.direction === "DEBIT" ? "-" : "+";
  return `${sign}₹${row.amount.toFixed(2)}`;
}

export default function HomeScreen() {
  const { user, apiClient, logout } = useAuth();
  const [recent, setRecent] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.transactions.list({ page: 1, pageSize: 20 });
      setRecent(result.items);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsReview = recent.filter((t) => t.status === "NEEDS_REVIEW");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi, {user?.displayName}</Text>
        <Pressable onPress={() => void logout()}>
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </View>

      {needsReview.length > 0 ? (
        <Text style={styles.reviewBanner}>
          {needsReview.length} transaction{needsReview.length === 1 ? "" : "s"} need review
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Recent activity</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={recent}
          keyExtractor={(item) => item.id}
          onRefresh={load}
          refreshing={loading}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.merchant}>
                  {item.merchantRaw ?? item.description ?? item.type}
                </Text>
                <Text style={styles.meta}>
                  {new Date(item.occurredAt).toLocaleDateString()} · {item.classificationSource}
                </Text>
              </View>
              <Text style={[styles.amount, item.direction === "DEBIT" && styles.debit]}>
                {formatAmount(item)}
              </Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontSize: 20, fontWeight: "700", color: "#0F172A" },
  logout: { color: "#DC2626" },
  reviewBanner: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
    color: "#0F172A",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rowText: { flex: 1 },
  merchant: { fontSize: 15, color: "#0F172A" },
  meta: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "600", color: "#16A34A" },
  debit: { color: "#DC2626" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 24 },
});
