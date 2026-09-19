import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  ChevronRight,
  MessageSquare,
  Phone,
  Radio,
  Smartphone,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { RiskBadge } from "@/components/RiskBadge";
import { AskBox } from "@/components/overview/AskBox";
import { EvidenceGraphPanel } from "@/components/overview/EvidenceGraphPanel";
import {
  getAgentPipelineInfo,
  getCases,
  getEntityTimeline,
  getOverview,
  getSubgraph,
} from "@/lib/api";
import { sourceColor } from "@/lib/sources";
import { cn } from "@/lib/utils";

const STREAMS = [
  { key: "cdr", label: "Call records", icon: Phone },
  { key: "ipdr", label: "Data sessions", icon: Wifi },
  { key: "bank", label: "Bank transactions", icon: Banknote },
  { key: "social", label: "Social posts", icon: MessageSquare },
];

const TIMELINE_LANES = [
  { label: "Calls", kind: "call", source: "cdr" },
  { label: "Sessions", kind: "session", source: "ipdr" },
  { label: "Transactions", kind: "txn", source: "bank" },
  { label: "Social", kind: "post", source: "social" },
];

const ROLE_LABELS = {
  mule: "Money laundering",
  associate: "Collection account",
  handler: "Impersonation / coercion",
  sim_farm: "SIM rotation",
};

const CLUSTER_JOINS = {
  scam_ring: "coerced transfer and onward hops.",
};

const LOCAL_ENGINE_TITLE =
  "The knowledge graph is unreachable. The same deterministic rules ran in-process over the record store.";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// API timestamps are naive and rendered as recorded (UTC on the server).
const parseTs = ts => Date.parse(ts.endsWith("Z") ? ts : `${ts}Z`);
const clock = ms => new Date(ms).toISOString().slice(11, 16);
const shortDate = ms =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function EngineBadge({ engine }) {
  const local = engine === "local";
  return (
    <span
      title={local ? LOCAL_ENGINE_TITLE : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wider",
        local ? "border-risk-border bg-risk-bg text-risk" : "border-canvas-border bg-canvas-raised text-ok",
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", local ? "bg-risk" : "bg-ok")} />
      {local ? "local engine" : "graph engine"}
    </span>
  );
}

function StatCard({ label, tone = "default", children }) {
  return (
    <div
      className={cn(
        "rounded border p-3 shadow-panel",
        tone === "risk" ? "border-risk-border bg-risk-bg/30" : "border-canvas-border bg-canvas-panel",
      )}
    >
      <p className="text-[0.6875rem] uppercase tracking-[0.09em] text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

function Panel({ title, aside, className, bodyClassName, children }) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded border border-canvas-border bg-canvas-panel shadow-panel",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-canvas-border px-3 py-2">
        <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.09em] text-ink">{title}</h2>
        {typeof aside === "string" ? <span className="text-[0.6875rem] text-ink-faint">{aside}</span> : aside}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

function LeadChip({ icon: Icon, time, text, note, risk }) {
  return (
    <span
      title={note}
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[0.8125rem]",
        risk ? "border-risk-border bg-risk-bg/50 text-ink" : "border-canvas-border bg-canvas-raised/70 text-ink",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", risk ? "text-risk" : "text-accent-bright")} aria-hidden />
      <span className="mono text-[0.6875rem] text-ink-faint">{time}</span>
      <span className="font-medium">{text}</span>
      <span className="sr-only">
        {" — "}
        {note}
      </span>
    </span>
  );
}

export default async function OverviewPage() {
  const [overview, pipeline, cases, graph] = await Promise.all([
    getOverview(),
    getAgentPipelineInfo(),
    getCases(),
    getSubgraph(),
  ]);
  const topEntity = overview.top_entities[0]?.entity_id;
  const timeline = topEntity ? await getEntityTimeline(topEntity) : { events: [] };

  const { sources, signals, bands, lead } = overview;
  const openCases = cases.filter(c => c.status === "open").length;
  const highClusters = graph.clusters.filter(c => c.severity === "high").length;
  const findings = signals.fast_call_to_debit + signals.fanout_patterns + signals.imei_persistence_devices;
  const riskLevel = bands.high > 0 ? "high" : bands.elevated > 0 ? "elevated" : "low";
  const scored = overview.scored || 1;

  const debitAt = parseTs(lead.debit_time);
  const callAt = debitAt - lead.latency_s * 1000;

  const persons = graph.nodes.filter(n => n.labels.includes("Person")).map(n => n.props);
  const alerts = persons.filter(p => p.band && p.band !== "low").sort((a, b) => b.risk_score - a.risk_score);
  const leadCluster = graph.clusters[0];

  const events = timeline.events;
  const times = events.map(e => parseTs(e.ts));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const position = ts => `${((parseTs(ts) - t0) / (t1 - t0)) * 100}%`;

  const joins = [
    { label: "Call followed by a debit within 10 minutes", icon: Radio, value: signals.fast_call_to_debit },
    { label: "Accounts that passed money straight on", icon: Banknote, value: signals.fanout_patterns },
    { label: "Handsets carrying 3 or more numbers", icon: Smartphone, value: signals.imei_persistence_devices },
    { label: "Entities in the high-risk band", icon: TriangleAlert, value: bands.high },
  ];

  return (
    <>
      <div className="space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow mb-2">Integrated multi-source investigation</p>
            <h1 className="font-serif text-[1.75rem] font-light leading-[1.1] tracking-[-0.03em] text-ink">
              Command centre
            </h1>
            <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-ink-muted">
              {"The bank sees an ordinary transfer. The phone company sees an ordinary call. "}
              <span className="text-ink">Only together do they show a crime.</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <EngineBadge engine={overview.engine} />
            <Link
              href="/queue"
              className="focus-ring inline-flex items-center gap-2 rounded border border-accent/50 bg-accent/10 px-3 py-1.5 text-[0.8125rem] text-accent-bright transition hover:border-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Review queue
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Active investigations">
            <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-ink">
              <CountUp value={openCases + highClusters} />
            </p>
            <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
              {plural(openCases, "open case")} · {plural(highClusters, "high-risk cluster")}
            </p>
          </StatCard>
          <StatCard label="Suspicious findings" tone={findings > 0 ? "risk" : "default"}>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums leading-none",
                findings > 0 ? "text-risk" : "text-ink",
              )}
            >
              <CountUp value={findings} />
            </p>
            <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
              {signals.fast_call_to_debit} call→debit · {signals.fanout_patterns} fan-out ·{" "}
              {signals.imei_persistence_devices} handsets
            </p>
          </StatCard>
          <StatCard label="Cross-source links">
            <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-ink">
              <CountUp value={overview.total_records} />
            </p>
            <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
              {overview.scored} resolved entities across {Object.keys(sources).length} sources
            </p>
          </StatCard>
          <StatCard label="Risk status" tone={riskLevel === "low" ? "default" : "risk"}>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold uppercase leading-none tracking-wide",
                riskLevel === "low" ? "text-ok" : "text-risk",
              )}
            >
              {riskLevel}
            </p>
            <div
              className="mt-2 flex h-1.5 w-full overflow-hidden rounded-sm bg-canvas-hover"
              role="img"
              aria-label={`${bands.high} high, ${bands.elevated} elevated, ${bands.low} low risk entities`}
            >
              {["high", "elevated", "low"].map(band => (
                <span
                  key={band}
                  style={{ width: `${(bands[band] / scored) * 100}%`, backgroundColor: `var(--band-${band})` }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
              {bands.high}
              {" high · "}
              {bands.elevated}
              {" elevated · "}
              {bands.low}
              {" low"}
            </p>
          </StatCard>
        </div>

        <section className="reasoning-surface animate-rise-in rounded px-4 py-3 shadow-raised">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
              Lead finding
            </span>
            <p className="text-[0.75rem] text-ink-muted">
              {"No single source shows a crime. The "}
              <strong className="text-ink">join</strong>
              {" does."}
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <LeadChip
              icon={Phone}
              time={clock(callAt)}
              text={`Inbound call from ${lead.caller}`}
              note="The telco sees a long call. Nothing unusual."
            />
            <span className="flex shrink-0 items-center gap-1 text-[0.625rem] uppercase tracking-wider text-risk">
              <ChevronRight className="h-3 w-3" aria-hidden />
              {Math.round(lead.latency_s / 60)} min later
            </span>
            <LeadChip
              icon={Banknote}
              time={clock(debitAt)}
              text={`₹${lead.amount.toLocaleString("en-IN")} debited — "${lead.narration}"`}
              note="The bank sees a large but plausible transfer."
              risk
            />
            <Link
              href={`/queue/${lead.person}`}
              className="group ml-auto inline-flex shrink-0 items-center gap-1 text-[0.75rem] text-accent-bright hover:underline"
            >
              {"Open "}
              {lead.person}
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_290px]">
          <div className="flex flex-col gap-3">
            <Panel title="Data streams" aside="ingested">
              <ul className="space-y-1.5">
                {STREAMS.map(({ key, label, icon: Icon }) => (
                  <li
                    key={key}
                    className="flex items-center gap-2.5 rounded border border-canvas-border/70 px-2 py-1.5"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: sourceColor(key) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[0.75rem] text-ink">{label}</span>
                    <span className="mono text-[0.6875rem] tabular-nums text-ink-muted">
                      {(sources[key] ?? 0).toLocaleString("en-IN")}
                    </span>
                    {sources[key] ? (
                      <span className="flex items-center gap-1 text-[0.625rem] uppercase tracking-wider text-ok">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
                        linked
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[0.625rem] uppercase tracking-wider text-ink-faint">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
                        empty
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Investigation pipeline" aside={<EngineBadge engine={overview.engine} />}>
              <ol className="space-y-1">
                {pipeline.agents.map((agent, i) => (
                  <li key={agent.name} className="flex gap-2.5 rounded px-1 py-1">
                    <span className="mono mt-0.5 w-4 shrink-0 text-[0.625rem] text-ink-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.75rem] text-ink">{agent.name}</span>
                      <span className="block truncate text-[0.6875rem] text-ink-faint" title={agent.calls}>
                        {agent.calls}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 border-t border-canvas-border pt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
                Stages are deterministic services, not prompts. Every proposal is a recommendation for
                human review — nothing here acts on its own.
              </p>
            </Panel>
          </div>

          <Panel
            title="Multi-source evidence graph"
            aside={`${graph.nodes.length} identities · ${graph.clusters.length} clusters`}
            className="flex flex-col min-h-[30rem]"
            bodyClassName="p-0"
          >
            <EvidenceGraphPanel nodes={graph.nodes} edges={graph.edges} clusters={graph.clusters} />
          </Panel>

          <div className="flex flex-col gap-3">
            <Panel title="What the join found" aside="cross-source only">
              <ul className="space-y-1">
                {joins.map(({ label, icon: Icon, value }) => (
                  <li key={label} className="flex items-start gap-2 rounded px-1 py-1">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk" aria-hidden />
                    <span className="min-w-0 flex-1 text-[0.75rem] leading-snug text-ink-muted">{label}</span>
                    <span className="mono shrink-0 text-[0.8125rem] tabular-nums text-risk">{value}</span>
                  </li>
                ))}
              </ul>
              {leadCluster ? (
                <div className="reasoning-surface mt-3 text-[0.75rem] leading-relaxed">
                  <p className="text-ink">{leadCluster.evidence}.</p>
                  <p className="mt-1 text-ink-faint">
                    {leadCluster.size}
                    {" actors joined by "}
                    {CLUSTER_JOINS[leadCluster.kind] ?? `${leadCluster.label.toLowerCase()}.`}
                  </p>
                </div>
              ) : null}
            </Panel>

            <Panel title="Alerts" aside={`${alerts.length} above low`} bodyClassName="p-0">
              <table className="w-full text-[0.75rem]">
                <thead>
                  <tr className="border-b border-canvas-border text-left text-[0.625rem] uppercase tracking-wider text-ink-faint">
                    <th className="px-3 py-1.5 font-medium">Entity</th>
                    <th className="px-2 py-1.5 font-medium">Type</th>
                    <th className="px-3 py-1.5 text-right font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map(entity => (
                    <tr
                      key={entity.entity_id}
                      className="border-b border-canvas-border/60 last:border-0 hover:bg-canvas-hover"
                    >
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/queue/${entity.entity_id}`}
                          className="focus-ring block min-w-0 truncate text-accent-bright hover:underline"
                        >
                          {entity.name}
                        </Link>
                        <span className="mono text-[0.625rem] text-ink-faint">{entity.entity_id}</span>
                      </td>
                      <td className="px-2 py-1.5 text-ink-muted">
                        {ROLE_LABELS[entity.role] ?? entity.role.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <RiskBadge band={entity.band} score={entity.risk_score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title="Case timeline" aside={`${events.length} events`}>
              <div className="space-y-1.5">
                {TIMELINE_LANES.map(lane => {
                  const laneEvents = events.filter(e => e.kind === lane.kind);
                  return (
                    <div key={lane.label} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-right text-[0.625rem] uppercase tracking-wider text-ink-faint">
                        {lane.label}
                      </span>
                      <div className="relative h-4 flex-1 rounded-sm bg-canvas-hover/60">
                        {laneEvents.map((event, i) => (
                          <span
                            key={`${event.rec_id}-${i}`}
                            title={`${event.ts} · ${event.rec_id}`}
                            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                            style={{ left: position(event.ts), backgroundColor: sourceColor(lane.source) }}
                          />
                        ))}
                      </div>
                      <span className="mono w-6 shrink-0 text-right text-[0.625rem] tabular-nums text-ink-faint">
                        {laneEvents.length}
                      </span>
                    </div>
                  );
                })}
              </div>
              {events.length ? (
                <div className="mt-2 flex justify-between border-t border-canvas-border pt-1.5 text-[0.625rem] text-ink-faint">
                  <span>{shortDate(t0)}</span>
                  <span>{shortDate(t1)}</span>
                </div>
              ) : null}
            </Panel>
          </div>
        </div>
        <AskBox />
      </div>
    </>
  );
}
