"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Activity, CircleCheck, CircleX, Gauge, Target, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import { runBenchmark } from "@/lib/api";
import { cn } from "@/lib/utils";
let _Component2 = Target;
function p(e, t) {
  let { good: n, warn: r } = t;
  if (e >= n) {
    return "good";
  } else if (e >= r) {
    return "warn";
  } else {
    return "crit";
  }
}
let b = {
  good: "text-emerald-400",
  warn: "text-amber-400",
  crit: "text-risk",
};
function _Component(e) {
  let { label: t, value: n, caption: a, toneKey: s } = e;
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">{t}</span>
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums leading-none",
            s ? b[s] : "text-ink",
          )}
        >
          {n}
        </span>
        <span className="text-[0.6875rem] leading-snug text-ink-faint">{a}</span>
      </CardBody>
    </Card>
  );
}
export default function BenchmarkPage() {
  let [t, n] = useState(null);
  let [b, j] = useState(null);
  let [v, y] = useState(true);
  let k = useCallback(async () => {
    y(true);
    j(null);
    try {
      n(await runBenchmark());
    } catch (e) {
      j(e instanceof Error ? e.message : String(e));
      n(null);
    } finally {
      y(false);
    }
  }, []);
  useEffect(() => {
    k();
  }, [k]);
  let N = t == null ? undefined : t.detection.confusion_matrix;
  let w = t == null ? undefined : t.detection.red_herrings;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Benchmark"
        description={
          <Fragment>
            Measured by running the production scorer against labels it has never seen. Ground truth
            comes from the data generator, which knows the answers because it constructed the
            scenario. No target is displayed anywhere on this page.
          </Fragment>
        }
        actions={
          <button type="button" className={buttonClass} onClick={() => void k()} disabled={v}>
            {v ? "Running…" : "Re-run"}
          </button>
        }
      />
      {b ? <ErrorAlert>{b}</ErrorAlert> : null}
      {v && !t ? <TableSkeleton cols={6} rows={5} /> : null}
      {t ? (
        <Fragment>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">Run</p>
                <p className="mt-0.5 font-mono text-[0.8125rem] text-ink">{t.run_id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[0.75rem] text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-accent-bright" strokeWidth={2} />
                  scorer: <span className="font-mono text-ink">{t.scorer}</span>
                </span>
                {Object.entries(t.seed_counts).map((e) => {
                  let [t, n] = e;
                  return (
                    <span className="tabular-nums" key={t}>
                      {n} {t}
                    </span>
                  );
                })}
              </div>
            </CardBody>
          </Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <_Component
              label="Precision"
              value={N ? N.precision.toFixed(3) : "—"}
              caption="of flagged entities, share that were fraud"
              toneKey={
                N
                  ? p(N.precision, {
                      good: 0.7,
                      warn: 0.5,
                    })
                  : undefined
              }
            />
            <_Component
              label="Recall"
              value={N ? N.recall.toFixed(3) : "—"}
              caption="of real fraud, share that was caught"
              toneKey={
                N
                  ? p(N.recall, {
                      good: 0.7,
                      warn: 0.5,
                    })
                  : undefined
              }
            />
            <_Component
              label="F1"
              value={N ? N.f1.toFixed(3) : "—"}
              caption="harmonic mean"
              toneKey={
                N
                  ? p(N.f1, {
                      good: 0.7,
                      warn: 0.5,
                    })
                  : undefined
              }
            />
            <_Component
              label="Decoy FP rate"
              value={w ? w.false_positive_rate.toFixed(3) : "—"}
              caption={w ? `${w.flagged} of ${w.total} planted decoys flagged` : ""}
              toneKey={
                w
                  ? p(1 - w.false_positive_rate, {
                      good: 0.8,
                      warn: 0.6,
                    })
                  : undefined
              }
            />
            <_Component
              label="Patterns"
              value={`${t.patterns.correct}/${t.patterns.total}`}
              caption="exact match on generator figures"
              toneKey={p(t.patterns.accuracy, {
                good: 0.85,
                warn: 0.6,
              })}
            />
            <_Component
              label="Bands"
              value={t.banding.accuracy.toFixed(3)}
              caption={`${t.banding.correct}/${t.banding.total} exact 3-way`}
              toneKey={p(t.banding.accuracy, {
                good: 0.7,
                warn: 0.4,
              })}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Detection</CardTitle>
              </CardHeader>
              <CardBody className="flex flex-wrap items-start gap-6">
                {N ? (
                  <div className="grid grid-cols-[auto_repeat(2,72px)] font-mono text-[0.75rem]">
                    <div />
                    <div className="pb-1.5 text-center text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                      pred fraud
                    </div>
                    <div className="pb-1.5 text-center text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                      pred clean
                    </div>
                    <div className="flex items-center justify-end pr-2.5 text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                      is fraud
                    </div>
                    <div className="border border-canvas-border bg-emerald-500/10 py-2.5 text-center text-lg font-semibold text-emerald-400">
                      {N.true_positive}
                    </div>
                    <div className="border border-canvas-border bg-risk-bg py-2.5 text-center text-lg font-semibold text-risk">
                      {N.false_negative}
                    </div>
                    <div className="flex items-center justify-end pr-2.5 text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                      is clean
                    </div>
                    <div className="border border-canvas-border bg-risk-bg py-2.5 text-center text-lg font-semibold text-risk">
                      {N.false_positive}
                    </div>
                    <div className="border border-canvas-border bg-emerald-500/10 py-2.5 text-center text-lg font-semibold text-emerald-400">
                      {N.true_negative}
                    </div>
                  </div>
                ) : null}
                <p className="min-w-[16rem] flex-1 text-[0.75rem] leading-relaxed text-ink-faint">
                  Victims are graded on a separate axis and never counted as fraud. A system that
                  scored well by flagging the person who lost the money would be measuring the wrong
                  thing.
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-ink-muted" strokeWidth={2} />
                  Action efficiency
                </CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-2 text-[0.8125rem]">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Actions</span>
                  <span className="font-mono tabular-nums text-ink">{t.efficiency.actions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Per entity</span>
                  <span className="font-mono tabular-nums text-ink">
                    {t.efficiency.actions_per_entity ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Declared baseline</span>
                  <span className="font-mono tabular-nums text-amber-400">
                    {t.efficiency.baseline_actions_per_entity}
                  </span>
                </div>
                <p className="mt-1 text-[0.6875rem] leading-snug text-ink-faint">
                  {t.efficiency.baseline_source}
                </p>
              </CardBody>
            </Card>
          </div>
          {t.hallucination ? (
            <Card>
              <CardHeader>
                <CardTitle>Hallucination control — verifier self-evaluation</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <_Component
                    label="Accuracy"
                    value={`${t.hallucination.correct}/${t.hallucination.total}`}
                    caption="hand-labelled adversarial cases"
                    toneKey={p(t.hallucination.accuracy, {
                      good: 0.9,
                      warn: 0.7,
                    })}
                  />
                  <_Component
                    label="Fabrication recall"
                    value={t.hallucination.fabrication_recall.toFixed(3)}
                    caption="claims citing records that never existed"
                    toneKey={p(t.hallucination.fabrication_recall, {
                      good: 0.9,
                      warn: 0.7,
                    })}
                  />
                  <_Component
                    label="Honest refusal"
                    value={t.hallucination.honest_refusal_respected ? "respected" : "PUNISHED"}
                    caption="a refusal must not be scored as a failure"
                    toneKey={t.hallucination.honest_refusal_respected ? "good" : "crit"}
                  />
                  <_Component
                    label="Sample size"
                    value={`n=${t.hallucination.total}`}
                    caption="a perfect score here is a floor, not a headline"
                  />
                </div>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <_Component2 className="h-4 w-4 text-ink-muted" strokeWidth={2} />
                Pattern extraction
              </CardTitle>
            </CardHeader>
            <CardBody>
              <DataTable head={["Figure", "Measured", "Ground truth", "Result"]}>
                {t.patterns.checks.map((e) => (
                  <TableRow key={e.field}>
                    <TableCell className="font-mono text-[0.75rem] text-ink-muted">
                      {e.field}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">{String(e.observed)}</TableCell>
                    <TableCell className="font-mono tabular-nums text-ink-muted">
                      {String(e.expected)}
                    </TableCell>
                    <TableCell>
                      {e.correct ? (
                        <span className="inline-flex items-center gap-1 text-[0.75rem] text-emerald-400">
                          <CircleCheck className="h-3.5 w-3.5" strokeWidth={2} />
                          exact
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[0.75rem] text-amber-400">
                          <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
                          {e.detail}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </DataTable>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Per-entity</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-[0.75rem] text-ink-faint">
                Score ranks a review queue; it is never a verdict. Rows marked RH are planted decoys
                — entities built to look like fraud and be innocent.
              </p>
              {t.detection.entities.length === 0 ? (
                <EmptyState title="No entities graded" icon={CircleX} />
              ) : (
                <DataTable head={["Entity", "Role", "Truth", "Score", "Band", "Result"]}>
                  {t.detection.entities.map((e) => (
                    <TableRow key={e.entity_id}>
                      <TableCell className="font-mono font-medium">
                        {e.entity_id}
                        {e.is_red_herring ? (
                          <span className="ml-1.5 text-[0.625rem] text-amber-400">RH</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-ink-muted">{e.role}</TableCell>
                      <TableCell className="text-ink-muted">{e.truth_label}</TableCell>
                      <TableCell className="font-mono tabular-nums">{e.score.toFixed(3)}</TableCell>
                      <TableCell className="text-ink-muted">{e.predicted_band}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-[0.75rem]",
                            e.correct ? "text-emerald-400" : "text-risk",
                          )}
                        >
                          {e.note || (e.correct ? "correct" : "incorrect")}
                        </span>
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
