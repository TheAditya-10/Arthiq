"use client";

import {
  ArrowLeftRight,
  CalendarDays,
  FolderTree,
  Landmark,
  LayoutDashboard,
  LogOut,
  Scale,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/people", label: "People", icon: Users },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/reconciliation", label: "Reconciliation", icon: Scale },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
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

  const signOut = () => logout().then(() => router.push("/login"));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-brand-800 text-onbrand-100 md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 md:py-6">
          <Logo size={34} light />
          <div className="flex items-center md:hidden">
            <ThemeToggle className="text-onbrand-200 hover:bg-white/10 hover:text-white" />
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="rounded-lg p-2 text-onbrand-200 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-white/12 text-white shadow-[inset_3px_0_0_#F2A81D]"
                    : "text-onbrand-200 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon size={18} className={active ? "text-accent" : ""} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-3 pb-5 pt-3 md:absolute md:bottom-0 md:block md:w-64">
          <div className="flex items-center gap-3 rounded-xl bg-white/8 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-slate-900">
              {(user.displayName?.[0] ?? user.email[0] ?? "?").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.displayName}</p>
              <p className="truncate text-xs text-onbrand-200">{user.email}</p>
            </div>
            <ThemeToggle className="text-onbrand-200 hover:bg-white/10 hover:text-white" />
            <button
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-onbrand-200 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8 lg:p-10">{children}</main>
    </div>
  );
}
