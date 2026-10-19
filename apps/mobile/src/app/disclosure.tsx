import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as NativeListener from "../../modules/notification-listener/index.js";
import { LEGAL_LABELS, legalUrl, openLegal } from "../legal.js";
import { useNotificationSettings } from "../notifications/NotificationSettingsContext.js";
import { DISCLOSURE_VERSION } from "../notifications/settings.js";
import { Button, Card, radius, useTheme } from "../ui/index.js";
import type { IconName } from "../ui/index.js";

/**
 * Prominent disclosure + consent, shown BEFORE the Android Notification
 * access screen (Google Play User Data policy: in-app, names the data, says
 * why, requires an affirmative action, and is not buried in a policy link).
 * Capture stays off until the user taps "Agree" here — see
 * `hasValidConsent` in notifications/settings.ts.
 */

const READ: { icon: IconName; text: string }[] = [
  {
    icon: "notifications-outline",
    text: "Notifications from the payment apps and bank-alert messages you switch on — Google Pay, PhonePe, Paytm and your Messages app.",
  },
];

const KEPT: string[] = [
  "Amount, debit or credit, merchant or payee, time and reference number.",
  "That is all that leaves your phone, over an encrypted connection, to your Arth-IQ account. The full message text is never sent or stored.",
];

const NEVER: string[] = [
  "Notifications from any other app: they are discarded on your phone the instant they arrive.",
  "One-time passwords, verification codes, PINs and passwords, even inside an app you allowed.",
  "Your SMS inbox, contacts, call logs, photos, location or microphone.",
];

export default function DisclosureScreen() {
  const t = useTheme();
  const router = useRouter();
  const { settings, updateSettings } = useNotificationSettings();

  async function agree() {
    await updateSettings({
      ...settings,
      paused: false,
      consent: { version: DISCLOSURE_VERSION, at: new Date().toISOString() },
    });
    router.back();
    // Android requires the user to flip the switch themselves, in system settings.
    if (NativeListener.getAccessStatus() !== "granted") NativeListener.openSettings();
  }

  const privacyLink = legalUrl("privacy");

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 12 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.pill,
            backgroundColor: t.creditSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={28} color={t.credit} />
        </View>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "800",
            color: t.text,
            letterSpacing: -0.6,
            marginTop: 16,
          }}
        >
          Before we read any notification
        </Text>
        <Text style={{ fontSize: 15, color: t.textMuted, marginTop: 8, lineHeight: 22 }}>
          Arth-IQ logs your UPI payments automatically by reading payment notifications. Here is
          exactly what that means.
        </Text>

        <Block title="What we read" items={READ.map((r) => r.text)} icon="eye-outline" />
        <Block title="What we keep" items={KEPT} icon="document-text-outline" />
        <Block
          title="What we never read or keep"
          items={NEVER}
          icon="close-circle-outline"
          tone="debit"
        />
        <Block
          title="You stay in control"
          items={[
            "Android asks you to switch on Notification access yourself, in the next step.",
            "Pause capture, or turn off any single app, in Settings at any time.",
            "Withdraw consent, download your data, or delete your account in Settings.",
            "We never sell your data or use it for advertising.",
          ]}
          icon="options-outline"
        />

        {privacyLink ? (
          <Pressable onPress={() => openLegal("privacy")} style={{ marginTop: 18 }}>
            <Text style={{ color: t.brand, fontWeight: "700", fontSize: 14 }}>
              Read the full {LEGAL_LABELS.privacy}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={{ padding: 20, gap: 10 }}>
        <Button label="Agree and continue" icon="checkmark" onPress={() => void agree()} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ alignItems: "center", paddingVertical: 12 }}
        >
          <Text style={{ color: t.textMuted, fontWeight: "700", fontSize: 15 }}>No thanks</Text>
        </Pressable>
        <Text style={{ textAlign: "center", fontSize: 12, color: t.textFaint }}>
          If you decline, the app still works. You just add payments by hand.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Block({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: IconName;
  tone?: "debit";
}) {
  const t = useTheme();
  return (
    <Card style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Ionicons name={icon} size={18} color={tone === "debit" ? t.debit : t.credit} />
        <Text style={{ fontSize: 15, fontWeight: "800", color: t.text }}>{title}</Text>
      </View>
      {items.map((item) => (
        <Text key={item} style={{ fontSize: 14, color: t.textMuted, lineHeight: 21, marginTop: 4 }}>
          {"•  "}
          {item}
        </Text>
      ))}
    </Card>
  );
}
