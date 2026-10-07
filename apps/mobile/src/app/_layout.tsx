import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import { registerTransactionCapturedCategory } from "../notifications/localNotify.js";
import { NotificationSettingsProvider } from "../notifications/NotificationSettingsContext.js";
import { useNotificationPipeline } from "../notifications/useNotificationPipeline.js";
import { useTheme } from "../ui/index.js";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTheme();
  useNotificationPipeline();

  useEffect(() => {
    void registerTransactionCapturedCategory();
    // Android 13+ blocks every notification (including this app's own
    // "Correct/Change" prompts) until POST_NOTIFICATIONS is granted at
    // runtime, and the channel has to exist before the permission dialog.
    void (async () => {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Captured transactions",
        importance: Notifications.AndroidImportance.HIGH,
      });
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") await Notifications.requestPermissionsAsync();
    })();
    // Tapping "Change" (or the notification body itself) opens the ledger so
    // the user can correct the category — see docs/MOBILE_ARCHITECTURE.md
    // §3. "Correct" just dismisses; the transaction was already created with
    // its classified category, so there's nothing further to do.
    const subscription = Notifications.addNotificationResponseReceivedListener((event) => {
      if (event.actionIdentifier !== "correct") {
        router.push("/(tabs)/transactions");
      }
    });
    return () => subscription.remove();
  }, [router]);

  if (loading) return null;

  return (
    <>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="login" redirect={!!user} />
        <Stack.Screen name="register" redirect={!!user} />
        <Stack.Screen name="(tabs)" redirect={!user} />
        <Stack.Screen
          name="transaction/[id]"
          redirect={!user}
          options={{ headerShown: true, title: "Transaction", presentation: "modal" }}
        />
        <Stack.Screen
          name="person/[id]"
          redirect={!user}
          options={{ headerShown: true, title: "Person" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationSettingsProvider>
        <RootNavigator />
      </NotificationSettingsProvider>
    </AuthProvider>
  );
}
