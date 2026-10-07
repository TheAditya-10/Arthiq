import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { radius, tabularNums, useTheme } from "./theme.js";

export { formatRupees, radius, space, tabularNums, useTheme } from "./theme.js";
export type { Theme } from "./theme.js";

export function rowTitle(item: {
  merchantRaw: string | null;
  description: string | null;
  type: string;
}): string {
  return item.merchantRaw ?? item.description ?? item.type.replace(/_/g, " ").toLowerCase();
}

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

/** The Arth-IQ mark plus wordmark. */
export function Logo({
  size = 40,
  showWordmark = true,
  light = false,
}: {
  size?: number;
  showWordmark?: boolean;
  light?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.3 }}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset import
        source={require("../../assets/logo-mark.png")}
        style={{ width: size, height: size }}
        accessibilityLabel="Arth-IQ logo"
      />
      {showWordmark ? (
        <Text
          style={{
            fontSize: size * 0.62,
            fontWeight: "800",
            letterSpacing: -0.5,
            color: light ? "#FFFFFF" : t.text,
          }}
        >
          Arth<Text style={{ color: t.accent }}>-IQ</Text>
        </Text>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.border,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginTop: 24,
        marginBottom: 10,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: "700", color: t.text, letterSpacing: -0.2 }}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.brand : variant === "danger" ? t.debitSoft : "transparent";
  const fg = variant === "primary" ? t.onBrand : variant === "danger" ? t.debit : t.brand;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingVertical: 15,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 16, fontWeight: "700" }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: selected ? t.brand : t.surface,
        borderWidth: 1,
        borderColor: selected ? t.brand : t.border,
      }}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? t.onBrand : t.textMuted} /> : null}
      <Text
        style={{
          color: selected ? t.onBrand : t.text,
          fontWeight: selected ? "700" : "500",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}

export function Field({
  label,
  icon,
  style,
  ...props
}: TextInputProps & { label?: string; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <Text style={{ fontSize: 13, fontWeight: "600", color: t.textMuted, marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: t.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: t.border,
          paddingHorizontal: 14,
        }}
      >
        {icon ? <Ionicons name={icon} size={18} color={t.textFaint} /> : null}
        <TextInput
          placeholderTextColor={t.textFaint}
          {...props}
          style={[{ flex: 1, paddingVertical: 14, fontSize: 16, color: t.text }, style]}
        />
      </View>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        backgroundColor: t.debitSoft,
        padding: 12,
        borderRadius: radius.md,
        marginVertical: 8,
      }}
    >
      <Ionicons name="alert-circle" size={18} color={t.debit} />
      <Text style={{ color: t.debit, flex: 1, fontSize: 14 }}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: IconName;
  title: string;
  hint?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: t.brandSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Ionicons name={icon} size={32} color={t.brand} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "700", color: t.text }}>{title}</Text>
      {hint ? (
        <Text style={{ fontSize: 14, color: t.textMuted, textAlign: "center", marginTop: 6 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Initial-letter avatar with a colour derived from the name. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const t = useTheme();
  const palette = [t.brand, "#7C5CBF", "#D9822B", "#2F80C9", "#C2477B", "#5B8C2A"];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = palette[hash % palette.length] ?? t.brand;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color, fontWeight: "800", fontSize: size * 0.4 }}>
        {(name.trim()[0] ?? "?").toUpperCase()}
      </Text>
    </View>
  );
}

const TYPE_ICONS: Record<string, IconName> = {
  INCOME: "arrow-down-circle",
  EXPENSE: "arrow-up-circle",
  CASH_EXPENSE: "cash",
  LENT: "arrow-redo",
  BORROWED: "arrow-undo",
  LENT_REPAYMENT: "return-down-back",
  BORROWED_REPAYMENT: "return-down-forward",
  TRANSFER: "swap-horizontal",
};

/** Row for a transaction: round icon tile, title, meta line, signed amount. */
export function TransactionRowView({
  title,
  meta,
  amount,
  direction,
  type,
  badge,
  onPress,
}: {
  title: string;
  meta: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  type: string;
  badge?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  const debit = direction === "DEBIT";
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: pressed ? t.surfaceAlt : t.surface,
        borderRadius: radius.md,
        marginBottom: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.border,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: debit ? t.debitSoft : t.creditSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={TYPE_ICONS[type] ?? (debit ? "arrow-up-circle" : "arrow-down-circle")}
          size={22}
          color={debit ? t.debit : t.credit}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: t.text }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.textFaint, marginTop: 2 }}>
          {meta}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text
          style={[
            { fontSize: 15, fontWeight: "700", color: debit ? t.text : t.credit },
            tabularNums,
          ]}
        >
          {debit ? "−" : "+"}₹
          {amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        {badge ? (
          <View
            style={{
              backgroundColor: t.warnSoft,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: t.onWarn }}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
