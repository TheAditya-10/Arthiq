import type { Config } from "tailwindcss";

// Arth-IQ palette: peacock teal + marigold, with green-tinted neutrals. The
// `slate` scale is remapped so existing utility classes pick up the new tone.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Colours below are CSS variables (see globals.css) so light/dark swap in one place.
        surface: v("surface"),
        slate: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, v(`slate-${n}`)]),
        ),
        brand: {
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: "#0B3D38",
          900: "#072B27",
        },
        // Fixed tints for text on the always-dark sidebar / brand panel.
        onbrand: { 100: "#CFE9E4", 200: "#9FD3CA" },
        emerald: {
          50: v("emerald-50"),
          100: v("emerald-100"),
          600: v("emerald-600"),
          700: v("emerald-700"),
          800: v("emerald-800"),
        },
        red: {
          50: v("red-50"),
          100: v("red-100"),
          500: v("red-500"),
          600: v("red-600"),
          700: v("red-700"),
          800: v("red-800"),
        },
        accent: { DEFAULT: "#F2A81D", soft: v("accent-soft"), ink: v("accent-ink") },
      },
      boxShadow: {
        card: "var(--shadow-card)",
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
