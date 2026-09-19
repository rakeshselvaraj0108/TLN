"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import { getAnomalies } from "@/lib/api";
let o = ["all", "cdr", "ipdr", "bank"];
let d = {
  high_call_volume: "High call volume",
  repeated_contact: "Repeated contact",
  odd_hour_activity: "Odd-hour activity",
  high_session_count: "High session count",
  bulk_upload: "Bulk upload",
  large_transfer: "Large transfer",
  rapid_disbursal: "Rapid disbursal",
};
export default function AnomaliesPage() {
  let [b, v] = useState("all");
  let [g, j] = useState(null);
  let [k, y] = useState(null);
  let [w, N] = useState(true);
  let [T, _] = useState(null);
  let L = useCallback(async () => {
    N(true);
    _(null);
    try {
      j(await getAnomalies(b));
    } catch (e) {
      _(String(e));
      j(null);
    } finally {
      N(false);
    }
  }, [b]);
  useEffect(() => {
    L();
  }, [L]);
  let A = ((g == null ? undefined : g.findings) ?? []).filter((e) => !k || e.rule === k);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Anomaly sweep"
        description="Threshold rules run over the raw rows. These are observations, not findings — each states the threshold it crossed so you can judge whether it means anything here."
        actions={
          <button onClick={L} className={buttonClass}>
            <RefreshCw className={"h-3.5 w-3.5 " + (w ? "animate-spin" : "")} />
            Re-run sweep
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filter by source"
          className="inline-flex gap-0.5 rounded border border-canvas-border bg-canvas-panel p-0.5"
        >
          {o.map((e) => (
            <button
              role="tab"
              aria-selected={b === e}
              onClick={() => {
                v(e);
                y(null);
              }}
              className={
                "focus-ring rounded px-2.5 py-1 text-[0.75rem] uppercase tracking-wider transition " +
                (b === e
                  ? "bg-canvas-hover text-ink shadow-panel"
                  : "text-ink-faint hover:text-ink-muted")
              }
              key={e}
            >
              {e}
            </button>
          ))}
        </div>
        {g ? (
          <div className="flex items-center gap-2 text-[0.75rem] text-ink-faint">
            <_Component label="critical" n={g.by_severity.critical ?? 0} tone="text-risk" />
            <_Component label="high" n={g.by_severity.high ?? 0} tone="text-ink" />
            <_Component label="medium" n={g.by_severity.medium ?? 0} tone="text-ink-muted" />
          </div>
        ) : null}
      </div>
      {g && Object.keys(g.by_rule).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <_Component2 active={k === null} onClick={() => y(null)}>
            All rules ({g.total})
          </_Component2>
          {Object.entries(g.by_rule)
            .sort((e, t) => t[1] - e[1])
            .map((e) => {
              let [r, s] = e;
              return (
                <_Component2 active={k === r} onClick={() => y(r)} key={r}>
                  {d[r] ?? r} ({s})
                </_Component2>
              );
            })}
        </div>
      ) : null}
      {T ? <ErrorAlert>{T}</ErrorAlert> : null}
      {w ? (
        <TableSkeleton cols={5} rows={7} />
      ) : A.length === 0 ? (
        <EmptyState title="Nothing crossed a threshold">
          No row in this feed exceeded any of the sweep rules. That is a result, not an absence of
          data — the thresholds are listed below.
        </EmptyState>
      ) : (
        <DataTable head={["Severity", "Rule", "Subject", "Observed", "What fired"]}>
          {A.map((e, t) => {
            return (
              <TableRow
                style={{
                  animationDelay: `${Math.min(t, 12) * 20}ms`,
                }}
                className="animate-fade-in"
                key={`${e.id}:${e.source}:${t}`}
              >
                <TableCell>
                  <_Component3 severity={e.severity} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-ink-muted">
                  {d[e.rule] ?? e.rule}
                </TableCell>
                <TableCell className="mono whitespace-nowrap text-ink">{e.subject}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <_Component4 finding={e} />
                </TableCell>
                <TableCell className="text-ink-muted">{e.description}</TableCell>
              </TableRow>
            );
          })}
        </DataTable>
      )}
      {g ? <_Component5 thresholds={g.thresholds} /> : null}
    </div>
  );
}
function _Component4(e) {
  let { finding: t } = e;
  let r = (e) =>
    t.unit === "bytes"
      ? `${(e / 1048576).toFixed(0)} MB`
      : t.unit === "INR"
        ? `₹${e.toLocaleString("en-IN")}`
        : e.toLocaleString();
  return (
    <span className="mono tabular-nums text-[0.75rem]">
      <span className="text-ink">{r(t.value)}</span>
      <span className="text-ink-faint"> / {r(t.threshold)}</span>
    </span>
  );
}
function _Component3(e) {
  let { severity: t } = e;
  let r =
    t === "critical"
      ? "border-risk-border bg-risk-bg text-risk"
      : t === "high"
        ? "border-canvas-border bg-canvas-hover text-ink"
        : "border-canvas-border bg-canvas-panel text-ink-faint";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider ${r}`}
    >
      {t}
    </span>
  );
}
function _Component(e) {
  let { label: t, n: r, tone: s } = e;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`tabular-nums font-medium ${s}`}>{r}</span>
      <span className="uppercase tracking-wider">{t}</span>
    </span>
  );
}
function _Component2(e) {
  let { active: t, onClick: r, children: s } = e;
  return (
    <button
      onClick={r}
      aria-pressed={t}
      className={
        "focus-ring rounded border px-2 py-0.5 text-[0.6875rem] transition " +
        (t
          ? "border-accent/40 bg-accent/10 text-accent-bright"
          : "border-canvas-border text-ink-faint hover:bg-canvas-hover hover:text-ink-muted")
      }
    >
      {s}
    </button>
  );
}
function _Component5(e) {
  let { thresholds: t } = e;
  return (
    <section className="rounded border border-canvas-border bg-canvas-panel/50 p-3">
      <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        Thresholds applied by this sweep
      </h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(t).map((e) => {
          let [r, s] = e;
          return (
            <div className="flex items-baseline justify-between gap-3" key={r}>
              <dt className="text-[0.75rem] text-ink-muted">{d[r] ?? r.replace(/_/g, " ")}</dt>
              <dd className="mono text-[0.75rem] tabular-nums text-ink-faint">
                {typeof s == "number" && s > 1000000 ? `${(s / 1048576).toFixed(0)} MB` : String(s)}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
        These are hand-picked review triggers, not learned boundaries. A rule firing means a row
        crossed a number a human chose — nothing more. The risk queue, which ranks people rather
        than rows, is the model-backed view.
      </p>
    </section>
  );
}
