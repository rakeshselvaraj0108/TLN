"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  CircleCheck,
  CircleMinus,
  CircleSlash,
  Download,
  FilePenLine,
  LoaderCircle,
  RefreshCw,
  ShieldQuestion,
  TriangleAlert,
} from "lucide-react";
import * as primitives from "@/components/ui/primitives";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import {
  attestControl,
  complianceReportUrl,
  getAttestations,
  getComplianceControls,
  getComplianceProgram,
  getMe,
} from "@/lib/api";
import { cn } from "@/lib/utils";
let d = CircleSlash;
let _Component3 = FilePenLine;
let g = {
  gap: {
    label: "Gap",
    icon: TriangleAlert,
    text: "text-risk",
    chip: "border-risk-border bg-risk-bg text-risk",
    blurb: "Checked, and the property does not hold.",
  },
  partial: {
    label: "Partial",
    icon: CircleMinus,
    text: "text-accent-bright",
    chip: "border-accent/40 bg-accent/10 text-accent-bright",
    blurb: "Holds in part, or holds with a caveat that matters.",
  },
  manual: {
    label: "Unclaimed",
    icon: ShieldQuestion,
    text: "text-ink-muted",
    chip: "border-canvas-border bg-canvas-hover text-ink-muted",
    blurb: "No technical check applies. Nobody has evidenced it, so it scores zero.",
  },
  not_applicable: {
    label: "Out of scope",
    icon: d,
    text: "text-ink-faint",
    chip: "border-canvas-border bg-canvas-panel text-ink-faint",
    blurb: "Excluded, with a stated reason. Not counted either way.",
  },
  satisfied: {
    label: "Verified",
    icon: CircleCheck,
    text: "text-[color:var(--ok)]",
    chip: "border-[color:var(--ok)]/35 bg-[color:var(--ok)]/10 text-[color:var(--ok)]",
    blurb: "A verifier inspected the running system and the property holds.",
  },
};
let k = ["all", "gap", "partial", "manual", "satisfied", "not_applicable"];
let j = {
  platform: "Platform",
  agency: "Agency",
  shared: "Shared",
};
function _Component2(e) {
  let { status: t } = e;
  let n = g[t];
  let _Component = n.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-[0.6875rem] font-medium",
        n.chip,
      )}
    >
      <_Component className="h-3 w-3" strokeWidth={2} aria-hidden={true} />
      {n.label}
    </span>
  );
}
function N(e) {
  let { value: t } = e;
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-canvas-hover"
      role="img"
      aria-label={`${t} percent`}
    >
      <div
        className="h-full rounded-full bg-accent-bright/70 transition-[width] duration-500"
        style={{
          width: `${Math.max(0, Math.min(100, t))}%`,
        }}
      />
    </div>
  );
}
function _Component4(e) {
  let { control: t, me: n, onAttested: r } = e;
  let [i, l] = useState(false);
  let [c, d] = useState("");
  let [o, h] = useState(false);
  let [p, k] = useState(null);
  let [N, w] = useState(null);
  let Z = g[t.status];
  let C = t.status === "manual" || t.status === "partial" || t.status === "gap";
  let S = async () => {
    h(true);
    w(null);
    k(null);
    try {
      let e = await attestControl(t.id, c.trim());
      k(e.effect);
      d("");
      r();
    } catch (e) {
      w(String(e));
    } finally {
      h(false);
    }
  };
  return (
    <div className="border-b border-canvas-border last:border-b-0">
      <button
        type="button"
        onClick={() => l((e) => !e)}
        aria-expanded={i}
        className="focus-ring flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-canvas-hover"
      >
        <ChevronRight
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform",
            i && "rotate-90",
          )}
          aria-hidden={true}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.6875rem] text-ink-faint">{t.id}</span>
            <span className="text-[0.8125rem] font-medium text-ink">{t.name}</span>
            <span className="rounded border border-canvas-border px-1.5 py-px text-[0.625rem] text-ink-faint">
              {j[t.owner]}
            </span>
          </div>
          <p className={cn("mt-1 text-[0.75rem] leading-relaxed", Z.text)}>{t.detail}</p>
        </div>
        <_Component2 status={t.status} />
      </button>
      {i ? (
        <div className="animate-fade-in space-y-3 border-t border-canvas-border bg-canvas-panel/40 px-3 py-3 pl-9">
          <p className="text-[0.75rem] leading-relaxed text-ink-muted">{t.description}</p>
          {t.observations.length ? (
            <div>
              <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Evidence gathered
              </div>
              <ul className="space-y-1">
                {t.observations.map((e, t) => (
                  <li className="flex gap-2 text-[0.75rem] leading-relaxed text-ink-muted" key={t}>
                    <span
                      aria-hidden={true}
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint/60"
                    />
                    <span className="min-w-0">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {C && (n == null ? undefined : n.role) === "supervisor" ? (
            <div className="rounded border border-canvas-border bg-canvas-raised p-2.5">
              <label
                htmlFor={`attest-${t.id}`}
                className="block text-[0.6875rem] font-medium text-ink-muted"
              >
                Record an attestation
              </label>
              <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-faint">
                This is logged against your name. It does <strong>not</strong> change the status —
                the verifier keeps reporting what it measures.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id={`attest-${t.id}`}
                  value={c}
                  onChange={(e) => d(e.target.value)}
                  placeholder="What evidences this? e.g. 'ISP v3.1 signed by the SIO on 2026-08-01'"
                  className="focus-ring min-w-0 flex-1 rounded border border-canvas-border bg-canvas px-2 py-1.5 text-[0.75rem] text-ink placeholder:text-ink-faint"
                />
                <button
                  type="button"
                  onClick={S}
                  disabled={o || c.trim().length < 8}
                  className={buttonClass}
                >
                  {o ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
                  ) : (
                    <_Component3 className="h-3.5 w-3.5" aria-hidden={true} />
                  )}
                  Attest
                </button>
              </div>
              {p ? (
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">{p}</p>
              ) : null}
              {N ? (
                <p role="alert" className="mt-2 text-[0.6875rem] text-risk">
                  {N}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
export default function CompliancePage() {
  let [t, n] = useState(null);
  let [i, l] = useState([]);
  let [c, d] = useState([]);
  let [m, u] = useState(null);
  let [j, y] = useState(true);
  let [Z, C] = useState(null);
  let [S, M] = useState("all");
  let [T, _] = useState("all");
  let A = useCallback(async () => {
    y(true);
    C(null);
    try {
      let [e, t] = await Promise.all([getComplianceProgram(), getComplianceControls()]);
      n(e);
      l(t.controls);
      getAttestations()
        .then((e) => d(e.attestations))
        .catch(() => d([]));
    } catch (e) {
      C(String(e));
      n(null);
      l([]);
    } finally {
      y(false);
    }
  }, []);
  useEffect(() => {
    A();
  }, [A]);
  useEffect(() => {
    let e = () =>
      getMe()
        .then(u)
        .catch(() => u(null));
    e();
    window.addEventListener("tracex:user-changed", e);
    return () => window.removeEventListener("tracex:user-changed", e);
  }, []);
  let E = useMemo(
    () => i.filter((e) => (S === "all" || e.domain === S) && (T === "all" || e.status === T)),
    [i, S, T],
  );
  let L = (t == null ? undefined : t.domains) ?? [];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Compliance programme"
        description="Every control below is evaluated against this running deployment when the page loads. Nothing here is a stored tick — a control is green only when a check inspected the system and found the property holding, and one nobody can evidence is shown as unclaimed rather than passing."
        actions={
          <Fragment>
            <button onClick={A} disabled={j} className={buttonClass}>
              {j ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden={true} />
              )}
              Re-assess
            </button>
            {(m == null ? undefined : m.role) === "supervisor" ? (
              <a href={complianceReportUrl()} className={primaryButtonClass}>
                <Download className="h-3.5 w-3.5" aria-hidden={true} />
                Export report
              </a>
            ) : null}
          </Fragment>
        }
      />
      {Z ? <ErrorAlert>{Z}</ErrorAlert> : null}
      {j && !t ? (
        <div className="flex items-center gap-2 py-10 text-[0.8125rem] text-ink-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden={true} />
          Assessing controls against the live system…
        </div>
      ) : null}
      {t ? (
        <Fragment>
          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="rounded border border-canvas-border bg-canvas-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                    Evidenced readiness
                  </div>
                  <div className="mt-1 font-serif text-3xl text-ink">{t.readiness}%</div>
                </div>
                <div className="text-right text-[0.6875rem] leading-relaxed text-ink-faint">
                  {t.scored_controls} scored
                  <br />
                  {t.total_controls} total
                </div>
              </div>
              <div className="mt-3">
                <N value={t.readiness} />
              </div>
              <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-faint">{t.how_scored}</p>
            </div>
            <div className="rounded border border-canvas-border bg-canvas-panel p-4">
              <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Posture
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {Object.keys(g).map((e) => {
                  return (
                    <div className="flex items-baseline justify-between gap-2" key={e}>
                      <dt className="flex min-w-0 items-center gap-1.5 text-[0.75rem] text-ink-muted">
                        <span
                          aria-hidden={true}
                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", {
                            "bg-risk": e === "gap",
                            "bg-accent-bright": e === "partial",
                            "bg-ink-faint": e === "manual" || e === "not_applicable",
                            "bg-[color:var(--ok)]": e === "satisfied",
                          })}
                        />
                        <span className="truncate">{g[e].label}</span>
                      </dt>
                      <dd className="font-mono text-[0.8125rem] text-ink">{t.counts[e] ?? 0}</dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-3 border-t border-canvas-border pt-2.5 text-[0.6875rem] leading-relaxed text-ink-faint">
                {t.attestation}
              </p>
            </div>
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-canvas-border bg-canvas-panel/60 p-3">
              <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                In scope
              </div>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-muted">{t.scope}</p>
            </div>
            <div className="rounded border border-canvas-border bg-canvas-panel/60 p-3">
              <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Out of scope
              </div>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-muted">{t.out_of_scope}</p>
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-[0.8125rem] font-semibold text-ink">
              Open findings
              <span className="ml-2 font-normal text-ink-faint">{t.open_findings.length}</span>
            </h2>
            {t.open_findings.length ? (
              <div className="divide-y divide-canvas-border rounded border border-risk-border/60 bg-risk-bg/30">
                {t.open_findings.map((e) => (
                  <div className="flex items-start gap-3 px-3 py-2.5" key={e.id}>
                    <TriangleAlert
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk"
                      strokeWidth={2}
                      aria-hidden={true}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[0.6875rem] text-ink-faint">{e.id}</span>
                        <span className="text-[0.8125rem] font-medium text-ink">{e.name}</span>
                      </div>
                      <p className="mt-0.5 text-[0.75rem] leading-relaxed text-risk">{e.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No gaps found" icon={CircleCheck}>
                Every control that could be checked is holding. Unclaimed organizational controls
                are listed below and still need attestation.
              </EmptyState>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-[0.8125rem] font-semibold text-ink">By domain</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {L.map((e) => {
                return (
                  <button
                    type="button"
                    onClick={() => {
                      M(e.domain);
                      _("all");
                    }}
                    className={cn(
                      "focus-ring rounded border p-3 text-left transition hover:bg-canvas-hover",
                      S === e.domain
                        ? "border-accent/40 bg-accent/[0.06]"
                        : "border-canvas-border bg-canvas-panel",
                    )}
                    key={e.domain}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[0.75rem] font-medium text-ink">{e.domain}</span>
                      <span className="shrink-0 font-mono text-[0.6875rem] text-ink-faint">
                        {e.readiness === null ? "n/a" : `${e.readiness}%`}
                      </span>
                    </div>
                    <div className="mt-2">
                      <N value={e.readiness ?? 0} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.625rem] text-ink-faint">
                      <span>{e.total} controls</span>
                      {e.counts.gap ? <span className="text-risk">{e.counts.gap} gap</span> : null}
                      {e.counts.manual ? <span>{e.counts.manual} unclaimed</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[0.8125rem] font-semibold text-ink">
                Security controls<span className="ml-2 font-normal text-ink-faint">{E.length}</span>
              </h2>
              {S !== "all" ? (
                <button
                  type="button"
                  onClick={() => M("all")}
                  className="focus-ring rounded px-2 py-1 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
                >
                  Clear domain filter ({S})
                </button>
              ) : null}
            </div>
            <div
              role="tablist"
              aria-label="Filter controls by status"
              className="mb-2 flex flex-wrap gap-1"
            >
              {k.map((e) => {
                let s = T === e;
                let r = e === "all" ? i.length : (t.counts[e] ?? 0);
                return (
                  <button
                    role="tab"
                    aria-selected={s}
                    type="button"
                    onClick={() => _(e)}
                    title={e === "all" ? undefined : g[e].blurb}
                    className={cn(
                      "focus-ring rounded border px-2 py-1 text-[0.6875rem] transition",
                      s
                        ? "border-accent/40 bg-accent/10 text-ink"
                        : "border-canvas-border text-ink-muted hover:bg-canvas-hover hover:text-ink",
                    )}
                    key={e}
                  >
                    {e === "all" ? "All" : g[e].label}
                    <span className="ml-1.5 font-mono text-ink-faint">{r}</span>
                  </button>
                );
              })}
            </div>
            <div className="rounded border border-canvas-border bg-canvas-panel">
              {E.length ? (
                E.map((e) => <_Component4 control={e} me={m} onAttested={A} key={e.id} />)
              ) : (
                <div className="px-3 py-8">
                  <EmptyState title="No controls match this filter">
                    Clear the status or domain filter to see the rest of the catalogue.
                  </EmptyState>
                </div>
              )}
            </div>
          </section>
          {c.length ? (
            <section>
              <h2 className="mb-2 text-[0.8125rem] font-semibold text-ink">
                Attestations<span className="ml-2 font-normal text-ink-faint">{c.length}</span>
              </h2>
              <p className="mb-2 max-w-2xl text-[0.6875rem] leading-relaxed text-ink-faint">
                A supervisor putting their name to a claim the platform cannot measure. Recorded in
                the audit log; it never changes a control’s status.
              </p>
              <div className="divide-y divide-canvas-border rounded border border-canvas-border bg-canvas-panel">
                {c.map((e, t) => (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2" key={t}>
                    <span className="font-mono text-[0.6875rem] text-ink-faint">
                      {e.control_id}
                    </span>
                    <span className="text-[0.75rem] text-ink-muted">{e.note}</span>
                    <span className="ml-auto shrink-0 text-[0.6875rem] text-ink-faint">
                      {e.by}
                      {e.at ? ` · ${new Date(e.at).toLocaleString()}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </Fragment>
      ) : null}
    </div>
  );
}
