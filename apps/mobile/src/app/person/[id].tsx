import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Account, PersonWithBalance } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";

type EntryType = "LENT" | "BORROWED" | "REPAYMENT_RECEIVED" | "REPAYMENT_MADE";
const ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: "LENT", label: "Lent" },
  { value: "BORROWED", label: "Borrowed" },
  { value: "REPAYMENT_RECEIVED", label: "Repayment received" },
  { value: "REPAYMENT_MADE", label: "Repayment made" },
];

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiClient } = useAuth();

  const [person, setPerson] = useState<PersonWithBalance | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entryType, setEntryType] = useState<EntryType>("LENT");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [personResult, accountList] = await Promise.all([
        apiClient.people.get(id),
        apiClient.accounts.list(),
      ]);
      setPerson(personResult);
      setAccounts(accountList);
      setAccountId((current) => current ?? accountList[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [apiClient, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordEntry() {
    const parsedAmount = Number(amount);
    if (!accountId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    setSaving(true);
    try {
      await apiClient.people.addLedgerEntry({
        personId: id,
        entryType,
        accountId,
        amount: parsedAmount,
        occurredAt: new Date().toISOString(),
      });
      setAmount("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !person) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{person.name}</Text>

      <View style={styles.balanceRow}>
        <View style={styles.balanceCell}>
          <Text style={styles.balanceLabel}>They owe you</Text>
          <Text style={styles.balancePositive}>₹{person.receivable.toFixed(2)}</Text>
        </View>
        <View style={styles.balanceCell}>
          <Text style={styles.balanceLabel}>You owe them</Text>
          <Text style={styles.balanceNegative}>₹{person.payable.toFixed(2)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Record lending / repayment</Text>

      <View style={styles.chipRow}>
        {ENTRY_TYPES.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.chip, entryType === option.value && styles.chipSelected]}
            onPress={() => setEntryType(option.value)}
          >
            <Text style={entryType === option.value ? styles.chipTextSelected : styles.chipText}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Account</Text>
      <View style={styles.chipRow}>
        {accounts.map((account) => (
          <Pressable
            key={account.id}
            style={[styles.chip, accountId === account.id && styles.chipSelected]}
            onPress={() => setAccountId(account.id)}
          >
            <Text style={accountId === account.id ? styles.chipTextSelected : styles.chipText}>
              {account.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <Pressable
        style={[styles.submitButton, saving && styles.submitButtonDisabled]}
        onPress={recordEntry}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  balanceRow: { flexDirection: "row", marginTop: 16, gap: 16 },
  balanceCell: { flex: 1 },
  balanceLabel: { fontSize: 12, color: "#94A3B8" },
  balancePositive: { fontSize: 20, fontWeight: "700", color: "#16A34A" },
  balanceNegative: { fontSize: 20, fontWeight: "700", color: "#DC2626" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 28,
    marginBottom: 8,
    color: "#0F172A",
  },
  label: { fontSize: 13, color: "#64748B", marginTop: 16, marginBottom: 8 },
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
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontWeight: "600" },
});
