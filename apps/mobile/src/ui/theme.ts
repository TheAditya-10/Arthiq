import { useColorScheme } from "react-native";

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  brand: string;
  brandDeep: string;
  onBrand: string;
  brandSoft: string;
  accent: string;
  credit: string;
  creditSoft: string;
  debit: string;
  debitSoft: string;
  warn: string;
  warnSoft: string;
  onWarn: string;
}

export const lightTheme: Theme = {
  dark: false,
  bg: "#F2F5F4",
  surface: "#FFFFFF",
  surfaceAlt: "#E8EEEC",
  border: "#DDE5E2",
  text: "#0E1B19",
  textMuted: "#53655F",
  textFaint: "#8A9A95",
  brand: "#14776B",
  brandDeep: "#0B3D38",
  onBrand: "#FFFFFF",
  brandSoft: "#DDF0EC",
  accent: "#F2A81D",
  credit: "#138A5E",
  creditSoft: "#DDF3EA",
  debit: "#D6453D",
  debitSoft: "#FBE6E4",
  warn: "#F2A81D",
  warnSoft: "#FDF1D6",
  onWarn: "#6B4700",
};

export const darkTheme: Theme = {
  dark: true,
  bg: "#0A1412",
  surface: "#121F1C",
  surfaceAlt: "#1A2A27",
  border: "#223632",
  text: "#EAF2F0",
  textMuted: "#9DB3AD",
  textFaint: "#6A7F79",
  brand: "#2BB5A0",
  brandDeep: "#0B3D38",
  onBrand: "#04201C",
  brandSoft: "#14332E",
  accent: "#F2A81D",
  credit: "#3DD39A",
  creditSoft: "#10302A",
  debit: "#FF7A70",
  debitSoft: "#3A1D1C",
  warn: "#F2A81D",
  warnSoft: "#3A2D0E",
  onWarn: "#FFD98A",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Keeps rupee figures from jittering as digits change. */
export const tabularNums = { fontVariant: ["tabular-nums" as const] };

export function formatRupees(value: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(value);
  const body = abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = opts.sign ? (value < 0 ? "−" : "+") : value < 0 ? "−" : "";
  return `${sign}₹${body}`;
}
