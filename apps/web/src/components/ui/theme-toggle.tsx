"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

/** Flips between light and dark. Starts from whatever the system resolved to. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`rounded-lg p-2 transition-colors ${className}`}
    >
      {resolved === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
