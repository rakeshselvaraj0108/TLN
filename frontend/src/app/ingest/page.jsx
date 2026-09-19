"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, FileText, LoaderCircle, Upload } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import {
  ACCEPTED_DOCUMENT_TYPES,
  DocumentAnalysisResult,
} from "@/components/documents/DocumentAnalysis";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";
import { ErrorAlert, PageHeader } from "@/components/ui/primitives";
import { getIngestStatus, uploadIngest } from "@/lib/api";
let m = [
  {
    key: "cdr",
    label: "CDR",
    hint: "Call Detail Records",
  },
  {
    key: "ipdr",
    label: "IPDR",
    hint: "IP Detail Records",
  },
  {
    key: "bank",
    label: "Bank statements",
    hint: "Statement lines, any format",
  },
  {
    key: "social",
    label: "Social posts",
    hint: "Public posts / statuses",
  },
  {
    key: "alpr",
    label: "ALPR",
    hint: "Camera plate reads",
  },
];
export default function IngestPage() {
  let [s, l] = useState(null);
  let [c, f] = useState(null);
  let [v, y] = useState([]);
  let [k, g] = useState(null);
  let [b, j] = useState(null);
  let [w, N] = useState(0);
  let Z = useCallback(async () => {
    try {
      l(await getIngestStatus());
    } catch (e) {
      l(null);
    }
  }, []);
  useEffect(() => {
    Z();
  }, [Z]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Data ingestion"
        description="Upload a source file exactly as it arrived — CSV, PDF, Word, Excel, JSON or a scan. The format is detected from the file itself, not from its name, and parsed to canonical rows. Every record is then SHA-256 hashed at the point of entry into a tamper-evident chain, entities are extracted, and the knowledge graph is extended. Re-uploading an identical file is detected and skipped."
      />
      {k ? <ErrorAlert>{k}</ErrorAlert> : null}
      <div className="max-w-4xl space-y-4">
        {b ? (
          <DocumentAnalysisResult
            analysis={b}
            onClose={() => {
              j(null);
              N((e) => e + 1);
            }}
          />
        ) : null}
        <DocumentsPanel title="Documents read" allowUpload={!b} key={w} />
      </div>
      <div className="stagger grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
        {m.map((e) => {
          var n;
          var i;
          return (
            <_Component
              source={e}
              busy={c === e.key}
              count={
                (s == null
                  ? undefined
                  : (n = s.sources) === null || n === undefined
                    ? undefined
                    : n[e.key]?.records) ?? 0
              }
              batches={
                (s == null
                  ? undefined
                  : (i = s.sources) === null || i === undefined
                    ? undefined
                    : i[e.key]?.batches) ?? 0
              }
              onUpload={async (t) => {
                g(null);
                f(e.key);
                try {
                  let n = await uploadIngest(e.key, t);
                  y((e) => [
                    {
                      ...n,
                      at: new Date().toLocaleTimeString(),
                    },
                    ...e,
                  ]);
                  await Z();
                } catch (e) {
                  g(e instanceof Error ? e.message : String(e));
                } finally {
                  f(null);
                }
              }}
              key={e.key}
            />
          );
        })}
      </div>
      {s ? (
        <div className="max-w-4xl rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
          <h3 className="mb-2 text-sm font-semibold text-ink">Knowledge graph</h3>
          {s.graph_error ? (
            <p className="text-[0.8125rem] text-ink-muted">{s.graph_error}</p>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-ink-muted">
              <span>
                <span className="tabular-nums text-ink">
                  <CountUp value={s.graph.nodes ?? 0} />
                </span>{" "}
                nodes
              </span>
              <span>
                <span className="tabular-nums text-ink">
                  <CountUp value={s.graph.relationships ?? 0} />
                </span>{" "}
                relationships
              </span>
              {Object.entries(s.graph.by_label ?? {}).map((e) => {
                let [t, n] = e;
                return (
                  <span className="mono" key={t}>
                    {t}:{n}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
      {v.length > 0 ? (
        <div className="max-w-4xl">
          <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
            Recent uploads
          </h3>
          <ul className="space-y-1.5">
            {v.map((e, t) => (
              <li
                className="animate-fade-in flex flex-wrap items-center justify-between gap-2 rounded border border-canvas-border bg-canvas-panel px-3 py-2 text-[0.8125rem] shadow-panel"
                key={t}
              >
                <span className="flex items-center gap-2 text-ink-muted">
                  <CircleCheck className="h-4 w-4 text-ok" />
                  {e.at} · {e.source_type} · {e.filename}
                </span>
                <span className="text-ink-muted">
                  {e.skipped_existing ? (
                    <span className="text-ink-faint">already ingested</span>
                  ) : (
                    <Fragment>
                      {e.rows_persisted} rows · {e.graph_rows_written} graph
                    </Fragment>
                  )}
                  {e.extraction_method && e.extraction_method !== "csv" ? (
                    <Fragment> · read as {e.extraction_method.replace(/_/g, " ")}</Fragment>
                  ) : null}{" "}
                  · <span className="mono">{e.chain_head.slice(0, 12)}…</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
function _Component(e) {
  let { source: t, busy: n, count: i, batches: o, onUpload: u } = e;
  let p = useRef(null);
  let [m, f] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        f(true);
      }}
      onDragLeave={() => f(false)}
      onDrop={(e) => {
        e.preventDefault();
        f(false);
        let n = e.dataTransfer.files?.[0];
        if (n) {
          u(n);
        }
      }}
      className={
        "rounded border bg-canvas-panel p-4 shadow-panel transition " +
        (m
          ? "border-accent bg-accent/5 ring-1 ring-accent/40"
          : "border-canvas-border hover:border-canvas-border/80")
      }
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-ink">{t.label}</div>
          <div className="text-[0.75rem] text-ink-faint">{t.hint}</div>
        </div>
        <FileText className="h-4 w-4 text-ink-faint" />
      </div>
      <div className="mb-3 text-[0.75rem] text-ink-muted">
        {i > 0 ? (
          <Fragment>
            <span className="tabular-nums text-ink">
              <CountUp value={i} />
            </span>{" "}
            records · {o} batch{o === 1 ? "" : "es"}
          </Fragment>
        ) : (
          <span className="text-ink-faint">no data yet</span>
        )}
      </div>
      <input
        ref={p}
        type="file"
        accept={ACCEPTED_DOCUMENT_TYPES}
        hidden={true}
        onChange={(e) => {
          let n = e.target.files?.[0];
          if (n) {
            u(n);
          }
          e.target.value = "";
        }}
      />
      <button
        disabled={n}
        onClick={() => {
          var e;
          if ((e = p.current) === null || e === undefined) {
            return undefined;
          } else {
            return e.click();
          }
        }}
        className="focus-ring flex w-full items-center justify-center gap-2 rounded border border-accent/40 bg-accent/10 px-3 py-2 text-[0.8125rem] text-accent-bright transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {n ? (
          <Fragment>
            <LoaderCircle className="h-4 w-4 animate-spin" /> Ingesting…
          </Fragment>
        ) : (
          <Fragment>
            <Upload className="h-4 w-4" />
            {m ? "Drop to ingest" : "Upload file"}
          </Fragment>
        )}
      </button>
    </div>
  );
}
