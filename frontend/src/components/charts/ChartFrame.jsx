"use client";

import { useEffect, useRef, useState } from "react";
import { ChartColumn } from "lucide-react";
import { cn } from "@/lib/utils";
let _Component = ChartColumn;
export function useElementWidth(e = 640) {
  let t = useRef(null);
  let [n, l] = useState(e);
  useEffect(() => {
    let e = t.current;
    if (!e) {
      return;
    }
    let n = new ResizeObserver((e) => {
      var t;
      let n = (t = e[0]) === null || t === undefined ? undefined : t.contentRect.width;
      if (n && n > 0) {
        l(n);
      }
    });
    n.observe(e);
    return () => n.disconnect();
  }, []);
  return {
    ref: t,
    width: n,
  };
}
function _Component3(e) {
  let { items: t } = e;
  if (t.length < 2) {
    return null;
  } else {
    return (
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {t.map((e) => (
          <li className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted" key={e.label}>
            <span
              aria-hidden={true}
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{
                background: e.color,
              }}
            />
            {e.label}
            {e.value ? <span className="text-ink-faint">· {e.value}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
}
function _Component2(e) {
  let { message: t = "No data available" } = e;
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <_Component className="h-5 w-5 text-ink-faint/40" strokeWidth={1.5} aria-hidden={true} />
      <p className="text-[0.8125rem] text-ink-muted">{t}</p>
    </div>
  );
}
export function ChartFrame(e) {
  let {
    title: t,
    caption: n,
    legend: a,
    actions: i,
    children: s,
    className: o,
    isEmpty: u,
    emptyMessage: x,
  } = e;
  return (
    <figure
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded border border-canvas-border bg-canvas-panel p-4",
        o,
      )}
    >
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[0.875rem] font-semibold text-ink">{t}</h3>
          {n ? (
            <p className="mt-0.5 max-w-prose text-[0.75rem] leading-relaxed text-ink-muted">{n}</p>
          ) : null}
        </div>
        {i ? <div className="flex shrink-0 items-center gap-1.5">{i}</div> : null}
      </figcaption>
      {u ? <_Component2 message={x} /> : s}
      {!u && (a == null ? undefined : a.length) ? <_Component3 items={a} /> : null}
    </figure>
  );
}
export function ChartTooltip(e) {
  let { x: t, y: n, children: a } = e;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-[16rem] rounded border border-canvas-border bg-canvas-raised px-2.5 py-1.5 text-[0.75rem] leading-snug text-ink shadow-float"
      style={{
        left: t + 12,
        top: n + 12,
      }}
    >
      {a}
    </div>
  );
}
