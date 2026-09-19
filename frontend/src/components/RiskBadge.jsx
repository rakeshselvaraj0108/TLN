import { cn } from "@/lib/utils";
let s = {
  high: "bg-risk-bg text-risk border border-risk-border",
  elevated: "bg-accent/15 text-accent-bright",
  low: "border border-canvas-border text-ink-muted",
};
export function RiskBadge(e) {
  let { band: n, score: i } = e;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wider",
        s[n] ?? s.low,
      )}
    >
      {n}
      {i != null ? <span className="font-mono opacity-80">{i.toFixed(2)}</span> : null}
    </span>
  );
}
