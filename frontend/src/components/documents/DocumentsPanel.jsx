"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileSearch, FileText, LoaderCircle, Trash2 } from "lucide-react";
import { DocumentAnalysisResult, DocumentAnalyzer } from "@/components/documents/DocumentAnalysis";
import { RiskBadge } from "@/components/RiskBadge";
import { ErrorAlert } from "@/components/ui/primitives";
import { deleteDocument, getDocument, getDocuments } from "@/lib/api";
import { cn } from "@/lib/utils";
let p = {
  digital_text: "text layer",
  spreadsheet: "spreadsheet",
  structured: "structured",
  narrative: "prose",
  ocr: "OCR",
  csv: "delimited",
};
export function DocumentsPanel(e) {
  let {
    entityId: n,
    caseId: t,
    allowUpload: f = true,
    title: b = "Documents read",
    className: g,
  } = e;
  let [j, v] = useState(null);
  let [k, N] = useState(0);
  let [y, w] = useState(null);
  let [_, S] = useState(null);
  let [C, F] = useState(null);
  let [D, Z] = useState(null);
  let E = useCallback(async () => {
    w(null);
    try {
      let e = await getDocuments({
        entityId: n,
        caseId: t,
      });
      v(e.documents);
      N(e.total);
    } catch (e) {
      w(e instanceof Error ? e.message : String(e));
      v([]);
    }
  }, [n, t]);
  useEffect(() => {
    E();
  }, [E]);
  let R = useCallback(async (e) => {
    F(e);
    w(null);
    try {
      S((await getDocument(e)).analysis);
    } catch (e) {
      w(e instanceof Error ? e.message : String(e));
    } finally {
      F(null);
    }
  }, []);
  return (
    <section className={cn("space-y-2", g)} aria-label={b}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
          <FileText className="h-3.5 w-3.5 text-ink-faint" aria-hidden={true} />
          {b}
        </h2>
        <p className="text-[0.75rem] text-ink-faint">
          {n ? (
            <Fragment>
              Documents naming <span className="mono">{n}</span>
              {j ? ` — ${j.length} of ${k} read in all` : ""}
            </Fragment>
          ) : j ? (
            `${j.length} document${j.length === 1 ? "" : "s"} read`
          ) : (
            ""
          )}
        </p>
      </div>
      {y ? <ErrorAlert>{y}</ErrorAlert> : null}
      {_ ? <DocumentAnalysisResult analysis={_} onClose={() => S(null)} /> : null}
      {j === null ? (
        <div className="space-y-1.5" aria-busy={true}>
          {[0, 1].map((e) => (
            <div className="skeleton h-12 rounded" key={e} />
          ))}
        </div>
      ) : j.length === 0 ? (
        <p className="rounded border border-dashed border-canvas-border px-3 py-4 text-center text-[0.75rem] leading-relaxed text-ink-faint">
          {n ? (
            <Fragment>
              No document read so far names <span className="mono">{n}</span>. That is a real answer
              — this entity surfaced from the data, not from a file anyone uploaded.
            </Fragment>
          ) : (
            "Nothing has been read yet. Drop a case file below and its identifiers are checked against everything already held."
          )}
        </p>
      ) : (
        <ul className="divide-y divide-canvas-border rounded border border-canvas-border bg-canvas-panel">
          {j.map((e) => {
            var s;
            return (
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" key={e.id}>
                <button
                  type="button"
                  onClick={() => R(e.id)}
                  className="focus-ring min-w-0 flex-1 rounded text-left transition hover:text-accent-bright"
                >
                  <span className="flex items-center gap-2">
                    {C === e.id ? (
                      <LoaderCircle
                        className="h-3.5 w-3.5 shrink-0 animate-spin"
                        aria-hidden={true}
                      />
                    ) : (
                      <FileSearch
                        className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                        aria-hidden={true}
                      />
                    )}
                    <span className="truncate text-[0.8125rem] text-ink">{e.filename}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2.5 text-[0.6875rem] text-ink-faint">
                    <span>{p[e.extraction_method] ?? e.extraction_method}</span>
                    <span>
                      {(s = e.size_bytes) < 1024
                        ? `${s} B`
                        : s < 1048576
                          ? `${(s / 1024).toFixed(1)} KB`
                          : `${(s / 1048576).toFixed(1)} MB`}
                    </span>
                    <span>
                      {e.identifier_count} identifier{e.identifier_count === 1 ? "" : "s"}
                      {e.known_count > 0 ? `, ${e.known_count} already held` : ""}
                    </span>
                    <span>
                      {(function (e) {
                        if (!e) {
                          return "";
                        }
                        let n = new Date(e);
                        return `${n.toLocaleDateString()} ${n.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`;
                      })(e.uploaded_at)}
                    </span>
                    <span>by {e.uploaded_by}</span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-2">
                  {e.entities.slice(0, 3).map((e) => (
                    <Link
                      href={`/profiles/${e}`}
                      className={cn(
                        "mono focus-ring rounded border px-1 py-0.5 text-[0.625rem] transition hover:bg-canvas-hover",
                        e === n
                          ? "border-accent/50 text-accent-bright"
                          : "border-canvas-border text-ink-faint",
                      )}
                      key={e}
                    >
                      {e}
                    </Link>
                  ))}
                  {e.top_risk > 0 ? (
                    <RiskBadge
                      band={e.top_risk >= 66 ? "high" : e.top_risk >= 33 ? "elevated" : "low"}
                      score={e.top_risk / 100}
                    />
                  ) : null}
                  {e.ingested_batch_id ? (
                    <span
                      className="rounded border border-[color:var(--ok)]/40 px-1.5 py-0.5 text-[0.625rem] text-[color:var(--ok)]"
                      title={`Rows from this document are in the chain, batch ${e.ingested_batch_id}`}
                    >
                      in evidence
                    </span>
                  ) : (
                    <span
                      className="rounded border border-canvas-border px-1.5 py-0.5 text-[0.625rem] text-ink-faint"
                      title="Read only — nothing from this document entered the hash chain."
                    >
                      read only
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={D === e.id}
                    onClick={async () => {
                      Z(e.id);
                      w(null);
                      try {
                        await deleteDocument(e.id);
                        await E();
                      } catch (e) {
                        w(e instanceof Error ? e.message : String(e));
                      } finally {
                        Z(null);
                      }
                    }}
                    aria-label={`Remove ${e.filename} from the library`}
                    title="Removes the reading. Any records ingested from it stay in the chain."
                    className="focus-ring rounded p-1 text-ink-faint transition hover:bg-canvas-hover hover:text-risk"
                  >
                    {D === e.id ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
                    )}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {f ? (
        <DocumentAnalyzer
          onAnalysed={() => E()}
          label={n ? `Read a document about ${n}` : "Read another document"}
          hint="PDF, Word, Excel, CSV, JSON or plain text. Its identifiers are checked against everything already held, and the reading is kept."
        />
      ) : null}
      <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
        Reading a document does not enter it into evidence. Anything marked{" "}
        <span className="text-ink-muted">in evidence</span> also went through ingest and is in the
        hash chain; everything else was read and nothing more.
      </p>
    </section>
  );
}
