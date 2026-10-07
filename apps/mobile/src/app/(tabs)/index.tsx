import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TransactionRow } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import {
  Avatar,
  EmptyState,
  Logo,
  SectionTitle,
  TransactionRowView,
  formatRupees,
  radius,
  rowTitle,
  tabularNums,
  useTheme,
} from "../../ui/index.js";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const [recent, setRecent] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { apiClient } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.transactions.list({ page: 1, pageSize: 50 });
      setRecent(result.items);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsReview = recent.filter((tx) => tx.status === "NEEDS_REVIEW");

  const month = useMemo(() => {
    const now = new Date();
    let spent = 0;
    let received = 0;
    for (const tx of recent) {
      const d = new Date(tx.occurredAt);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      if (tx.status === "VOIDED") continue;
      if (tx.direction === "DEBIT") spent += tx.amount;
      else received += tx.amount;
    }
    return { spent, received, label: now.toLocaleString("en-IN", { month: "long" }) };
  }, [recent]);

  const name = user?.displayName ?? "there";

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={t.brand} />
        }
      >
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Logo size={34} />
          <Pressable
            accessibilityLabel="Open settings"
            onPress={() => router.push("/(tabs)/settings")}
          >
            <Avatar name={name} size={38} />
          </Pressable>
        </View>

        <Text style={{ fontSize: 15, color: t.textMuted, marginTop: 22 }}>{greeting()},</Text>
        <Text style={{ fontSize: 26, fontWeight: "800", color: t.text, letterSpacing: -0.6 }}>
          {name}
        </Text>

        {/* Hero: this month at a glance */}
        <View
          style={{
            marginTop: 18,
            backgroundColor: t.brandDeep,
            borderRadius: radius.xl,
            padding: 22,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              right: -50,
              top: -50,
              width: 190,
              height: 190,
              borderRadius: 95,
              backgroundColor: "#14776B",
              opacity: 0.45,
            }}
          />
          <View
            style={{
              position: "absolute",
              right: 40,
              bottom: -70,
              width: 130,
              height: 130,
              borderRadius: 65,
              backgroundColor: "#F2A81D",
              opacity: 0.16,
            }}
          />
          <Text style={{ color: "#A9D4CC", fontSize: 14, fontWeight: "600" }}>
            Spent in {month.label}
          </Text>
          <Text
            style={[
              {
                color: "#FFFFFF",
                fontSize: 40,
                fontWeight: "800",
                letterSpacing: -1,
                marginTop: 4,
              },
              tabularNums,
            ]}
          >
            {formatRupees(month.spent)}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
            <HeroStat
              icon="arrow-down"
              label="Received"
              value={formatRupees(month.received)}
              good
            />
            <HeroStat
              icon="swap-vertical"
              label="Net"
              value={formatRupees(month.received - month.spent, { sign: true })}
            />
          </View>
        </View>

        {needsReview.length > 0 ? (
          <Pressable
            onPress={() => router.push("/(tabs)/transactions")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: t.warnSoft,
              padding: 14,
              borderRadius: radius.md,
              marginTop: 14,
            }}
          >
            <Ionicons name="alert-circle" size={22} color={t.onWarn} />
            <Text style={{ flex: 1, color: t.onWarn, fontWeight: "600" }}>
              {needsReview.length} transaction{needsReview.length === 1 ? "" : "s"} need a quick
              look
            </Text>
            <Ionicons name="chevron-forward" size={18} color={t.onWarn} />
          </Pressable>
        ) : null}

        <SectionTitle
          action={
            <Pressable onPress={() => router.push("/(tabs)/transactions")}>
              <Text style={{ color: t.brand, fontWeight: "700", fontSize: 14 }}>See all</Text>
            </Pressable>
          }
        >
          Recent activity
        </SectionTitle>

        {loading && recent.length === 0 ? (
          <ActivityIndicator color={t.brand} style={{ marginTop: 24 }} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon="sparkles-outline"
            title="Nothing here yet"
            hint="Pay with Google Pay, PhonePe or Paytm and it shows up here, or tap + to add one yourself."
          />
        ) : (
          recent.slice(0, 8).map((item) => (
            <TransactionRowView
              key={item.id}
              title={rowTitle(item)}
              meta={new Date(item.occurredAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
              amount={item.amount}
              direction={item.direction}
              type={item.type}
              badge={item.status === "NEEDS_REVIEW" ? "Review" : undefined}
              onPress={() =>
                router.push({ pathname: "/transaction/[id]", params: { id: item.id } })
              }
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroStat({
  icon,
  label,
  value,
  good,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: "rgba(255,255,255,0.10)",
        borderRadius: radius.md,
        padding: 12,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: good ? "rgba(61,211,154,0.25)" : "rgba(255,255,255,0.15)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={16} color={good ? "#3DD39A" : "#FFFFFF"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#A9D4CC", fontSize: 12 }}>{label}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }, tabularNums]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
