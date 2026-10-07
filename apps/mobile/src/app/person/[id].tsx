import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import type { Account, PersonWithBalance } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ChipRow,
  Field,
  SectionTitle,
  formatRupees,
  tabularNums,
  useTheme,
} from "../../ui/index.js";

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
  const t = useTheme();

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
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}
      >
        <ActivityIndicator color={t.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
    >
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Avatar name={person.name} size={72} />
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: t.text,
            marginTop: 12,
            letterSpacing: -0.5,
          }}
        >
          {person.name}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
        <Card style={{ flex: 1, backgroundColor: t.creditSoft, borderColor: "transparent" }}>
          <Text style={{ fontSize: 13, color: t.textMuted, fontWeight: "600" }}>They owe you</Text>
          <Text
            style={[
              { fontSize: 22, fontWeight: "800", color: t.credit, marginTop: 4 },
              tabularNums,
            ]}
          >
            {formatRupees(person.receivable)}
          </Text>
        </Card>
        <Card style={{ flex: 1, backgroundColor: t.debitSoft, borderColor: "transparent" }}>
          <Text style={{ fontSize: 13, color: t.textMuted, fontWeight: "600" }}>You owe them</Text>
          <Text
            style={[{ fontSize: 22, fontWeight: "800", color: t.debit, marginTop: 4 }, tabularNums]}
          >
            {formatRupees(person.payable)}
          </Text>
        </Card>
      </View>

      <SectionTitle>Record lending or repayment</SectionTitle>
      <ChipRow>
        {ENTRY_TYPES.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={entryType === option.value}
            onPress={() => setEntryType(option.value)}
          />
        ))}
      </ChipRow>

      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: t.textMuted,
          marginTop: 20,
          marginBottom: 8,
        }}
      >
        Account
      </Text>
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

      <View style={{ marginTop: 20 }}>
        <Field
          label="Amount"
          icon="cash-outline"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
      </View>

      <Button
        label="Save entry"
        icon="checkmark"
        onPress={recordEntry}
        loading={saving}
        style={{ marginTop: 12 }}
      />
    </ScrollView>
  );
}
