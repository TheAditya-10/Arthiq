import { NotificationProviderKey } from "@arthiq/types";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as NativeListener from "../../../modules/notification-listener/index.js";
import type { Account } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import { getDiagnostics, subscribeDiagnostics } from "../../notifications/diagnostics.js";
import { useNotificationSettings } from "../../notifications/NotificationSettingsContext.js";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ChipRow,
  SectionTitle,
  radius,
  useTheme,
} from "../../ui/index.js";

const PROVIDER_LABELS: { key: NotificationProviderKey; label: string }[] = [
  { key: NotificationProviderKey.GOOGLE_PAY, label: "Google Pay" },
  { key: NotificationProviderKey.PHONEPE, label: "PhonePe" },
  { key: NotificationProviderKey.PAYTM, label: "Paytm" },
  { key: NotificationProviderKey.GENERIC_UPI, label: "Bank SMS alerts (any UPI app)" },
];

export default function SettingsScreen() {
  const { user, apiClient, logout } = useAuth();
  const t = useTheme();
  const { settings, updateSettings } = useNotificationSettings();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const diagnostics = useSyncExternalStore(subscribeDiagnostics, getDiagnostics);
  const [listenerStatus, setListenerStatus] = useState<NativeListener.ListenerStatus | null>(null);
  const [accessStatus, setAccessStatus] = useState<"granted" | "denied" | "unknown">("unknown");

  useEffect(() => {
    void apiClient.accounts.list().then(setAccounts);
    setAccessStatus(NativeListener.getAccessStatus());
  }, [apiClient]);

  useEffect(() => {
    const refresh = () => setListenerStatus(NativeListener.getListenerStatus());
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);

  async function setProviderAccount(provider: NotificationProviderKey, accountId: string | null) {
    const next = { ...settings, accountByProvider: { ...settings.accountByProvider } };
    if (accountId) {
      next.accountByProvider[provider] = accountId;
    } else {
      delete next.accountByProvider[provider];
    }
    await updateSettings(next);
  }

  const granted = accessStatus === "granted";

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: t.text, letterSpacing: -0.7 }}>
          Settings
        </Text>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 }}>
          <Avatar name={user?.displayName ?? user?.email ?? "?"} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: t.text }}>
              {user?.displayName}
            </Text>
            <Text style={{ fontSize: 13.5, color: t.textMuted }}>{user?.email}</Text>
          </View>
          <Pressable
            accessibilityLabel="Sign out"
            onPress={() => void logout()}
            style={{ padding: 10, borderRadius: radius.pill, backgroundColor: t.debitSoft }}
          >
            <Ionicons name="log-out-outline" size={20} color={t.debit} />
          </Pressable>
        </Card>

        <SectionTitle>Automatic capture</SectionTitle>
        <Card
          style={{
            backgroundColor: granted ? t.creditSoft : t.warnSoft,
            borderColor: "transparent",
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Ionicons
              name={granted ? "checkmark-circle" : "alert-circle"}
              size={28}
              color={granted ? t.credit : t.onWarn}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontWeight: "700", color: granted ? t.credit : t.onWarn, fontSize: 16 }}
              >
                {granted ? "Notification access is on" : "Notification access is off"}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 13.5, marginTop: 2 }}>
                Needed to log UPI payments from your notifications.
              </Text>
            </View>
          </View>
          {!granted ? (
            <Button
              label="Open notification access settings"
              icon="open-outline"
              onPress={() => NativeListener.openSettings()}
              style={{ marginTop: 14 }}
            />
          ) : null}
        </Card>

        <SectionTitle>Capture from</SectionTitle>
        <Text style={{ fontSize: 13.5, color: t.textMuted, marginBottom: 12 }}>
          Pick the account each payment app records against. Apps set to Off are ignored.
        </Text>

        {PROVIDER_LABELS.map(({ key, label }) => (
          <Card key={key} style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: t.text, marginBottom: 10 }}>
              {label}
            </Text>
            <ChipRow>
              <Chip
                label="Off"
                selected={!settings.accountByProvider[key]}
                onPress={() => void setProviderAccount(key, null)}
              />
              {accounts.map((account) => (
                <Chip
                  key={account.id}
                  label={account.name}
                  selected={settings.accountByProvider[key] === account.id}
                  onPress={() => void setProviderAccount(key, account.id)}
                />
              ))}
            </ChipRow>
          </Card>
        ))}

        <SectionTitle>Listener status</SectionTitle>
        {listenerStatus ? (
          <Card>
            <StatusRow label="Service connected" ok={listenerStatus.serviceConnected} />
            <StatusRow label="Forwarding enabled" ok={listenerStatus.processingEnabled} />
            <Detail label="Allowed apps" value={listenerStatus.allowedPackages || "(none)"} />
            <Detail label="Notifications seen (any app)" value={String(listenerStatus.seenCount)} />
            <Detail label="Forwarded to app" value={String(listenerStatus.forwardedCount)} />
            <Detail label="Last app seen" value={listenerStatus.lastSeenPackage || "(none)"} />
          </Card>
        ) : null}

        <SectionTitle>Recent payment notifications</SectionTitle>
        <Text style={{ fontSize: 13.5, color: t.textMuted, marginBottom: 10 }}>
          What the app saw from your enabled payment apps since it was last opened, and what it did
          with each. Empty means nothing has arrived yet.
        </Text>
        {diagnostics.length === 0 ? <Text style={{ color: t.textFaint }}>None yet.</Text> : null}
        {diagnostics.map((entry) => (
          <View
            key={`${entry.at}-${entry.text}`}
            style={{
              marginBottom: 8,
              padding: 12,
              borderRadius: radius.md,
              backgroundColor: t.surfaceAlt,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: t.text }}>
              {new Date(entry.at).toLocaleTimeString()} · {entry.outcome}
            </Text>
            <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              {entry.packageName}: {entry.title} | {entry.text}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7 }}>
      <Text style={{ flex: 1, color: t.text }}>{label}</Text>
      <View
        style={{
          flexDirection: "row",
          gap: 5,
          alignItems: "center",
          backgroundColor: ok ? t.creditSoft : t.debitSoft,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.pill,
        }}
      >
        <Ionicons name={ok ? "checkmark" : "close"} size={13} color={ok ? t.credit : t.debit} />
        <Text style={{ fontSize: 12, fontWeight: "700", color: ok ? t.credit : t.debit }}>
          {ok ? "Yes" : "No"}
        </Text>
      </View>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 7 }}>
      <Text style={{ fontSize: 12, color: t.textFaint }}>{label}</Text>
      <Text style={{ fontSize: 14, color: t.text, marginTop: 1 }}>{value}</Text>
    </View>
  );
}
