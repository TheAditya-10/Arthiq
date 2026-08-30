export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-slate-600">
        This screen lands in {phase} — see{" "}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
          docs/IMPLEMENTATION_STATUS.md
        </code>{" "}
        for current progress.
      </p>
    </div>
  );
}
