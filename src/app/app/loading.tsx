export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Loading your workspace…</span>
      <div className="h-4 w-40 rounded-full bg-line" />
      <div className="h-10 w-full max-w-xl rounded-2xl bg-line" />
      <div className="h-56 w-full rounded-3xl bg-line/70" />
    </div>
  );
}
