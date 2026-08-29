export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Arthiq</h1>
      <p className="text-slate-600">
        Personal finance intelligence and reconciliation system. The web dashboard is scaffolded and
        builds successfully; feature screens land in later implementation phases — see{" "}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">
          docs/IMPLEMENTATION_STATUS.md
        </code>{" "}
        for current progress.
      </p>
    </main>
  );
}
