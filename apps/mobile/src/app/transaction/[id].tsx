import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Bucket, Person, SubBucket, TransactionRow } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import { type Theme, formatRupees, radius, useTheme } from "../../ui/index.js";

type LedgerKind = "LENT" | "REPAYMENT_MADE" | "REPAYMENT_RECEIVED" | "BORROWED";

const DEBIT_KINDS: { value: LedgerKind; label: string }[] = [
  { value: "LENT", label: "I lent this to a friend" },
  { value: "REPAYMENT_MADE", label: "I paid back a friend" },
];
const CREDIT_KINDS: { value: LedgerKind; label: string }[] = [
  { value: "REPAYMENT_RECEIVED", label: "A friend paid me back" },
  { value: "BORROWED", label: "I borrowed from a friend" },
];

/** Transaction types that already belong to the people ledger or are balance-only. */
const NON_CONVERTIBLE_TYPES = [
  "LENT",
  "BORROWED",
  "LENT_REPAYMENT",
  "BORROWED_REPAYMENT",
  "TRANSFER",
];

/**
 * Reached either from the Transactions list or from tapping "Change" on the
 * local "Correct/Change" notification (docs/MOBILE_ARCHITECTURE.md §3).
 * Besides picking a category, it lets you create a new category/sub-category,
 * record the transaction as money lent to / repaid by a friend, or split the
 * bill. The last two replace the captured transaction: the new ledger/split
 * entries are created first, then the original is voided, so a failure in
 * between never loses the payment.
 */
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiClient } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [subBuckets, setSubBuckets] = useState<SubBucket[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBucketName, setNewBucketName] = useState<string | null>(null);
  const [newSubBucketName, setNewSubBucketName] = useState<string | null>(null);

  const [ledgerKind, setLedgerKind] = useState<LedgerKind | null>(null);
  const [ledgerPersonId, setLedgerPersonId] = useState<string | null>(null);
  const [newPersonName, setNewPersonName] = useState("");

  const [splitOpen, setSplitOpen] = useState(false);
  // personId -> what that person owes back (as typed); presence means "in the split"
  const [shares, setShares] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txn, bucketList, peopleList] = await Promise.all([
        apiClient.transactions.get(id),
        apiClient.buckets.list(),
        apiClient.people.list(),
      ]);
      setTransaction(txn);
      setBuckets(bucketList);
      setPeople(peopleList);
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

  async function selectSubBucket(subBucketId: string | null, bucketId = selectedBucketId) {
    if (!transaction || !bucketId) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.transactions.update(transaction.id, {
        bucketId,
        subBucketId: subBucketId ?? undefined,
      });
      router.back();
    } catch {
      setError("Could not save the category.");
    } finally {
      setSaving(false);
    }
  }

  async function createBucket() {
    const name = newBucketName?.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await apiClient.buckets.create({ name });
      setBuckets(await apiClient.buckets.list());
      setNewBucketName(null);
      setSelectedBucketId(created.id);
      setSubBuckets([]);
    } catch {
      setError("Could not create that category (does it already exist?).");
    }
  }

  async function createSubBucket() {
    const name = newSubBucketName?.trim();
    if (!name || !selectedBucketId) return;
    setError(null);
    try {
      const created = await apiClient.subBuckets.create({ bucketId: selectedBucketId, name });
      setNewSubBucketName(null);
      // Picking it saves the transaction into it straight away.
      await selectSubBucket(created.id);
    } catch {
      setError("Could not create that sub-category (does it already exist?).");
    }
  }

  async function resolvePersonId(): Promise<string | null> {
    if (ledgerPersonId) return ledgerPersonId;
    const name = newPersonName.trim();
    if (!name) return null;
    const created = await apiClient.people.create({ name });
    return created.id;
  }

  async function saveLedgerEntry() {
    if (!transaction || !ledgerKind) return;
    setError(null);
    setSaving(true);
    try {
      const personId = await resolvePersonId();
      if (!personId) {
        setError("Pick a person or type a new name.");
        return;
      }
      await apiClient.people.addLedgerEntry({
        personId,
        entryType: ledgerKind,
        accountId: transaction.accountId,
        amount: transaction.amount,
        occurredAt: transaction.occurredAt,
        notes: transaction.merchantRaw ?? transaction.description ?? undefined,
      });
      await replaceOriginal(transaction.id);
    } catch {
      setError("Could not record this with your friend. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  const sharedIds = Object.keys(shares);
  const total = transaction?.amount ?? 0;
  const sharedTotal = sharedIds.reduce((sum, key) => sum + (Number(shares[key]) || 0), 0);
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
    setShares(Object.fromEntries(sharedIds.map((key) => [key, String(each)])));
  }

  async function saveSplit() {
    if (!transaction) return;
    setError(null);
    if (sharedIds.length === 0 || sharedIds.some((key) => !(Number(shares[key]) > 0))) {
      setError("Select people and enter how much each owes.");
      return;
    }
    if (yourShare < 0) {
      setError("The shares add up to more than the payment.");
      return;
    }
    setSaving(true);
    try {
      const sameBucket = transaction.bucketId === selectedBucketId;
      await apiClient.transactions.split({
        accountId: transaction.accountId,
        amount: transaction.amount,
        occurredAt: transaction.occurredAt,
        merchantRaw: transaction.merchantRaw ?? undefined,
        description: transaction.description ?? undefined,
        bucketId: selectedBucketId ?? undefined,
        subBucketId: sameBucket ? (transaction.subBucketId ?? undefined) : undefined,
        shares: sharedIds.map((personId) => ({ personId, amount: Number(shares[personId]) })),
      });
      await replaceOriginal(transaction.id);
    } catch {
      setError("Could not split this payment. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  /** Voids the captured transaction once its replacement exists. */
  async function replaceOriginal(originalId: string) {
    try {
      await apiClient.transactions.remove(originalId);
    } catch {
      setError(
        "Saved, but the original captured payment could not be removed — delete it from the Transactions list to avoid counting it twice.",
      );
      return;
    }
    router.back();
  }

  if (loading || !transaction) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.brand} />
      </View>
    );
  }

  const convertible =
    !NON_CONVERTIBLE_TYPES.includes(transaction.type) && transaction.status !== "VOIDED";
  const ledgerKinds = transaction.direction === "DEBIT" ? DEBIT_KINDS : CREDIT_KINDS;
  const canSplit = convertible && transaction.direction === "DEBIT";

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.title}>
          {transaction.merchantRaw ?? transaction.description ?? "Transaction"}
        </Text>
        <Text style={styles.amount}>
          {transaction.direction === "DEBIT" ? "−" : "+"}
          {formatRupees(transaction.amount)}
        </Text>
        <Text style={styles.meta}>
          {new Date(transaction.occurredAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      </View>

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
        <Pressable style={styles.chipAdd} onPress={() => setNewBucketName("")}>
          <Text style={styles.chipAddText}>+ New category</Text>
        </Pressable>
      </View>
      {newBucketName !== null ? (
        <View style={styles.inlineForm}>
          <TextInput
            style={styles.input}
            placeholder="New category name"
            value={newBucketName}
            onChangeText={setNewBucketName}
            autoFocus
          />
          <Pressable style={styles.primaryButton} onPress={() => void createBucket()}>
            <Text style={styles.primaryButtonText}>Add</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedBucketId ? (
        <>
          <Text style={styles.sectionTitle}>Sub-category</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !transaction.subBucketId && styles.chipSelected]}
              onPress={() => void selectSubBucket(null)}
              disabled={saving}
            >
              <Text style={!transaction.subBucketId ? styles.chipTextSelected : styles.chipText}>
                None
              </Text>
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
            <Pressable style={styles.chipAdd} onPress={() => setNewSubBucketName("")}>
              <Text style={styles.chipAddText}>+ New sub-category</Text>
            </Pressable>
          </View>
          {newSubBucketName !== null ? (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.input}
                placeholder="New sub-category name"
                value={newSubBucketName}
                onChangeText={setNewSubBucketName}
                autoFocus
              />
              <Pressable style={styles.primaryButton} onPress={() => void createSubBucket()}>
                <Text style={styles.primaryButtonText}>Add</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      {convertible ? (
        <>
          <Text style={styles.sectionTitle}>With a friend</Text>
          <Text style={styles.hint}>
            Money lent to or from a friend is tracked in People, not counted as your expense.
          </Text>
          <View style={styles.chipRow}>
            {ledgerKinds.map((kind) => (
              <Pressable
                key={kind.value}
                style={[styles.chip, ledgerKind === kind.value && styles.chipSelected]}
                onPress={() => setLedgerKind(ledgerKind === kind.value ? null : kind.value)}
              >
                <Text style={ledgerKind === kind.value ? styles.chipTextSelected : styles.chipText}>
                  {kind.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {ledgerKind ? (
            <>
              <Text style={styles.subLabel}>Which friend?</Text>
              <View style={styles.chipRow}>
                {people.map((person) => (
                  <Pressable
                    key={person.id}
                    style={[styles.chip, ledgerPersonId === person.id && styles.chipSelected]}
                    onPress={() => {
                      setLedgerPersonId(ledgerPersonId === person.id ? null : person.id);
                      setNewPersonName("");
                    }}
                  >
                    <Text
                      style={
                        ledgerPersonId === person.id ? styles.chipTextSelected : styles.chipText
                      }
                    >
                      {person.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="…or type a new person's name"
                value={newPersonName}
                onChangeText={(text) => {
                  setNewPersonName(text);
                  if (text) setLedgerPersonId(null);
                }}
              />
              <Pressable
                style={[styles.primaryButton, styles.fullButton]}
                onPress={() => void saveLedgerEntry()}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>Save with friend</Text>
              </Pressable>
            </>
          ) : null}
        </>
      ) : null}

      {canSplit ? (
        <>
          <Text style={styles.sectionTitle}>Split this bill</Text>
          {!splitOpen ? (
            <Pressable style={styles.chipAdd} onPress={() => setSplitOpen(true)}>
              <Text style={styles.chipAddText}>Split with friends</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.hint}>
                Pick who shared this. Your part stays your expense; each friend's part is recorded
                as money they owe you.
              </Text>
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
              {people.length === 0 ? (
                <Text style={styles.hint}>Add friends first from the People tab.</Text>
              ) : null}
              {sharedIds.map((personId) => (
                <View key={personId} style={styles.shareRow}>
                  <Text style={styles.shareName}>
                    {people.find((person) => person.id === personId)?.name}
                  </Text>
                  <TextInput
                    style={[styles.input, styles.shareInput]}
                    keyboardType="decimal-pad"
                    placeholder="owes ₹"
                    value={shares[personId]}
                    onChangeText={(text) =>
                      setShares((current) => ({ ...current, [personId]: text }))
                    }
                  />
                </View>
              ))}
              {sharedIds.length > 0 ? (
                <>
                  <Pressable onPress={splitEqually}>
                    <Text style={styles.link}>Split equally</Text>
                  </Pressable>
                  <Text style={styles.hint}>Your share: ₹{yourShare.toFixed(2)}</Text>
                  <Pressable
                    style={[styles.primaryButton, styles.fullButton]}
                    onPress={() => void saveSplit()}
                    disabled={saving}
                  >
                    <Text style={styles.primaryButtonText}>Save split</Text>
                  </Pressable>
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saving ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg, padding: 16 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
    hero: {
      backgroundColor: t.brandDeep,
      borderRadius: radius.xl,
      padding: 22,
      marginBottom: 4,
    },
    title: { fontSize: 16, fontWeight: "600", color: "#A9D4CC" },
    amount: {
      fontSize: 38,
      fontWeight: "800",
      letterSpacing: -1,
      marginTop: 4,
      color: "#FFFFFF",
      fontVariant: ["tabular-nums"],
    },
    meta: { fontSize: 13, color: "#A9D4CC", marginTop: 6 },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      marginTop: 26,
      marginBottom: 10,
      color: t.text,
      letterSpacing: -0.2,
    },
    subLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: t.textMuted,
      marginTop: 14,
      marginBottom: 8,
    },
    hint: { fontSize: 13.5, color: t.textMuted, marginBottom: 10 },
    error: {
      color: t.debit,
      marginTop: 16,
      backgroundColor: t.debitSoft,
      padding: 12,
      borderRadius: radius.md,
    },
    link: { color: t.brand, marginTop: 8, fontWeight: "600" },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      borderRadius: radius.pill,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    chipSelected: { backgroundColor: t.brand, borderColor: t.brand },
    chipText: { color: t.text, fontWeight: "500" },
    chipTextSelected: { color: t.onBrand, fontWeight: "700" },
    chipAdd: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: t.brand,
      borderRadius: radius.pill,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    chipAddText: { color: t.brand, fontWeight: "600" },
    inlineForm: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginTop: 8,
      color: t.text,
    },
    primaryButton: {
      backgroundColor: t.brand,
      borderRadius: radius.md,
      paddingVertical: 13,
      paddingHorizontal: 20,
      alignItems: "center",
      marginTop: 8,
    },
    fullButton: { marginTop: 14 },
    primaryButtonText: { color: t.onBrand, fontWeight: "700" },
    shareRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    shareName: { width: 110, color: t.text },
    shareInput: { flex: 1 },
  });
}
