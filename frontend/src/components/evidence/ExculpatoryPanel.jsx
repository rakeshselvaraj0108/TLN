"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleMinus, LoaderCircle, Scale } from "lucide-react";
import { getExculpatory } from "@/lib/api";
export function ExculpatoryPanel(e) {
  let { entityId: s } = e;
  let [t, o] = useState(null);
  let [m, x] = useState(null);
  useEffect(() => {
    getExculpatory(s)
      .then(o)
      .catch((e) => x(String(e)));
  }, [s]);
  if (m) {
    return (
      <div className="rounded border border-risk-border bg-risk-bg p-3 text-[0.8125rem] text-risk">
        {m}
      </div>
    );
  }
  if (!t) {
    return (
      <div className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Running exculpatory checks…
      </div>
    );
  }
  let h = t.original_risk_score - t.adjusted_risk_score;
  return (
    <section className="reasoning-surface--counter animate-rise-in rounded p-4 shadow-raised">
      <div className="mb-1 flex items-center gap-2">
        <Scale className="h-4 w-4 text-risk" />
        <h2 className="text-sm font-semibold text-ink">Exculpatory evidence</h2>
      </div>
      <p className="mb-3 text-[0.75rem] text-ink-muted">
        Does the same evidence also fit a legitimate explanation? Each reduction is the check's
        ceiling scaled by how closely this entity resembles the legitimate reference pattern, and by
        how much evidence supports the comparison — so a marginal match yields a marginal reduction.
        The total is capped, so this never zeroes out a score.
      </p>
      <div className="mb-3 flex items-center gap-4 rounded border border-canvas-border bg-canvas/60 p-2.5 text-[0.8125rem]">
        <span className="text-ink-muted">
          Original <span className="mono text-ink">{t.original_risk_score.toFixed(3)}</span>
        </span>
        <span className="text-ink-faint">→</span>
        <span className="text-ink-muted">
          Adjusted{" "}
          <span className="mono text-accent-bright">{t.adjusted_risk_score.toFixed(3)}</span>
        </span>
        {h > 0 ? (
          <span className="ml-auto text-[0.75rem] text-risk">
            −{(t.total_confidence_reduction * 100).toFixed(0)}% confidence
            {t.capped ? " (capped)" : ""}
          </span>
        ) : (
          <span className="ml-auto text-[0.75rem] text-ink-faint">no reduction</span>
        )}
      </div>
      <ul className="space-y-2.5">
        {t.findings.map((e) => (
          <li className="flex gap-2.5 text-[0.8125rem]" key={e.check}>
            {e.applies ? (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-risk" />
            ) : (
              <CircleMinus className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            )}
            <div className="min-w-0 flex-1">
              <div className="mono text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                {e.check}
                {e.applies ? (
                  <span className="ml-2 text-risk">
                    −{(e.confidence_reduction * 100).toFixed(1)}%
                  </span>
                ) : null}
              </div>
              <div className={e.applies ? "text-ink" : "text-ink-faint"}>{e.reason}</div>
              <div className="mono mt-1 text-[0.6875rem] text-ink-faint">
                {e.max_weight.toFixed(2)} ceiling × {e.fit.toFixed(2)} fit × {e.evidence.toFixed(2)}{" "}
                evidence ={" "}
                <span className={e.applies ? "text-risk" : ""}>
                  {e.confidence_reduction.toFixed(3)}
                </span>
              </div>
              {e.contributions.length > 0 ? (
                <details className="mt-1 text-[0.6875rem] text-ink-faint">
                  <summary className="cursor-pointer">
                    per-feature similarity to the legitimate reference
                  </summary>
                  <table className="mt-1 w-full">
                    <tbody>
                      {e.contributions.map((e) => (
                        <tr key={e.feature}>
                          <td className="mono pr-3">{e.feature}</td>
                          <td className="mono pr-3 text-ink-muted">
                            {e.value} vs {e.reference}
                          </td>
                          <td className="mono text-right">{(e.similarity * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-canvas-border pt-2 text-[0.75rem] text-ink-faint">
        {t.note}
      </p>
    </section>
  );
}
