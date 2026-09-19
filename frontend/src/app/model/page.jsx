"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ColumnChart } from "@/components/charts/BarCharts";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import { TrainedModelPanel } from "@/components/model/TrainedModelPanel";
import { getModelMonitor } from "@/lib/api";
import { bandColor, bandLabel } from "@/lib/sources";
export default function ModelPage() {
  let [e, t] = useState(null);
  let [a, c] = useState(true);
  let [d, o] = useState(null);
  let h = useCallback(async () => {
    c(true);
    o(null);
    try {
      t(await getModelMonitor());
    } catch (e) {
      o(String(e));
      t(null);
    } finally {
      c(false);
    }
  }, []);
  useEffect(() => {
    h();
  }, [h]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Model monitor"
        description="What the classifier is, how the current scores are spread, and how well it separates the archetypes the seed data declares."
        actions={
          <button onClick={h} className={buttonClass}>
            <RefreshCw className={"h-3.5 w-3.5 " + (a ? "animate-spin" : "")} />
            Refresh
          </button>
        }
      />
      {d ? <ErrorAlert>{d}</ErrorAlert> : null}
      {a ? (
        <div className="space-y-3">
          <div className="skeleton h-32 rounded" />
          <div className="skeleton h-40 rounded" />
        </div>
      ) : e ? (
        <Fragment>
          <_Component separation={e.separation} />
          <_Component2 distribution={e.distribution} />
          <_Component3 model={e.model} />
          <TrainedModelPanel />
        </Fragment>
      ) : null}
    </div>
  );
}
function _Component(e) {
  var t;
  let { separation: n } = e;
  if (!n.available) {
    return <EmptyState title="Separation not measurable">{n.reason}</EmptyState>;
  }
  let { confusion: r } = n;
  return (
    <section className="reasoning-surface space-y-3 p-3">
      <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        Separation against declared labels
      </h2>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <_Component4 label="AUC" value={n.auc.toFixed(3)} note="rank quality, threshold-free" />
        <_Component4
          label="Recall"
          value={n.recall.toFixed(3)}
          note={`at threshold ${n.threshold}`}
        />
        <_Component4
          label="Precision"
          value={((t = n.precision) === null || t === undefined ? undefined : t.toFixed(3)) ?? "—"}
          note={`at threshold ${n.threshold}`}
        />
        <_Component4
          label="Matched"
          value={String(n.matched_entities)}
          note={`${n.unmatched_entities} unlabelled`}
        />
      </div>
      <div className="grid max-w-md grid-cols-2 gap-px overflow-hidden rounded border border-canvas-border bg-canvas-border">
        <_Component5 label="True positive" n={r.true_positive} />
        <_Component5 label="False negative" n={r.false_negative} />
        <_Component5 label="False positive" n={r.false_positive} />
        <_Component5 label="True negative" n={r.true_negative} />
      </div>
      <p className="text-[0.75rem] leading-relaxed text-ink-muted">{n.caveat}</p>
      <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
        Positive labels: <span className="mono">{n.positive_labels.join(", ")}</span>. The
        red-herring and bystander archetypes are deliberately <em>not</em> positives — a working
        model is supposed to leave them low, and counting them as hits would invert the test they
        exist for.
      </p>
    </section>
  );
}
function _Component2(e) {
  var t;
  var a;
  var n;
  let { distribution: p } = e;
  if (p.scored_entities === 0) {
    return (
      <EmptyState title="Nothing scored yet">
        Run an analysis pass from the risk queue to populate the distribution.
      </EmptyState>
    );
  } else {
    return (
      <section className="space-y-3 rounded border border-canvas-border bg-canvas-panel/50 p-3">
        <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
          Live score distribution
        </h2>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <_Component4 label="Scored" value={String(p.scored_entities)} />
          <_Component4
            label="Mean"
            value={((t = p.mean) === null || t === undefined ? undefined : t.toFixed(3)) ?? "—"}
          />
          <_Component4
            label="Min"
            value={((a = p.min) === null || a === undefined ? undefined : a.toFixed(3)) ?? "—"}
          />
          <_Component4
            label="Max"
            value={((n = p.max) === null || n === undefined ? undefined : n.toFixed(3)) ?? "—"}
          />
          <_Component4 label="High band" value={String(p.by_band.high ?? 0)} />
          <_Component4 label="Elevated" value={String(p.by_band.elevated ?? 0)} />
          <_Component4 label="Low" value={String(p.by_band.low ?? 0)} />
        </div>
        <ColumnChart
          title="Score distribution"
          caption="How many people fall in each tenth of the scale. Colour marks which review band a bucket belongs to."
          xLabel="assessed priority"
          height={160}
          data={p.histogram.map((e) => {
            let t = (e.from + e.to) / 2;
            let a = t >= 0.66 ? "high" : t >= 0.33 ? "elevated" : "low";
            return {
              label: e.from.toFixed(1),
              value: e.count,
              color: bandColor(a),
              detail: `${bandLabel(a)} · scores ${e.from.toFixed(1)}–${e.to.toFixed(1)}`,
            };
          })}
          valueFormat={(e) => `${e} ${e === 1 ? "entity" : "entities"}`}
        />
        <p className="text-[0.6875rem] text-ink-faint">
          Buckets are fixed at tenths, not scaled to the data, so two runs' histograms are directly
          comparable. Scorers in use:{" "}
          {Object.entries(p.models_used)
            .map((e) => {
              let [t, a] = e;
              return `${t} (${a})`;
            })
            .join(", ")}
          .
        </p>
      </section>
    );
  }
}
function _Component3(e) {
  let { model: t } = e;
  return (
    <section className="space-y-3 rounded border border-canvas-border bg-canvas-panel/50 p-3">
      <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">Model card</h2>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        <_Component6 label="Name" value={t.name} />
        <_Component6 label="Family" value={t.family} />
        <_Component6 label="Fallback" value={t.fallback} />
        <_Component6 label="Explainability" value={t.explainability} />
        <_Component6 label="Features" value={`${t.feature_count} named features`} />
        <_Component6 label="Archetypes" value={t.archetypes.join(", ")} />
      </dl>
      <div>
        <p className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">Training data</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-muted">{t.training_data}</p>
      </div>
      <div className="reasoning-surface--counter p-3">
        <p className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
          What this score is for
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-muted">{t.decision_role}</p>
      </div>
      <details className="text-[0.75rem]">
        <summary className="focus-ring cursor-pointer text-ink-faint hover:text-ink-muted">
          Feature vector ({t.feature_count})
        </summary>
        <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map((e) => (
            <li className="mono text-[0.6875rem] text-ink-faint" key={e}>
              {e}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
function _Component4(e) {
  let { label: t, value: a, note: n } = e;
  return (
    <div className="flex flex-col">
      <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">{t}</span>
      <span className="mono text-lg tabular-nums text-ink">{a}</span>
      {n ? <span className="text-[0.625rem] text-ink-faint">{n}</span> : null}
    </div>
  );
}
function _Component5(e) {
  let { label: t, n: a } = e;
  return (
    <div className="bg-canvas-panel px-3 py-2">
      <p className="text-[0.625rem] uppercase tracking-wider text-ink-faint">{t}</p>
      <p className="mono text-base tabular-nums text-ink">{a}</p>
    </div>
  );
}
function _Component6(e) {
  let { label: t, value: a } = e;
  return (
    <div>
      <dt className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">{t}</dt>
      <dd className="text-[0.8125rem] text-ink-muted">{a}</dd>
    </div>
  );
}
