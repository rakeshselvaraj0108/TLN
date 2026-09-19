"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Split } from "lucide-react";
import { useEvidenceSelectActions } from "@/components/evidence/EvidenceSelection";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import { EmptyState, ErrorAlert, PageHeader } from "@/components/ui/primitives";
import { getCallToDebitCorrelations, getFanoutCorrelations } from "@/lib/api";
let h = (e) => "₹" + e.toLocaleString("en-IN");
let m = (e) =>
  e < 60 ? `${e}s` : e < 3600 ? `${Math.round(e / 60)}m` : `${(e / 3600).toFixed(1)}h`;
export default function CorrelationsPage() {
  let [n, f] = useState(null);
  let [x, p] = useState(null);
  let [b, g] = useState(null);
  let { select: v } = useEvidenceSelectActions();
  useEffect(() => {
    getCallToDebitCorrelations()
      .then((e) => f(e.links))
      .catch((e) => g(String(e)));
    getFanoutCorrelations()
      .then((e) => p(e.links))
      .catch((e) => g(String(e)));
  }, []);
  let j = (n == null ? undefined : n.filter((e) => e.latency_s <= 600).length) ?? 0;
  let k = (x == null ? undefined : x.filter((e) => e.passthrough_ratio >= 0.9).length) ?? 0;
  let N = (e, t) =>
    v({
      entityId: e,
      origin: t,
    });
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Cross-domain correlations"
        description="The join no single system sees. A call and a debit are each ordinary — a call followed within minutes by a high-passthrough debit is not."
      />
      {b ? <ErrorAlert>{b}</ErrorAlert> : null}
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Phone className="h-4 w-4 text-accent-bright" /> Call → debit latency
          </h2>
          {n && n.length > 0 ? (
            <span className="text-[0.75rem] text-ink-faint">
              {j > 0 ? (
                <span className="text-risk">
                  {j} under {10} min
                </span>
              ) : null}
              {j > 0 ? " · " : ""}
              {n.length} coupling{n.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {n ? (
          n.length === 0 ? (
            <EmptyState title="No call→debit couplings">
              Ingest the CDR and banking sources, then run the analysis pass.
            </EmptyState>
          ) : (
            <DataTable head={["Person", "Caller", "Latency", "Amount", "Narration"]}>
              {n.map((e) => (
                <TableRow
                  onClick={() => N(e.person, "Selected from call→debit couplings")}
                  className="cursor-pointer"
                  key={`${e.call_rec_id}:${e.debit_rec_id}`}
                >
                  <TableCell>
                    <Link
                      href={`/queue/${e.person}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mono text-accent-bright hover:underline"
                    >
                      {e.person}
                    </Link>
                  </TableCell>
                  <TableCell className="mono text-ink-muted">{e.caller}</TableCell>
                  <TableCell>
                    <span
                      className={e.latency_s <= 600 ? "font-semibold text-risk" : "text-ink-muted"}
                    >
                      {m(e.latency_s)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{h(e.amount)}</TableCell>
                  <TableCell className="text-ink-muted">{e.narration}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          )
        ) : (
          <TableSkeleton cols={5} />
        )}
      </section>
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Split className="h-4 w-4 text-accent-bright" /> Fund fan-out
          </h2>
          {x && x.length > 0 ? (
            <span className="text-[0.75rem] text-ink-faint">
              {k > 0 ? (
                <span className="text-risk">
                  {k} at {90}%+ passthrough
                </span>
              ) : null}
              {k > 0 ? " · " : ""}
              {x.length} pattern{x.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {x ? (
          x.length === 0 ? (
            <EmptyState title="No fan-out patterns">
              Nothing found. Ingest the banking source and run the analysis pass.
            </EmptyState>
          ) : (
            <DataTable head={["Person", "Inbound", "Passthrough", "Hops", "Window"]}>
              {x.map((e) => (
                <TableRow
                  onClick={() => N(e.person, "Selected from fund fan-out")}
                  className="cursor-pointer"
                  key={`${e.person}:${e.inbound_rec_id}`}
                >
                  <TableCell>
                    <Link
                      href={`/queue/${e.person}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mono text-accent-bright hover:underline"
                    >
                      {e.person}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{h(e.inbound_amount)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          e.passthrough_ratio >= 0.9
                            ? "font-semibold tabular-nums text-risk"
                            : "tabular-nums text-ink-muted"
                        }
                      >
                        {(e.passthrough_ratio * 100).toFixed(0)}%
                      </span>
                      <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-canvas-hover sm:block">
                        <span
                          className={
                            "block h-full origin-left rounded-full animate-grow-x " +
                            (e.passthrough_ratio >= 0.9 ? "bg-risk" : "bg-ink-faint/60")
                          }
                          style={{
                            width: `${Math.min(100, e.passthrough_ratio * 100)}%`,
                          }}
                        />
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{e.hop_count}</TableCell>
                  <TableCell className="text-ink-muted">≤ {m(e.window_s)}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          )
        ) : (
          <TableSkeleton cols={5} />
        )}
      </section>
    </div>
  );
}
