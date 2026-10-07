"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "arthiq-theme";

interface ThemeContextValue {
  preference: ThemePreference;
  /** What is actually showing right now. */
  resolved: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Runs before first paint (inlined in <head>) so there is no light flash for
 * dark-mode users. Keep in sync with applyTheme below.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function applyTheme(preference: ThemePreference): "light" | "dark" {
  const dark = preference === "dark" || (preference === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let stored: ThemePreference = "system";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      /* storage blocked: stay on system */
    }
    setPreferenceState(stored);
    setResolved(applyTheme(stored));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () =>
      setPreferenceState((current) => {
        setResolved(applyTheme(current));
        return current;
      });
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setResolved(applyTheme(next));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
