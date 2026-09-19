"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, LoaderCircle, Lock, ShieldCheck } from "lucide-react";
import { CounterfactualPanel } from "@/components/evidence/CounterfactualPanel";
import { ExculpatoryPanel } from "@/components/evidence/ExculpatoryPanel";
import { RiskBadge } from "@/components/RiskBadge";
import { ErrorAlert, PageHeader } from "@/components/ui/primitives";
import { evidencePackageUrl, getBsaCertificate, getCases, getMe, getQueue } from "@/lib/api";
export default function EvidencePage() {
  let [e, t] = useState([]);
  let [n, f] = useState([]);
  let [b, v] = useState("");
  let [g, k] = useState("");
  let [j, y] = useState(null);
  let [N, w] = useState(null);
  let [_, Z] = useState(null);
  useEffect(() => {
    let e = () => {
      getQueue()
        .then((e) => {
          t(e.items);
          if (e.items[0]) {
            v((t) => t || e.items[0].entity_id);
          }
        })
        .catch((e) => Z(String(e)));
      getCases()
        .then(f)
        .catch(() => {});
      getMe()
        .then(w)
        .catch(() => w(null));
    };
    e();
    window.addEventListener("tracex:user-changed", e);
    return () => window.removeEventListener("tracex:user-changed", e);
  }, []);
  useEffect(() => {
    if (b) {
      y(null);
      getBsaCertificate({
        entityId: b,
      })
        .then(y)
        .catch((e) => Z(String(e)));
    }
  }, [b]);
  let S = e.find((e) => e.entity_id === b);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Evidence & trust"
        description="Transparent reasoning about a flagged entity, an adversarial legitimacy check, and a court-ready evidence package with the Section 63 BSA certificate."
      />
      {_ ? <ErrorAlert>{_}</ErrorAlert> : null}
      <div className="flex items-center gap-3">
        <label className="text-[0.8125rem] text-ink-muted">Entity</label>
        <select
          value={b}
          onChange={(e) => v(e.target.value)}
          className="rounded border border-canvas-border bg-canvas-raised px-2 py-1 text-[0.8125rem] text-ink"
        >
          {e.map((e) => (
            <option value={e.entity_id} key={e.entity_id}>
              {e.entity_id} — {e.band} {e.risk_score.toFixed(2)}
            </option>
          ))}
        </select>
        {S ? <RiskBadge band={S.band} score={S.risk_score} /> : null}
        {b ? (
          <Link
            href={`/queue/${b}`}
            className="text-[0.8125rem] text-accent-bright hover:underline"
          >
            full entity view →
          </Link>
        ) : null}
      </div>
      {b ? (
        <Fragment>
          <CounterfactualPanel entityId={b} />
          <ExculpatoryPanel entityId={b} />
        </Fragment>
      ) : null}
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-accent-bright" /> Section 63 BSA certificate
        </h2>
        {j ? (
          <Fragment>
            <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-ink-muted">
              <span>
                Status: <span className="text-risk">{j.certificate.status}</span>
              </span>
              <span>
                Records: <span className="text-ink">{j.certificate.total_records}</span>
              </span>
              <span>
                Chains:{" "}
                <span className={j.certificate.all_chains_intact ? "text-ok" : "text-risk"}>
                  {j.certificate.all_chains_intact ? "all intact" : "FAILURE"}
                </span>
              </span>
            </div>
            <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap rounded border border-canvas-border bg-canvas/60 p-3 text-[0.6875rem] leading-relaxed text-ink-muted">
              {j.text}
            </pre>
          </Fragment>
        ) : (
          <LoaderCircle className="h-4 w-4 animate-spin text-ink-muted" />
        )}
      </section>
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <FileText className="h-4 w-4 text-accent-bright" /> Evidence package
        </h2>
        <p className="mb-3 text-[0.8125rem] text-ink-muted">
          Bundles the assessment, counterfactual, exculpatory findings, the reconstructed timeline,
          the hash-chain manifest, and the BSA certificate.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={g}
            onChange={(e) => k(e.target.value ? Number(e.target.value) : "")}
            className="rounded border border-canvas-border bg-canvas-raised px-2 py-1 text-[0.8125rem] text-ink"
          >
            <option value="">This entity only</option>
            {n.map((e) => (
              <option value={e.id} key={e.id}>
                Case {e.case_code} — {e.title}
              </option>
            ))}
          </select>
          {["pdf", "text", "json"].map((e) =>
            (N == null ? undefined : N.is_supervisor) ? (
              <a
                href={evidencePackageUrl(
                  g
                    ? {
                        caseId: g,
                        fmt: e,
                      }
                    : {
                        entityId: b,
                        fmt: e,
                      },
                )}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[0.8125rem] text-accent-bright hover:bg-accent/20"
                key={e}
              >
                <Download className="h-3.5 w-3.5" /> {e.toUpperCase()}
              </a>
            ) : (
              <span
                title="Exporting an evidence package requires the supervisor role"
                className="flex cursor-not-allowed items-center gap-1.5 rounded border border-canvas-border px-3 py-1.5 text-[0.8125rem] text-ink-faint"
                key={e}
              >
                <Lock className="h-3.5 w-3.5" /> {e.toUpperCase()}
              </span>
            ),
          )}
        </div>
        {(N == null ? undefined : N.is_supervisor) ? null : (
          <p className="mt-2 text-[0.75rem] text-risk">
            Export is restricted to supervisors — a package leaves the system with case material in
            it. Switch role in the top bar to demonstrate.
          </p>
        )}
      </section>
    </div>
  );
}
