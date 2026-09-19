"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CreditCard, Phone, Split } from "lucide-react";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";
import { CounterfactualPanel } from "@/components/evidence/CounterfactualPanel";
import { useEvidenceSelectActions } from "@/components/evidence/EvidenceSelection";
import { ExculpatoryPanel } from "@/components/evidence/ExculpatoryPanel";
import { ResponseAgentPanel } from "@/components/response/ResponseAgentPanel";
import { RiskBadge } from "@/components/RiskBadge";
import { ShapFactors } from "@/components/ShapFactors";
import { ErrorAlert } from "@/components/ui/primitives";
import { getEntityIntel } from "@/lib/api";
function v(e) {
  return "₹" + e.toLocaleString("en-IN");
}
function g(e) {
  if (e < 60) {
    return `${e}s`;
  } else if (e < 3600) {
    return `${Math.round(e / 60)}m`;
  } else {
    return `${(e / 3600).toFixed(1)}h`;
  }
}
export default function QueueByEntityIdPage() {
  let t = String(useParams()?.entityId ?? "");
  let [r, o] = useState(null);
  let [k, w] = useState(null);
  let { select: F } = useEvidenceSelectActions();
  useEffect(() => {
    getEntityIntel(t)
      .then(o)
      .catch((e) => w(String(e)));
  }, [t]);
  useEffect(() => {
    if (r) {
      F({
        entityId: r.entity_id,
        band: r.band,
        riskScore: r.risk_score,
        origin: "Open in the assessment view",
      });
    }
  }, [r, F]);
  if (k) {
    return (
      <div className="space-y-3">
        <_Component />
        <ErrorAlert>{k}</ErrorAlert>
      </div>
    );
  } else if (r) {
    return (
      <div className="max-w-4xl space-y-5">
        <_Component />
        <div className="sticky top-0 z-10 -mx-6 flex flex-wrap items-center gap-3 border-b border-canvas-border bg-canvas/95 px-6 pb-3 backdrop-blur">
          <h1 className="mono text-2xl font-medium tracking-tight text-ink">{r.entity_id}</h1>
          <RiskBadge band={r.band} score={r.risk_score} />
          <span className="text-[0.75rem] text-ink-faint">model: {r.model}</span>
        </div>
        <section className="reasoning-surface animate-rise-in rounded p-4 shadow-raised">
          <h2 className="mb-1 text-sm font-semibold text-ink">Why this score</h2>
          <p className="mb-3 text-[0.75rem] text-ink-muted">
            Feature attribution for the risk score. Blue raises risk, grey lowers it. These are the
            exact inputs — no hidden signals.
          </p>
          <ShapFactors factors={r.top_factors} />
        </section>
        <CounterfactualPanel entityId={r.entity_id} />
        <ExculpatoryPanel entityId={r.entity_id} />
        <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
          <DocumentsPanel entityId={r.entity_id} title="Documents naming this entity" />
        </section>
        <div id="agent" className="scroll-mt-4">
          <ResponseAgentPanel entityId={r.entity_id} />
        </div>
        {r.call_to_debit_links.length > 0 ? (
          <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Phone className="h-4 w-4 text-accent-bright" /> Call → debit couplings
            </h2>
            <table className="w-full text-[0.8125rem]">
              <thead>
                <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                  <th className="py-1 pr-3">Caller</th>
                  <th className="py-1 pr-3">Latency</th>
                  <th className="py-1 pr-3">Amount</th>
                  <th className="py-1 pr-3">→ Account</th>
                  <th className="py-1">Narration</th>
                </tr>
              </thead>
              <tbody>
                {r.call_to_debit_links.map((e) => {
                  return (
                    <tr
                      className="border-t border-canvas-border/60 transition-colors hover:bg-canvas-hover/60"
                      key={`${e.call_rec_id}:${e.debit_rec_id}`}
                    >
                      <td className="mono py-1.5 pr-3">{e.caller}</td>
                      <td className="py-1.5 pr-3">
                        <span
                          className={
                            e.latency_s <= 600 ? "font-semibold text-risk" : "text-ink-muted"
                          }
                        >
                          {g(e.latency_s)}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{v(e.amount)}</td>
                      <td className="mono py-1.5 pr-3 text-ink-muted">{e.dst_account ?? "—"}</td>
                      <td className="py-1.5 text-ink-muted">{e.narration}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}
        {r.fanout_links.length > 0 ? (
          <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Split className="h-4 w-4 text-accent-bright" /> Fund fan-out
            </h2>
            <table className="w-full text-[0.8125rem]">
              <thead>
                <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                  <th className="py-1 pr-3">Inbound</th>
                  <th className="py-1 pr-3">Passthrough</th>
                  <th className="py-1 pr-3">Hops</th>
                  <th className="py-1">Window</th>
                </tr>
              </thead>
              <tbody>
                {r.fanout_links.map((e) => (
                  <tr
                    className="border-t border-canvas-border/60 transition-colors hover:bg-canvas-hover/60"
                    key={`${e.inbound_rec_id}:${e.outbound_rec_ids.join(",")}`}
                  >
                    <td className="py-1.5 pr-3 font-mono">{v(e.inbound_amount)}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={
                          e.passthrough_ratio >= 0.9 ? "font-semibold text-risk" : "text-ink-muted"
                        }
                      >
                        {(e.passthrough_ratio * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{e.hop_count}</td>
                    <td className="py-1.5 text-ink-muted">≤ {g(e.window_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <CreditCard className="h-4 w-4 text-ink-faint" /> Controlled identifiers
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {r.identifiers.map((e, s) => {
              return (
                <span
                  className="mono rounded border border-canvas-border px-1.5 py-0.5 text-[0.75rem] text-ink-muted"
                  key={s}
                >
                  {e.kind}:{" "}
                  {String(
                    e.props.msisdn ??
                      e.props.imei ??
                      e.props.number ??
                      e.props.handle ??
                      e.props.addr ??
                      "?",
                  )}
                </span>
              );
            })}
          </div>
        </section>
        <details className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Full feature vector
          </summary>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[0.8125rem]">
            {Object.entries(r.features).map((e) => {
              let [s, t] = e;
              return (
                <div className="flex justify-between" key={s}>
                  <dt className="text-ink-faint">{s}</dt>
                  <dd className="mono text-ink-muted">{t}</dd>
                </div>
              );
            })}
          </dl>
        </details>
      </div>
    );
  } else {
    return <_ />;
  }
}
function _Component() {
  return (
    <Link
      href="/queue"
      className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Risk queue
    </Link>
  );
}
function _() {
  return (
    <div className="max-w-4xl space-y-5" aria-busy={true} aria-label="Loading assessment">
      <div className="skeleton h-3 w-24 rounded-sm" />
      <div className="flex items-center gap-3">
        <div className="skeleton h-6 w-28 rounded-sm" />
        <div className="skeleton h-5 w-20 rounded-sm" />
      </div>
      <div className="reasoning-surface space-y-2 rounded p-4">
        <div className="skeleton h-3 w-32 rounded-sm" />
        {[0, 1, 2, 3, 4].map((e) => (
          <div className="grid grid-cols-[180px_1fr_64px] items-center gap-2" key={e}>
            <div className="skeleton h-2.5 rounded-sm" />
            <div className="skeleton h-3 rounded-sm" />
            <div className="skeleton h-2.5 rounded-sm" />
          </div>
        ))}
      </div>
      {[0, 1].map((e) => (
        <div
          className="space-y-2 rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel"
          key={e}
        >
          <div className="skeleton h-3 w-40 rounded-sm" />
          <div className="skeleton h-2.5 w-full rounded-sm" />
          <div className="skeleton h-2.5 w-3/4 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
