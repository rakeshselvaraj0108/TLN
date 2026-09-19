"use client";

import { Fragment, useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  CircleCheck,
  FileSearch,
  FileText,
  Hash,
  LoaderCircle,
  ScanLine,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { Badge } from "@/components/ui/Badge";
import { ErrorAlert, primaryButtonClass } from "@/components/ui/primitives";
import { analyzeDocument } from "@/lib/api";
import { cn } from "@/lib/utils";
let v = {
  phone: "Phone",
  imei: "Device (IMEI)",
  account: "Bank account",
  ifsc: "IFSC",
  upi: "UPI handle",
  ip: "IP address",
  email: "Email",
  vehicle: "Vehicle",
  case_code: "Case reference",
  record_id: "Record id",
  handle: "Social handle",
};
export let ACCEPTED_DOCUMENT_TYPES =
  ".pdf,.doc,.docx,.csv,.tsv,.json,.ndjson,.jsonl,.txt,.md,.xlsx,.xls,.png,.jpg,.jpeg,.tif,.tiff";
export function DocumentAnalyzer(e) {
  let {
    onAnalysed: n,
    label: t = "Analyse a case document",
    hint: r = "PDF, Word, Excel, CSV, JSON or plain text — or a photo of a printout.",
    className: c,
  } = e;
  let o = useRef(null);
  let [x, m] = useState(false);
  let [h, u] = useState(false);
  let [b, g] = useState(null);
  let v = useCallback(
    async (e) => {
      u(true);
      g(null);
      try {
        n(await analyzeDocument(e));
      } catch (e) {
        g(e instanceof Error ? e.message : String(e));
      } finally {
        u(false);
      }
    },
    [n],
  );
  return (
    <div className={c}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          m(true);
        }}
        onDragLeave={() => m(false)}
        onDrop={(e) => {
          e.preventDefault();
          m(false);
          let t = e.dataTransfer.files?.[0];
          if (t) {
            v(t);
          }
        }}
        className={cn(
          "rounded border border-dashed bg-canvas-panel/40 px-4 py-5 text-center transition",
          x ? "border-accent bg-accent/5 ring-1 ring-accent/40" : "border-canvas-border",
        )}
      >
        <FileSearch
          className="mx-auto h-5 w-5 text-ink-faint/60"
          strokeWidth={1.5}
          aria-hidden={true}
        />
        <p className="mt-1.5 text-[0.8125rem] font-medium text-ink">{t}</p>
        <p className="mx-auto mt-0.5 max-w-md text-[0.75rem] leading-relaxed text-ink-faint">{r}</p>
        <input
          ref={o}
          type="file"
          accept={ACCEPTED_DOCUMENT_TYPES}
          hidden={true}
          onChange={(e) => {
            let t = e.target.files?.[0];
            if (t) {
              v(t);
            }
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={h}
          onClick={() => {
            var e;
            if ((e = o.current) === null || e === undefined) {
              return undefined;
            } else {
              return e.click();
            }
          }}
          className={cn(primaryButtonClass, "mx-auto mt-3")}
        >
          {h ? (
            <Fragment>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
              Reading the document…
            </Fragment>
          ) : (
            <Fragment>
              <Upload className="h-3.5 w-3.5" aria-hidden={true} />
              {x ? "Drop to read" : "Choose a file"}
            </Fragment>
          )}
        </button>
      </div>
      {b ? (
        <div className="mt-2">
          <ErrorAlert>{b}</ErrorAlert>
        </div>
      ) : null}
    </div>
  );
}
function _Component(e) {
  let { hit: i } = e;
  return (
    <tr className="border-b border-canvas-border/60 align-top last:border-b-0">
      <td className="py-2 pr-3 text-[0.75rem] text-ink-faint">{v[i.kind] ?? i.kind}</td>
      <td className="py-2 pr-3">
        <span className="mono text-[0.8125rem] text-ink">{i.value}</span>
        {i.count > 1 ? (
          <span className="ml-1.5 text-[0.6875rem] text-ink-faint">×{i.count}</span>
        ) : null}
        <p className="mt-0.5 max-w-md text-[0.6875rem] leading-relaxed text-ink-faint">
          {i.context}
        </p>
      </td>
      <td className="py-2 pr-3">
        {i.known ? (
          i.entity_id ? (
            <Link
              href={`/profiles/${i.entity_id}`}
              className="mono text-[0.8125rem] text-accent-bright hover:underline"
            >
              {i.entity_id}
            </Link>
          ) : (
            <span className="text-[0.75rem] text-ink-muted">on file</span>
          )
        ) : (
          <span className="text-[0.75rem] text-ink-faint">not in the data</span>
        )}
      </td>
      <td className="py-2 pr-3">
        {i.band ? (
          <RiskBadge band={i.band} score={i.risk_score ?? undefined} />
        ) : (
          <span className="text-[0.75rem] text-ink-faint">—</span>
        )}
      </td>
      <td className="py-2 text-[0.75rem] text-ink-faint">{i.model ?? "—"}</td>
    </tr>
  );
}
export function DocumentAnalysisResult(e) {
  var n;
  var i;
  let { analysis: l, onClose: d } = e;
  let [p, f] = useState(false);
  let b = l.summary;
  let v = l.hits.filter((e) => e.known);
  let k = l.hits.filter((e) => !e.known);
  let N = v
    .filter((e) => e.risk_score != null)
    .reduce((e, n) => {
      if (!e || (n.risk_score ?? 0) > (e.risk_score ?? 0)) {
        return n;
      } else {
        return e;
      }
    }, null);
  return (
    <section
      aria-label={`Analysis of ${l.filename}`}
      className="animate-fade-in space-y-4 rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-canvas-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden={true} />
            <h3 className="truncate text-[0.9375rem] font-medium text-ink">{l.filename}</h3>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-ink-faint">
            <span>
              {(i = l.size_bytes) < 1024
                ? `${i} B`
                : i < 1048576
                  ? `${(i / 1024).toFixed(1)} KB`
                  : `${(i / 1048576).toFixed(1)} MB`}
            </span>
            {l.page_count > 0 ? (
              <span>
                {l.page_count} page{l.page_count === 1 ? "" : "s"}
              </span>
            ) : null}
            <span>{l.char_count.toLocaleString()} characters</span>
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3 w-3" aria-hidden={true} />
              <span className="mono">{l.sha256.slice(0, 12)}…</span>
            </span>
          </p>
        </div>
        {d ? (
          <button
            type="button"
            onClick={d}
            aria-label="Close document analysis"
            className="focus-ring rounded p-1 text-ink-faint transition hover:bg-canvas-hover hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden={true} />
          </button>
        ) : null}
      </header>
      <div
        className={cn(
          "flex items-start gap-2 rounded border px-3 py-2 text-[0.75rem] leading-relaxed",
          l.is_transcription
            ? "border-accent/40 bg-accent/[0.06] text-ink-muted"
            : "border-canvas-border bg-canvas-raised text-ink-muted",
        )}
      >
        <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden={true} />
        <div>
          <span className="text-ink">{l.extraction_note}</span>
          {l.is_transcription ? (
            <Fragment>
              {" "}
              Figures below are a transcription, not a faithful copy — check them against the source
              before relying on them.
              {l.mean_ocr_confidence != null ? (
                <Fragment> Mean confidence {l.mean_ocr_confidence.toFixed(0)}%.</Fragment>
              ) : null}
            </Fragment>
          ) : null}
        </div>
      </div>
      {l.warnings.length > 0 ? (
        <ul className="space-y-1">
          {l.warnings.map((e, n) => (
            <li
              className="flex items-start gap-2 rounded border border-canvas-border bg-canvas-raised px-3 py-2 text-[0.75rem] leading-relaxed text-ink-muted"
              key={n}
            >
              <TriangleAlert
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
                aria-hidden={true}
              />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <_ label="Identifiers" value={b.identifiers} />
        <_ label="Already on file" value={b.already_known} />
        <_ label="Entities matched" value={b.resolved_entities.length} />
        <_
          label="Highest assessment"
          value={b.highest_known_score != null ? b.highest_known_score.toFixed(0) : "—"}
        />
      </dl>
      {(N == null ? undefined : N.entity_id) ? (
        <div className="rounded border border-risk-border bg-risk-bg px-3 py-2.5">
          <p className="text-[0.8125rem] leading-relaxed text-ink">
            <span className="mono">{N.value}</span> in this document resolves to{" "}
            <Link
              href={`/profiles/${N.entity_id}`}
              className="mono text-accent-bright hover:underline"
            >
              {N.entity_id}
            </Link>
            , which the <span className="mono">{N.model ?? "risk"}</span> model has already assessed
            at {(n = N.risk_score) === null || n === undefined ? undefined : n.toFixed(0)} ({N.band}
            ).
          </p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-faint">
            The assessment is the existing one, carried over — this document was not scored. A score
            ranks the review queue and is not a finding.
          </p>
        </div>
      ) : v.length > 0 ? (
        <p className="rounded border border-canvas-border bg-canvas-raised px-3 py-2 text-[0.75rem] leading-relaxed text-ink-muted">
          {v.length} identifier(s) in this document are already in the data, but none of them
          resolves to an entity the model has scored.
        </p>
      ) : null}
      {l.flags.length > 0 ? (
        <div>
          <h4 className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
            Terms worth reading in context
          </h4>
          <ul className="space-y-1.5">
            {l.flags.map((e, n) => (
              <li
                className="rounded border border-canvas-border bg-canvas-raised px-2.5 py-1.5"
                key={n}
              >
                <Badge variant="accent">{e.label}</Badge>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-faint">{e.context}</p>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-faint">
            These are matched terms, not a classification. Each one points at a paragraph for a
            person to read — nothing here decides what kind of case this is.
          </p>
        </div>
      ) : null}
      {l.hits.length > 0 ? (
        <div>
          <h4 className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
            Identifiers in this document
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.8125rem]">
              <thead>
                <tr className="border-b border-canvas-border text-left text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Value and where it appears</th>
                  <th className="py-2 pr-3 font-medium">Resolves to</th>
                  <th className="py-2 pr-3 font-medium">Existing assessment</th>
                  <th className="py-2 font-medium">Model</th>
                </tr>
              </thead>
              <tbody>
                {[...v, ...k].map((e, n) => (
                  <_Component hit={e} key={`${e.kind}-${e.value}-${n}`} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="rounded border border-dashed border-canvas-border px-3 py-4 text-center text-[0.75rem] text-ink-faint">
          No identifiers were found in this document. Its text is below, if there was any to read.
        </p>
      )}
      {l.amounts.length > 0 || l.dates.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {l.amounts.length > 0 ? (
            <div>
              <h4 className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
                Amounts mentioned
              </h4>
              <ul className="space-y-1">
                {l.amounts.slice(0, 8).map((e, n) => (
                  <li className="text-[0.75rem] text-ink-muted" key={n}>
                    <span className="mono text-ink">{e.text}</span>
                    <span className="ml-1.5 text-ink-faint">{e.context}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {l.dates.length > 0 ? (
            <div>
              <h4 className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
                Dates mentioned
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {l.dates.slice(0, 12).map((e) => (
                  <span
                    className="mono rounded border border-canvas-border px-1.5 py-0.5 text-[0.6875rem] text-ink-muted"
                    key={e}
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {l.rows.length > 0 ? (
        <div>
          <h4 className="mb-1.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
            Structured rows read from the document
            <span className="normal-case tracking-normal text-ink-faint/70">
              {l.summary.rows_parsed} shown
            </span>
          </h4>
          <div className="max-h-64 overflow-auto rounded border border-canvas-border">
            <table className="w-full border-collapse text-[0.75rem]">
              <thead className="sticky top-0 bg-canvas-panel">
                <tr className="border-b border-canvas-border text-left text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                  {l.row_columns.map((e) => (
                    <th className="whitespace-nowrap px-2 py-1.5 font-medium" key={e}>
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {l.rows.map((e, n) => (
                  <tr className="border-b border-canvas-border/50 last:border-b-0" key={n}>
                    {l.row_columns.map((n) => {
                      return (
                        <td className="mono whitespace-nowrap px-2 py-1 text-ink-muted" key={n}>
                          {e[n] ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-faint">
            Reading a document does not add it to the record store. To put these rows into the hash
            chain, upload the file from{" "}
            <Link href="/ingest" className="text-accent-bright hover:underline">
              Data ingestion
            </Link>
            .
          </p>
        </div>
      ) : null}
      {l.ingested ? (
        <p className="flex items-center gap-2 rounded border border-canvas-border bg-canvas-raised px-3 py-2 text-[0.75rem] text-ink-muted">
          <CircleCheck className="h-3.5 w-3.5 text-ok" aria-hidden={true} />
          Ingested {l.ingested.rows_persisted} row(s) into the chain, head{" "}
          <span className="mono">{l.ingested.chain_head.slice(0, 12)}…</span>
        </p>
      ) : null}
      {l.text_preview ? (
        <div>
          <button
            type="button"
            onClick={() => f((e) => !e)}
            aria-expanded={p}
            className="focus-ring text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint transition hover:text-ink"
          >
            {p ? "Hide" : "Show"} the text this was read from
          </button>
          {p ? (
            <pre className="animate-fade-in mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-canvas-border bg-canvas p-3 text-[0.75rem] leading-relaxed text-ink-muted">
              {l.text_preview}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
function _(e) {
  let { label: n, value: t } = e;
  return (
    <div className="rounded border border-canvas-border bg-canvas-raised px-2.5 py-2">
      <dt className="text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">{n}</dt>
      <dd className="mt-0.5 font-mono text-[1.0625rem] text-ink">{t}</dd>
    </div>
  );
}
