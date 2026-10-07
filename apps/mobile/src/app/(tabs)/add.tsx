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
import type { Account, Person } from "../../api/client.js";
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

      {canSplit && people.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Shared with (optional)</Text>
          <View style={styles.chipRow}>
            {people.map((person) => (
              <Pressable
                key={person.id}
                style={[styles.chip, person.id in shares && styles.chipSelected]}
                onPress={() => toggleShared(person.id)}
              >
                <Text style={person.id in shares ? styles.chipTextSelected : styles.chipText}>
                  {person.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {sharedIds.length > 0 ? (
            <>
              {sharedIds.map((personId) => (
                <View key={personId} style={styles.shareRow}>
                  <Text style={styles.shareName}>
                    {people.find((p) => p.id === personId)?.name} owes
                  </Text>
                  <TextInput
                    style={[styles.input, styles.shareInput]}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={shares[personId]}
                    onChangeText={(value) => setShares((c) => ({ ...c, [personId]: value }))}
                  />
                </View>
              ))}
              <Pressable onPress={splitEqually}>
                <Text style={styles.link}>Split equally</Text>
              </Pressable>
              <Text style={styles.hint}>
                Your share: {yourShare >= 0 ? yourShare.toFixed(2) : "—"} · the rest is tracked as
                owed to you until they pay back.
              </Text>
            </>
          ) : null}
        </>
      ) : null}

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
  shareRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  shareName: { flex: 1, color: "#334155" },
  shareInput: { width: 120 },
  link: { color: "#2563EB", marginTop: 12 },
  hint: { color: "#64748B", marginTop: 8 },
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
