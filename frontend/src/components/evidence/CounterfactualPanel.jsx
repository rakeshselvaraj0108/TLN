"use client";

import { useEffect, useState } from "react";
import { GitBranch, LoaderCircle } from "lucide-react";
import { getCounterfactual } from "@/lib/api";
export function CounterfactualPanel(e) {
  let { entityId: s } = e;
  let [t, c] = useState(null);
  let [d, o] = useState(null);
  useEffect(() => {
    getCounterfactual(s)
      .then(c)
      .catch((e) => o(String(e)));
  }, [s]);
  if (d) {
    return (
      <div className="rounded border border-risk-border bg-risk-bg p-3 text-[0.8125rem] text-risk">
        {d}
      </div>
    );
  } else if (t) {
    return (
      <section className="reasoning-surface animate-rise-in rounded p-4 shadow-raised">
        <div className="mb-1 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-accent-bright" />
          <h2 className="text-sm font-semibold text-ink">Counterfactual explanation</h2>
        </div>
        <p className="mb-3 text-[0.75rem] text-ink-muted">
          Why this entity was flagged, and what would have to be different for it not to be. Each
          boundary below is found by probing the live scorer with this entity's own feature vector —
          so it is specific to this entity, not a fixed threshold.
        </p>
        {t.counterfactuals.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-faint">
            Nothing to explain: this entity is below the flag threshold.
          </p>
        ) : (
          <ol className="stagger space-y-3">
            {t.counterfactuals.map((e) => (
              <li
                className={
                  e.driver === "combined"
                    ? "rounded border border-accent/30 bg-accent/5 p-2.5"
                    : "border-l border-canvas-border pl-3"
                }
                key={e.driver}
              >
                <div className="mono mb-0.5 flex items-center gap-2 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                  {e.driver === "combined" ? "all drivers together" : e.driver}
                  {e.flip_reachable && e.driver !== "combined" ? (
                    <span className="rounded bg-canvas-hover px-1 text-accent-bright">
                      flips at{" "}
                      {e.flip_value == null
                        ? "—"
                        : e.feature === "total_fanout_inbound_inr"
                          ? "₹" + Math.round(e.flip_value).toLocaleString("en-IN")
                          : e.feature === "max_passthrough_ratio" ||
                              e.feature === "counterparty_stability"
                            ? `${(e.flip_value * 100).toFixed(0)}%`
                            : String(e.flip_value)}
                    </span>
                  ) : null}
                </div>
                <div className="text-[0.8125rem] text-ink">{e.observed}.</div>
                <div
                  className={
                    "mt-0.5 text-[0.8125rem] " +
                    (e.flip_reachable ? "text-accent-bright" : "text-ink-faint")
                  }
                >
                  {e.boundary}
                </div>
              </li>
            ))}
          </ol>
        )}
        <details className="mt-3 text-[0.75rem] text-ink-faint">
          <summary className="cursor-pointer">How these numbers were derived</summary>
          <p className="mt-1 leading-relaxed">{t.method}</p>
          <p className="mt-1">
            Flag threshold: <span className="mono text-ink-muted">{t.flag_threshold}</span>. This
            entity scored <span className="mono text-ink-muted">{t.risk_score.toFixed(3)}</span>.
          </p>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="font-medium">feature</th>
                <th className="font-medium">observed</th>
                <th className="font-medium">flips at</th>
              </tr>
            </thead>
            <tbody>
              {t.counterfactuals
                .filter((e) => e.driver !== "combined")
                .map((e) => {
                  return (
                    <tr className="text-ink-muted" key={e.driver}>
                      <td className="mono">{e.feature}</td>
                      <td className="mono">{e.observed_value}</td>
                      <td className="mono">{e.flip_value ?? "unreachable"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </details>
      </section>
    );
  } else {
    return (
      <div className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Generating counterfactual…
      </div>
    );
  }
}
