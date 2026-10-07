import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Person } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";
import { Avatar, EmptyState, Field, radius, useTheme } from "../../ui/index.js";

export default function PeopleScreen() {
  const { apiClient } = useAuth();
  const router = useRouter();
  const t = useTheme();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPeople(await apiClient.people.list());
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPerson() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await apiClient.people.create({ name });
      setNewName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: t.text, letterSpacing: -0.7 }}>
          People
        </Text>
        <Text style={{ fontSize: 14, color: t.textMuted, marginTop: 4, marginBottom: 14 }}>
          Friends you split bills with, lend to or borrow from.
        </Text>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Field
              icon="person-add-outline"
              placeholder="Add a person"
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={addPerson}
              returnKeyType="done"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add person"
            onPress={addPerson}
            disabled={creating || !newName.trim()}
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.md,
              backgroundColor: t.brand,
              alignItems: "center",
              justifyContent: "center",
              opacity: creating || !newName.trim() ? 0.5 : 1,
            }}
          >
            {creating ? (
              <ActivityIndicator color={t.onBrand} />
            ) : (
              <Ionicons name="add" size={26} color={t.onBrand} />
            )}
          </Pressable>
        </View>
      </View>

      {loading && people.length === 0 ? (
        <ActivityIndicator color={t.brand} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/person/[id]", params: { id: item.id } })}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 14,
                marginBottom: 8,
                borderRadius: radius.md,
                backgroundColor: pressed ? t.surfaceAlt : t.surface,
                borderWidth: 1,
                borderColor: t.border,
              })}
            >
              <Avatar name={item.name} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: t.text }}>
                {item.name}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={t.textFaint} />
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No one added yet"
              hint="Add a friend above to track who owes what."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
