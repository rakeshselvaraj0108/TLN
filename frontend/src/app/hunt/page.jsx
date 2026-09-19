"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Crosshair,
  Download,
  FileText,
  LoaderCircle,
  Network,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import { getHuntReport, huntReportTextUrl, runHuntSweep } from "@/lib/api";
import { cn } from "@/lib/utils";
let g = {
  mule_network: "Money-mule network",
  identity_farm: "Synthetic identity / SIM farm",
  coordinated_campaign: "Coordinated campaign",
  shared_infrastructure: "Shared-infrastructure ring",
  unknown: "Unclassified association",
};
let k = {
  funds: "funds",
  synchronised: "timing",
  dna: "behaviour",
  device: "device",
  ip: "network",
  sim: "SIM",
};
function y(e) {
  return `₹${e.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}
export default function HuntPage() {
  let [e, t] = useState(null);
  let [n, a] = useState(false);
  let [d, u] = useState(null);
  let [m, x] = useState(0);
  let h = useCallback(async (e) => {
    a(true);
    u(null);
    try {
      t(await runHuntSweep(e));
    } catch (e) {
      u(String(e));
      t(null);
    } finally {
      a(false);
    }
  }, []);
  useEffect(() => {
    h(m);
  }, [h, m]);
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="Campaign hunt"
        description={
          <Fragment>
            Sweeps the whole population for entities operating together, rather than scoring them
            one at a time. A ring of ten quiet accounts never reaches the top of a risk queue; it
            does reach the top of this one, because the ranking reflects what binds the members
            rather than how loud any one of them is.
          </Fragment>
        }
        actions={
          <button onClick={() => h(m)} disabled={n} className={buttonClass}>
            <RefreshCw className={cn("h-3.5 w-3.5", n && "animate-spin")} />
            Re-sweep
          </button>
        }
      />
      {d ? <ErrorAlert>{d}</ErrorAlert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="min-conf"
          className="text-[0.6875rem] uppercase tracking-wider text-ink-faint"
        >
          Minimum confidence
        </label>
        <input
          id="min-conf"
          type="range"
          min={0}
          max={0.9}
          step={0.05}
          value={m}
          onChange={(e) => x(Number(e.target.value))}
          className="focus-ring h-1 w-48 accent-current"
        />
        <span className="mono text-[0.75rem] text-ink">{(m * 100).toFixed(0)}%</span>
      </div>
      {e ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <_ icon={Network} label="Operations" value={String(e.portfolio.campaigns)} />
          <_
            icon={Users}
            label="Entities implicated"
            value={String(e.portfolio.entities_implicated)}
          />
          <_ icon={Crosshair} label="Exposure" value={y(e.portfolio.total_exposure_inr)} />
          <_ icon={Network} label="Links examined" value={String(e.links_examined)} />
        </div>
      ) : null}
      {n && !e ? (
        <div className="space-y-1.5" aria-busy={true}>
          {[0, 1, 2].map((e) => (
            <div className="skeleton h-16 rounded" key={e} />
          ))}
        </div>
      ) : null}
      {e && e.campaigns.length === 0 ? (
        <EmptyState title="No operations above this threshold" icon={Network}>
          Lower the confidence floor, or ingest more data. Finding nothing is a valid result — it is
          not the same as nothing being there.
        </EmptyState>
      ) : null}
      <div className="space-y-2">
        {e == null
          ? undefined
          : e.campaigns.map((e, t) => <N rank={t + 1} campaign={e} key={e.campaign_id} />)}
      </div>
      {e ? (
        <p className="rounded border border-canvas-border bg-canvas-panel p-3 text-[0.75rem] leading-relaxed text-ink-muted shadow-panel">
          {e.note}
        </p>
      ) : null}
    </div>
  );
}
function N(e) {
  var n;
  let { rank: i, campaign: l } = e;
  let [c, o] = useState(i === 1);
  return (
    <div className="rounded border border-canvas-border bg-canvas-panel shadow-panel">
      <button
        type="button"
        onClick={() => o((e) => !e)}
        aria-expanded={c}
        className="focus-ring flex w-full flex-wrap items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-canvas-hover"
      >
        <span className="mono w-4 shrink-0 text-[0.6875rem] text-ink-faint">{i}</span>
        <span className="mono shrink-0 text-[0.8125rem] text-accent-bright">{l.campaign_id}</span>
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
          {g[l.typology] ?? l.typology}
        </span>
        <Badge variant="neutral">{l.members.length} members</Badge>
        {l.exposure_inr > 0 ? (
          <span className="mono shrink-0 text-[0.75rem] text-ink-muted">{y(l.exposure_inr)}</span>
        ) : null}
        <Badge
          className={
            (n = l.confidence) >= 0.65
              ? "bg-risk-bg text-risk border border-risk-border"
              : n >= 0.5
                ? "bg-accent/15 text-accent-bright"
                : "border border-canvas-border text-ink-faint"
          }
        >
          {(l.confidence * 100).toFixed(0)}% confidence
        </Badge>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform",
            c && "rotate-180",
          )}
        />
      </button>
      {c ? (
        <div className="space-y-3 border-t border-canvas-border px-3 py-2.5">
          <p className="text-[0.75rem] leading-relaxed text-ink-muted">{l.summary}</p>
          <div>
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Members
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {l.members.map((e) => (
                <Link
                  href={`/queue/${encodeURIComponent(e)}`}
                  className="focus-ring mono rounded border border-canvas-border px-1.5 py-0.5 text-[0.6875rem] text-accent-bright transition hover:bg-canvas-hover"
                  key={e}
                >
                  {e}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Why these are grouped
            </span>
            <ul className="mt-1 space-y-1">
              {l.links.slice(0, 8).map((e, t) => {
                return (
                  <li className="flex items-start gap-2 text-[0.75rem]" key={t}>
                    <Badge variant="neutral" className="shrink-0">
                      {k[e.kind] ?? e.kind}
                    </Badge>
                    <span className="mono shrink-0 text-ink-faint">
                      {e.a} · {e.b}
                    </span>
                    <span className="min-w-0 flex-1 text-ink-muted">{e.detail}</span>
                    <span className="mono shrink-0 text-ink-faint">{e.strength.toFixed(2)}</span>
                  </li>
                );
              })}
              {l.links.length > 8 ? (
                <li className="text-[0.6875rem] text-ink-faint">
                  … {l.links.length - 8} further link(s)
                </li>
              ) : null}
            </ul>
          </div>
          <_Component entityId={l.members[0]} />
        </div>
      ) : null}
    </div>
  );
}
function _Component(e) {
  let { entityId: t } = e;
  let [n, a] = useState(null);
  let [i, l] = useState(false);
  let [c, o] = useState(null);
  async function d() {
    l(true);
    o(null);
    try {
      a(await getHuntReport(t));
    } catch (e) {
      o(String(e));
    } finally {
      l(false);
    }
  }
  return (
    <div className="rounded border border-canvas-border bg-canvas-raised p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={d} disabled={i} className={primaryButtonClass} type="button">
          {i ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          Build report for {t}
        </button>
        {n ? (
          <a href={huntReportTextUrl(t)} className={buttonClass}>
            <Download className="h-3.5 w-3.5" />
            Download .txt
          </a>
        ) : null}
      </div>
      {c ? (
        <div className="mt-2">
          <ErrorAlert>{c}</ErrorAlert>
        </div>
      ) : null}
      {n ? (
        <div className="mt-2.5 space-y-2.5">
          <p className="text-[0.75rem] leading-relaxed text-ink">{n.summary}</p>
          {n.loss_prevented ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <Z label="At risk" value={y(n.loss_prevented.at_risk_inr)} />
              <Z
                label="Still recoverable"
                value={y(n.loss_prevented.recoverable_inr)}
                accent={true}
              />
              <Z label="Already lost" value={y(n.loss_prevented.already_lost_inr)} />
            </div>
          ) : null}
          {n.loss_prevented ? (
            <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
              {n.loss_prevented.basis}
            </p>
          ) : null}
          {n.findings.length ? (
            <div>
              <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                Findings
              </span>
              <ul className="mt-1 space-y-1">
                {n.findings.slice(0, 6).map((e, t) => (
                  <li className="text-[0.75rem]" key={t}>
                    <Badge variant="neutral">{e.confidence}</Badge>{" "}
                    <span className="text-ink">{e.title}</span>{" "}
                    <span className="text-ink-muted">— {e.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {n.exculpatory.length ? (
            <div>
              <span className="text-[0.6875rem] uppercase tracking-wider text-ok">Exculpatory</span>
              <ul className="mt-1 space-y-0.5">
                {n.exculpatory.map((e, t) => (
                  <li className="text-[0.75rem] text-ink-muted" key={t}>
                    · {e.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-faint">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{n.caveats[0]}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function Z(e) {
  let { label: t, value: n, accent: s } = e;
  return (
    <div className="rounded border border-canvas-border bg-canvas p-2">
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">{t}</div>
      <div className={cn("mono mt-0.5 text-[0.875rem]", s ? "text-ok" : "text-ink")}>{n}</div>
    </div>
  );
}
function _(e) {
  let { icon: _Component2, label: n, value: s } = e;
  return (
    <div className="rounded border border-canvas-border bg-canvas-panel p-3 shadow-panel">
      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        <_Component2 className="h-3 w-3" />
        {n}
      </div>
      <div className="mono mt-1 text-[0.9375rem] font-semibold text-ink">{s}</div>
    </div>
  );
}
