import type { Config } from "tailwindcss";

// Arth-IQ palette: peacock teal + marigold, with green-tinted neutrals. The
// `slate` scale is remapped so existing utility classes pick up the new tone.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          50: "#F3F6F5",
          100: "#E8EEEC",
          200: "#DDE5E2",
          300: "#C4D0CC",
          400: "#8A9A95",
          500: "#5A6B66",
          600: "#46564F",
          700: "#34433E",
          800: "#1F2D29",
          900: "#0E1B19",
        },
        brand: {
          50: "#E6F3F0",
          100: "#CFE9E4",
          200: "#9FD3CA",
          500: "#14776B",
          600: "#106A5F",
          700: "#0B5A50",
          800: "#0B3D38",
          900: "#072B27",
        },
        accent: { DEFAULT: "#F2A81D", soft: "#FDF1D6", ink: "#6B4700" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,61,56,0.05), 0 4px 16px -6px rgba(11,61,56,0.10)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
