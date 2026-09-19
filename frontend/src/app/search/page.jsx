"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Database, FolderOpen, LoaderCircle, Search, Users } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { EmptyState, ErrorAlert, PageHeader, primaryButtonClass } from "@/components/ui/primitives";
import { getCases, getQueue, getRecordsSummary, search } from "@/lib/api";
let d = FolderOpen;
let x = {
  Person: "Resolved persons",
  Phone: "Phone numbers",
  Device: "Devices (IMEI)",
  Sim: "SIMs (IMSI)",
  Account: "Bank accounts",
  UpiId: "UPI handles",
  Ip: "IP addresses",
  SocialHandle: "Social handles",
};
let p = {
  cdr: "Call records (CDR)",
  ipdr: "Data sessions (IPDR)",
  bank: "Bank transactions",
  social: "Social posts",
  alpr: "Camera reads (ALPR)",
};
export default function SearchPage() {
  let [e, t] = useState("");
  let [n, a] = useState(null);
  let [c, o] = useState(false);
  let [d, m] = useState(null);
  let [p, f] = useState(null);
  let [g, y] = useState(true);
  let j = useCallback(
    async (n) => {
      let s = (n ?? e).trim();
      if (s) {
        if (n) {
          t(n);
        }
        o(true);
        m(null);
        try {
          a(await search(s));
        } catch (e) {
          m(String(e));
          a(null);
        } finally {
          o(false);
        }
      }
    },
    [e],
  );
  useEffect(() => {
    Promise.allSettled([getRecordsSummary(), getQueue(), getCases()])
      .then((e) => {
        let [t, n, s] = e;
        f({
          sources: t.status === "fulfilled" ? t.value.counts : {},
          totalRecords: t.status === "fulfilled" ? t.value.total : 0,
          entities:
            n.status === "fulfilled"
              ? [...n.value.items].sort((e, t) => t.risk_score - e.risk_score)
              : [],
          cases: s.status === "fulfilled" ? s.value : [],
        });
      })
      .finally(() => y(false));
  }, []);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Search"
        description="One box, every identifier. Phone, IMEI, IMSI, account, UPI handle, IP or social handle — paste what you have."
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            Identifier or fragment
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              autoFocus={true}
              value={e}
              onChange={(e) => t(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  j();
                }
              }}
              placeholder="+919104332181 · 287101226916693 · HDFC61559407816 · @quickcash_jobs"
              className="focus-ring mono w-full rounded border border-canvas-border bg-canvas-panel py-2 pl-9 pr-3 text-[0.8125rem] text-ink placeholder:text-ink-faint/60"
            />
          </div>
        </label>
        <button onClick={() => j()} disabled={c || !e.trim()} className={primaryButtonClass}>
          {c ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Search
        </button>
      </div>
      {n && n.guessed_types.length > 0 ? (
        <p className="text-[0.75rem] text-ink-faint">
          Read as{" "}
          {n.guessed_types.map((e, t) => (
            <span key={e}>
              {t > 0 ? " or " : ""}
              <span className="text-ink-muted">{e}</span>
            </span>
          ))}
          . Every identifier type was searched regardless.
        </p>
      ) : null}
      {d ? <ErrorAlert>{d}</ErrorAlert> : null}
      {c ? (
        <div className="space-y-2" aria-busy={true} aria-label="Searching">
          {Array.from({
            length: 3,
          }).map((e, t) => (
            <div className="skeleton h-16 rounded" key={t} />
          ))}
        </div>
      ) : n && n.total === 0 ? (
        <EmptyState title={`Nothing matches “${n.term}”`}>
          No identifier in the graph contains that string. If the data has not been ingested yet,
          load it from Data ingestion first.
        </EmptyState>
      ) : n ? (
        <div className="space-y-4">
          <p className="text-[0.75rem] text-ink-muted">
            {n.total} {n.total === 1 ? "match" : "matches"} across {n.groups.length}{" "}
            {n.groups.length === 1 ? "type" : "types"}
          </p>
          {n.groups.map((e, t) => {
            return (
              <section
                style={{
                  animationDelay: `${t * 40}ms`,
                }}
                className="animate-fade-in rounded border border-canvas-border bg-canvas-panel/50 p-3"
                key={e.kind}
              >
                <h2 className="mb-2 flex items-baseline gap-2 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                  {x[e.kind] ?? e.kind}
                  <span className="tabular-nums text-ink-faint/70">{e.count}</span>
                </h2>
                <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {e.hits.map((e, t) => (
                    <_Component hit={e} key={`${e.label}-${t}`} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
      {n || c ? null : <_Component2 holdings={p} loading={g} onPick={(e) => j(e)} />}
    </div>
  );
}
function _Component2(e) {
  let { holdings: t, loading: n, onPick: r } = e;
  if (n) {
    return (
      <div className="grid gap-3 lg:grid-cols-3" aria-busy={true} aria-label="Loading holdings">
        {[0, 1, 2].map((e) => (
          <div className="skeleton h-44 rounded" key={e} />
        ))}
      </div>
    );
  }
  if (!t) {
    return null;
  }
  let i = Object.entries(t.sources).filter((e) => {
    let [, t] = e;
    return t > 0;
  });
  if (i.length === 0 && t.entities.length === 0 && t.cases.length === 0) {
    return (
      <EmptyState title="Nothing has been ingested yet" icon={Database}>
        Load the source data from Data ingestion, then run the analysis pass. This panel lists what
        the store holds as soon as there is something in it.
      </EmptyState>
    );
  } else {
    return (
      <div className="space-y-3">
        <div className="flex items-baseline gap-2 border-b border-canvas-border pb-2">
          <h2 className="text-[0.8125rem] font-medium text-ink">In this deployment</h2>
          <p className="text-[0.75rem] text-ink-faint">
            Everything the box above searches. Select anything to look it up.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <_Component3
            icon={Database}
            title="Datasets ingested"
            note={`${t.totalRecords.toLocaleString()} hash-chained records`}
          >
            {i.length === 0 ? (
              <p className="text-[0.75rem] text-ink-faint">No records yet.</p>
            ) : (
              <ul className="space-y-1">
                {i.map((e) => {
                  let [n, r] = e;
                  return (
                    <li key={n}>
                      <Link
                        href={`/records?source=${n}`}
                        className="focus-ring flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[0.8125rem] transition hover:bg-canvas-hover"
                      >
                        <span className="truncate text-ink-muted">{p[n] ?? n}</span>
                        <span className="mono shrink-0 tabular-nums text-ink-faint">
                          {r.toLocaleString()}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </_Component3>
          <_Component3
            icon={Users}
            title="Resolved people"
            note={`${t.entities.length} assessed, highest first`}
          >
            {t.entities.length === 0 ? (
              <p className="text-[0.75rem] text-ink-faint">
                Nothing has been scored. Run the analysis pass from the risk queue.
              </p>
            ) : (
              <ul className="space-y-1">
                {t.entities.slice(0, 8).map((e) => (
                  <li key={e.entity_id}>
                    <Link
                      href={`/profiles/${e.entity_id}`}
                      className="focus-ring flex items-center justify-between gap-2 rounded px-1.5 py-1 transition hover:bg-canvas-hover"
                    >
                      <span className="mono text-[0.8125rem] text-accent-bright">
                        {e.entity_id}
                      </span>
                      <RiskBadge band={e.band} score={e.risk_score} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </_Component3>
          <_Component3 icon={d} title="Cases" note={`${t.cases.length} on file`}>
            {t.cases.length === 0 ? (
              <p className="text-[0.75rem] text-ink-faint">No case has been opened yet.</p>
            ) : (
              <ul className="space-y-1">
                {t.cases.slice(0, 8).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/cases/${e.id}`}
                      className="focus-ring block rounded px-1.5 py-1 transition hover:bg-canvas-hover"
                    >
                      <span className="mono text-[0.75rem] text-accent-bright">{e.case_code}</span>
                      <span className="ml-1.5 text-[0.8125rem] text-ink-muted">{e.title}</span>
                      <span className="ml-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                        {e.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </_Component3>
        </div>
        {t.entities.length > 0 ? (
          <div className="rounded border border-canvas-border bg-canvas-panel/50 p-3">
            <h3 className="mb-2 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Try one of these
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {t.entities.slice(0, 10).map((e) => (
                <button
                  type="button"
                  onClick={() => r(e.entity_id)}
                  className="focus-ring mono rounded border border-canvas-border px-2 py-1 text-[0.75rem] text-ink-muted transition hover:border-accent/40 hover:bg-canvas-hover hover:text-ink"
                  key={e.entity_id}
                >
                  {e.entity_id}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}
function _Component3(e) {
  let { icon: _Component4, title: n, note: r, children: a } = e;
  return (
    <section className="animate-fade-in rounded border border-canvas-border bg-canvas-panel/50 p-3">
      <h3 className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
        <_Component4 className="h-3.5 w-3.5 text-ink-faint" aria-hidden={true} />
        {n}
      </h3>
      <p className="mb-2 mt-0.5 text-[0.6875rem] text-ink-faint">{r}</p>
      {a}
    </section>
  );
}
function _Component(e) {
  let { hit: t } = e;
  let n = (
    <Fragment>
      <span className="mono block truncate text-[0.8125rem] text-ink">{t.label}</span>
      <span className="mt-0.5 block text-[0.6875rem] text-ink-faint">
        {t.entity_id ? (
          <Fragment>
            resolved to <span className="mono text-accent-bright">{t.entity_id}</span>
          </Fragment>
        ) : (
          "not resolved to a person"
        )}
      </span>
    </Fragment>
  );
  if (t.entity_id) {
    return (
      <li>
        <Link
          href={`/profiles/${t.entity_id}`}
          className="focus-ring block rounded border border-canvas-border bg-canvas-panel px-2.5 py-2 transition hover:border-accent/40 hover:bg-canvas-hover"
        >
          {n}
        </Link>
      </li>
    );
  } else {
    return <li className="rounded border border-canvas-border bg-canvas-panel px-2.5 py-2">{n}</li>;
  }
}
