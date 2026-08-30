import { NotificationProviderKey } from "@arthiq/types";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as NativeListener from "../../../modules/notification-listener/index.js";
import type { Account } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useNotificationSettings } from "../../notifications/NotificationSettingsContext.js";

const PROVIDER_LABELS: { key: NotificationProviderKey; label: string }[] = [
  { key: NotificationProviderKey.GOOGLE_PAY, label: "Google Pay" },
  { key: NotificationProviderKey.PHONEPE, label: "PhonePe" },
  { key: NotificationProviderKey.PAYTM, label: "Paytm" },
];

export default function SettingsScreen() {
  const { user, apiClient, logout } = useAuth();
  const { settings, updateSettings } = useNotificationSettings();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accessStatus, setAccessStatus] = useState<"granted" | "denied" | "unknown">("unknown");

  useEffect(() => {
    void apiClient.accounts.list().then(setAccounts);
    setAccessStatus(NativeListener.getAccessStatus());
  }, [apiClient]);

  async function setProviderAccount(provider: NotificationProviderKey, accountId: string | null) {
    const next = { ...settings, accountByProvider: { ...settings.accountByProvider } };
    if (accountId) {
      next.accountByProvider[provider] = accountId;
    } else {
      delete next.accountByProvider[provider];
    }
    await updateSettings(next);
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Account</Text>
      <Text style={styles.value}>{user?.email}</Text>
      <Pressable onPress={() => void logout()}>
        <Text style={styles.logout}>Sign out</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Notification access</Text>
      <Text style={styles.value}>
        {accessStatus === "granted" ? "Granted" : "Not granted"} — required to capture UPI
        transaction notifications automatically.
      </Text>
      {accessStatus !== "granted" ? (
        <Pressable style={styles.linkButton} onPress={() => NativeListener.openSettings()}>
          <Text style={styles.linkButtonText}>Open notification access settings</Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionTitle}>Capture from</Text>
      <Text style={styles.hint}>
        Map each payment app to the account its notifications should be recorded against. Leaving
        one unmapped means its notifications are ignored.
      </Text>

      {PROVIDER_LABELS.map(({ key, label }) => (
        <View key={key} style={styles.providerRow}>
          <Text style={styles.providerLabel}>{label}</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !settings.accountByProvider[key] && styles.chipSelected]}
              onPress={() => void setProviderAccount(key, null)}
            >
              <Text
                style={!settings.accountByProvider[key] ? styles.chipTextSelected : styles.chipText}
              >
                Off
              </Text>
            </Pressable>
            {accounts.map((account) => (
              <Pressable
                key={account.id}
                style={[
                  styles.chip,
                  settings.accountByProvider[key] === account.id && styles.chipSelected,
                ]}
                onPress={() => void setProviderAccount(key, account.id)}
              >
                <Text
                  style={
                    settings.accountByProvider[key] === account.id
                      ? styles.chipTextSelected
                      : styles.chipText
                  }
                >
                  {account.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 8,
    color: "#0F172A",
  },
  value: { fontSize: 15, color: "#334155" },
  hint: { fontSize: 13, color: "#94A3B8", marginBottom: 12 },
  logout: { color: "#DC2626", marginTop: 8 },
  linkButton: { marginTop: 8 },
  linkButtonText: { color: "#2563EB" },
  providerRow: { marginTop: 16 },
  providerLabel: { fontSize: 15, fontWeight: "600", marginBottom: 8, color: "#0F172A" },
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
});
