"use client";

import { Fragment, useState } from "react";
import { scaleLinear } from "d3";
import { ChartFrame, ChartTooltip, useElementWidth } from "@/components/charts/ChartFrame";
import { cn } from "@/lib/utils";
export function BarChart(e) {
  let {
    title: t,
    caption: n,
    data: c,
    legend: d,
    valueFormat: o = (e) => e.toLocaleString(),
    barHeight: u = 26,
    actions: x,
    className: h,
    emptyMessage: m,
  } = e;
  let { ref: v, width: f } = useElementWidth();
  let [p, g] = useState(null);
  let k = Math.min(184, Math.max(96, f * 0.34));
  let y = Math.max(6, Math.floor((k - 10) / 6.2));
  let j = Math.max(40, f - k - 58 - 12);
  let b = Math.max(...c.map((e) => e.value), 1);
  let N = scaleLinear().domain([0, b]).range([0, j]);
  let w = c.length * (u + 8);
  return (
    <ChartFrame
      title={t}
      caption={n}
      legend={d}
      actions={x}
      className={h}
      isEmpty={c.length === 0}
      emptyMessage={m}
    >
      <div ref={v} className="w-full">
        <svg width={f} height={w} role="img" aria-label={t}>
          {c.map((e, t) => {
            let n = t * (u + 8);
            let a = Math.max(e.value > 0 ? 3 : 0, N(e.value));
            let i = !!e.onClick;
            return (
              <g
                onMouseMove={(t) =>
                  g({
                    d: e,
                    x: t.clientX,
                    y: t.clientY,
                  })
                }
                onMouseLeave={() => g(null)}
                onClick={e.onClick}
                className={cn(i && "cursor-pointer")}
                tabIndex={i ? 0 : undefined}
                role={i ? "button" : undefined}
                onKeyDown={(t) => {
                  if (i && (t.key === "Enter" || t.key === " ")) {
                    var n;
                    t.preventDefault();
                    if ((n = e.onClick) !== null && n !== undefined) {
                      n.call(e);
                    }
                  }
                }}
                key={e.label}
              >
                <rect x={0} y={n} width={f} height={u + 8} fill="transparent" />
                <text
                  x={0}
                  y={n + u / 2}
                  dominantBaseline="central"
                  className="fill-ink-muted text-[0.75rem]"
                >
                  {e.label.length > y ? `${e.label.slice(0, y - 1)}…` : e.label}
                </text>
                <rect
                  x={k}
                  y={n + 4}
                  width={a}
                  height={u - 8}
                  rx={4}
                  fill={e.color}
                  opacity={p && p.d.label !== e.label ? 0.45 : 1}
                  style={{
                    transition: "opacity 150ms",
                  }}
                />
                <text
                  x={k + a + 8}
                  y={n + u / 2}
                  dominantBaseline="central"
                  className="fill-ink text-[0.75rem] font-medium tabular-nums"
                >
                  {o(e.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {p ? (
        <ChartTooltip x={p.x} y={p.y}>
          <div className="font-medium">{p.d.label}</div>
          <div className="text-ink-muted">{o(p.d.value)}</div>
          {p.d.detail ? <div className="mt-0.5 text-ink-faint">{p.d.detail}</div> : null}
        </ChartTooltip>
      ) : null}
    </ChartFrame>
  );
}
export function ColumnChart(e) {
  let {
    title: t,
    caption: n,
    data: c,
    height: d = 180,
    valueFormat: o = (e) => e.toLocaleString(),
    actions: u,
    className: x,
    xLabel: h,
    emptyMessage: m,
  } = e;
  let { ref: v, width: f } = useElementWidth();
  let [p, g] = useState(null);
  let k = Math.max(40, f - 34 - 8);
  let y = Math.max(40, d - (h ? 40 : 26) - 8);
  let j = Math.max(...c.map((e) => e.value), 1);
  let b = scaleLinear().domain([0, j]).range([y, 0]).nice();
  let N = k / Math.max(1, c.length);
  let w = Math.max(2, N - 2);
  let M = c.every((e) => Number.isInteger(e.value))
    ? b.ticks(Math.min(4, j)).filter(Number.isInteger)
    : b.ticks(4);
  return (
    <ChartFrame
      title={t}
      caption={n}
      actions={u}
      className={x}
      isEmpty={c.length === 0}
      emptyMessage={m}
    >
      <div ref={v} className="w-full">
        <svg width={f} height={d} role="img" aria-label={t}>
          {M.map((e) => (
            <g key={e}>
              <line
                x1={34}
                x2={34 + k}
                y1={8 + b(e)}
                y2={8 + b(e)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={28}
                y={8 + b(e)}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-ink-faint text-[0.6875rem] tabular-nums"
              >
                {e}
              </text>
            </g>
          ))}
          {c.map((e, t) => {
            let n = 34 + t * N + 1;
            let a = Math.max(e.value > 0 ? 2 : 0, y - b(e.value));
            return (
              <g
                onMouseMove={(t) =>
                  g({
                    d: e,
                    x: t.clientX,
                    y: t.clientY,
                  })
                }
                onMouseLeave={() => g(null)}
                onClick={e.onClick}
                className={cn(e.onClick && "cursor-pointer")}
                key={`${e.label}-${t}`}
              >
                <rect x={n} y={8} width={w} height={y} fill="transparent" />
                <rect
                  x={n}
                  y={8 + y - a}
                  width={w}
                  height={a}
                  rx={Math.min(4, w / 2)}
                  fill={e.color}
                  opacity={p && p.d !== e ? 0.45 : 1}
                  style={{
                    transition: "opacity 150ms",
                  }}
                />
              </g>
            );
          })}
          <line
            x1={34}
            x2={34 + k}
            y1={8 + y}
            y2={8 + y}
            stroke="var(--chart-axis)"
            strokeWidth={1}
          />
          {c.length > 0 ? (
            <Fragment>
              <text x={34} y={8 + y + 14} className="fill-ink-faint text-[0.6875rem]">
                {c[0].label}
              </text>
              <text
                x={34 + k}
                y={8 + y + 14}
                textAnchor="end"
                className="fill-ink-faint text-[0.6875rem]"
              >
                {c[c.length - 1].label}
              </text>
            </Fragment>
          ) : null}
          {h ? (
            <text
              x={34 + k / 2}
              y={d - 4}
              textAnchor="middle"
              className="fill-ink-faint text-[0.6875rem]"
            >
              {h}
            </text>
          ) : null}
        </svg>
      </div>
      {p ? (
        <ChartTooltip x={p.x} y={p.y}>
          <div className="font-medium">{p.d.label}</div>
          <div className="text-ink-muted">{o(p.d.value)}</div>
          {p.d.detail ? <div className="mt-0.5 text-ink-faint">{p.d.detail}</div> : null}
        </ChartTooltip>
      ) : null}
    </ChartFrame>
  );
}
