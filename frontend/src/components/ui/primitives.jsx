import { Inbox, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
export function PageHeader(e) {
  let { title: t, description: n, actions: s, eyebrow: i, className: l } = e;
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 border-b border-canvas-border pb-4",
        l,
      )}
    >
      <div className="min-w-0">
        {i ? <p className="eyebrow mb-2.5">{i}</p> : null}
        <h1 className="font-serif text-[1.75rem] font-light leading-[1.1] tracking-[-0.03em] text-ink">
          {t}
        </h1>
        {n ? (
          <p className="mt-2 max-w-2xl text-[0.8125rem] leading-relaxed text-ink-muted">{n}</p>
        ) : null}
      </div>
      {s ? <div className="flex shrink-0 items-center gap-2">{s}</div> : null}
    </div>
  );
}
export function ErrorAlert(e) {
  let { children: t } = e;
  return (
    <div
      role="alert"
      className="animate-fade-in flex items-start gap-2 rounded border border-risk-border bg-risk-bg p-3 text-[0.8125rem] text-risk"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{t}</div>
    </div>
  );
}
export function EmptyState(e) {
  let { title: t, children: n, icon: _Component = Inbox, action: a } = e;
  return (
    <div className="animate-fade-in flex flex-col items-center gap-2 rounded border border-dashed border-canvas-border bg-canvas-panel/40 px-6 py-10 text-center">
      <_Component className="h-6 w-6 text-ink-faint/50" strokeWidth={1.5} />
      <p className="text-[0.8125rem] font-medium text-ink-muted">{t}</p>
      {n ? <p className="max-w-sm text-[0.75rem] leading-relaxed text-ink-faint">{n}</p> : null}
      {a ? <div className="mt-1">{a}</div> : null}
    </div>
  );
}
export let primaryButtonClass =
  "focus-ring inline-flex items-center gap-2 rounded border border-accent/50 bg-accent/10 px-3 py-1.5 text-[0.8125rem] text-accent-bright transition hover:border-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50";
export let buttonClass =
  "focus-ring inline-flex items-center gap-2 rounded border border-canvas-border px-3 py-1.5 text-[0.8125rem] text-ink-muted transition hover:border-canvas-border-strong hover:bg-canvas-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";
