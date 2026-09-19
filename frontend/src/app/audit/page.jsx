"use client";

import { useEffect, useMemo, useState } from "react";
import { area, curveMonotoneX, line, scaleLinear, scaleTime } from "d3";
import { RefreshCw, ScrollText } from "lucide-react";
import { BarChart } from "@/components/charts/BarCharts";
import { ChartFrame, ChartTooltip, useElementWidth } from "@/components/charts/ChartFrame";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import { getAudit } from "@/lib/api";
import { SERIES_COLORS } from "@/lib/sources";
function _Component(e) {
  let {
    title: t,
    caption: n,
    series: s,
    height: i = 200,
    area: l = false,
    valueFormat: c = (e) => e.toLocaleString(),
    dateFormat: o = (e) =>
      e.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
    actions: m,
    className: x,
    emptyMessage: h,
  } = e;
  let { ref: p, width: f } = useElementWidth();
  let [g, v] = useState(null);
  let [j, y] = useState({
    x: 0,
    y: 0,
  });
  let b = s.flatMap((e) => e.points);
  let k = b.length === 0;
  let N = Math.max(40, f - 38 - 10);
  let w = Math.max(40, i - 8 - 24);
  let {
    x: M,
    y: L,
    paths: S,
    fills: A,
    ticks: T,
    xTicks: W,
    spine: _,
  } = useMemo(() => {
    if (k) {
      return {
        x: null,
        y: null,
        paths: [],
        fills: [],
        ticks: [],
        xTicks: [],
        spine: [],
      };
    }
    let e = b.map((e) => e.t.getTime());
    let t = scaleTime()
      .domain([new Date(Math.min(...e)), new Date(Math.max(...e))])
      .range([0, N]);
    let n = Math.max(...b.map((e) => e.v), 1);
    let a = scaleLinear().domain([0, n]).range([w, 0]).nice();
    let r = line()
      .x((e) => t(e.t))
      .y((e) => a(e.v))
      .curve(curveMonotoneX);
    let i = area()
      .x((e) => t(e.t))
      .y0(w)
      .y1((e) => a(e.v))
      .curve(curveMonotoneX);
    return {
      x: t,
      y: a,
      paths: s.map((e) => {
        return {
          s: e,
          d: r(e.points) ?? "",
        };
      }),
      fills: s.map((e) => {
        return {
          s: e,
          d: i(e.points) ?? "",
        };
      }),
      ticks: b.every((e) => Number.isInteger(e.v))
        ? a.ticks(Math.min(4, n)).filter(Number.isInteger)
        : a.ticks(4),
      xTicks: t.ticks(Math.max(2, Math.min(6, Math.floor(N / 90)))),
      spine: s.reduce((e, t) => (t.points.length > e.length ? t.points : e), []),
    };
  }, [s, b, N, w, k]);
  let D = s.map((e) => ({
    label: e.label,
    color: e.color,
  }));
  let F = g !== null ? _[g] : null;
  return (
    <ChartFrame
      title={t}
      caption={n}
      legend={D}
      actions={m}
      className={x}
      isEmpty={k}
      emptyMessage={h}
    >
      <div ref={p} className="w-full">
        {k ? null : (
          <svg
            width={f}
            height={i}
            role="img"
            aria-label={t}
            onMouseMove={function (e) {
              if (k || _.length === 0) {
                return;
              }
              let t = e.currentTarget.getBoundingClientRect();
              v(
                Math.round(
                  Math.max(0, Math.min(1, (e.clientX - t.left - 38) / N)) * (_.length - 1),
                ),
              );
              y({
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onMouseLeave={() => v(null)}
          >
            {T.map((e) => (
              <g key={e}>
                <line
                  x1={38}
                  x2={38 + N}
                  y1={8 + L(e)}
                  y2={8 + L(e)}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={32}
                  y={8 + L(e)}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-ink-faint text-[0.6875rem] tabular-nums"
                >
                  {e}
                </text>
              </g>
            ))}
            {l
              ? A.map((e) => {
                  let { s: t, d: n } = e;
                  return <path d={n} fill={t.color} opacity={0.16} key={`f-${t.key}`} />;
                })
              : null}
            {S.map((e) => {
              let { s: t, d: n } = e;
              return (
                <path
                  d={n}
                  fill="none"
                  stroke={t.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`translate(${38},${8})`}
                  key={t.key}
                />
              );
            })}
            {s
              .filter((e) => e.points.length === 1)
              .map((e) => (
                <circle
                  cx={38 + M(e.points[0].t)}
                  cy={8 + L(e.points[0].v)}
                  r={5}
                  fill={e.color}
                  stroke="var(--surface-panel)"
                  strokeWidth={2}
                  key={`solo-${e.key}`}
                />
              ))}
            {F ? (
              <g transform={`translate(${38},${8})`}>
                <line
                  x1={M(F.t)}
                  x2={M(F.t)}
                  y1={0}
                  y2={w}
                  stroke="var(--chart-axis)"
                  strokeWidth={1}
                />
                {s.map((e) => {
                  let t = e.points[g];
                  if (t) {
                    return (
                      <circle
                        cx={M(t.t)}
                        cy={L(t.v)}
                        r={4}
                        fill={e.color}
                        stroke="var(--surface-panel)"
                        strokeWidth={2}
                        key={e.key}
                      />
                    );
                  } else {
                    return null;
                  }
                })}
              </g>
            ) : null}
            <line
              x1={38}
              x2={38 + N}
              y1={8 + w}
              y2={8 + w}
              stroke="var(--chart-axis)"
              strokeWidth={1}
            />
            {W.map((e, t) => (
              <text
                x={38 + M(e)}
                y={i - 6}
                textAnchor={t === 0 ? "start" : t === W.length - 1 ? "end" : "middle"}
                className="fill-ink-faint text-[0.6875rem]"
                key={t}
              >
                {o(e)}
              </text>
            ))}
          </svg>
        )}
      </div>
      {F ? (
        <ChartTooltip x={j.x} y={j.y}>
          <div className="font-medium">{o(F.t)}</div>
          {s.map((e) => {
            let t = e.points[g];
            if (t) {
              return (
                <div className="mt-0.5 flex items-center gap-1.5" key={e.key}>
                  <span
                    aria-hidden={true}
                    className="h-2 w-2 shrink-0 rounded-[1px]"
                    style={{
                      background: e.color,
                    }}
                  />
                  <span className="text-ink-muted">{e.label}</span>
                  <span className="ml-auto tabular-nums">{c(t.v)}</span>
                </div>
              );
            } else {
              return null;
            }
          })}
        </ChartTooltip>
      ) : null}
    </ChartFrame>
  );
}
let h = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function _Component2(e) {
  let {
    title: t,
    caption: n,
    cells: s,
    color: i = "var(--series-1)",
    valueLabel: l = "events",
    actions: c,
    className: o,
    emptyMessage: d,
  } = e;
  let [m, x] = useState(null);
  let p = new Map();
  for (let e of s) {
    p.set(`${e.day}-${e.hour}`, e.value);
  }
  let f = Math.max(...s.map((e) => e.value), 1);
  let g = s.length === 0 || s.every((e) => e.value === 0);
  return (
    <ChartFrame title={t} caption={n} actions={c} className={o} isEmpty={g} emptyMessage={d}>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex flex-col gap-[3px]">
            {h.map((e, t) => (
              <div className="flex items-center gap-[3px]" key={e}>
                <span className="w-8 shrink-0 text-[0.6875rem] text-ink-faint">{e}</span>
                {Array.from(
                  {
                    length: 24,
                  },
                  (n, r) => {
                    let c = p.get(`${t}-${r}`) ?? 0;
                    let o = {
                      day: t,
                      hour: r,
                      value: c,
                    };
                    return (
                      <div
                        role="img"
                        aria-label={`${e} ${r}:00 — ${c} ${l}`}
                        className="h-4 flex-1 rounded-[2px] border border-canvas-border/40 transition-transform hover:scale-110"
                        style={{
                          background: i,
                          opacity: c === 0 ? 0.06 : 0.18 + (c / f) * 0.82,
                        }}
                        onMouseMove={(e) =>
                          x({
                            c: o,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseLeave={() => x(null)}
                        key={r}
                      />
                    );
                  },
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 pl-[35px] text-[0.6875rem] text-ink-faint">
            <span>00:00</span>
            <span className="flex-1 text-center">12:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[0.6875rem] text-ink-faint">
        <span>Less</span>
        {[0.1, 0.3, 0.55, 0.8, 1].map((e) => (
          <span
            aria-hidden={true}
            className="h-3 w-3 rounded-[2px]"
            style={{
              background: i,
              opacity: e,
            }}
            key={e}
          />
        ))}
        <span>More</span>
        <span className="ml-1">
          · peak {f.toLocaleString()} {l}
        </span>
      </div>
      {m ? (
        <ChartTooltip x={m.x} y={m.y}>
          <div className="font-medium">
            {h[m.c.day]} · {String(m.c.hour).padStart(2, "0")}:00
          </div>
          <div className="text-ink-muted">
            {m.c.value.toLocaleString()} {l}
          </div>
        </ChartTooltip>
      ) : null}
    </ChartFrame>
  );
}
export default function AuditPage() {
  let [e, t] = useState(null);
  let [n, d] = useState(null);
  let [u, h] = useState(false);
  let [g, v] = useState("");
  async function j() {
    h(true);
    try {
      t((await getAudit(300)).items);
      d(null);
    } catch (e) {
      d(String(e));
    } finally {
      h(false);
    }
  }
  useEffect(() => {
    j();
  }, []);
  let y = g.trim().toLowerCase();
  let b = e
    ? y
      ? e.filter((e) =>
          [e.actor, e.action, e.target_type, e.target_id, e.detail]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(y),
        )
      : e
    : null;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every ingestion, query, view, and status change — append-only, with actor and timestamp. The actor is derived from the request identity, never from a field the client can set."
        actions={
          <button onClick={j} className={buttonClass}>
            <RefreshCw className={"h-3.5 w-3.5 " + (u ? "animate-spin" : "")} />
            Refresh
          </button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          value={g}
          onChange={(e) => v(e.target.value)}
          placeholder="Filter by actor, action, target…"
          aria-label="Filter audit log"
          className="focus-ring w-64 rounded border border-canvas-border bg-canvas-raised px-2.5 py-1.5 text-[0.8125rem] text-ink transition placeholder:text-ink-faint"
        />
        {b ? (
          <span className="text-[0.75rem] tabular-nums text-ink-faint">
            {b.length}
            {e && b.length !== e.length ? ` of ${e.length}` : ""} entr{b.length === 1 ? "y" : "ies"}
          </span>
        ) : null}
      </div>
      {n ? <ErrorAlert>{n}</ErrorAlert> : null}
      {b && b.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <_Component
              title="Activity over time"
              caption="How many actions were recorded each day. A flat line during working hours is normal; a spike is worth a look."
              area={true}
              height={180}
              series={[
                {
                  key: "actions",
                  label: "Recorded actions",
                  color: SERIES_COLORS[0],
                  points: (function (e) {
                    let t = new Map();
                    for (let a of e) {
                      if (!a.ts) {
                        continue;
                      }
                      let e = new Date(a.ts);
                      if (Number.isNaN(e.getTime())) {
                        continue;
                      }
                      let r = e.toISOString().slice(0, 10);
                      t.set(r, (t.get(r) ?? 0) + 1);
                    }
                    return [...t.entries()]
                      .sort((e, t) => e[0].localeCompare(t[0]))
                      .map((e) => {
                        let [t, n] = e;
                        return {
                          t: new Date(`${t}T00:00:00`),
                          v: n,
                        };
                      });
                  })(b),
                },
              ]}
              valueFormat={(e) => `${e} ${e === 1 ? "action" : "actions"}`}
              emptyMessage="No timestamped entries to plot."
            />
            <BarChart
              title="Most frequent actions"
              caption="What is being done most often in the system."
              data={(function (e) {
                let n = new Map();
                for (let a of e) {
                  n.set(a.action, (n.get(a.action) ?? 0) + 1);
                }
                return [...n.entries()]
                  .sort((e, t) => t[1] - e[1])
                  .slice(0, 6)
                  .map((e, t) => {
                    let [n, a] = e;
                    return {
                      label: n,
                      value: a,
                      color: SERIES_COLORS[t % SERIES_COLORS.length],
                      detail: "action recorded in the audit log",
                    };
                  });
              })(b)}
              valueFormat={(e) => `${e}×`}
            />
          </div>
          <_Component2
            title="When the system is used"
            caption="Each square is one hour of one weekday. Darker means more activity — useful for spotting access outside normal hours."
            cells={(function (e) {
              let t = new Map();
              for (let a of e) {
                if (!a.ts) {
                  continue;
                }
                let e = new Date(a.ts);
                if (Number.isNaN(e.getTime())) {
                  continue;
                }
                let r = `${e.getDay()}-${e.getHours()}`;
                t.set(r, (t.get(r) ?? 0) + 1);
              }
              return [...t.entries()].map((e) => {
                let [t, n] = e;
                let [a, r] = t.split("-").map(Number);
                return {
                  day: a,
                  hour: r,
                  value: n,
                };
              });
            })(b)}
            valueLabel="actions"
            emptyMessage="No timestamped entries to plot."
          />
        </div>
      ) : null}
      {e ? (
        b && b.length === 0 ? (
          <EmptyState title={y ? "No matching entries" : "Nothing logged yet"} icon={ScrollText}>
            {y
              ? "No audit entry matches that filter."
              : "Actions are recorded here as soon as they happen."}
          </EmptyState>
        ) : (
          <DataTable head={["Time", "Actor", "Action", "Target", "Detail"]}>
            {b.map((e) => {
              var r;
              return (
                <TableRow key={e.id}>
                  <TableCell className="mono whitespace-nowrap text-ink-faint">
                    {e.ts ? new Date(e.ts).toLocaleString() : ""}
                  </TableCell>
                  <TableCell className="text-ink-muted">{e.actor}</TableCell>
                  <TableCell
                    className={
                      "mono " +
                      ((r = e.action).startsWith("evidence.") || r.includes("export")
                        ? "text-risk"
                        : r.startsWith("case.") || r.includes("analyze")
                          ? "text-accent-bright"
                          : "text-ink-muted")
                    }
                  >
                    {e.action}
                  </TableCell>
                  <TableCell className="mono text-ink-muted">
                    {e.target_type ? `${e.target_type}:${e.target_id ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-ink-muted">{e.detail ?? ""}</TableCell>
                </TableRow>
              );
            })}
          </DataTable>
        )
      ) : (
        <TableSkeleton cols={5} rows={8} />
      )}
    </div>
  );
}
