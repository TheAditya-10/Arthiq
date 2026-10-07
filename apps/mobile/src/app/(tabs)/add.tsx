import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Account, Person } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ChipRow,
  ErrorText,
  Field,
  type IconName,
  SectionTitle,
  formatRupees,
  radius,
  tabularNums,
  useTheme,
} from "../../ui/index.js";

type EntryType = "EXPENSE" | "INCOME" | "CASH_EXPENSE";
const TYPES: { value: EntryType; label: string; icon: IconName }[] = [
  { value: "EXPENSE", label: "Expense", icon: "arrow-up-circle-outline" },
  { value: "INCOME", label: "Income", icon: "arrow-down-circle-outline" },
  { value: "CASH_EXPENSE", label: "Cash", icon: "cash-outline" },
];

export default function AddScreen() {
  const { apiClient } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [type, setType] = useState<EntryType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  // personId -> what that person owes back (as typed); presence means "shared with them"
  const [shares, setShares] = useState<Record<string, string>>({});

  useEffect(() => {
    void apiClient.accounts.list().then((list) => {
      setAccounts(list);
      setAccountId((current) => current ?? list[0]?.id ?? null);
    });
  }, [apiClient]);

  useEffect(() => {
    void apiClient.people.list().then(setPeople);
  }, [apiClient]);

  const canSplit = type === "EXPENSE" || type === "CASH_EXPENSE";
  const sharedIds = Object.keys(shares);
  const sharedTotal = sharedIds.reduce((sum, id) => sum + (Number(shares[id]) || 0), 0);
  const total = Number(amount) || 0;
  const yourShare = Math.round((total - sharedTotal) * 100) / 100;

  function toggleShared(personId: string) {
    setShares((current) => {
      const next = { ...current };
      if (personId in next) delete next[personId];
      else next[personId] = "";
      return next;
    });
  }

  /** Splits the amount equally between you and everyone selected. */
  function splitEqually() {
    if (sharedIds.length === 0 || total <= 0) return;
    const each = Math.floor((total / (sharedIds.length + 1)) * 100) / 100;
    setShares(Object.fromEntries(sharedIds.map((id) => [id, String(each)])));
  }

  async function submit() {
    setError(null);
    const parsedAmount = Number(amount);
    if (!accountId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount and account.");
      return;
    }
    if (canSplit && sharedIds.length > 0) {
      if (sharedIds.some((id) => !(Number(shares[id]) > 0))) {
        setError("Enter how much each selected person owes.");
        return;
      }
      if (yourShare < 0) {
        setError("The shares add up to more than the payment.");
        return;
      }
    }
    setSaving(true);
    try {
      if (canSplit && sharedIds.length > 0) {
        await apiClient.transactions.split({
          accountId,
          amount: parsedAmount,
          occurredAt: new Date().toISOString(),
          description: description.trim() || undefined,
          shares: sharedIds.map((personId) => ({ personId, amount: Number(shares[personId]) })),
        });
        setAmount("");
        setDescription("");
        setShares({});
        router.push("/(tabs)/transactions");
        return;
      }
      await apiClient.transactions.create({
        accountId,
        type,
        amount: parsedAmount,
        direction: type === "INCOME" ? "CREDIT" : "DEBIT",
        occurredAt: new Date().toISOString(),
        description: description.trim() || undefined,
      });
      setAmount("");
      setDescription("");
      router.push("/(tabs)/transactions");
    } catch {
      setError("Could not save this transaction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 28, fontWeight: "800", color: t.text, letterSpacing: -0.7 }}>
            Add transaction
          </Text>

          {/* Type segmented control */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: t.surfaceAlt,
              borderRadius: radius.md,
              padding: 4,
              marginTop: 16,
            }}
          >
            {TYPES.map((option) => {
              const active = type === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setType(option.value)}
                  accessibilityState={{ selected: active }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    gap: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 10,
                    borderRadius: radius.sm,
                    backgroundColor: active ? t.surface : "transparent",
                  }}
                >
                  <Ionicons name={option.icon} size={16} color={active ? t.brand : t.textMuted} />
                  <Text style={{ fontWeight: "700", color: active ? t.text : t.textMuted }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Amount */}
          <Card style={{ marginTop: 16, alignItems: "center", paddingVertical: 26 }}>
            <Text style={{ color: t.textMuted, fontSize: 13, fontWeight: "600" }}>Amount</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Text
                style={{
                  fontSize: 38,
                  fontWeight: "800",
                  color: type === "INCOME" ? t.credit : t.text,
                }}
              >
                ₹
              </Text>
              <TextInput
                placeholder="0"
                placeholderTextColor={t.textFaint}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                style={[
                  {
                    fontSize: 44,
                    fontWeight: "800",
                    color: type === "INCOME" ? t.credit : t.text,
                    minWidth: 90,
                    paddingVertical: 0,
                    marginLeft: 4,
                  },
                  tabularNums,
                ]}
              />
            </View>
          </Card>

          <SectionTitle>Paid from</SectionTitle>
          <ChipRow>
            {accounts.map((account) => (
              <Chip
                key={account.id}
                label={account.name}
                icon="wallet-outline"
                selected={accountId === account.id}
                onPress={() => setAccountId(account.id)}
              />
            ))}
          </ChipRow>

          <View style={{ marginTop: 22 }}>
            <Field
              label="Note"
              icon="create-outline"
              placeholder="What was it for? (optional)"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {canSplit && people.length > 0 ? (
            <>
              <SectionTitle>Split with friends</SectionTitle>
              <ChipRow>
                {people.map((person) => (
                  <Chip
                    key={person.id}
                    label={person.name}
                    selected={person.id in shares}
                    onPress={() => toggleShared(person.id)}
                  />
                ))}
              </ChipRow>
              {sharedIds.length > 0 ? (
                <Card style={{ marginTop: 14 }}>
                  {sharedIds.map((personId) => {
                    const name = people.find((p) => p.id === personId)?.name ?? "";
                    return (
                      <View
                        key={personId}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 10,
                        }}
                      >
                        <Avatar name={name} size={36} />
                        <Text style={{ flex: 1, color: t.text, fontWeight: "600" }}>
                          {name} owes
                        </Text>
                        <TextInput
                          style={[
                            {
                              width: 110,
                              textAlign: "right",
                              fontSize: 16,
                              fontWeight: "700",
                              color: t.text,
                              backgroundColor: t.surfaceAlt,
                              borderRadius: radius.sm,
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                            },
                            tabularNums,
                          ]}
                          placeholder="0.00"
                          placeholderTextColor={t.textFaint}
                          keyboardType="decimal-pad"
                          value={shares[personId]}
                          onChangeText={(value) => setShares((c) => ({ ...c, [personId]: value }))}
                        />
                      </View>
                    );
                  })}
                  <Pressable onPress={splitEqually} style={{ marginTop: 2 }}>
                    <Text style={{ color: t.brand, fontWeight: "700" }}>Split equally</Text>
                  </Pressable>
                  <View
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: radius.sm,
                      backgroundColor: t.brandSoft,
                    }}
                  >
                    <Text style={{ color: t.text, fontWeight: "700" }}>
                      Your share: {yourShare >= 0 ? formatRupees(yourShare) : "—"}
                    </Text>
                    <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>
                      The rest is tracked as owed to you until they pay back.
                    </Text>
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}

          {error ? <ErrorText>{error}</ErrorText> : null}

          <Button
            label="Save transaction"
            icon="checkmark"
            onPress={submit}
            loading={saving}
            style={{ marginTop: 24 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
