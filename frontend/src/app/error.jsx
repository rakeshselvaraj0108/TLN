"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
let _Component = RotateCw;
export default function RootError(e) {
  let { error: t, reset: r } = e;
  useEffect(() => {
    console.error("Route error:", t);
  }, [t]);
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start gap-3 rounded border border-risk-border bg-risk-bg p-4">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-risk" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-ink">This view could not be rendered</h1>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-muted">
            The rest of the application is unaffected — the navigation and your other views still
            work. This is usually the API returning something the page did not expect.
          </p>
          {(t == null ? undefined : t.message) ? (
            <p className="mono mt-2 break-words rounded border border-canvas-border bg-canvas/60 p-2 text-[0.75rem] text-ink-muted">
              {t.message}
              {t.digest ? ` (digest ${t.digest})` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={r}
          className="focus-ring inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[0.8125rem] text-accent-bright transition hover:bg-accent/20"
        >
          <_Component className="h-3.5 w-3.5" /> Try again
        </button>
        <Link
          href="/overview"
          className="focus-ring inline-flex items-center gap-2 rounded border border-canvas-border px-3 py-1.5 text-[0.8125rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
