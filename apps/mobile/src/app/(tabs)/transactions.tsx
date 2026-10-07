import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TransactionRow } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import { Chip, EmptyState, TransactionRowView, rowTitle, useTheme } from "../../ui/index.js";

type Filter = "ALL" | "OUT" | "IN" | "REVIEW";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function TransactionsScreen() {
  const { apiClient } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const [items, setItems] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");

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

  const sections = useMemo(() => {
    const visible = items.filter((tx) =>
      filter === "ALL"
        ? true
        : filter === "OUT"
          ? tx.direction === "DEBIT"
          : filter === "IN"
            ? tx.direction === "CREDIT"
            : tx.status === "NEEDS_REVIEW",
    );
    const groups = new Map<string, TransactionRow[]>();
    for (const tx of visible) {
      const key = dayLabel(tx.occurredAt);
      groups.set(key, [...(groups.get(key) ?? []), tx]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [items, filter]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: t.text, letterSpacing: -0.7 }}>
          Activity
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 6 }}>
          <Chip label="All" selected={filter === "ALL"} onPress={() => setFilter("ALL")} />
          <Chip label="Spent" selected={filter === "OUT"} onPress={() => setFilter("OUT")} />
          <Chip label="Received" selected={filter === "IN"} onPress={() => setFilter("IN")} />
          <Chip
            label="To review"
            selected={filter === "REVIEW"}
            onPress={() => setFilter("REVIEW")}
          />
        </View>
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator color={t.brand} style={{ marginTop: 32 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          onRefresh={load}
          refreshing={loading}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderSectionHeader={({ section }) => (
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: t.textMuted,
                marginTop: 14,
                marginBottom: 8,
              }}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <TransactionRowView
              title={rowTitle(item)}
              meta={item.bucketId ? "Categorized" : "Needs a category"}
              amount={item.amount}
              direction={item.direction}
              type={item.type}
              badge={item.status === "NEEDS_REVIEW" ? "Review" : undefined}
              onPress={() =>
                router.push({ pathname: "/transaction/[id]", params: { id: item.id } })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={filter === "ALL" ? "No transactions yet" : "Nothing in this view"}
              hint={
                filter === "ALL"
                  ? "Payments from your UPI apps land here automatically."
                  : "Try a different filter."
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
