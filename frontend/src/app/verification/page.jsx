"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  LoaderCircle,
  Lock,
  LockOpen,
  RefreshCw,
  ScanSearch,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import { VerificationReport } from "@/components/verification/VerificationReport";
import { ask, getSelfEval, getVerificationPanel, verifyAnswer } from "@/lib/api";
import { cn } from "@/lib/utils";
let f = [
  {
    label: "Fabricated citation",
    claim: "A transfer of 250000 was made to account HDFC0000000000.",
    cited: "TXN-DOES-NOT-EXIST",
    note: "Cites a record that was never ingested. Caught without a model.",
  },
  {
    label: "Unsupported figure",
    claim: "A transfer of 999999 was made from SBIN1234567890.",
    cited: "",
    note: "Paste a real record id to see grounding pass and support fail.",
  },
  {
    label: "Honest refusal",
    claim: "I can't answer that from the data available.",
    cited: "",
    note: "Must not be punished — hedging is the behaviour we want.",
  },
];
export default function VerificationPage() {
  let [t, a] = useState(null);
  let [b, v] = useState(null);
  let [k, g] = useState(true);
  let [j, N] = useState(null);
  let [w, y] = useState(f[0].claim);
  let [_, C] = useState(f[0].cited);
  let [S, Z] = useState(null);
  let [T, A] = useState(false);
  let [E, F] = useState("How many records are in the system?");
  let [M, H] = useState(null);
  let [O, I] = useState(false);
  let P = useCallback(async () => {
    g(true);
    N(null);
    try {
      let [e, t] = await Promise.all([getVerificationPanel(), getSelfEval()]);
      a(e);
      v(t);
    } catch (e) {
      N(String(e));
    } finally {
      g(false);
    }
  }, []);
  useEffect(() => {
    P();
  }, [P]);
  let q = async () => {
    A(true);
    N(null);
    try {
      let e = _.split(/[,\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      Z(
        await verifyAnswer([
          {
            claim: w,
            cited: e,
          },
        ]),
      );
    } catch (e) {
      N(String(e));
      Z(null);
    } finally {
      A(false);
    }
  };
  let D = async () => {
    I(true);
    N(null);
    try {
      H(
        await ask(E, "text", {
          verify: true,
        }),
      );
    } catch (e) {
      N(String(e));
      H(null);
    } finally {
      I(false);
    }
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Answer verification"
        description="Every claim an agent makes here is checked before you are asked to rely on it. Cited records are resolved and re-hashed against the values recorded at ingest — that part is arithmetic, and no model can talk it out of a verdict. Only what arithmetic cannot settle is put to judges, and when they disagree you are told."
        actions={
          <button onClick={P} disabled={k} className={buttonClass}>
            {k ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden={true} />
            )}
            Re-run
          </button>
        }
      />
      {j ? <ErrorAlert>{j}</ErrorAlert> : null}
      {t ? (
        <section
          className={cn(
            "flex flex-wrap items-start gap-3 rounded border p-3",
            t.air_gapped ? "border-canvas-border bg-canvas-panel" : "border-risk-border bg-risk-bg",
          )}
        >
          {t.air_gapped ? (
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ok)]" aria-hidden={true} />
          ) : (
            <LockOpen className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden={true} />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[0.8125rem] font-medium text-ink">
              {t.count} judge{t.count === 1 ? "" : "s"} active
              <span className="ml-2 font-normal text-ink-faint">{t.judges.join(", ")}</span>
            </div>
            <p
              className={cn(
                "mt-0.5 text-[0.75rem] leading-relaxed",
                t.air_gapped ? "text-ink-muted" : "text-risk",
              )}
            >
              {t.note}
            </p>
          </div>
        </section>
      ) : null}
      <section className="rounded border border-canvas-border bg-canvas-panel p-3">
        <h2 className="text-[0.8125rem] font-semibold text-ink">Test the verifier</h2>
        <p className="mt-0.5 max-w-2xl text-[0.75rem] leading-relaxed text-ink-muted">
          Hand it a claim and the records that claim cites. A citation that resolves to nothing
          comes back as a fabrication — no model is consulted for that verdict.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {f.map((e) => (
            <button
              type="button"
              onClick={() => {
                y(e.claim);
                C(e.cited);
                Z(null);
              }}
              title={e.note}
              className="focus-ring rounded border border-canvas-border px-2 py-1 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
              key={e.label}
            >
              {e.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 space-y-2">
          <div>
            <label
              htmlFor="probe-claim"
              className="block text-[0.6875rem] font-medium text-ink-muted"
            >
              Claim
            </label>
            <textarea
              id="probe-claim"
              value={w}
              onChange={(e) => y(e.target.value)}
              rows={2}
              className="focus-ring mt-1 w-full resize-y rounded border border-canvas-border bg-canvas px-2 py-1.5 text-[0.75rem] text-ink placeholder:text-ink-faint"
            />
          </div>
          <div>
            <label
              htmlFor="probe-cited"
              className="block text-[0.6875rem] font-medium text-ink-muted"
            >
              Cited records{" "}
              <span className="font-normal text-ink-faint">
                (rec_id or row hash, comma separated — leave blank to cite nothing)
              </span>
            </label>
            <input
              id="probe-cited"
              value={_}
              onChange={(e) => C(e.target.value)}
              className="focus-ring mt-1 w-full rounded border border-canvas-border bg-canvas px-2 py-1.5 font-mono text-[0.75rem] text-ink placeholder:text-ink-faint"
              placeholder="TXN00042"
            />
          </div>
          <button onClick={q} disabled={T || !w.trim()} className={primaryButtonClass}>
            {T ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
            ) : (
              <ScanSearch className="h-3.5 w-3.5" aria-hidden={true} />
            )}
            Verify claim
          </button>
        </div>
        {S ? (
          <div className="mt-3">
            <VerificationReport result={S} defaultOpen={true} />
          </div>
        ) : null}
      </section>
      <section className="rounded border border-canvas-border bg-canvas-panel p-3">
        <h2 className="text-[0.8125rem] font-semibold text-ink">Verify a live answer</h2>
        <p className="mt-0.5 max-w-2xl text-[0.75rem] leading-relaxed text-ink-muted">
          The same check, on the real ask pipeline. The answer comes back with its verification
          attached; if verification fails, the answer still arrives and says so.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={E}
            onChange={(e) => F(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !O && D()}
            aria-label="Question"
            className="focus-ring min-w-0 flex-1 rounded border border-canvas-border bg-canvas px-2 py-1.5 text-[0.75rem] text-ink placeholder:text-ink-faint"
            placeholder="Ask a question…"
          />
          <button onClick={D} disabled={O || !E.trim()} className={buttonClass}>
            {O ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden={true} />
            )}
            Ask & verify
          </button>
        </div>
        {M ? (
          <div className="mt-3 space-y-2">
            <div className="rounded border border-canvas-border bg-canvas-raised p-3">
              <p className="text-[0.8125rem] leading-relaxed text-ink">{M.answer}</p>
              {M.sources?.length ? (
                <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
                  Sources: {M.sources.join(", ")}
                </p>
              ) : null}
            </div>
            {M.verification ? <VerificationReport result={M.verification} /> : null}
          </div>
        ) : null}
      </section>
      {b ? (
        <section>
          <h2 className="mb-1 text-[0.8125rem] font-semibold text-ink">
            The verifier, graded against itself
          </h2>
          <p className="mb-2 max-w-2xl text-[0.75rem] leading-relaxed text-ink-muted">{b.note}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-canvas-border bg-canvas-panel p-3">
              <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Accuracy
              </div>
              <div className="mt-1 font-serif text-2xl text-ink">
                {(b.accuracy * 100).toFixed(0)}%
              </div>
              <div className="mt-0.5 text-[0.6875rem] text-ink-faint">
                {b.correct} of {b.total} labelled cases
              </div>
            </div>
            <div className="rounded border border-canvas-border bg-canvas-panel p-3">
              <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Fabrication recall
              </div>
              <div
                className={cn(
                  "mt-1 font-serif text-2xl",
                  b.fabrication_recall === 1 ? "text-[color:var(--ok)]" : "text-risk",
                )}
              >
                {(b.fabrication_recall * 100).toFixed(0)}%
              </div>
              <div className="mt-0.5 text-[0.6875rem] text-ink-faint">
                Invented citations caught. The number that matters most.
              </div>
            </div>
            <div className="rounded border border-canvas-border bg-canvas-panel p-3">
              <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Honest refusals
              </div>
              <div
                className={cn(
                  "mt-1 font-serif text-2xl",
                  b.honest_refusal_respected ? "text-[color:var(--ok)]" : "text-risk",
                )}
              >
                {b.honest_refusal_respected ? "Respected" : "Punished"}
              </div>
              <div className="mt-0.5 text-[0.6875rem] text-ink-faint">
                Penalising "I don’t know" would train the agent to guess.
              </div>
            </div>
          </div>
          <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-muted">
            {b.cases.filter((e) => e.correct).length} of {b.cases.length} traps handled correctly.
            Each row below is a claim deliberately built to defeat the checker — an invented
            citation, a tampered record, a figure the evidence does not carry, and an honest refusal
            that must not be punished. The verifier is graded against them on every run, so this
            page reports what it does rather than what it claims.
          </p>
          <div className="mt-2 rounded border border-canvas-border bg-canvas-panel">
            {b.cases.map((e) => (
              <div
                className="flex items-start gap-2.5 border-b border-canvas-border px-3 py-2 last:border-b-0"
                key={e.trap_id}
              >
                <ShieldCheck
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    e.correct ? "text-[color:var(--ok)]" : "text-risk",
                  )}
                  strokeWidth={2}
                  aria-hidden={true}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[0.625rem] text-ink-faint">{e.trap_id}</span>
                    <span className="text-[0.75rem] text-ink">{e.claim}</span>
                  </div>
                  <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-faint">
                    {e.why_it_matters}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span
                    className={cn(
                      "block text-[0.6875rem] font-medium",
                      e.correct ? "text-[color:var(--ok)]" : "text-risk",
                    )}
                  >
                    {e.correct ? "Caught" : "Missed"}
                  </span>
                  <span
                    className="block text-[0.625rem] text-ink-faint"
                    title={`expected ${e.expected}, got ${e.predicted}`}
                  >
                    {e.correct ? (
                      <Fragment>ruled {e.predicted}</Fragment>
                    ) : (
                      <Fragment>
                        expected {e.expected}, got <span className="text-risk">{e.predicted}</span>
                      </Fragment>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
