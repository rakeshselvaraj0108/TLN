"use client";

import { useEffect, useState } from "react";
import { Cpu, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable, TableCell, TableRow } from "@/components/ui/DataTable";
import { ErrorAlert } from "@/components/ui/primitives";
import { getMlModel, getMlShadow } from "@/lib/api";
import { cn } from "@/lib/utils";

const f3 = (v) => (typeof v === "number" ? v.toFixed(3) : "—");

function Stat({ label, value, hint }) {
  return (
    <div>
      <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="text-[0.6875rem] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export function TrainedModelPanel() {
  let [model, setModel] = useState(null);
  let [shadow, setShadow] = useState(null);
  let [error, setError] = useState(null);

  useEffect(() => {
    getMlModel()
      .then(setModel)
      .catch((e) => setError(String(e)));
    getMlShadow()
      .then(setShadow)
      .catch(() => setShadow(null));
  }, []);

  if (error) return <ErrorAlert>{error}</ErrorAlert>;
  if (!model) return <div className="skeleton h-40 rounded" />;
  if (!model.card) {
    return (
      <Card>
        <CardBody className="text-[0.8125rem] text-ink-muted">
          <TriangleAlert className="mr-1.5 inline h-4 w-4 text-risk" />
          The trained model is unavailable ({model.status.reason}). Scores are coming from the rule-based fallback. Run{" "}
          <span className="mono">python -m tracex_api.ml.train</span> to regenerate it.
        </CardBody>
      </Card>
    );
  }
  let c = model.card;
  let t = c.test;
  let ext = c.external_validation;
  let live = ext.trained_on_live_features;
  let base = c.baselines;
  let rows = [
    ["Trained XGBoost", t],
    ["Logistic regression", base.logistic_regression],
    ["Hand-written rule scorer", base.hand_written_rule_scorer],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Cpu className="h-4 w-4 text-accent-bright" strokeWidth={2} />
          Trained model — this repository
          <span className="rounded border border-canvas-border px-1.5 py-0.5 font-mono text-[0.6875rem] font-normal text-ink-muted">
            scorer mode: {model.scorer_mode}
          </span>
          <span className="font-mono text-[0.6875rem] font-normal text-ink-faint">sha256 {model.status.artifact_sha256}…</span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
          {c.algorithm}. Trained on {c.data.n_train.toLocaleString()} synthetic entities drawn from a hand-authored archetype sampler (v
          {c.data.sampler_version}); tuned by 5-fold cross-validation; calibrated on a separate {c.data.n_validation.toLocaleString()};
          evaluated once on {c.data.n_test.toLocaleString()} untouched entities. Every number below was measured by the training run —{" "}
          <span className="mono">python -m tracex_api.ml.train</span> regenerates it.
        </p>

        <div>
          <h4 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">Held-out synthetic test split</h4>
          <DataTable head={["Model", "ROC-AUC", "PR-AUC", "Precision@0.33", "Recall@0.33", "Brier"]}>
            {rows.map(([name, m], i) => (
              <TableRow key={name}>
                <TableCell className={cn(i === 0 && "font-medium text-ink")}>{name}</TableCell>
                <TableCell className="font-mono tabular-nums">{f3(m.roc_auc)}</TableCell>
                <TableCell className="font-mono tabular-nums">{f3(m.pr_auc)}</TableCell>
                <TableCell className="font-mono tabular-nums">{f3(m["precision@0.33"])}</TableCell>
                <TableCell className="font-mono tabular-nums">{f3(m["recall@0.33"])}</TableCell>
                <TableCell className="font-mono tabular-nums">{f3(m.brier)}</TableCell>
              </TableRow>
            ))}
          </DataTable>
          <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
            Calibration error (ECE) {t.expected_calibration_error}. This split shares the sampler's assumptions, so it is optimistic by construction.
          </p>
        </div>

        <div>
          <h4 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
            The seeded case ({ext.n_graded} graded entities, victims excluded)
          </h4>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Trained — live features" value={live ? f3(live.roc_auc) : "—"} hint={live ? `recall ${f3(live["recall@0.33"])} · precision ${f3(live["precision@0.33"])}` : "not computed"} />
            <Stat label="Trained — captured vectors" value={f3(ext.trained_on_captured_vectors.roc_auc)} hint={`recall ${f3(ext.trained_on_captured_vectors["recall@0.33"])}`} />
            <Stat label="Recorded original model" value={f3(ext.recorded_original.roc_auc)} hint={`recall ${f3(ext.recorded_original["recall@0.33"])}`} />
            <Stat label="Feature skew" value={ext.feature_skew ? `${ext.feature_skew.entities_with_different_features}/${ext.feature_skew.of}` : "—"} hint={ext.feature_skew ? `mean |Δscore| ${ext.feature_skew.mean_abs_score_change}` : ""} />
          </div>
        </div>

        {shadow ? (
          <div>
            <h4 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
              Live shadow scoring — trained model vs the scorer in force
            </h4>
            <div className="max-h-72 overflow-y-auto">
              <DataTable head={["Entity", "Role", "In force", "Model", "Trained", "Bands agree"]}>
                {shadow.entities.map((e) => (
                  <TableRow key={e.entity_id}>
                    <TableCell className="font-mono">{e.entity_id}</TableCell>
                    <TableCell className="text-ink-muted">{e.role}</TableCell>
                    <TableCell className="font-mono tabular-nums">{f3(e.active_score)}</TableCell>
                    <TableCell className="text-ink-faint">{e.active_model}</TableCell>
                    <TableCell className="font-mono tabular-nums">{f3(e.trained_score)}</TableCell>
                    <TableCell className={e.bands_agree ? "text-ink-muted" : "text-amber-400"}>{e.bands_agree ? "yes" : "differs"}</TableCell>
                  </TableRow>
                ))}
              </DataTable>
            </div>
            <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
              {shadow.agreement.bands_agree} of {shadow.agreement.of} entities land in the same band under both scorers. {shadow.note}
            </p>
          </div>
        ) : null}

        <div>
          <h4 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">What drives it (mean |TreeSHAP|)</h4>
          <ul className="space-y-1">
            {c.feature_importance.slice(0, 6).map((f) => (
              <li key={f.feature} className="flex items-center gap-2 text-[0.75rem]">
                <span className="w-52 shrink-0 truncate font-mono text-ink-muted">{f.feature}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded bg-canvas-hover">
                  <span className="block h-full rounded bg-accent-bright" style={{ width: `${Math.min(100, (f.mean_abs_shap / c.feature_importance[0].mean_abs_shap) * 100)}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right font-mono tabular-nums text-ink-faint">{f.mean_abs_shap.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-amber-500/25 bg-amber-500/5 p-3">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[0.75rem] font-semibold text-amber-400">
            <TriangleAlert className="h-3.5 w-3.5" /> Known limitations (from the model card)
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-[0.75rem] leading-relaxed text-ink-muted">
            {c.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
