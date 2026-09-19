"use client";

import { useMemo, useState } from "react";
import { Banknote, MessageSquare, Phone, Wifi } from "lucide-react";
let o = MessageSquare;
let c = {
  call: {
    label: "Calls",
    icon: Phone,
    color: "#38bdf8",
  },
  session: {
    label: "Data",
    icon: Wifi,
    color: "#818cf8",
  },
  txn: {
    label: "Transactions",
    icon: Banknote,
    color: "#34d399",
  },
  post: {
    label: "Social",
    icon: o,
    color: "#f472b6",
  },
};
let u = ["call", "session", "txn", "post"];
export function EventTimeline(e) {
  let { events: n, highlightRecIds: a } = e;
  let [i, l] = useState(null);
  let [o, d] = useState(null);
  let { t0: f, t1: m } = useMemo(() => {
    if (n.length === 0) {
      return {
        t0: 0,
        t1: 1,
      };
    }
    let e = n.map((e) => new Date(e.ts).getTime());
    return {
      t0: Math.min(...e),
      t1: Math.max(...e),
    };
  }, [n]);
  let p = Math.max(m - f, 1);
  let x = (e) => ((new Date(e).getTime() - f) / p) * 100;
  if (n.length === 0) {
    return (
      <div className="rounded border border-dashed border-canvas-border bg-canvas-panel/50 p-6 text-[0.8125rem] text-ink-faint">
        No events on the timeline.
      </div>
    );
  } else {
    return (
      <div className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <div className="mb-2 flex justify-between text-[0.6875rem] text-ink-faint">
          <span className="mono">{new Date(f).toLocaleString()}</span>
          <span className="mono">{new Date(m).toLocaleString()}</span>
        </div>
        <div className="space-y-2">
          {u.map((e) => {
            let t = c[e];
            let s = n.filter((t) => t.kind === e);
            let _Component = t.icon;
            return (
              <div className="flex items-center gap-3" key={e}>
                <div className="flex w-28 shrink-0 items-center gap-1.5 text-[0.75rem] text-ink-muted">
                  <_Component
                    className="h-3.5 w-3.5"
                    style={{
                      color: t.color,
                    }}
                  />
                  {t.label}
                  <span className="text-ink-faint">({s.length})</span>
                </div>
                <div className="relative h-7 flex-1 rounded bg-canvas-hover/60">
                  {(function (e, t) {
                    let n = [...e].sort(
                      (e, t) => new Date(e.ts).getTime() - new Date(t.ts).getTime(),
                    );
                    let r = [];
                    for (let e of n) {
                      let n = r[r.length - 1];
                      if (n && Math.abs(t(e.ts) - t(n[0].ts)) < 2.2) {
                        n.push(e);
                      } else {
                        r.push([e]);
                      }
                    }
                    return r;
                  })(s, x).map((e) => {
                    let n = e[0];
                    let s = e.some((e) => (a == null ? undefined : a.has(e.rec_id)));
                    let i = e.length > 1;
                    let c = !!o && o.length === e.length && o[0].rec_id === n.rec_id;
                    return (
                      <button
                        type="button"
                        onMouseEnter={() => l(e)}
                        onMouseLeave={() => l((e) => (o ? e : null))}
                        onFocus={() => l(e)}
                        onBlur={() => l((e) => (o ? e : null))}
                        onClick={() => {
                          d(c ? null : e);
                          l(c ? null : e);
                        }}
                        aria-label={
                          i
                            ? `${e.length} ${t.label.toLowerCase()} around ${new Date(n.ts).toLocaleString()}`
                            : `${t.label} at ${new Date(n.ts).toLocaleString()}`
                        }
                        aria-pressed={c}
                        className="focus-ring absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                        style={{
                          left: `${x(n.ts)}%`,
                        }}
                        key={`${n.kind}:${n.rec_id}:${e.length}`}
                      >
                        <span
                          className="flex items-center justify-center rounded-full text-[8px] font-medium text-canvas transition-transform"
                          style={{
                            width: i ? 16 : s ? 12 : 8,
                            height: i ? 16 : s ? 12 : 8,
                            background: s ? "var(--risk)" : t.color,
                            outline: s ? "2px solid var(--risk-border)" : "none",
                          }}
                        >
                          {i ? e.length : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div aria-live="polite">{(o ?? i)?.length ? <_Component2 events={o ?? i} /> : null}</div>
      </div>
    );
  }
}
function _Component2(e) {
  let { events: t } = e;
  if (t.length === 1) {
    return <_Component3 e={t[0]} />;
  } else {
    return (
      <div className="mt-3 space-y-2">
        <div className="text-[0.75rem] text-ink-faint">
          {t.length} events at this point on the axis — each is a separate record.
        </div>
        {t.map((e) => (
          <_Component3 e={e} key={`${e.kind}:${e.rec_id}`} />
        ))}
      </div>
    );
  }
}
function _Component3(e) {
  let { e: t } = e;
  return (
    <div className="mt-3 rounded border border-canvas-border bg-canvas-raised p-3 text-[0.8125rem]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-ink">
          {t.kind.toUpperCase()} · {new Date(t.ts).toLocaleString()}
        </span>
        <span className="mono text-[0.6875rem] text-ink-faint">
          {t.rec_id} · {String(t.row_sha256).slice(0, 12)}…
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5">
        {Object.entries(t.detail).map((e) => {
          let [t, n] = e;
          if (n == null || n === "") {
            return null;
          } else {
            return (
              <div className="flex justify-between gap-3" key={t}>
                <dt className="text-ink-faint">{t}</dt>
                <dd className="mono truncate text-right text-ink-muted">{String(n)}</dd>
              </div>
            );
          }
        })}
        {t.entities && t.entities.length > 0 ? (
          <div className="col-span-2 flex justify-between gap-3">
            <dt className="text-ink-faint">entities</dt>
            <dd className="mono text-ink-muted">{t.entities.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
