"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { arc, pie } from "d3";
import { CircleCheck, FileSearch, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { ColumnChart } from "@/components/charts/BarCharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/ChartFrame";
import { DocumentAnalysisResult, DocumentAnalyzer } from "@/components/documents/DocumentAnalysis";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";
import { useEvidenceSelection } from "@/components/evidence/EvidenceSelection";
import { RiskBadge } from "@/components/RiskBadge";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import { getQueue, runIntelAnalysis } from "@/lib/api";
import { clearEntityIntelCache } from "@/lib/entity-cache";
import { RISK_BANDS, bandColor, bandLabel } from "@/lib/sources";
import { cn } from "@/lib/utils";
function _Component(e) {
  let {
    title: t,
    caption: n,
    data: s,
    centerLabel: r,
    size: i = 168,
    valueFormat: c = (e) => e.toLocaleString(),
    actions: o,
    className: d,
    emptyMessage: u,
  } = e;
  let [h, m] = useState(null);
  let x = s.filter((e) => e.value > 0);
  let p = x.reduce((e, t) => e + t.value, 0);
  let f = i / 2;
  let y = pie()
    .value((e) => e.value)
    .sort(null)
    .padAngle(0.012)(x);
  let j = arc()
    .innerRadius(f * 0.62)
    .outerRadius(f - 2)
    .cornerRadius(3);
  let g = x.map((e) => ({
    label: e.label,
    color: e.color,
    value: `${c(e.value)} · ${p ? Math.round((e.value / p) * 100) : 0}%`,
  }));
  return (
    <ChartFrame
      title={t}
      caption={n}
      legend={g}
      actions={o}
      className={d}
      isEmpty={x.length === 0}
      emptyMessage={u}
    >
      <div className="flex items-center justify-center py-1">
        <svg width={i} height={i} role="img" aria-label={t}>
          <g transform={`translate(${f},${f})`}>
            {y.map((e) => {
              return (
                <path
                  d={j(e) ?? undefined}
                  fill={e.data.color}
                  stroke="var(--surface-panel)"
                  strokeWidth={2}
                  opacity={h && h.d.label !== e.data.label ? 0.45 : 1}
                  className={cn(e.data.onClick && "cursor-pointer")}
                  style={{
                    transition: "opacity 150ms",
                  }}
                  onMouseMove={(t) =>
                    m({
                      d: e.data,
                      x: t.clientX,
                      y: t.clientY,
                    })
                  }
                  onMouseLeave={() => m(null)}
                  onClick={e.data.onClick}
                  key={e.data.label}
                />
              );
            })}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              dy={r ? -8 : 0}
              className="fill-ink text-[1.25rem] font-semibold tabular-nums"
            >
              {c(p)}
            </text>
            {r ? (
              <text
                textAnchor="middle"
                dominantBaseline="central"
                dy={12}
                className="fill-ink-faint text-[0.6875rem]"
              >
                {r}
              </text>
            ) : null}
          </g>
        </svg>
      </div>
      {h ? (
        <ChartTooltip x={h.x} y={h.y}>
          <div className="font-medium">{h.d.label}</div>
          <div className="text-ink-muted">
            {c(h.d.value)}
            {p ? ` · ${Math.round((h.d.value / p) * 100)}%` : ""}
          </div>
        </ChartTooltip>
      ) : null}
    </ChartFrame>
  );
}
let w = ["all", "high", "elevated", "low"];
export default function QueuePage() {
  let [t, n] = useState([]);
  let [v, b] = useState([]);
  let [k, M] = useState("all");
  let [C, _] = useState(true);
  let [H, A] = useState(false);
  let [q, E] = useState(null);
  let { selection: F, select: z } = useEvidenceSelection();
  let [D, P] = useState(null);
  let [R, L] = useState(false);
  let [V, O] = useState(null);
  let T = useCallback(async () => {
    _(true);
    E(null);
    try {
      let e = await getQueue(k === "all" ? undefined : k);
      n(e.items);
      if (k === "all") {
        b(e.items);
      }
    } catch (e) {
      E(String(e));
    } finally {
      _(false);
    }
  }, [k]);
  useEffect(() => {
    T();
  }, [T]);
  useEffect(() => {
    if (v.length === 0) {
      getQueue()
        .then((e) => b(e.items))
        .catch(() => {});
    }
  }, [v.length]);
  let X = (F == null ? undefined : F.entityId) ?? null;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Risk-ranked entity queue"
        description="Scored by the anomaly model. Every entity here still requires human review — a score is not a decision. Select a row to inspect it."
        actions={
          <Fragment>
            <button
              onClick={() => {
                L((e) => !e);
                if (R) {
                  O(null);
                }
              }}
              aria-expanded={R}
              className={buttonClass}
            >
              <FileSearch className="h-3.5 w-3.5" />
              Read a document
            </button>
            <button
              disabled={H}
              onClick={async () => {
                A(true);
                E(null);
                try {
                  let e = await runIntelAnalysis();
                  P({
                    ...e,
                    at: new Date().toLocaleTimeString(),
                  });
                  clearEntityIntelCache();
                  await T();
                } catch (e) {
                  E(String(e));
                } finally {
                  A(false);
                }
              }}
              className={primaryButtonClass}
            >
              {H ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {H ? "Scoring…" : "Re-analyze"}
            </button>
            <button onClick={T} className={buttonClass}>
              <RefreshCw className={"h-3.5 w-3.5 " + (C ? "animate-spin" : "")} />
              Refresh
            </button>
          </Fragment>
        }
      />
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter by risk band"
          className="inline-flex gap-0.5 rounded border border-canvas-border bg-canvas-panel p-0.5"
        >
          {w.map((e) => (
            <button
              role="tab"
              aria-selected={k === e}
              onClick={() => M(e)}
              className={
                "focus-ring rounded px-2.5 py-1 text-[0.75rem] uppercase tracking-wider transition " +
                (k === e
                  ? "bg-canvas-hover text-ink shadow-panel"
                  : "text-ink-faint hover:text-ink-muted")
              }
              key={e}
            >
              {e}
            </button>
          ))}
        </div>
        {!C && t.length > 0 ? (
          <span className="text-[0.75rem] tabular-nums text-ink-faint">
            {t.length} {t.length === 1 ? "entity" : "entities"}
          </span>
        ) : null}
      </div>
      {q ? <ErrorAlert>{q}</ErrorAlert> : null}
      {D ? (
        <div className="animate-fade-in flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-canvas-border bg-canvas-panel px-3 py-2 text-[0.75rem] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <CircleCheck className="h-3.5 w-3.5 text-ok" aria-hidden={true} />
            Scored {D.scored} {D.scored === 1 ? "entity" : "entities"} at {D.at}
          </span>
          <span>
            model <span className="mono text-ink">{D.model}</span>
          </span>
          <span className="flex flex-wrap gap-x-2">
            {Object.entries(D.bands).map((e) => {
              let [t, n] = e;
              return (
                <span key={t}>
                  {n} {t}
                </span>
              );
            })}
          </span>
          <span className="text-ink-faint">Scores rank this queue; they decide nothing.</span>
        </div>
      ) : null}
      {R ? (
        <div className="space-y-3">
          {V ? (
            <DocumentAnalysisResult
              analysis={V}
              onClose={() => {
                O(null);
                L(false);
              }}
            />
          ) : (
            <Fragment>
              <DocumentAnalyzer
                onAnalysed={O}
                label="Read a case document"
                hint="PDF, Word, Excel, CSV, JSON or plain text — or a photo of a printout. Every identifier in it is checked against the entities already scored here."
              />
              <DocumentsPanel allowUpload={false} title="Already read" />
            </Fragment>
          )}
        </div>
      ) : null}
      {v.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <_Component
            title="Priority breakdown"
            caption="Everyone the model has assessed. Select a segment to filter the list below to that group."
            data={RISK_BANDS.map((e) => ({
              label: bandLabel(e),
              value: v.filter((t) => t.band === e).length,
              color: bandColor(e),
              onClick: () => M(k === e ? "all" : e),
            }))}
            centerLabel="assessed"
          />
          <ColumnChart
            title="Score distribution"
            caption="How assessments are spread across the 0–100 scale. A cluster near the review threshold is where borderline cases sit."
            xLabel="assessed priority (0–100)"
            data={(function (e) {
              let t = Array(10).fill(0);
              for (let n of e) {
                let e = Math.min(9, Math.floor(n.risk_score * 10));
                t[e] += 1;
              }
              return t.map((e, t) => {
                let n = t * 10;
                let a = (n + 5) / 100;
                let l = a >= 0.66 ? "high" : a >= 0.33 ? "elevated" : "low";
                return {
                  label: `${n}–${n + 10}`,
                  value: e,
                  color: bandColor(l),
                  detail: `${bandLabel(l)} range`,
                };
              });
            })(v)}
            valueFormat={(e) => `${e} ${e === 1 ? "person" : "people"}`}
          />
        </div>
      ) : null}
      {C ? (
        <Z />
      ) : t.length === 0 ? (
        <EmptyState title="No scored entities">
          Ingest the source data, then run <strong>Re-analyze</strong> to score the resolved
          entities.
        </EmptyState>
      ) : (
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead>
            <tr className="border-b border-canvas-border text-left text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              <th className="py-2 pr-3 font-medium">Entity</th>
              <th className="py-2 pr-3 font-medium">Band</th>
              <th className="py-2 pr-3 font-medium">Score</th>
              <th className="py-2 pr-3 font-medium">Top factors</th>
              <th className="py-2 font-medium">Model</th>
            </tr>
          </thead>
          <tbody>
            {t.map((e, t) => {
              let n = X === e.entity_id;
              return (
                <tr
                  onClick={() =>
                    z({
                      entityId: e.entity_id,
                      band: e.band,
                      riskScore: e.risk_score,
                      origin: "Selected in the risk queue",
                    })
                  }
                  style={{
                    animationDelay: `${Math.min(t, 12) * 22}ms`,
                  }}
                  className={
                    "animate-fade-in cursor-pointer border-b border-canvas-border/60 transition-colors " +
                    (n ? "bg-accent/10" : "hover:bg-canvas-hover")
                  }
                  key={e.entity_id}
                >
                  <td className="relative py-2 pr-3">
                    {n ? (
                      <span className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-accent-bright" />
                    ) : null}
                    <Link
                      href={`/queue/${e.entity_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mono text-accent-bright hover:underline"
                    >
                      {e.entity_id}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <RiskBadge band={e.band} />
                  </td>
                  <td className="py-2 pr-3">
                    <S score={e.risk_score} band={e.band} />
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">
                    <div className="flex flex-wrap gap-x-1.5 gap-y-1">
                      {e.top_factors.slice(0, 3).map((e) => (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-canvas-hover/70 px-1.5 py-0.5 text-[0.6875rem]"
                          title={`SHAP ${e.shap.toFixed(3)}`}
                          key={e.feature}
                        >
                          <span
                            className={
                              e.direction === "raises" ? "text-accent-bright" : "text-ink-faint"
                            }
                          >
                            {e.direction === "raises" ? "↑" : "↓"}
                          </span>
                          {e.feature}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 text-[0.75rem] text-ink-faint">{e.model}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
function S(e) {
  let { score: t, band: n } = e;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono tabular-nums">{t.toFixed(3)}</span>
      <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-canvas-hover sm:block">
        <span
          className={
            "block h-full origin-left rounded-full animate-grow-x " +
            (n === "high" ? "bg-risk" : n === "elevated" ? "bg-accent" : "bg-ink-faint/60")
          }
          style={{
            width: `${Math.max(2, Math.min(100, t * 100))}%`,
          }}
        />
      </span>
    </div>
  );
}
function Z() {
  return (
    <div className="space-y-2" aria-busy={true} aria-label="Loading queue">
      {Array.from({
        length: 6,
      }).map((e, t) => (
        <div className="grid grid-cols-[120px_80px_110px_1fr_90px] items-center gap-3" key={t}>
          <div className="skeleton h-3 rounded-sm" />
          <div className="skeleton h-3 rounded-sm" />
          <div className="skeleton h-3 rounded-sm" />
          <div className="skeleton h-3 rounded-sm" />
          <div className="skeleton h-3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
