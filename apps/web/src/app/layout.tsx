import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Arth-IQ", template: "%s · Arth-IQ" },
  description: "Know where every rupee goes. Personal finance intelligence and reconciliation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
