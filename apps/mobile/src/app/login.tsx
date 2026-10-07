import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Button, ErrorText, Field, Logo, useTheme } from "../ui/index.js";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", marginBottom: 36 }}>
            <Logo size={72} showWordmark={false} />
            <Text
              style={{
                fontSize: 34,
                fontWeight: "800",
                letterSpacing: -1,
                color: t.text,
                marginTop: 16,
              }}
            >
              Arth<Text style={{ color: t.accent }}>-IQ</Text>
            </Text>
            <Text style={{ fontSize: 15, color: t.textMuted, marginTop: 6 }}>
              Know where every rupee goes.
            </Text>
          </View>

          <Field
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Password"
            icon="lock-closed-outline"
            placeholder="Your password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <ErrorText>{error}</ErrorText> : null}

          <Button
            label="Sign in"
            onPress={onSubmit}
            loading={submitting}
            style={{ marginTop: 8 }}
          />

          <Link
            href="/register"
            style={{ marginTop: 24, textAlign: "center", color: t.brand, fontWeight: "600" }}
          >
            New here? Create an account
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
