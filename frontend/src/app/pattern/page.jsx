"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Camera,
  Car,
  Eye,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEvidenceSelectActions } from "@/components/evidence/EvidenceSelection";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorAlert, PageHeader, buttonClass } from "@/components/ui/primitives";
import {
  getPatternCameras,
  getPatternContradictions,
  getPatternSummary,
  getPatternTimeline,
  getQueue,
} from "@/lib/api";
import { cn } from "@/lib/utils";
let _Component3 = Car;
let _Component = Navigation;
let y = {
  N: 0,
  E: 90,
  S: 180,
  W: 270,
};
let N = {
  N: "northbound",
  E: "eastbound",
  S: "southbound",
  W: "westbound",
};
function _Component2(e) {
  let { entityId: t, className: n } = e;
  let [s, c] = useState(null);
  let [l, d] = useState(null);
  let [u, m] = useState(null);
  let { select: h } = useEvidenceSelectActions();
  let w = useRouter();
  useEffect(() => {
    getPatternCameras()
      .then((e) => c(e.cameras))
      .catch((e) => d(e instanceof Error ? e.message : String(e)));
  }, []);
  let _ = useMemo(
    () =>
      s
        ? t
          ? [...s].sort(
              (e, n) =>
                (e.entities.includes(t) ? 0 : 1) - (n.entities.includes(t) ? 0 : 1) ||
                n.reads - e.reads,
            )
          : s
        : [],
    [s, t],
  );
  if (l) {
    return <ErrorAlert>{l}</ErrorAlert>;
  }
  if (!s) {
    return (
      <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-4", n)} aria-busy={true}>
        {[0, 1, 2, 3].map((e) => (
          <div className="skeleton h-32 rounded" key={e} />
        ))}
      </div>
    );
  }
  let C = t ? s.filter((e) => e.entities.includes(t)).length : 0;
  return (
    <div className={cn("space-y-2", n)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
          <Camera className="h-3.5 w-3.5 text-ink-faint" aria-hidden={true} />
          Camera network
        </h2>
        <p className="text-[0.75rem] text-ink-faint">
          {t ? (
            <Fragment>
              {C} of {s.length} cameras have read a vehicle registered to{" "}
              <span className="mono text-ink-muted">{t}</span>. Open one to place it in the
              reconstruction.
            </Fragment>
          ) : (
            <Fragment>
              {s.length} cameras, {s.reduce((e, t) => e + t.reads, 0)} reads.
            </Fragment>
          )}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {_.map((e) => {
          let s = !!t && e.entities.includes(t);
          let i = u === e.camera_id;
          return (
            <article
              className={cn(
                "flex flex-col rounded border bg-canvas-panel p-2.5 transition",
                s ? "border-accent/50 bg-accent/[0.05]" : "border-canvas-border",
                i && "ring-1 ring-accent/40",
              )}
              key={e.camera_id}
            >
              <button
                type="button"
                onClick={() => {
                  m(e.camera_id);
                  h({
                    labels: ["Camera"],
                    props: {
                      camera: e.camera_id,
                      covers: e.poi_name ?? "—",
                      facing: e.facing ?? "—",
                      reads: e.reads,
                      vehicles: e.vehicles,
                      mean_confidence: e.mean_confidence,
                    },
                    origin: "Selected in the camera network",
                  });
                }}
                className="focus-ring -m-1 rounded p-1 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="mono text-[0.8125rem] font-medium text-ink">{e.camera_id}</span>
                  {e.facing ? (
                    <span
                      className="flex items-center gap-1 text-[0.625rem] uppercase tracking-wider text-ink-faint"
                      title={`Predominantly reads ${N[e.facing] ?? e.facing} traffic`}
                    >
                      <_Component
                        className="h-3 w-3"
                        style={{
                          transform: `rotate(${y[e.facing] ?? 0}deg)`,
                        }}
                        aria-hidden={true}
                      />
                      {e.facing}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[0.75rem] leading-snug text-ink-muted">
                  {e.name}
                </p>
                {e.poi_name ? (
                  <p className="mt-1 flex items-center gap-1 text-[0.6875rem] text-ink-faint">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden={true} />
                    <span className="truncate">{e.poi_name}</span>
                  </p>
                ) : null}
                <p className="mt-1.5 flex flex-wrap gap-x-2 text-[0.6875rem] text-ink-faint">
                  <span className="tabular-nums">{e.reads} reads</span>
                  <span className="tabular-nums">{e.vehicles} vehicles</span>
                </p>
                <p className="mt-0.5 text-[0.625rem] text-ink-faint/80">
                  {(function (e, t) {
                    let n = e.slice(0, 10);
                    let r = t.slice(0, 10);
                    if (n === r) {
                      return n;
                    } else {
                      return `${n} → ${r}`;
                    }
                  })(e.first_read, e.last_read)}
                </p>
              </button>
              {e.entities.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {e.entities.slice(0, 4).map((e) => (
                    <Link
                      href={`/profiles/${e}`}
                      className={cn(
                        "mono focus-ring rounded border px-1 py-0.5 text-[0.625rem] transition hover:bg-canvas-hover",
                        e === t
                          ? "border-accent/50 text-accent-bright"
                          : "border-canvas-border text-ink-faint",
                      )}
                      key={e}
                    >
                      {e}
                    </Link>
                  ))}
                  {e.entities.length > 4 ? (
                    <span className="px-1 py-0.5 text-[0.625rem] text-ink-faint">
                      +{e.entities.length - 4}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  let n = new URLSearchParams({
                    camera: e.camera_id,
                  });
                  if (t) {
                    n.set("entity", t);
                  }
                  w.push(`/eye?${n.toString()}`);
                }}
                className="focus-ring mt-2 flex items-center justify-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[0.6875rem] text-accent-bright transition hover:bg-accent/20"
              >
                <Eye className="h-3 w-3" aria-hidden={true} />
                Open in Investigation Eye
              </button>
            </article>
          );
        })}
      </div>
      <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
        A camera reads a plate; the registration roster ties that plate to a person. It places a{" "}
        <em>vehicle</em>, never a driver — and a vehicle that habitually passes a camera is not
        placed at an event by passing it again.
      </p>
    </div>
  );
}
let _ = {
  strong: "bg-risk-bg text-risk border border-risk-border",
  moderate: "bg-accent/15 text-accent-bright",
  weak: "border border-canvas-border text-ink-faint",
  contradicted: "border border-canvas-border text-ink-faint line-through",
};
function C(e) {
  return e.slice(11, 16);
}
export default function PatternPage() {
  let [t, n] = useState(null);
  let [c, f] = useState("");
  let [p, v] = useState(null);
  let [b, k] = useState(null);
  let [y, N] = useState([]);
  let [Z, T] = useState(null);
  let [M, E] = useState(false);
  let [A, F] = useState(false);
  let L = useCallback(async () => {
    T(null);
    try {
      let [e, t, r] = await Promise.all([
        getQueue(),
        getPatternSummary(),
        getPatternContradictions(),
      ]);
      n(e.items);
      k(t);
      N(r.items);
      f((t) => {
        return t || (e.items[0]?.entity_id ?? "");
      });
    } catch (e) {
      T(String(e));
    }
  }, []);
  useEffect(() => {
    L();
  }, [L]);
  let R = useCallback(async (e) => {
    if (e) {
      E(true);
      T(null);
      try {
        v(await getPatternTimeline(e));
      } catch (e) {
        T(String(e));
        v(null);
      } finally {
        E(false);
      }
    }
  }, []);
  useEffect(() => {
    R(c);
  }, [c, R]);
  let O = (p == null ? undefined : p.events.filter((e) => e.kind === "txn")) ?? [];
  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="Pattern of life"
        description={
          <Fragment>
            Camera reads, call records and money movement on one axis. A transaction alone says
            funds moved; a camera read alone says a vehicle passed. Together they place a person at
            a cash-out — and each claim below carries the source rows it was built from.
          </Fragment>
        }
        actions={
          <button
            onClick={() => {
              L();
              R(c);
            }}
            className={buttonClass}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", M && "animate-spin")} />
            Refresh
          </button>
        }
      />
      {Z ? <ErrorAlert>{Z}</ErrorAlert> : null}
      {b ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <P icon={Camera} label="ALPR reads" value={b.reads} />
          <P icon={_Component3} label="Vehicles" value={b.vehicles} />
          <P
            icon={Camera}
            label="Cameras"
            value={b.cameras}
            onClick={() => F((e) => !e)}
            active={A}
            hint={A ? "Hide the network" : "Open the network"}
          />
          <P icon={MapPin} label="Places" value={b.pois} />
        </div>
      ) : null}
      {A ? <_Component2 entityId={c || undefined} /> : null}
      <section className="space-y-2">
        <label
          htmlFor="pol-entity"
          className="text-[0.6875rem] uppercase tracking-wider text-ink-faint"
        >
          Subject
        </label>
        <select
          id="pol-entity"
          value={c}
          onChange={(e) => f(e.target.value)}
          className="focus-ring w-full max-w-md rounded border border-canvas-border bg-canvas-raised px-2 py-1.5 text-[0.8125rem] text-ink transition"
        >
          {(t == null ? undefined : t.length) ? (
            t.map((e) => (
              <option value={e.entity_id} key={e.entity_id}>
                {e.entity_id} — {e.band} {e.risk_score.toFixed(2)}
              </option>
            ))
          ) : (
            <option value="">No scored entities yet</option>
          )}
        </select>
      </section>
      {p ? (
        <Fragment>
          <div className="flex flex-wrap gap-2 text-[0.75rem] text-ink-muted">
            <Badge variant="neutral">{p.counts.alpr_reads} reads</Badge>
            <Badge variant="neutral">{p.counts.debits} debits</Badge>
            <Badge
              className={
                p.counts.corroborated_debits > 0
                  ? _.strong
                  : "border border-canvas-border text-ink-faint"
              }
            >
              {p.counts.corroborated_debits} corroborated
            </Badge>
          </div>
          {O.length === 0 ? (
            <EmptyState title="No debits for this subject" icon={Banknote}>
              There is nothing here for camera evidence to corroborate.
            </EmptyState>
          ) : (
            <section className="space-y-2">
              <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                Financial events and their physical corroboration
              </h2>
              {O.map((e) => (
                <S event={e} key={e.rec_id} />
              ))}
            </section>
          )}
          <p className="rounded border border-canvas-border bg-canvas-panel p-3 text-[0.75rem] leading-relaxed text-ink-muted shadow-panel">
            <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5 text-ok" />
            {p.note}
          </p>
        </Fragment>
      ) : null}
      {y.length ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            <TriangleAlert className="h-3 w-3 text-risk" />
            Unsafe tracks ({y.length})
          </h2>
          <p className="max-w-2xl text-[0.75rem] leading-relaxed text-ink-muted">
            Reads that cannot both be true. Either one is a misread or the plate is cloned — a
            movement track through these points would pass somewhere the vehicle never went.
          </p>
          {y.map((e, t) => (
            <div
              className="rounded border border-risk-border bg-risk-bg p-3 text-[0.75rem]"
              key={t}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono font-medium text-risk">{e.plate}</span>
                <span className="mono text-ink-muted">
                  {e.separation_km} km in {e.gap_seconds}s
                </span>
                <Badge className={_.strong}>{e.implied_kmh.toFixed(0)} km/h implied</Badge>
              </div>
              <div className="mono mt-1 text-ink-faint">
                {e.from.camera_id} {C(e.from.ts)} → {e.to.camera_id} {C(e.to.ts)}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
function S(e) {
  var a;
  let { event: s } = e;
  let i = s.corroborations ?? [];
  let c = i[0];
  return (
    <div className="rounded border border-canvas-border bg-canvas-panel shadow-panel">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-canvas-border px-3 py-2.5">
        <Banknote className="h-4 w-4 shrink-0 text-ink-faint" />
        <span className="mono shrink-0 text-[0.8125rem] text-ink">{C(s.ts)}</span>
        <span className="text-[0.8125rem] font-medium text-ink">
          {(a = s.amount) == null
            ? ""
            : `₹${a.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}`}
        </span>
        <span className="text-[0.75rem] text-ink-muted">{s.channel}</span>
        <span className="mono min-w-0 flex-1 truncate text-[0.6875rem] text-ink-faint">
          {s.account}
        </span>
        <Badge className={_[(c == null ? undefined : c.strength) ?? "weak"]}>
          {c ? c.strength : "no evidence"}
        </Badge>
      </div>
      {i.length === 0 ? (
        <p className="px-3 py-2.5 text-[0.75rem] text-ink-faint">
          No camera read places any vehicle at this transaction.
        </p>
      ) : (
        <ul className="divide-y divide-canvas-border">
          {i.map((e, t) => (
            <T c={e} key={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
function T(e) {
  let { c: t } = e;
  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <_Component3 className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <span className="mono text-[0.8125rem] text-ink">{t.plate}</span>
        {t.poi ? <span className="text-[0.75rem] text-ink-muted">at {t.poi}</span> : null}
        <Badge className={_[t.strength]}>{t.strength}</Badge>
        {t.minutes_from_event != null ? (
          <span className="mono text-[0.6875rem] text-ink-faint">
            {t.minutes_from_event > 0 ? "+" : ""}
            {t.minutes_from_event.toFixed(0)} min
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[0.75rem] leading-snug text-ink-muted">{t.reason}</p>
      <div className="mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.625rem] text-ink-faint">
        {t.reads.map((e) => (
          <span key={e.record_id}>
            {e.record_id} · {C(e.ts)} · conf {e.confidence.toFixed(2)}
          </span>
        ))}
      </div>
    </li>
  );
}
function P(e) {
  let { icon: _Component4, label: n, value: a, onClick: s, active: i, hint: c } = e;
  let l = (
    <Fragment>
      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        <_Component4 className="h-3 w-3" />
        {n}
      </div>
      <div className="mt-1 text-lg font-semibold text-ink">{a}</div>
      {c ? <div className="mt-0.5 text-[0.625rem] text-accent-bright">{c}</div> : null}
    </Fragment>
  );
  if (s) {
    return (
      <button
        type="button"
        onClick={s}
        aria-expanded={i}
        className={cn(
          "focus-ring rounded border bg-canvas-panel p-3 text-left shadow-panel transition hover:bg-canvas-hover",
          i ? "border-accent/50 bg-accent/[0.05]" : "border-canvas-border",
        )}
      >
        {l}
      </button>
    );
  } else {
    return (
      <div className="rounded border border-canvas-border bg-canvas-panel p-3 shadow-panel">
        {l}
      </div>
    );
  }
}
