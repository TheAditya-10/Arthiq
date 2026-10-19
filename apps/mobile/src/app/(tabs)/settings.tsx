import { NotificationProviderKey } from "@arthiq/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as NativeListener from "../../../modules/notification-listener/index.js";
import type { Account } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import { getDiagnostics, subscribeDiagnostics } from "../../notifications/diagnostics.js";
import { LEGAL_LABELS, legalUrl, openLegal, type LegalPage } from "../../legal.js";
import { useNotificationSettings } from "../../notifications/NotificationSettingsContext.js";
import { defaultNotificationSettings, hasValidConsent } from "../../notifications/settings.js";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ChipRow,
  ErrorText,
  Field,
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
  const { user, apiClient, logout, deleteAccount } = useAuth();
  const router = useRouter();
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
  const consented = hasValidConsent(settings);
  const paused = settings.paused;
  const capturing = consented && granted && !paused;
  const enabledApps = PROVIDER_LABELS.filter(({ key }) => settings.accountByProvider[key]);

  const [exporting, setExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function exportData() {
    setExporting(true);
    try {
      const data = await apiClient.users.exportMe();
      const uri = `${FileSystem.cacheDirectory}arthiq-export-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/json",
          dialogTitle: "Your Arth-IQ data",
        });
      } else {
        Alert.alert("Export ready", "Sharing isn't available on this device.");
      }
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (err) {
      Alert.alert("Could not export", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete account permanently?",
      "This erases your account and ALL your transactions, people, categories and history. It cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: () => void runDelete(),
        },
      ],
    );
  }

  async function runDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      await AsyncStorage.clear(); // dedup cache, sync queue, settings: nothing of theirs left on the phone
      await updateSettings(defaultNotificationSettings());
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the account.");
      setDeleting(false);
    }
  }

  function withdrawConsent() {
    Alert.alert(
      "Stop reading notifications?",
      "Arth-IQ will stop capturing payments. Anything already recorded stays. To fully revoke the permission, also switch off Notification access for Arth-IQ in Android settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop and open settings",
          onPress: () => {
            void updateSettings({ ...settings, consent: null });
            NativeListener.openSettings();
          },
        },
      ],
    );
  }

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
            backgroundColor: capturing ? t.creditSoft : t.warnSoft,
            borderColor: "transparent",
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Ionicons
              name={capturing ? "checkmark-circle" : "alert-circle"}
              size={28}
              color={capturing ? t.credit : t.onWarn}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontWeight: "700", color: capturing ? t.credit : t.onWarn, fontSize: 16 }}
              >
                {!consented
                  ? "Automatic capture is off"
                  : paused
                    ? "Capture is paused"
                    : granted
                      ? "Capture is on"
                      : "Notification access is off"}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 13.5, marginTop: 2 }}>
                {!consented
                  ? "Review what we read, then agree to turn it on."
                  : paused
                    ? "Nothing is being read until you resume."
                    : granted
                      ? "Reading only the apps you picked below."
                      : "Android needs you to switch on Notification access."}
              </Text>
            </View>
          </View>
          {!consented ? (
            <Button
              label="Review and turn on"
              icon="shield-checkmark-outline"
              onPress={() => router.push("/disclosure")}
              style={{ marginTop: 14 }}
            />
          ) : paused ? (
            <Button
              label="Resume capture"
              icon="play"
              onPress={() => void updateSettings({ ...settings, paused: false })}
              style={{ marginTop: 14 }}
            />
          ) : !granted ? (
            <Button
              label="Open notification access settings"
              icon="open-outline"
              onPress={() => NativeListener.openSettings()}
              style={{ marginTop: 14 }}
            />
          ) : (
            <Button
              label="Pause capture"
              variant="ghost"
              icon="pause"
              onPress={() => void updateSettings({ ...settings, paused: true })}
              style={{ marginTop: 10 }}
            />
          )}
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

        <SectionTitle>What Arth-IQ reads</SectionTitle>
        <Card>
          <Text style={{ fontSize: 13, fontWeight: "700", color: t.textFaint }}>READING NOW</Text>
          <Text style={{ fontSize: 14.5, color: t.text, marginTop: 4, lineHeight: 21 }}>
            {capturing && enabledApps.length > 0
              ? enabledApps.map((a) => a.label).join(", ")
              : "Nothing"}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: "700", color: t.textFaint, marginTop: 14 }}>
            NEVER READ OR KEPT
          </Text>
          <Text style={{ fontSize: 14, color: t.textMuted, marginTop: 4, lineHeight: 21 }}>
            Notifications from any other app, OTPs and verification codes, your SMS inbox, contacts,
            photos, location. Only amount, debit/credit, merchant, time and reference leave your
            phone; never the message text.
          </Text>
          {consented ? (
            <Button
              label="Withdraw consent"
              variant="ghost"
              icon="hand-left-outline"
              onPress={withdrawConsent}
              style={{ marginTop: 12 }}
            />
          ) : null}
        </Card>

        <SectionTitle>Your data</SectionTitle>
        <Card>
          <Text style={{ fontSize: 14, color: t.textMuted, lineHeight: 21 }}>
            Download everything we hold about you, or delete your account and all of it for good.
          </Text>
          <Button
            label="Download my data"
            variant="ghost"
            icon="download-outline"
            loading={exporting}
            onPress={() => void exportData()}
            style={{ marginTop: 10 }}
          />
        </Card>
        <Card style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: t.debit }}>Delete account</Text>
          <Text style={{ fontSize: 13.5, color: t.textMuted, marginTop: 4, marginBottom: 12 }}>
            Permanent. Enter your password to confirm.
          </Text>
          <Field
            label="Password"
            icon="lock-closed-outline"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            value={deletePassword}
            onChangeText={setDeletePassword}
          />
          {deleteError ? <ErrorText>{deleteError}</ErrorText> : null}
          <Button
            label="Delete my account"
            variant="danger"
            icon="trash-outline"
            loading={deleting}
            disabled={!deletePassword}
            onPress={confirmDelete}
          />
        </Card>

        {(["privacy", "terms", "trust", "contact"] as LegalPage[]).some((p) => legalUrl(p)) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 14 }}>
            {(["privacy", "terms", "trust", "contact"] as LegalPage[]).map((page) => (
              <Pressable key={page} onPress={() => openLegal(page)}>
                <Text style={{ color: t.brand, fontWeight: "700", fontSize: 13 }}>
                  {LEGAL_LABELS[page]}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

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
              {entry.detail ? ` — ${entry.detail}` : ""}
            </Text>
            <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              {entry.text || entry.title
                ? `${entry.packageName}: ${entry.title} | ${entry.text}`
                : `${entry.packageName}: content not kept (not a payment)`}
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
