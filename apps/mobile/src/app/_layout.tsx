import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import { registerTransactionCapturedCategory } from "../notifications/localNotify.js";
import { NotificationSettingsProvider } from "../notifications/NotificationSettingsContext.js";
import { useNotificationPipeline } from "../notifications/useNotificationPipeline.js";

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
  useNotificationPipeline();

  useEffect(() => {
    void registerTransactionCapturedCategory();
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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" redirect={!!user} />
      <Stack.Screen name="register" redirect={!!user} />
      <Stack.Screen name="(tabs)" redirect={!user} />
      <Stack.Screen
        name="transaction/[id]"
        redirect={!user}
        options={{ headerShown: true, title: "Edit Transaction", presentation: "modal" }}
      />
      <Stack.Screen
        name="person/[id]"
        redirect={!user}
        options={{ headerShown: true, title: "Person" }}
      />
    </Stack>
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
