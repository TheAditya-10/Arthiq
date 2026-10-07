import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Pressable, View } from "react-native";
import { type IconName, useTheme } from "../../ui/index.js";

const ICONS: Record<string, { on: IconName; off: IconName }> = {
  index: { on: "home", off: "home-outline" },
  transactions: { on: "receipt", off: "receipt-outline" },
  people: { on: "people", off: "people-outline" },
  settings: { on: "settings", off: "settings-outline" },
};

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarIcon: ({ focused, color }) => {
          const icon = ICONS[route.name];
          if (!icon) return null;
          return <Ionicons name={focused ? icon.on : icon.off} size={23} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="transactions" options={{ title: "Activity" }} />
      <Tabs.Screen
        name="add"
        options={{
          title: "Add",
          tabBarLabel: () => null,
          tabBarButton: ({ onPress, accessibilityState }) => (
            <View style={{ flex: 1, alignItems: "center" }}>
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
                accessibilityState={accessibilityState}
                style={({ pressed }) => ({
                  marginTop: -22,
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: t.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 4,
                  borderColor: t.surface,
                  elevation: 6,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons name="add" size={30} color="#2B1B00" />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
