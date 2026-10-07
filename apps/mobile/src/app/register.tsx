import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Button, ErrorText, Field, Logo, useTheme } from "../ui/index.js";

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await register(email.trim(), password, displayName.trim());
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Registration failed");
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
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <Logo size={56} showWordmark={false} />
            <Text
              style={{
                fontSize: 28,
                fontWeight: "800",
                letterSpacing: -0.8,
                color: t.text,
                marginTop: 14,
              }}
            >
              Create your account
            </Text>
            <Text style={{ fontSize: 15, color: t.textMuted, marginTop: 6 }}>
              Takes a minute. Your payments log themselves after that.
            </Text>
          </View>

          <Field
            label="Name"
            icon="person-outline"
            placeholder="What should we call you?"
            value={displayName}
            onChangeText={setDisplayName}
          />
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
            placeholder="Choose a password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <ErrorText>{error}</ErrorText> : null}

          <Button
            label="Create account"
            onPress={onSubmit}
            loading={submitting}
            style={{ marginTop: 8 }}
          />

          <Link
            href="/login"
            style={{ marginTop: 24, textAlign: "center", color: t.brand, fontWeight: "600" }}
          >
            Already have an account? Sign in
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
