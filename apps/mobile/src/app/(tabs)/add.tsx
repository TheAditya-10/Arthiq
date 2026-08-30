import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Account } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";

type EntryType = "EXPENSE" | "INCOME" | "CASH_EXPENSE";
const TYPES: { value: EntryType; label: string }[] = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
  { value: "CASH_EXPENSE", label: "Cash expense" },
];

export default function AddScreen() {
  const { apiClient } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [type, setType] = useState<EntryType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiClient.accounts.list().then((list) => {
      setAccounts(list);
      setAccountId((current) => current ?? list[0]?.id ?? null);
    });
  }, [apiClient]);

  async function submit() {
    setError(null);
    const parsedAmount = Number(amount);
    if (!accountId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount and account.");
      return;
    }
    setSaving(true);
    try {
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
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Type</Text>
      <View style={styles.chipRow}>
        {TYPES.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.chip, type === option.value && styles.chipSelected]}
            onPress={() => setType(option.value)}
          >
            <Text style={type === option.value ? styles.chipTextSelected : styles.chipText}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
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

      <Text style={styles.sectionTitle}>Amount</Text>
      <TextInput
        style={styles.input}
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.sectionTitle}>Description</Text>
      <TextInput
        style={styles.input}
        placeholder="Optional"
        value={description}
        onChangeText={setDescription}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.submitButton, saving && styles.submitButtonDisabled]}
        onPress={submit}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 20,
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
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: "#DC2626", marginTop: 12 },
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
