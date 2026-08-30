import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Person } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.js";

export default function PeopleScreen() {
  const { apiClient } = useAuth();
  const router = useRouter();
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
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          onRefresh={load}
          refreshing={loading}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: "/person/[id]", params: { id: item.id } })}
            >
              <Text style={styles.name}>{item.name}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No one added yet.</Text>}
        />
      )}

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a person"
          value={newName}
          onChangeText={setNewName}
        />
        <Pressable style={styles.addButton} onPress={addPerson} disabled={creating}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  name: { fontSize: 16, color: "#0F172A" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 24 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 10,
  },
  addButton: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "600" },
});
