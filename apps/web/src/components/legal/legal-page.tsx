import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SITE } from "@/lib/site";
import { LegalLinks } from "./legal-links";

/** Shell for the public (no sign-in needed) policy and trust pages. */
export function LegalPage({
  title,
  intro,
  updated = true,
  children,
}: {
  title: string;
  intro?: string;
  updated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200/80 bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Arth-IQ home">
            <Logo size={32} />
          </Link>
          <ThemeToggle className="text-slate-500 hover:bg-slate-100 hover:text-slate-900" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="page-title">{title}</h1>
        {updated && (
          <p className="mt-1 text-xs text-slate-500">Last updated: {SITE.policyUpdated}</p>
        )}
        {intro && <p className="mt-4 text-base text-slate-700">{intro}</p>}
        <div className="mt-8 space-y-8">{children}</div>
      </main>
      <footer className="border-t border-slate-200/80">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <LegalLinks />
          <p className="mt-3 text-xs text-slate-400">
            © {new Date().getFullYear()} {SITE.name}
          </p>
        </div>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
