"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bot, CircleCheck, CircleX, LoaderCircle, Play } from "lucide-react";
import { InvestigatorAgent } from "@/components/agents/InvestigatorAgent";
import { ErrorAlert, PageHeader } from "@/components/ui/primitives";
import { getAgentPipelineInfo, runAgentPipeline } from "@/lib/api";
import { clearEntityIntelCache } from "@/lib/entity-cache";
export default function AgentsPage() {
  let [t, n] = useState(null);
  let [x, p] = useState(null);
  let [f, b] = useState(false);
  let [v, g] = useState(null);
  useEffect(() => {
    getAgentPipelineInfo()
      .then(n)
      .catch((e) => g(String(e)));
  }, []);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Agent pipeline"
        description="An eight-stage pipeline — planner, investigator, correlator, analyst, critic, verifier, responder, auditor. Each stage calls the deterministic services directly. If a language model is configured it writes the run-report prose only, and the report is rejected if it contains a figure that is not in the facts — never a score or a decision."
      />
      {v ? <ErrorAlert>{v}</ErrorAlert> : null}
      {t ? (
        <div className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
          <div className="flex flex-wrap items-stretch gap-2">
            {t.agents.map((e, n) => (
              <div className="flex items-center gap-2" key={e.name}>
                <div className="rounded border border-canvas-border bg-canvas-raised px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink">
                    <Bot className="h-3.5 w-3.5 text-accent-bright" />
                    {e.name}
                  </div>
                  <div className="mt-0.5 text-[0.6875rem] text-ink-faint">{e.calls}</div>
                </div>
                {n < t.agents.length - 1 ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-canvas-border pt-2 text-[0.75rem] text-ink-faint">
            {t.note}
          </p>
        </div>
      ) : null}
      <button
        disabled={f}
        onClick={async () => {
          b(true);
          g(null);
          p(null);
          try {
            p(await runAgentPipeline(true));
            clearEntityIntelCache();
          } catch (e) {
            g(String(e));
          } finally {
            b(false);
          }
        }}
        className="flex items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3.5 py-2 text-[0.8125rem] text-accent-bright hover:bg-accent/20 disabled:opacity-50"
      >
        {f ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run
        pipeline
      </button>
      {x ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-[0.8125rem]">
            {x.ok ? (
              <span className="flex items-center gap-1.5 text-ok">
                <CircleCheck className="h-4 w-4" /> completed
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-risk">
                <CircleX className="h-4 w-4" /> failed
              </span>
            )}
            <span className="text-ink-muted">
              engine <span className="mono">{x.engine}</span>
            </span>
            <span className="text-ink-muted">{x.elapsed_s}s</span>
          </div>
          {x.error ? <ErrorAlert>{x.error}</ErrorAlert> : null}
          <div className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
            <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
              Agent log
            </h3>
            <ol className="space-y-1.5">
              {x.log.map((e, t) => (
                <li className="flex gap-2.5 text-[0.8125rem]" key={t}>
                  <span className="mono w-24 shrink-0 text-accent-bright">{e.agent}</span>
                  <span className="text-ink-muted">{e.msg}</span>
                </li>
              ))}
            </ol>
          </div>
          {x.report?.headline ? (
            <section className="reasoning-surface rounded p-4">
              <h3 className="mb-1 text-sm font-semibold text-ink">Run report</h3>
              <p className="mb-2 text-[0.8125rem] text-ink">{x.report.headline}</p>
              <p className="text-[0.8125rem] text-ink-muted">{x.report.narrative}</p>
              <div className="mt-3 flex items-center justify-between border-t border-canvas-border pt-2 text-[0.6875rem] text-ink-faint">
                <span>LLM provider: {x.report.llm_provider} (prose only)</span>
              </div>
              <p className="mt-1 text-[0.75rem] text-risk">{x.report.disclaimer}</p>
            </section>
          ) : null}
        </div>
      ) : null}
      <InvestigatorAgent />
    </div>
  );
}
