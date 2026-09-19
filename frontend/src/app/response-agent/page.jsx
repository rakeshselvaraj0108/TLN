"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Dna, History, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { ResponseAgentPanel } from "@/components/response/ResponseAgentPanel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import {
  getQueue,
  getResponseCampaigns,
  getResponseInvestigations,
  getResponseStats,
} from "@/lib/api";
import { cn } from "@/lib/utils";
let o = History;
let v = {
  low: "border-canvas-border text-ink-muted",
  medium: "bg-accent/15 text-accent-bright",
  high: "bg-risk-bg text-risk border border-risk-border",
  critical: "bg-risk-bg text-risk border border-risk-border",
};
export default function ResponseAgentPage() {
  let [e, t] = useState(null);
  let [n, g] = useState("");
  let [y, b] = useState(null);
  let [j, w] = useState([]);
  let [N, Z] = useState([]);
  let [M, _] = useState(null);
  let [T, C] = useState(false);
  let A = useCallback(async () => {
    C(true);
    try {
      let [e, r, i, a] = await Promise.all([
        getQueue(),
        getResponseStats(),
        getResponseInvestigations(),
        getResponseCampaigns(),
      ]);
      t(e.items);
      b(r);
      w(i.items);
      Z(a.items);
      if (!n && e.items.length) {
        g(e.items[0].entity_id);
      }
    } catch (e) {
      _(String(e));
    } finally {
      C(false);
    }
  }, []);
  useEffect(() => {
    A();
  }, [A]);
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="Agentic fraud response"
        description={
          <Fragment>
            The agent investigates a suspicious entity across every signal it can reach, weighs
            competing explanations, measures how fast the threat is escalating, and proposes the
            safest next action. It executes nothing: recommendations are ranked, explained, and left
            for a named human to approve.
          </Fragment>
        }
        actions={
          <button onClick={A} className={buttonClass}>
            <RefreshCw className={cn("h-3.5 w-3.5", T && "animate-spin")} />
            Refresh
          </button>
        }
      />
      {M ? <ErrorAlert>{M}</ErrorAlert> : null}
      {y ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <_Component icon={Bot} label="Investigations" value={y.investigations} />
          <_Component icon={Dna} label="Campaign signatures" value={y.campaigns} />
          <_Component icon={o} label="Human decisions" value={y.decisions} />
        </div>
      ) : null}
      <section className="space-y-2">
        <label
          htmlFor="agent-entity"
          className="text-[0.6875rem] uppercase tracking-wider text-ink-faint"
        >
          Entity to investigate
        </label>
        <div className="flex flex-wrap gap-2">
          <select
            id="agent-entity"
            value={n}
            onChange={(e) => g(e.target.value)}
            className="focus-ring min-w-[16rem] flex-1 rounded border border-canvas-border bg-canvas-raised px-2 py-1.5 text-[0.8125rem] text-ink transition"
          >
            {(e == null ? undefined : e.length) ? (
              e.map((e) => (
                <option value={e.entity_id} key={e.entity_id}>
                  {e.entity_id} — {e.band} {e.risk_score.toFixed(2)}
                </option>
              ))
            ) : (
              <option value="">No scored entities — run an analysis first</option>
            )}
          </select>
        </div>
      </section>
      {n ? (
        <ResponseAgentPanel entityId={n} onDecided={A} />
      ) : (
        <EmptyState title="Nothing to investigate yet" icon={Search}>
          Ingest data and run the risk analysis; the agent works from the scored queue.
        </EmptyState>
      )}
      {N.length ? (
        <section className="space-y-2">
          <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            Learned Fraud DNA signatures
          </h2>
          <p className="text-[0.75rem] leading-relaxed text-ink-muted">
            Each signature describes a way of operating, not an identifier — which is why a number
            that has never been reported can still be matched to a campaign the first time it
            appears.
          </p>
          <ul className="space-y-1.5">
            {N.map((e) => (
              <li
                className="rounded border border-canvas-border bg-canvas-panel px-3 py-2 shadow-panel"
                key={e.campaign_id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono text-[0.8125rem] text-accent-bright">{e.campaign_id}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                    {e.label}
                  </span>
                  <Badge variant="neutral">{e.member_count} members</Badge>
                  <span className="mono text-[0.625rem] text-ink-faint">{e.dna_signature}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {j.length ? (
        <section className="space-y-2">
          <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            Agent memory — recent investigations
          </h2>
          <ul className="space-y-1">
            {j.slice(0, 15).map((e) => {
              return (
                <li
                  className="flex flex-wrap items-center gap-2 rounded border border-canvas-border bg-canvas-panel px-3 py-2 text-[0.75rem] shadow-panel"
                  key={e.id}
                >
                  <Link
                    href={`/profiles/${encodeURIComponent(e.entity_id)}`}
                    className="mono shrink-0 text-accent-bright hover:underline"
                  >
                    {e.entity_id}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {e.hypothesis.replace(/_/g, " ")}
                  </span>
                  {e.campaign_id ? (
                    <span className="mono text-[0.625rem] text-ink-faint">{e.campaign_id}</span>
                  ) : null}
                  <Badge className={v[e.tier] ?? v.low}>{e.tier}</Badge>
                  <span className="mono shrink-0 text-ink-faint">{e.risk_score.toFixed(0)}</span>
                  <span className="mono shrink-0 text-[0.625rem] text-ink-faint">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {e || M ? null : (
        <div className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
    </div>
  );
}
function _Component(e) {
  let { icon: _Component2, label: n, value: i } = e;
  return (
    <div className="rounded border border-canvas-border bg-canvas-panel p-3 shadow-panel">
      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        <_Component2 className="h-3 w-3" />
        {n}
      </div>
      <div className="mt-1 text-lg font-semibold text-ink">{i}</div>
    </div>
  );
}
