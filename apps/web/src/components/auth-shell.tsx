import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const POINTS = [
  "Payments from your UPI apps log themselves",
  "Split bills and track who owes what",
  "Reconcile against your bank statement",
];

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#14776B]/40" />
        <div className="pointer-events-none absolute -bottom-32 left-24 h-80 w-80 rounded-full bg-accent/15" />
        <Logo size={44} light />
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            Know where every rupee goes.
          </h2>
          <ul className="mt-8 space-y-3 text-onbrand-100">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-onbrand-200">Personal finance intelligence</p>
      </section>

      <section className="relative flex items-center justify-center px-6 py-12">
        <ThemeToggle className="absolute right-4 top-4 text-slate-500 hover:bg-slate-100 hover:text-slate-900" />
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size={40} />
          </div>
          <h1 className="page-title">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
