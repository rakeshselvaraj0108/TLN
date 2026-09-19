import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
let s = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wider",
  {
    variants: {
      variant: {
        neutral: "border border-canvas-border text-ink-muted",
        accent: "bg-accent/15 text-accent-bright",
        risk: "bg-risk-bg text-risk border border-risk-border",
        ok: "bg-ok/20 text-ok",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);
export function Badge(e) {
  let { className: t, variant: n, ...i } = e;
  return (
    <span
      className={cn(
        s({
          variant: n,
        }),
        t,
      )}
      {...i}
    />
  );
}
