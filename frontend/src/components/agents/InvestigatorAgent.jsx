"use client";

import { useEffect, useState } from "react";
import { Bot, LoaderCircle, Lock, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable, TableCell, TableRow } from "@/components/ui/DataTable";
import { ErrorAlert, primaryButtonClass } from "@/components/ui/primitives";
import { VerificationReport } from "@/components/verification/VerificationReport";
import { getAgenticStatus, runAgenticInvestigation } from "@/lib/api";
import { clearEntityIntelCache } from "@/lib/entity-cache";

const EXAMPLES = [
  { label: "Assess P0006", objective: "Is P0006 part of a mule network? Consider innocent explanations before concluding.", entity_id: "P0006" },
  { label: "Assess P0018", objective: "Is P0018 operating a SIM farm, and does any money movement back that up?", entity_id: "P0018" },
  { label: "Whole case", objective: "Which entities are highest risk, and is there a coordinated campaign?", entity_id: "" },
];

function ProviderBanner({ status }) {
  if (!status) return null;
  let sel = status.selection;
  let tone = status.active === "stub" ? "amber" : status.all_local ? "emerald" : "risk";
  let tones = {
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    risk: "border-risk-border bg-risk-bg text-risk",
  };
  let text =
    status.active === "stub"
      ? "No language model is configured, so this runs the same tool-use loop with the deterministic planner (degraded). Set LLM_PROVIDER=ollama for a local model, or LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY for Claude."
      : status.all_local
        ? `Local model: ${status.providers.find((p) => p.name === status.active)?.model}. Evidence stays on this machine.`
        : "Cloud model active: the evidence returned by tools is sent to the provider.";
  return (
    <div className={`rounded border px-3 py-2 text-[0.75rem] leading-relaxed ${tones[tone]}`}>
      <span className="font-medium">Provider: {status.active}.</span> {text}
      {sel?.reason ? <span className="text-ink-faint"> ({sel.reason})</span> : null}
    </div>
  );
}

export function InvestigatorAgent() {
  let [status, setStatus] = useState(null);
  let [objective, setObjective] = useState(EXAMPLES[0].objective);
  let [entity, setEntity] = useState(EXAMPLES[0].entity_id);
  let [busy, setBusy] = useState(false);
  let [out, setOut] = useState(null);
  let [error, setError] = useState(null);

  useEffect(() => {
    getAgenticStatus()
      .then(setStatus)
      .catch((e) => setError(String(e)));
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      setOut(await runAgenticInvestigation({ objective, entity_id: entity || null, max_steps: 8 }));
      clearEntityIntelCache();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent-bright" /> Autonomous investigator
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
          A tool-using agent: the model chooses which read-only investigation tools to call, reads the results, and writes an answer citing the records
          behind each claim. Every factual sentence is then re-checked against those records; a fabricated or altered citation sends the answer back
          for one repair. It cannot act on anything, and it cannot score — scores come from the trained model.
        </p>
        <ProviderBanner status={status} />
        {status ? (
          <details className="text-[0.75rem] text-ink-faint">
            <summary className="cursor-pointer select-none">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Guarantees and tools ({status.tools.length})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {status.guarantees.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
            <p className="mt-2 font-mono">{status.tools.map((t) => t.name).join(" · ")}</p>
          </details>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button
              key={x.label}
              type="button"
              onClick={() => {
                setObjective(x.objective);
                setEntity(x.entity_id);
              }}
              className="focus-ring rounded border border-canvas-border px-2 py-1 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
            >
              {x.label}
            </button>
          ))}
        </div>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={2}
          maxLength={500}
          aria-label="Investigation objective"
          className="focus-ring w-full rounded border border-canvas-border bg-canvas px-2.5 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint"
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={entity}
            onChange={(e) => setEntity(e.target.value.trim())}
            placeholder="entity (optional)"
            aria-label="Focus entity"
            className="focus-ring w-36 rounded border border-canvas-border bg-canvas px-2.5 py-1.5 font-mono text-[0.8125rem] text-ink placeholder:text-ink-faint"
          />
          <button type="button" onClick={run} disabled={busy || objective.trim().length < 5} className={primaryButtonClass}>
            {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {busy ? "Investigating…" : "Investigate"}
          </button>
        </div>
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}

        {out ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-muted">
              <span className="mono rounded border border-canvas-border px-1.5 py-0.5">
                {out.provider} · {out.model}
              </span>
              {out.degraded ? (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <TriangleAlert className="h-3.5 w-3.5" /> deterministic planner — no model reasoning
                </span>
              ) : null}
              {out.fallback ? <span className="text-risk">fell back from {out.fallback.from}: {out.fallback.reason}</span> : null}
              <span>{out.safety.tool_calls} tool calls</span>
              <span>{out.safety.repair_rounds} repair round(s)</span>
              <span>{out.elapsed_s}s</span>
              {out.usage.in + out.usage.out > 0 ? (
                <span>
                  {out.usage.in}→{out.usage.out} tokens
                </span>
              ) : null}
            </div>
            <section className="reasoning-surface rounded p-4">
              <h3 className="mb-1 text-sm font-semibold text-ink">Answer</h3>
              <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-ink">{out.answer}</p>
            </section>
            <VerificationReport result={out.verification} defaultOpen={true} />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.6875rem] text-ink-faint">
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> tools read-only: {String(out.safety.tools_read_only)}
              </span>
              <span>refused tool calls: {out.safety.refused_tool_calls}</span>
              <span>instruction-like strings redacted from evidence: {out.safety.injection_strings_redacted}</span>
              <span>
                ledger session <span className="mono">{out.session_key}</span> (see Reasoning state)
              </span>
            </div>
            <details>
              <summary className="cursor-pointer select-none text-[0.75rem] text-ink-muted">Step trace ({out.steps.length})</summary>
              <div className="mt-2">
                <DataTable head={["#", "Stage", "Action", "Outcome", "Detail"]}>
                  {out.steps.map((s) => (
                    <TableRow key={s.seq}>
                      <TableCell className="tabular-nums text-ink-faint">{s.seq}</TableCell>
                      <TableCell className="text-ink-muted">{s.stage}</TableCell>
                      <TableCell>
                        {s.action}
                        {s.tool_name ? <span className="ml-1.5 text-[0.6875rem] text-ink-faint">{s.tool_name}</span> : null}
                      </TableCell>
                      <TableCell className={s.outcome === "ok" ? "text-ink-muted" : "text-risk"}>{s.outcome}</TableCell>
                      <TableCell className="max-w-md truncate text-[0.75rem] text-ink-faint" title={s.result_digest}>
                        {s.result_digest}
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              </div>
            </details>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
