"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  Dna,
  Gauge,
  LoaderCircle,
  Play,
  ShieldQuestion,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ErrorAlert, buttonClass, primaryButtonClass } from "@/components/ui/primitives";
import {
  RECORDS_PAGE_SIZE,
  decideResponse,
  getMe,
  simulateResponse,
  startResponseInvestigation,
} from "@/lib/api";
import { cn } from "@/lib/utils";
let k = {
  low: "border-canvas-border text-ink-muted",
  medium: "bg-accent/15 text-accent-bright",
  high: "bg-risk-bg text-risk border border-risk-border",
  critical: "bg-risk-bg text-risk border border-risk-border",
};
let N = {
  normal: "Normal",
  suspicious: "Suspicious",
  high_velocity: "High velocity",
  coordinated: "Coordinated",
};
let w = {
  observe: "text-ink-muted",
  hypothesize: "text-accent-bright",
  investigate: "text-accent-bright",
  correlate: "text-accent-bright",
  score: "text-ink",
  decide: "text-ink-muted",
  propose: "text-risk",
};
function y(e) {
  return `${Math.round(e * 100)}%`;
}
export function ResponseAgentPanel(e) {
  let { entityId: s, onDecided: c } = e;
  let [d, o] = useState(null);
  let [x, m] = useState(false);
  let [h, u] = useState(null);
  let [p, b] = useState(null);
  async function f() {
    m(true);
    u(null);
    try {
      o(await startResponseInvestigation(s));
    } catch (e) {
      u(String(e));
    } finally {
      m(false);
    }
  }
  useEffect(() => {
    let e = true;
    let t = () => {
      getMe()
        .then((t) => e && b(t))
        .catch(() => e && b(null));
    };
    t();
    window.addEventListener("tracex:user-changed", t);
    return () => {
      e = false;
      window.removeEventListener("tracex:user-changed", t);
    };
  }, []);
  return (
    <section className="space-y-3 rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent-bright" />
          <h2 className="text-sm font-semibold text-ink">Agentic fraud response</h2>
          {d ? <Badge className={k[d.tier] ?? k.low}>{d.tier}</Badge> : null}
        </div>
        <button onClick={f} disabled={x} className={primaryButtonClass}>
          {x ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {x ? "Investigating…" : d ? "Re-investigate" : "Investigate with agent"}
        </button>
      </header>
      {d || x || h ? null : (
        <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
          The agent collects what evidence it can reach, weighs competing explanations, measures how
          fast the risk is moving, and proposes the safest next action. It decides nothing on its
          own — every recommendation ends with your signature.
        </p>
      )}
      {h ? <ErrorAlert>{h}</ErrorAlert> : null}
      {x && !d ? (
        <div className="space-y-1.5" aria-busy={true}>
          {[0, 1, 2, 3].map((e) => (
            <div className="skeleton h-8 rounded" key={e} />
          ))}
        </div>
      ) : null}
      {d ? (
        <div className="animate-fade-in space-y-4">
          <S inv={d} />
          <Z inv={d} />
          {d.campaign_match ? <A inv={d} /> : null}
          <E inv={d} onDecided={c} isSupervisor={!!(p == null ? undefined : p.is_supervisor)} />
          <I inv={d} />
          <T inv={d} />
        </div>
      ) : null}
    </section>
  );
}
function S(e) {
  let { inv: t } = e;
  return (
    <div className="rounded border border-canvas-border bg-canvas-raised p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.8125rem] font-medium text-ink">{t.hypothesis_label}</span>
        <span className="mono text-[0.6875rem] text-ink-faint">
          {y(t.confidence)} confidence · {t.elapsed_ms}ms · {t.sources_used.length} sources
        </span>
      </div>
      {t.hypothesis_ranking.length > 1 ? (
        <div className="mt-2 space-y-1">
          {t.hypothesis_ranking.slice(0, 3).map((e, t) => (
            <div className="flex items-center gap-2" key={e.hypothesis}>
              <span
                className={cn(
                  "w-40 shrink-0 truncate text-[0.6875rem]",
                  t === 0 ? "text-ink" : "text-ink-faint",
                )}
              >
                {e.label}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded bg-canvas-hover">
                <div
                  className={cn("h-full rounded", t === 0 ? "bg-risk" : "bg-ink-faint/40")}
                  style={{
                    width: `${Math.max(2, e.confidence * 100)}%`,
                  }}
                />
              </div>
              <span className="mono w-9 shrink-0 text-right text-[0.6875rem] text-ink-faint">
                {y(e.confidence)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {t.reused_memory ? (
        <p className="mt-2 text-[0.6875rem] text-ink-faint">
          Reused prior intelligence on this entity — only new signals were investigated.
        </p>
      ) : null}
    </div>
  );
}
function Z(e) {
  let { inv: s } = e;
  let a = s.trajectory;
  let i = s.velocity;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <C
        icon={Gauge}
        label="Risk"
        value={s.risk_score.toFixed(0)}
        sub={
          s.prior_score != null
            ? `was ${s.prior_score.toFixed(0)} · tier ${s.tier}`
            : `tier ${s.tier}`
        }
      />
      <C
        icon={TrendingUp}
        label="Acceleration"
        value={a ? a.band : "—"}
        sub={a ? a.reason : "no trend yet"}
        alert={
          (a == null ? undefined : a.band) === "high" ||
          (a == null ? undefined : a.band) === "critical"
        }
      />
      <C
        icon={Activity}
        label="Velocity"
        value={i ? (N[i.band] ?? i.band) : "—"}
        sub={
          i
            ? `${i.peak_per_minute}/min peak · baseline ${i.baseline_per_minute}/min`
            : "no call events"
        }
        alert={!!i && (i.band !== "normal" || !!i.deviates_from_baseline)}
      />
    </div>
  );
}
function C(e) {
  let { icon: _Component, label: s, value: a, sub: i, alert: r } = e;
  return (
    <div className="rounded border border-canvas-border bg-canvas-raised p-2.5">
      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        <_Component className={cn("h-3 w-3", r ? "text-risk" : "")} />
        {s}
      </div>
      <div className={cn("mt-0.5 text-sm font-medium", r ? "text-risk" : "text-ink")}>{a}</div>
      <div className="mt-0.5 text-[0.6875rem] leading-snug text-ink-faint">{i}</div>
    </div>
  );
}
function A(e) {
  let { inv: t } = e;
  let s = t.campaign_match;
  return (
    <div className="rounded border border-risk-border bg-risk-bg p-3">
      <div className="flex items-center gap-2">
        <Dna className="h-4 w-4 text-risk" />
        <span className="text-[0.8125rem] font-medium text-risk">
          Behavioural match to campaign {s.campaign_id}
        </span>
        <span className="mono ml-auto text-[0.6875rem] text-risk">{y(s.similarity)} similar</span>
      </div>
      <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
        Matched on behaviour, not on the identifier — which is why a number that has never been
        reported can still be placed in a known campaign.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.shared_traits.map((e) => (
          <span
            className="mono rounded border border-risk-border/60 px-1.5 py-0.5 text-[0.625rem] text-ink-muted"
            key={e.trait}
          >
            {e.trait.replace(/_/g, " ")} {e.this_entity.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}
let R = {
  reversible: "bg-ok/20 text-ok",
  partially_reversible: "bg-accent/15 text-accent-bright",
  irreversible: "bg-risk-bg text-risk border border-risk-border",
};
function E(e) {
  let { inv: t, onDecided: s, isSupervisor: i } = e;
  let [r, l] = useState({});
  if (t.proposals.length === 0) {
    return (
      <p className="text-[0.8125rem] text-ink-muted">
        No action recommended — the evidence does not support one.
      </p>
    );
  } else {
    return (
      <div className="space-y-2">
        <h3 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
          Recommended actions — ranked by expected benefit against risk carried
        </h3>
        {t.proposals.map((e, a) => (
          <_Component2
            rank={a + 1}
            proposal={e}
            investigationId={t.investigation_id}
            isSupervisor={i}
            verdict={r[e.action]}
            onDecided={(t) => {
              l((s) => ({
                ...s,
                [e.action]: t,
              }));
              if (s != null) {
                s();
              }
            }}
            key={e.action}
          />
        ))}
      </div>
    );
  }
}
function _Component2(e) {
  let { rank: t, proposal: s, investigationId: i, isSupervisor: l, verdict: c, onDecided: d } = e;
  let [o, x] = useState(t === 1);
  let [b, k] = useState(null);
  let [N, w] = useState(null);
  let [_, S] = useState("");
  let [Z, C] = useState(null);
  let A = i != null && !c;
  let E = _.trim().length;
  let q = E < RECORDS_PAGE_SIZE;
  let I = s.approval === "supervisor" && !l;
  let T = I
    ? "Approving this action requires the supervisor role. You can still reject it."
    : E === 0
      ? `Record why. A rationale of at least ${RECORDS_PAGE_SIZE} characters is required for approval and for rejection.`
      : q
        ? `${RECORDS_PAGE_SIZE - E} more character${RECORDS_PAGE_SIZE - E == 1 ? "" : "s"} — a decision needs a reason a reviewer can read.`
        : null;
  async function W() {
    if (i != null) {
      w("simulate");
      C(null);
      try {
        k(await simulateResponse(i, s.action));
      } catch (e) {
        C(String(e));
      } finally {
        w(null);
      }
    }
  }
  async function M(e) {
    if (i != null) {
      w(e);
      C(null);
      try {
        await decideResponse(i, s.action, e, _.trim());
        d(e);
      } catch (e) {
        C(String(e));
      } finally {
        w(null);
      }
    }
  }
  return (
    <div className="rounded border border-canvas-border bg-canvas-raised">
      <button
        type="button"
        onClick={() => x((e) => !e)}
        aria-expanded={o}
        className="focus-ring flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-canvas-hover"
      >
        <span className="mono w-4 shrink-0 text-[0.6875rem] text-ink-faint">{t}</span>
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{s.title}</span>
        <Badge className={R[s.reversibility]}>{s.reversibility.replace(/_/g, " ")}</Badge>
        <span className="mono shrink-0 text-[0.6875rem] text-ink-faint">{y(s.confidence)}</span>
        {c ? <Badge variant={c === "approved" ? "ok" : "neutral"}>{c}</Badge> : null}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform",
            o && "rotate-180",
          )}
        />
      </button>
      {o ? (
        <div className="space-y-2.5 border-t border-canvas-border px-3 py-2.5">
          <dl className="grid gap-2 text-[0.75rem] sm:grid-cols-2">
            <F label="Expected benefit">{s.expected_benefit}</F>
            <F label="Potential downside">{s.downside}</F>
            <F label="Why this rank">{s.rank_reason}</F>
            <F label="Approval required">
              {s.approval === "auto" ? "none — observation only" : s.approval}
              {s.affected_entities.length
                ? ` · ${s.affected_entities.length} entities affected`
                : ""}
            </F>
          </dl>
          {s.evidence.length ? (
            <div>
              <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                Supporting evidence
              </span>
              <ul className="mt-1 space-y-0.5">
                {s.evidence.map((e, t) => (
                  <li className="text-[0.75rem] leading-snug text-ink-muted" key={t}>
                    · {e}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {b ? (
            <div className="rounded border border-accent/30 bg-accent/5 p-2.5 text-[0.75rem]">
              <div className="font-medium text-accent-bright">Simulation — nothing applied</div>
              <div className="mt-1 text-ink-muted">
                Would affect {b.would_affect} entities ·{" "}
                {b.reversible ? "reversible" : "not reversible"} · projected risk reduction{" "}
                {b.projected_risk_reduction}
              </div>
              <ul className="mt-1 space-y-0.5 text-ink-faint">
                {b.caveats.map((e, t) => (
                  <li key={t}>· {e}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {Z ? <ErrorAlert>{Z}</ErrorAlert> : null}
          {A ? (
            <div className="space-y-2">
              <textarea
                value={_}
                onChange={(e) => S(e.target.value)}
                rows={2}
                placeholder="Why this decision — recorded against your name, and read by whoever reviews it…"
                aria-describedby={T ? `${s.action}-block` : undefined}
                className={
                  "focus-ring w-full rounded border bg-canvas px-2 py-1.5 text-[0.75rem] text-ink transition placeholder:text-ink-faint " +
                  (q && E > 0 ? "border-accent/50" : "border-canvas-border")
                }
              />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={W} disabled={N !== null} className={buttonClass} type="button">
                  {N === "simulate" ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldQuestion className="h-3.5 w-3.5" />
                  )}
                  Simulate
                </button>
                <button
                  onClick={() => M("approved")}
                  disabled={N !== null || q || I}
                  className={primaryButtonClass}
                  type="button"
                  title={T ?? undefined}
                >
                  {N === "approved" ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => M("rejected")}
                  disabled={N !== null || q}
                  className={buttonClass}
                  type="button"
                >
                  {N === "rejected" ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Reject
                </button>
                {T ? (
                  <span id={`${s.action}-block`} className="text-[0.6875rem] text-ink-faint">
                    {T}
                  </span>
                ) : (
                  <span className="text-[0.6875rem] text-[color:var(--ok)]">
                    Ready to record — this decision is signed with your name.
                  </span>
                )}
              </div>
            </div>
          ) : c ? (
            <p className="text-[0.75rem] text-ink-faint">
              Recorded as <span className="text-ink">{c}</span>. The agent will not propose this
              action for this entity again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
function F(e) {
  let { label: t, children: s } = e;
  return (
    <div>
      <dt className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">{t}</dt>
      <dd className="mt-0.5 leading-snug text-ink-muted">{s}</dd>
    </div>
  );
}
function I(e) {
  let { inv: t } = e;
  let [s, i] = useState(false);
  if (t.findings.length === 0) {
    return null;
  } else {
    return (
      <W open={s} onToggle={() => i((e) => !e)} title={`Evidence collected (${t.findings.length})`}>
        <ul className="space-y-1.5">
          {t.findings.map((e, t) => (
            <li className="flex items-start gap-2 text-[0.75rem]" key={t}>
              <span className="mono shrink-0 text-ink-faint">{e.source}</span>
              <span className="min-w-0 flex-1 text-ink-muted">{e.summary}</span>
              {e.provenance === "mock" ? (
                <Badge
                  variant="neutral"
                  title="Stand-in for an external feed this deployment is not connected to"
                >
                  mock
                </Badge>
              ) : null}
              <span className="mono shrink-0 text-ink-faint">{e.weight.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        {t.sources_skipped.length ? (
          <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] text-ink-faint">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {t.sources_skipped.length} source(s) were unreachable; the assessment ran on what
            remained.
          </p>
        ) : null}
      </W>
    );
  }
}
function T(e) {
  let { inv: t } = e;
  let [s, i] = useState(false);
  return (
    <W open={s} onToggle={() => i((e) => !e)} title={`Agent activity (${t.steps.length} steps)`}>
      <ol className="space-y-1">
        {t.steps.map((e, t) => {
          return (
            <li className="flex items-start gap-2 text-[0.75rem]" key={t}>
              <span className="mono shrink-0 text-ink-faint">{e.ts.slice(11, 23)}</span>
              <span
                className={cn(
                  "mono w-[4.5rem] shrink-0 text-[0.625rem] uppercase",
                  w[e.phase] ?? "text-ink-faint",
                )}
              >
                {e.phase}
              </span>
              <span className="min-w-0 flex-1 leading-snug text-ink-muted">{e.message}</span>
            </li>
          );
        })}
      </ol>
    </W>
  );
}
function W(e) {
  let { open: t, onToggle: s, title: a, children: i } = e;
  return (
    <div className="rounded border border-canvas-border bg-canvas-raised">
      <button
        type="button"
        onClick={s}
        aria-expanded={t}
        className="focus-ring flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-canvas-hover"
      >
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">{a}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-ink-faint transition-transform", t && "rotate-180")}
        />
      </button>
      {t ? <div className="border-t border-canvas-border p-3">{i}</div> : null}
    </div>
  );
}
