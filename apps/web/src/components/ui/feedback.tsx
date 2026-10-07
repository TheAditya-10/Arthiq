import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function Alert({
  tone = "error",
  children,
  className = "",
}: {
  tone?: "error" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  const colors = tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${colors} ${className}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> {label}
    </p>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-surface px-6 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon size={26} />
      </span>
      <p className="text-base font-bold text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
    </div>
  );
}

const AVATAR_TONES = [
  "bg-brand-50 text-brand-700",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
];

/** Initial-letter avatar; colour is stable per name. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${AVATAR_TONES[hash % AVATAR_TONES.length]}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Small icon + label + big number tile used for summary rows. */
export function Stat({
  label,
  value,
  tone = "default",
  icon: Icon,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "bad";
  icon?: LucideIcon;
  testId?: string;
}) {
  const color =
    tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-slate-900";
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {Icon && <Icon size={14} />}
        {label}
      </p>
      <p
        data-testid={testId}
        className={`mt-1 text-xl font-extrabold tracking-tight tabular-nums ${color}`}
      >
        {value}
      </p>
    </div>
  );
}
