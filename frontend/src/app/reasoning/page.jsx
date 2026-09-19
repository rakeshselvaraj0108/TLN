"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Brain,
  CircleDot,
  CircleHelp,
  CircleX,
  Eye,
  GitBranch,
  Lightbulb,
  Link2,
  Scale,
  ShieldQuestion,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import {
  getReasoningClaims,
  getReasoningSession,
  getReasoningSessions,
  getReasoningTrace,
} from "@/lib/api";
import { cn } from "@/lib/utils";
let c = Lightbulb;
let _Component2 = CircleDot;
let _Component4 = Link2;
let k = {
  observed: {
    label: "Observed",
    icon: Eye,
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    rule: "border-l-emerald-500/60",
    blurb: "Read directly from an ingested record. Carries a hash-chain reference.",
  },
  inferred: {
    label: "Inferred",
    icon: GitBranch,
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    rule: "border-l-sky-500/60",
    blurb: "Derived by deterministic code from observations. Not itself observed.",
  },
  hypothesis: {
    label: "Hypothesis",
    icon: c,
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    rule: "border-l-amber-500/60",
    blurb: "A proposed explanation under test. Explicitly not a finding.",
  },
  conclusion: {
    label: "Conclusion",
    icon: Scale,
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    rule: "border-l-violet-500/60",
    blurb: "Tested and cited. Never more confident than the evidence beneath it.",
  },
};
function _Component3(e) {
  let { kind: t } = e;
  let n = k[t];
  let _Component = n.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6875rem] font-medium",
        n.chip,
      )}
      title={n.blurb}
    >
      <_Component className="h-3 w-3" strokeWidth={2} aria-hidden={true} />
      {n.label}
    </span>
  );
}
function N(e) {
  let { value: t } = e;
  let n = Math.round(t * 100);
  return (
    <span className="inline-flex items-center gap-1.5" title={`confidence ${n} of 100`}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-canvas-border" aria-hidden={true}>
        <span
          className="block h-full rounded-full bg-accent-bright"
          style={{
            width: `${n}%`,
          }}
        />
      </span>
      <span className="tabular-nums text-[0.75rem] text-ink-muted">{n}%</span>
    </span>
  );
}
export default function ReasoningPage() {
  let [e, t] = useState(null);
  let [n, a] = useState(null);
  let [i, l] = useState(null);
  let [c, o] = useState([]);
  let [w, Z] = useState([]);
  let [M, _] = useState(null);
  let [A, L] = useState(false);
  useEffect(() => {
    getReasoningSessions()
      .then((e) => {
        t(e);
        if (e.length && !n) {
          a(e[0].session_key);
        }
      })
      .catch((e) => _(e.message));
  }, []);
  let T = useCallback(async (e) => {
    L(true);
    _(null);
    try {
      let [t, n, s] = await Promise.all([
        getReasoningSession(e),
        getReasoningClaims(e),
        getReasoningTrace(e),
      ]);
      l(t);
      o(n);
      Z(s);
    } catch (e) {
      _(e instanceof Error ? e.message : String(e));
      l(null);
    } finally {
      L(false);
    }
  }, []);
  useEffect(() => {
    if (n) {
      T(n);
    }
  }, [n, T]);
  let q = i == null ? undefined : i.efficiency;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Reasoning state"
        description={
          <Fragment>
            What the agent knows, how it knows it, and what it still does not know. State persists
            between requests — a later question resumes this investigation instead of restarting
            one.
          </Fragment>
        }
        actions={
          e && e.length > 0 ? (
            <label className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
              <span className="sr-only">Investigation session</span>
              <select
                className="focus-ring rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
                value={n ?? ""}
                onChange={(e) => a(e.target.value)}
              >
                {e.map((e) => (
                  <option value={e.session_key} key={e.session_key}>
                    {e.session_key} — {e.objective.slice(0, 48)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={buttonClass}
                onClick={() => n && void T(n)}
                disabled={A}
              >
                Refresh
              </button>
            </label>
          ) : null
        }
      />
      {M ? <ErrorAlert>{M}</ErrorAlert> : null}
      {e !== null && e.length === 0 ? (
        <EmptyState title="No investigation sessions yet" icon={Brain}>
          A session is opened when the agent starts reasoning about an entity. Until then there is
          no state to show — which is the honest answer, not an empty dashboard.
        </EmptyState>
      ) : null}
      {i ? (
        <Fragment>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">
                  Objective
                </p>
                <p className="mt-0.5 text-[0.875rem] text-ink">{i.objective}</p>
              </div>
              <div className="flex items-center gap-4 text-[0.75rem] text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <_Component2 className="h-3.5 w-3.5 text-accent-bright" strokeWidth={2} />
                  {i.status}
                </span>
                <span className="tabular-nums">{i.action_count} actions</span>
              </div>
            </CardBody>
          </Card>
          {q ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Actions",
                  value: q.actions,
                  hint: "steps taken in this session",
                },
                {
                  label: "Failed",
                  value: q.failed_actions,
                  hint: "errors and timeouts, recorded not dropped",
                },
                {
                  label: "Redundant",
                  value: q.redundant_actions,
                  hint: "actions that repeated known information",
                },
                {
                  label: "Gain / action",
                  value: q.gain_per_action.toFixed(2),
                  hint: "measured information gain per action",
                },
              ].map((e) => (
                <Card key={e.label}>
                  <CardBody>
                    <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">
                      {e.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{e.value}</p>
                    <p className="mt-0.5 text-[0.6875rem] leading-snug text-ink-faint">{e.hint}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Hypotheses under test</CardTitle>
              </CardHeader>
              <CardBody>
                {i.open_hypotheses.length === 0 ? (
                  <p className="text-[0.8125rem] text-ink-faint">No open hypotheses.</p>
                ) : (
                  <ul className="space-y-2">
                    {i.open_hypotheses.map((e) => (
                      <li
                        className={cn(
                          "rounded border border-canvas-border border-l-2 bg-canvas-panel/40 p-2.5",
                          k.hypothesis.rule,
                        )}
                        key={e.id}
                      >
                        <p className="text-[0.8125rem] text-ink">{e.statement}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[0.75rem]">
                          <N value={e.confidence} />
                          <span className="text-emerald-400">+{e.support} for</span>
                          <span className="text-amber-400">−{e.contradiction} against</span>
                          <span className="text-ink-faint">{e.status}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleX className="h-4 w-4 text-amber-400" strokeWidth={2} />
                  Contradicting evidence
                </CardTitle>
              </CardHeader>
              <CardBody>
                {i.contradictions.length === 0 ? (
                  <p className="text-[0.8125rem] text-ink-faint">
                    No contradictions recorded. That is not the same as none existing — it means
                    none has been found and logged yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {i.contradictions.map((e, t) => (
                      <li
                        className="rounded border border-amber-500/25 bg-amber-500/5 p-2.5"
                        key={t}
                      >
                        <p className="text-[0.8125rem] text-ink">{e.statement}</p>
                        {e.rationale ? (
                          <p className="mt-1 text-[0.75rem] text-ink-faint">{e.rationale}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleHelp className="h-4 w-4 text-ink-muted" strokeWidth={2} />
                  Open questions
                </CardTitle>
              </CardHeader>
              <CardBody>
                {i.pending.length === 0 && i.unresolved.length === 0 ? (
                  <p className="text-[0.8125rem] text-ink-faint">Nothing outstanding.</p>
                ) : (
                  <ul className="space-y-1.5 text-[0.8125rem] text-ink-muted">
                    {[...i.pending, ...i.unresolved].map((e, t) => (
                      <li className="flex gap-2" key={t}>
                        <span className="text-ink-faint">·</span>
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldQuestion className="h-4 w-4 text-ink-muted" strokeWidth={2} />
                  Approaches already tried
                </CardTitle>
              </CardHeader>
              <CardBody>
                {i.failed.length === 0 ? (
                  <p className="text-[0.8125rem] text-ink-faint">No dead ends recorded yet.</p>
                ) : (
                  <Fragment>
                    <ul className="space-y-1.5 text-[0.8125rem] text-ink-muted">
                      {i.failed.map((e, t) => (
                        <li className="flex gap-2" key={t}>
                          <span className="text-ink-faint">·</span>
                          {e}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[0.6875rem] leading-snug text-ink-faint">
                      Carried forward so the next request does not spend actions rediscovering the
                      same dead end.
                    </p>
                  </Fragment>
                )}
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Evidence ledger</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-[0.75rem] leading-relaxed text-ink-faint">
                Every claim declares what kind of thing it is. An observation carries a hash-chain
                reference back to the ingested row; an inference does not, and is never presented as
                though it did.
              </p>
              {A ? (
                <TableSkeleton cols={5} rows={4} />
              ) : c.length === 0 ? (
                <EmptyState title="No claims recorded in this session" icon={Brain} />
              ) : (
                <DataTable head={["Class", "Statement", "Source", "Provenance", "Confidence"]}>
                  {c.map((e) => (
                    <TableRow className={cn(e.retracted && "opacity-50")} key={e.id}>
                      <TableCell>
                        <_Component3 kind={e.epistemic_class} />
                      </TableCell>
                      <TableCell>
                        <span className={cn(e.retracted && "line-through")}>{e.statement}</span>
                        {e.verified === "contradicted" ? (
                          <span className="ml-2 text-[0.6875rem] text-amber-400">contradicted</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-ink-muted">{e.source_kind}</TableCell>
                      <TableCell>
                        {e.row_sha256 ? (
                          <span
                            className="inline-flex items-center gap-1 font-mono text-[0.6875rem] text-ink-muted"
                            title={`row ${e.row_sha256}`}
                          >
                            <_Component4 className="h-3 w-3" strokeWidth={2} aria-hidden={true} />
                            {e.row_sha256.slice(0, 10)}…
                          </span>
                        ) : (
                          <span className="text-[0.6875rem] text-ink-faint">
                            derived — no source row
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <N value={e.confidence} />
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Step trace</CardTitle>
            </CardHeader>
            <CardBody>
              {w.length === 0 ? (
                <p className="text-[0.8125rem] text-ink-faint">
                  No steps recorded for this session yet.
                </p>
              ) : (
                <DataTable head={["#", "Stage", "Action", "Outcome", "Gain", "Latency"]}>
                  {w.map((e) => (
                    <TableRow key={e.seq}>
                      <TableCell className="tabular-nums text-ink-faint">{e.seq}</TableCell>
                      <TableCell className="text-ink-muted">{e.stage}</TableCell>
                      <TableCell>
                        {e.action}
                        {e.tool_name ? (
                          <span className="ml-1.5 text-[0.6875rem] text-ink-faint">
                            via {e.tool_name}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-[0.75rem]",
                            e.outcome === "ok"
                              ? "text-ink-muted"
                              : e.outcome === "empty"
                                ? "text-ink-faint"
                                : "text-risk",
                          )}
                        >
                          {e.outcome}
                        </span>
                        {e.error ? (
                          <span className="ml-1.5 text-[0.6875rem] text-risk/80">{e.error}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums text-ink-muted">
                        {e.info_gain.toFixed(2)}
                        {e.redundant ? (
                          <span className="ml-1.5 text-[0.6875rem] text-amber-400">redundant</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums text-ink-faint">
                        {e.latency_ms} ms
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              )}
            </CardBody>
          </Card>
        </Fragment>
      ) : null}
    </div>
  );
}
