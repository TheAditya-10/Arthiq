import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { TransactionRow } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";

function formatAmount(row: TransactionRow): string {
  const sign = row.direction === "DEBIT" ? "-" : "+";
  return `${sign}₹${row.amount.toFixed(2)}`;
}

export default function TransactionsScreen() {
  const { apiClient } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.transactions.list({ page: 1, pageSize: 50 });
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          onRefresh={load}
          refreshing={loading}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({ pathname: "/transaction/[id]", params: { id: item.id } })
              }
            >
              <View style={styles.rowText}>
                <Text style={styles.merchant}>
                  {item.merchantRaw ?? item.description ?? item.type}
                </Text>
                <Text style={styles.meta}>
                  {new Date(item.occurredAt).toLocaleDateString()} ·{" "}
                  {item.bucketId ? "Categorized" : "Uncategorized"}
                </Text>
              </View>
              <Text style={[styles.amount, item.direction === "DEBIT" && styles.debit]}>
                {formatAmount(item)}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
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
