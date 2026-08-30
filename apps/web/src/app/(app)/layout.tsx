"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/people", label: "People" },
  { href: "/accounts", label: "Accounts" },
  { href: "/reconciliation", label: "Reconciliation" },
  { href: "/categories", label: "Categories" },
  { href: "/events", label: "Events" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  if (!user) return null; // redirecting

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <span className="text-lg font-semibold tracking-tight">Arthiq</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-slate-200 px-4 py-3 md:block">
          <p className="truncate text-sm font-medium text-slate-900">{user.displayName}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <button
            onClick={() => logout().then(() => router.push("/login"))}
            className="mt-2 text-xs font-medium text-slate-600 underline"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
