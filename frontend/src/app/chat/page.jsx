"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CornerDownLeft,
  LoaderCircle,
  Lock,
  LockOpen,
  ScanSearch,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useEvidenceSelection } from "@/components/evidence/EvidenceSelection";
import { Badge } from "@/components/ui/Badge";
import { ErrorAlert, PageHeader, primaryButtonClass } from "@/components/ui/primitives";
import { VerificationReport } from "@/components/verification/VerificationReport";
import {
  ask,
  clearAskHistory,
  getAskExamples,
  getAskHistory,
  getVerificationPanel,
  verifyAnswer,
} from "@/lib/api";
import { cn } from "@/lib/utils";
let j = 1;
function _Component(e) {
  let { v: n } = e;
  if (!n) {
    return null;
  }
  let r = {
    verified: {
      label: "Cross-verified",
      cls: "text-[color:var(--ok)]",
    },
    partial: {
      label: "Partly verified",
      cls: "text-accent-bright",
    },
    unsupported: {
      label: "Not supported",
      cls: "text-risk",
    },
    compromised: {
      label: "Do not rely",
      cls: "text-risk",
    },
    unavailable: {
      label: "Unverified",
      cls: "text-ink-faint",
    },
  };
  let s = r[n.verdict] ?? r.unavailable;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[0.6875rem]", s.cls)}>
      <ShieldCheck className="h-3 w-3" strokeWidth={2} aria-hidden={true} />
      {s.label}
    </span>
  );
}
export default function ChatPage() {
  let [t, n] = useState([]);
  let [i, N] = useState("");
  let [w, C] = useState(false);
  let [S, Z] = useState([]);
  let [A, T] = useState(null);
  let [_, M] = useState(null);
  let [O, D] = useState(null);
  let [q, E] = useState("");
  let [H, F] = useState("");
  let [I, K] = useState(null);
  let [P, R] = useState(false);
  let [V, X] = useState("turn");
  let B = useRef(null);
  let L = useRef(null);
  let U = useRef("default");
  let { select: W } = useEvidenceSelection();
  let [z, $] = useState(true);
  useEffect(() => {
    U.current = (function () {
      try {
        let e = window.sessionStorage.getItem("tracex.ask.session");
        if (e) {
          return e;
        }
        let t = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        window.sessionStorage.setItem("tracex.ask.session", t);
        return t;
      } catch (e) {
        return "default";
      }
    })();
    getAskExamples()
      .then((e) => Z(e.examples))
      .catch(() => Z([]));
    getVerificationPanel()
      .then(T)
      .catch(() => T(null));
    getAskHistory(U.current)
      .then((e) => {
        let t = e.turns.map((e) => {
          return {
            id: j++,
            question: e.question,
            answer: e.answer,
            verification: e.answer?.verification ?? null,
            error: null,
            pending: false,
            at: e.at ? new Date(e.at).toLocaleTimeString() : "",
          };
        });
        n(t);
        let a = t[t.length - 1];
        if (a) {
          M(a.id);
        }
      })
      .catch(() => {})
      .finally(() => $(false));
  }, []);
  useEffect(() => {
    var e;
    if ((e = B.current) !== null && e !== undefined) {
      e.scrollTo({
        top: B.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [t]);
  let G = useCallback(
    async (e) => {
      let t = e.trim();
      if (!t) {
        return;
      }
      let a = j++;
      let r = new Date().toLocaleTimeString();
      n((e) => [
        ...e,
        {
          id: a,
          question: t,
          answer: null,
          verification: null,
          error: null,
          pending: true,
          at: r,
        },
      ]);
      M(a);
      X("turn");
      N("");
      C(true);
      D(null);
      try {
        let e = await ask(t, "text", {
          verify: true,
          sessionKey: U.current,
        });
        n((t) =>
          t.map((t) => {
            if (t.id === a) {
              return {
                ...t,
                answer: e,
                verification: e.verification ?? null,
                pending: false,
              };
            } else {
              return t;
            }
          }),
        );
        if (e.entity_id) {
          W({
            entityId: e.entity_id,
            origin: `Subject of “${t.length > 48 ? `${t.slice(0, 48)}…` : t}”`,
          });
        }
      } catch (t) {
        let e = t instanceof Error ? t.message : String(t);
        n((t) =>
          t.map((t) =>
            t.id === a
              ? {
                  ...t,
                  error: e,
                  pending: false,
                }
              : t,
          ),
        );
        D(e);
      } finally {
        var s;
        C(false);
        if ((s = L.current) !== null && s !== undefined) {
          s.focus();
        }
      }
    },
    [W],
  );
  let J = useCallback(async () => {
    if (q.trim()) {
      R(true);
      D(null);
      try {
        let e = H.split(/[,\s]+/)
          .map((e) => e.trim())
          .filter(Boolean);
        K(
          await verifyAnswer([
            {
              claim: q.trim(),
              cited: e,
            },
          ]),
        );
      } catch (e) {
        D(e instanceof Error ? e.message : String(e));
        K(null);
      } finally {
        R(false);
      }
    }
  }, [q, H]);
  let Q = t.find((e) => e.id === _) ?? null;
  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col gap-3">
      <PageHeader
        title="Investigative agent"
        description="Ask in plain language. Every answer is cross-checked as it arrives — its claims resolved against the hashed record store, and anything left to interpretation put to the judge panel. The check sits beside the answer, not beneath it."
        actions={
          A ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[0.6875rem]",
                A.air_gapped
                  ? "border-canvas-border text-ink-muted"
                  : "border-risk-border bg-risk-bg text-risk",
              )}
              title={A.note}
            >
              {A.air_gapped ? (
                <Lock className="h-3 w-3 text-[color:var(--ok)]" aria-hidden={true} />
              ) : (
                <LockOpen className="h-3 w-3" aria-hidden={true} />
              )}
              <Users className="h-3 w-3" aria-hidden={true} />
              {A.count} judge{A.count === 1 ? "" : "s"}
              <span className="text-ink-faint">{A.judges.join(", ")}</span>
            </span>
          ) : null
        }
      />
      {O ? <ErrorAlert>{O}</ErrorAlert> : null}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <section
          aria-label="Agent conversation"
          className="flex min-h-0 flex-col rounded border border-canvas-border bg-canvas-panel"
        >
          <div className="flex items-center gap-2 border-b border-canvas-border px-3 py-2">
            <Send className="h-3.5 w-3.5 text-ink-faint" aria-hidden={true} />
            <h2 className="text-[0.8125rem] font-medium text-ink">Agent</h2>
            <span className="ml-auto text-[0.6875rem] text-ink-faint">
              {t.length} turn{t.length === 1 ? "" : "s"}
            </span>
            {t.length > 0 ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await clearAskHistory(U.current);
                  } catch (e) {}
                  n([]);
                  M(null);
                  K(null);
                }}
                title="Start a new conversation"
                aria-label="Start a new conversation"
                className="focus-ring rounded p-1 text-ink-faint transition hover:bg-canvas-hover hover:text-ink"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
              </button>
            ) : null}
          </div>
          <div ref={B} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {z && t.length === 0 ? (
              <div className="space-y-2 py-6" aria-busy={true} aria-label="Restoring conversation">
                <div className="skeleton ml-auto h-7 w-2/5 rounded" />
                <div className="skeleton h-16 rounded" />
              </div>
            ) : null}
            {z || t.length !== 0 ? null : (
              <div className="space-y-3 py-6 text-center">
                <p className="text-[0.8125rem] text-ink-muted">
                  Ask a question to begin. Answers are built from real queries against the case data
                  — never generated prose.
                </p>
                <p className="mx-auto max-w-sm text-[0.75rem] leading-relaxed text-ink-faint">
                  Follow-ups work: ask about an entity, then just ask “why?” or “show me the
                  transactions” and the next answer stays on the same subject.
                </p>
                {S.length ? (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {S.map((e) => (
                      <button
                        type="button"
                        onClick={() => G(e)}
                        className="focus-ring rounded border border-canvas-border px-2 py-1 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
                        key={e}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {t.map((e) => {
              var i;
              var c;
              let d = e.id === _;
              return (
                <div className="space-y-1.5" key={e.id}>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded border border-accent/30 bg-accent/[0.07] px-2.5 py-1.5 text-[0.8125rem] text-ink">
                      {e.question}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => M(e.id)}
                    aria-pressed={d}
                    className={cn(
                      "focus-ring block w-full rounded border px-2.5 py-2 text-left transition",
                      d
                        ? "border-accent/40 bg-canvas-raised"
                        : "border-canvas-border bg-canvas-raised/60 hover:bg-canvas-hover",
                    )}
                  >
                    {e.pending ? (
                      <span className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
                        Answering, and cross-checking as it goes…
                      </span>
                    ) : e.error ? (
                      <span className="text-[0.8125rem] text-risk">{e.error}</span>
                    ) : (
                      <Fragment>
                        <p className="text-[0.8125rem] leading-relaxed text-ink">
                          {e.answer?.answer}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.6875rem] text-ink-faint">
                          {e.answer?.intent ? (
                            <Badge variant="neutral">{e.answer.intent.replace(/_/g, " ")}</Badge>
                          ) : null}
                          {(
                            (i = e.answer) === null || i === undefined
                              ? undefined
                              : i.sources?.length
                          ) ? (
                            <span>read from {e.answer.sources.join(", ")}</span>
                          ) : null}
                          <_Component v={e.verification} />
                          <span className="ml-auto">{e.at}</span>
                        </div>
                      </Fragment>
                    )}
                  </button>
                  {(
                    (c = e.answer) === null || c === undefined ? undefined : c.suggestions?.length
                  ) ? (
                    <div className="flex flex-wrap gap-1.5">
                      {e.answer.suggestions.map((e) => (
                        <button
                          type="button"
                          onClick={() => G(e)}
                          className="focus-ring rounded border border-canvas-border px-2 py-0.5 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
                          key={e}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {e.answer?.link ? (
                    <Link
                      href={e.answer.link}
                      className="inline-block text-[0.6875rem] text-accent-bright hover:underline"
                    >
                      Open the underlying view →
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              G(i);
            }}
            className="flex gap-2 border-t border-canvas-border p-2.5"
          >
            <input
              ref={L}
              value={i}
              onChange={(e) => N(e.target.value)}
              disabled={w}
              aria-label="Ask the agent"
              placeholder="Ask about entities, cases, records, risk…"
              className="focus-ring min-w-0 flex-1 rounded border border-canvas-border bg-canvas px-2.5 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint disabled:opacity-60"
            />
            <button type="submit" disabled={w || !i.trim()} className={primaryButtonClass}>
              {w ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
              ) : (
                <CornerDownLeft className="h-3.5 w-3.5" aria-hidden={true} />
              )}
              Ask
            </button>
          </form>
        </section>
        <section
          aria-label="Cross-check"
          className="flex min-h-0 flex-col rounded border border-canvas-border bg-canvas-panel"
        >
          <div className="flex items-center gap-2 border-b border-canvas-border px-3 py-2">
            <ScanSearch className="h-3.5 w-3.5 text-ink-faint" aria-hidden={true} />
            <h2 className="text-[0.8125rem] font-medium text-ink">Cross-check</h2>
            <div role="tablist" aria-label="Cross-check mode" className="ml-auto flex gap-1">
              {["turn", "claim"].map((e) => (
                <button
                  role="tab"
                  aria-selected={V === e}
                  type="button"
                  onClick={() => X(e)}
                  className={cn(
                    "focus-ring rounded border px-2 py-0.5 text-[0.625rem] transition",
                    V === e
                      ? "border-accent/40 bg-accent/10 text-ink"
                      : "border-canvas-border text-ink-muted hover:bg-canvas-hover hover:text-ink",
                  )}
                  key={e}
                >
                  {e === "turn" ? "This answer" : "Check a claim"}
                </button>
              ))}
            </div>
          </div>
          {V === "turn" && Q && !Q.pending ? (
            <div className="truncate border-b border-canvas-border px-3 py-1.5 text-[0.6875rem] text-ink-faint">
              on: {Q.question}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {V === "claim" ? (
              <div className="space-y-2.5">
                <p className="text-[0.75rem] leading-relaxed text-ink-muted">
                  Point the panel at a specific claim. A citation that resolves to nothing comes
                  back as a fabrication — settled by arithmetic, with no model asked for an opinion.
                </p>
                <div>
                  <label
                    htmlFor="chat-claim"
                    className="block text-[0.6875rem] font-medium text-ink-muted"
                  >
                    Claim
                  </label>
                  <textarea
                    id="chat-claim"
                    value={q}
                    onChange={(e) => E(e.target.value)}
                    rows={2}
                    placeholder="A transfer of 480000 was made from HDFC61559407816 to KKBK91183842513 by IMPS."
                    className="focus-ring mt-1 w-full resize-y rounded border border-canvas-border bg-canvas px-2 py-1.5 text-[0.75rem] text-ink placeholder:text-ink-faint"
                  />
                </div>
                <div>
                  <label
                    htmlFor="chat-cited"
                    className="block text-[0.6875rem] font-medium text-ink-muted"
                  >
                    Cited records{" "}
                    <span className="font-normal text-ink-faint">
                      (rec_id or row hash — blank cites nothing)
                    </span>
                  </label>
                  <input
                    id="chat-cited"
                    value={H}
                    onChange={(e) => F(e.target.value)}
                    placeholder="TXN00086"
                    className="focus-ring mt-1 w-full rounded border border-canvas-border bg-canvas px-2 py-1.5 font-mono text-[0.75rem] text-ink placeholder:text-ink-faint"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={J}
                    disabled={P || !q.trim()}
                    className={primaryButtonClass}
                  >
                    {P ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
                    ) : (
                      <ScanSearch className="h-3.5 w-3.5" aria-hidden={true} />
                    )}
                    Check claim
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      E(
                        "A transfer of 480000 was made from HDFC61559407816 to KKBK91183842513 by IMPS.",
                      );
                      F("TXN00086");
                      K(null);
                    }}
                    className="focus-ring rounded border border-canvas-border px-2 py-1.5 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
                  >
                    Try a real claim
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      E("A transfer of 250000 was made to account HDFC0000000000.");
                      F("TXN-DOES-NOT-EXIST");
                      K(null);
                    }}
                    className="focus-ring rounded border border-canvas-border px-2 py-1.5 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
                  >
                    Try a fabrication
                  </button>
                </div>
                {I ? <VerificationReport result={I} defaultOpen={true} /> : null}
              </div>
            ) : Q ? (
              Q.pending ? (
                <div className="flex items-center gap-2 py-8 text-[0.8125rem] text-ink-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden={true} />
                  Resolving citations and consulting the panel…
                </div>
              ) : Q.error ? (
                <p className="py-8 text-[0.8125rem] text-risk">
                  The answer failed, so there was nothing to check.
                </p>
              ) : Q.verification ? (
                <div className="space-y-3">
                  <VerificationReport result={Q.verification} defaultOpen={true} />
                  <dl className="grid grid-cols-3 gap-2 rounded border border-canvas-border bg-canvas-raised p-2.5 text-center">
                    <div>
                      <dt className="text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                        Claims
                      </dt>
                      <dd className="mt-0.5 font-mono text-[0.9375rem] text-ink">
                        {Q.verification.claims.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                        Records
                      </dt>
                      <dd className="mt-0.5 font-mono text-[0.9375rem] text-ink">
                        {Q.verification.evidence_resolved}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                        Checks
                      </dt>
                      <dd className="mt-0.5 font-mono text-[0.9375rem] text-ink">
                        {Q.verification.independent_checks}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
                    Verdicts marked <em>verified</em> were settled by re-hashing the cited records —
                    arithmetic, not opinion. Only what a hash cannot settle is put to the judges,
                    and when they disagree the claim is shown as disputed rather than averaged into
                    a score.
                  </p>
                  <Link
                    href="/verification"
                    className="inline-block text-[0.6875rem] text-accent-bright hover:underline"
                  >
                    Test the verifier, and see how it scores itself →
                  </Link>
                </div>
              ) : (
                <p className="py-8 text-[0.8125rem] text-ink-muted">
                  This answer came back without a cross-check attached.
                </p>
              )
            ) : (
              <div className="space-y-2 py-8 text-center">
                <ScanSearch
                  className="mx-auto h-6 w-6 text-ink-faint/50"
                  strokeWidth={1.5}
                  aria-hidden={true}
                />
                <p className="text-[0.8125rem] text-ink-muted">Nothing to check yet.</p>
                <p className="mx-auto max-w-xs text-[0.75rem] leading-relaxed text-ink-faint">
                  Ask a question and this column will show what the panel found when it tried to
                  substantiate the answer — claim by claim.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
