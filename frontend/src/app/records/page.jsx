"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, X } from "lucide-react";
import { BarChart } from "@/components/charts/BarCharts";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import { getRecords, getRecordsSummary, recordsExportUrl } from "@/lib/api";
import { SOURCE_TYPE_LABELS, sourceColor, sourceLabel } from "@/lib/sources";
let h = [
  {
    id: "cdr",
    label: "CDR",
  },
  {
    id: "ipdr",
    label: "IPDR",
  },
  {
    id: "bank",
    label: "Bank",
  },
  {
    id: "social",
    label: "Social",
  },
];
export default function RecordsPage() {
  let [e, t] = useState("cdr");
  let [a, p] = useState(1);
  let [g, v] = useState("");
  let [k, N] = useState("");
  let [w, y] = useState("");
  let [S, Z] = useState("");
  let [C, _] = useState(null);
  let [A, E] = useState({});
  let [D, L] = useState(true);
  let [M, F] = useState(null);
  let P = useMemo(
    () => ({
      page: a,
      pageSize: 50,
      search: k,
      dateFrom: w,
      dateTo: S,
    }),
    [a, k, w, S],
  );
  let R = useCallback(async () => {
    L(true);
    F(null);
    try {
      let t = await getRecords(e, P);
      _(t);
    } catch (e) {
      F(String(e));
      _(null);
    } finally {
      L(false);
    }
  }, [e, P]);
  useEffect(() => {
    R();
  }, [R]);
  useEffect(() => {
    getRecordsSummary()
      .then((e) => E(e.counts))
      .catch(() => E({}));
  }, []);
  let I = useCallback(() => p(1), []);
  let O = !!k || !!w || !!S;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Source records"
        description="The parsed rows exactly as ingested, each carrying the SHA-256 that binds it to the hash chain. This is the view that answers “where does this actually come from”."
        actions={
          <Fragment>
            <a
              href={recordsExportUrl(e, P)}
              className={buttonClass}
              title="Export every row matching the current filters, hashes included"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
            <button onClick={R} className={buttonClass}>
              <RefreshCw className={"h-3.5 w-3.5 " + (D ? "animate-spin" : "")} />
              Refresh
            </button>
          </Fragment>
        }
      />
      <div
        role="tablist"
        aria-label="Source feed"
        className="inline-flex gap-0.5 rounded border border-canvas-border bg-canvas-panel p-0.5"
      >
        {h.map((a) => {
          return (
            <button
              role="tab"
              aria-selected={e === a.id}
              onClick={() => {
                t(a.id);
                I();
              }}
              className={
                "focus-ring flex items-center gap-1.5 rounded px-2.5 py-1 text-[0.75rem] uppercase tracking-wider transition " +
                (e === a.id
                  ? "bg-canvas-hover text-ink shadow-panel"
                  : "text-ink-faint hover:text-ink-muted")
              }
              key={a.id}
            >
              {a.label}
              <span className="tabular-nums text-ink-faint/70">{A[a.id] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {Object.keys(A).length > 0 ? (
        <BarChart
          title="What has been loaded"
          caption="Records held per source. Select a bar to browse that feed."
          data={Object.entries(A)
            .sort((e, t) => t[1] - e[1])
            .map((e, a) => {
              let [s, r] = e;
              return {
                label: sourceLabel(s),
                value: r,
                color: sourceColor(s, a),
                detail: `${SOURCE_TYPE_LABELS[s] ?? s} · every row hashed on entry`,
                onClick: () => {
                  if (h.some((e) => e.id === s)) {
                    t(s);
                    I();
                  }
                },
              };
            })}
          valueFormat={(e) => e.toLocaleString("en-IN")}
        />
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              value={g}
              onChange={(e) => v(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  N(g);
                  I();
                }
              }}
              placeholder="number, IMEI, account, handle…"
              className="focus-ring w-64 rounded border border-canvas-border bg-canvas-panel py-1.5 pl-7 pr-2 text-[0.8125rem] text-ink placeholder:text-ink-faint/70"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">From</span>
          <input
            type="date"
            value={w}
            onChange={(e) => {
              y(e.target.value);
              I();
            }}
            className="focus-ring rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">To</span>
          <input
            type="date"
            value={S}
            onChange={(e) => {
              Z(e.target.value);
              I();
            }}
            className="focus-ring rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
          />
        </label>
        <button
          onClick={() => {
            N(g);
            I();
          }}
          className={buttonClass}
        >
          Apply
        </button>
        {O ? (
          <button
            onClick={() => {
              v("");
              N("");
              y("");
              Z("");
              I();
            }}
            className={buttonClass}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        ) : null}
      </div>
      {M ? <ErrorAlert>{M}</ErrorAlert> : null}
      {D ? (
        <TableSkeleton cols={7} rows={8} />
      ) : C && C.rows.length !== 0 ? (
        <Fragment>
          <div className="flex items-center justify-between text-[0.75rem] text-ink-faint">
            <span className="tabular-nums">
              {C.total.toLocaleString()} {C.total === 1 ? "row" : "rows"}
              {O ? " matching" : ""}
            </span>
            <span className="tabular-nums">
              Page {C.page} of {C.total_pages}
            </span>
          </div>
          <DataTable head={[...C.columns, "Row hash"]}>
            {C.rows.map((e, t) => (
              <TableRow
                style={{
                  animationDelay: `${Math.min(t, 12) * 18}ms`,
                }}
                className="animate-fade-in"
                key={e._row_sha256 + t}
              >
                {C.columns.map((t) => (
                  <TableCell className="whitespace-nowrap" key={t}>
                    <_Component value={e[t]} />
                  </TableCell>
                ))}
                <TableCell>
                  <_Component2 row={e} />
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
          <_Component3 page={C.page} totalPages={C.total_pages} onChange={p} />
        </Fragment>
      ) : (
        <EmptyState title="No matching records">
          {O
            ? "No row in this feed matches the current filters."
            : "This feed has not been ingested yet. Load it from Data ingestion."}
        </EmptyState>
      )}
    </div>
  );
}
function _Component(e) {
  let { value: t } = e;
  if (t == null || t === "") {
    return <span className="text-ink-faint/50">—</span>;
  }
  let a = String(t);
  let s = /^-?\d+(\.\d+)?$/.test(a);
  return (
    <span className={s ? "mono tabular-nums text-ink-muted" : "text-ink-muted"}>
      {a.length > 60 ? a.slice(0, 60) + "…" : a}
    </span>
  );
}
function _Component2(e) {
  let { row: t } = e;
  return (
    <span
      className="mono text-[0.6875rem] text-ink-faint"
      title={`${t._row_sha256}
batch ${t._batch_id}
file ${t._source_filename}`}
    >
      {t._row_sha256.slice(0, 10)}…
    </span>
  );
}
function _Component3(e) {
  let { page: t, totalPages: a, onChange: s } = e;
  if (a <= 1) {
    return null;
  } else {
    return (
      <div className="flex items-center justify-center gap-2 pt-1">
        <button onClick={() => s(Math.max(1, t - 1))} disabled={t <= 1} className={buttonClass}>
          Previous
        </button>
        <span className="px-2 text-[0.75rem] tabular-nums text-ink-faint">
          {t} / {a}
        </span>
        <button onClick={() => s(Math.min(a, t + 1))} disabled={t >= a} className={buttonClass}>
          Next
        </button>
      </div>
    );
  }
}
