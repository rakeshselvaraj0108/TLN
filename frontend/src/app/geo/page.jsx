"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { line, scaleSqrt, select, zoom, zoomIdentity } from "d3";
import { LoaderCircle, MapPin, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { useEvidenceSelectActions } from "@/components/evidence/EvidenceSelection";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import {
  getGeoContradictions,
  getGeoMovement,
  getGeoProximity,
  getGeoTowers,
  getQueue,
} from "@/lib/api";
function _Component6(e) {
  let {
    sites: t,
    track: n,
    selectedKey: l,
    onSelect: r,
    height: i = 420,
    emptyMessage: c = "No cell sites with a position.",
  } = e;
  let o = useRef(null);
  let u = useRef(null);
  let [x, h] = useState(880);
  let [p, b] = useState(zoomIdentity);
  useEffect(() => {
    let e = o.current;
    if (!e) {
      return;
    }
    let t = new ResizeObserver((e) => {
      let [t] = e;
      h(Math.max(320, t.contentRect.width));
    });
    t.observe(e);
    return () => t.disconnect();
  }, []);
  let f = useMemo(() => {
    let e = [...t, ...(n ?? [])];
    if (e.length === 0) {
      return null;
    }
    let s = e.map((e) => e.lat);
    let a = e.map((e) => e.lon);
    let [l, r] = [Math.min(...s), Math.max(...s)];
    let [c, o] = [Math.min(...a), Math.max(...a)];
    if (r - l < 0.01) {
      let e = (l + r) / 2;
      [l, r] = [e - 0.005, e + 0.005];
    }
    if (o - c < 0.01) {
      let e = (c + o) / 2;
      [c, o] = [e - 0.005, e + 0.005];
    }
    let d = Math.cos(((l + r) / 2) * (Math.PI / 180));
    let u = (o - c) * d;
    let m = r - l;
    let h = x - 56;
    let p = i - 56;
    let b = Math.min(h / u, p / m);
    let f = (h - u * b) / 2;
    let j = (p - m * b) / 2;
    return {
      project: (e, t) => [28 + f + (t - c) * d * b, 28 + j + (r - e) * b],
      k: b,
    };
  }, [t, n, x, i]);
  useEffect(() => {
    let e = u.current;
    if (!e) {
      return;
    }
    let t = zoom()
      .scaleExtent([1, 60])
      .on("zoom", (e) => b(e.transform));
    let n = select(e);
    n.call(t);
    n.on("dblclick.zoom", null);
    return () => {
      n.on(".zoom", null);
    };
  }, []);
  let j = useCallback(() => {
    let e = u.current;
    if (e) {
      select(e).transition().duration(250).call(zoom().transform, zoomIdentity);
      b(zoomIdentity);
    }
  }, []);
  let g = useMemo(() => {
    if (!f) {
      return [];
    }
    let e = new Map();
    for (let n of t) {
      let [t, s] = f.project(n.lat, n.lon);
      let a = p.applyX(t);
      let l = p.applyY(s);
      let r = Math.round(a / 26);
      let i = Math.round(l / 26);
      let c = `${r}:${i}`;
      let o = e.get(c);
      if (o) {
        o.weight += n.weight;
        o.members.push(n);
        o.x += (a - o.x) / o.members.length;
        o.y += (l - o.y) / o.members.length;
      } else {
        e.set(c, {
          key: c,
          x: a,
          y: l,
          weight: n.weight,
          members: [n],
        });
      }
    }
    return [...e.values()];
  }, [t, f, p]);
  let k = useMemo(() => {
    let e = Math.max(1, ...g.map((e) => e.weight));
    return scaleSqrt().domain([0, e]).range([2.5, 14]);
  }, [g]);
  let v = useMemo(
    () =>
      f && n && !(n.length < 2)
        ? line()
            .x((e) => p.applyX(f.project(e.lat, e.lon)[0]))
            .y((e) => p.applyY(f.project(e.lat, e.lon)[1]))(n)
        : null,
    [f, n, p],
  );
  let y = useMemo(() => {
    if (!f) {
      return null;
    }
    let t = (f.k * p.k) / 110.574;
    if (!isFinite(t) || t <= 0) {
      return null;
    }
    let n = 120 / t;
    let s = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250];
    let a = s.find((e) => e >= n) ?? s[s.length - 1];
    return {
      px: a * t,
      label: a < 1 ? `${Math.round(a * 1000)} m` : `${a} km`,
    };
  }, [f, p]);
  if (!f || t.length === 0) {
    return (
      <div
        ref={o}
        style={{
          height: i,
        }}
        className="flex items-center justify-center rounded border border-dashed border-canvas-border bg-canvas-panel/40 text-[0.8125rem] text-ink-faint"
      >
        {c}
      </div>
    );
  }
  let w = g.filter((e) => e.members.length > 1).length;
  return (
    <div
      ref={o}
      className="relative overflow-hidden rounded border border-canvas-border bg-canvas-panel/60"
    >
      <svg
        ref={u}
        width={x}
        height={i}
        role="img"
        aria-label={`Cell site map, ${t.length} sites`}
        className="block cursor-grab active:cursor-grabbing"
      >
        <_Component width={x} height={i} />
        {v ? (
          <path
            d={v}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={1.25}
            strokeOpacity={0.55}
            strokeLinejoin="round"
            strokeDasharray="4 3"
          />
        ) : null}
        {g.map((e) => {
          let n = e.members.length > 1;
          let a = !!l && e.members.some((e) => e.cell_key === l);
          let i = k(e.weight);
          let c = e.members[0];
          return (
            <g
              transform={`translate(${e.x},${e.y})`}
              onClick={() => {
                if (!n && r) {
                  r(c);
                }
              }}
              className={r && !n ? "cursor-pointer" : undefined}
              tabIndex={r && !n ? 0 : -1}
              role={r && !n ? "button" : undefined}
              aria-label={
                n
                  ? `${e.members.length} cell sites, ${e.weight} observations — zoom in to separate`
                  : `Cell ${c.cell_key}, ${c.weight} observations`
              }
              onKeyDown={(e) => {
                if (r && !n && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  r(c);
                }
              }}
              key={e.key}
            >
              <circle
                r={i}
                fill={a ? "#38bdf8" : n ? "#1d4ed8" : "#2563eb"}
                fillOpacity={a ? 0.5 : n ? 0.32 : 0.24}
                stroke={a ? "#38bdf8" : n ? "#60a5fa" : "#475569"}
                strokeWidth={a ? 1.75 : 1}
              />
              {n && i >= 9 ? (
                <text
                  textAnchor="middle"
                  dy="0.32em"
                  className="pointer-events-none select-none"
                  fontSize={Math.min(10, i)}
                  fill="#dbeafe"
                >
                  {e.members.length}
                </text>
              ) : (
                <circle r={1.5} fill={a ? "#38bdf8" : "#94a3b8"} />
              )}
              <title>
                {n
                  ? `${e.members.length} cell sites here
${e.weight} observation(s)
Zoom in to separate them`
                  : `${c.label ?? c.cell_key}
${c.weight} observation(s)
${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`}
              </title>
            </g>
          );
        })}
        {y ? (
          <g transform={`translate(${28},${i - 14})`}>
            <line x1={0} y1={0} x2={y.px} y2={0} stroke="#94a3b8" strokeWidth={1.5} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="#94a3b8" strokeWidth={1.5} />
            <line x1={y.px} y1={-4} x2={y.px} y2={4} stroke="#94a3b8" strokeWidth={1.5} />
            <text x={y.px / 2} y={-7} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {y.label}
            </text>
          </g>
        ) : null}
      </svg>
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-2 text-[0.6875rem] text-ink-faint">
        {w > 0 ? (
          <span className="rounded bg-canvas/80 px-1.5 py-0.5">
            {w} cluster{w === 1 ? "" : "s"} — zoom to separate
          </span>
        ) : null}
        <span className="rounded bg-canvas/80 px-1.5 py-0.5 tabular-nums">{p.k.toFixed(1)}×</span>
        {p.k !== 1 ? (
          <button
            onClick={j}
            className="pointer-events-auto rounded border border-canvas-border bg-canvas/80 px-1.5 py-0.5 text-ink-muted transition hover:text-ink"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
function _Component(e) {
  let { width: t, height: n } = e;
  let a = Math.floor(t / 60);
  let l = Math.floor(n / 60);
  return (
    <g stroke="#233047" strokeWidth={0.5} strokeOpacity={0.6}>
      {Array.from({
        length: a + 1,
      }).map((e, t) => (
        <line x1={t * 60} y1={0} x2={t * 60} y2={n} key={`v${t}`} />
      ))}
      {Array.from({
        length: l + 1,
      }).map((e, n) => (
        <line x1={0} y1={n * 60} x2={t} y2={n * 60} key={`h${n}`} />
      ))}
    </g>
  );
}
function _Component5() {
  let [e, t] = useState(null);
  let [n, l] = useState(true);
  let [i, c] = useState(null);
  let d = useCallback(async () => {
    l(true);
    c(null);
    try {
      t(await getGeoContradictions());
    } catch (e) {
      c(String(e));
      t(null);
    } finally {
      l(false);
    }
  }, []);
  useEffect(() => {
    d();
  }, [d]);
  if (n) {
    return <TableSkeleton cols={5} rows={5} />;
  } else if (i) {
    return <ErrorAlert>{i}</ErrorAlert>;
  } else if (e) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.75rem] text-ink-muted">
            {e.total === 0
              ? "No contradictions found."
              : `${e.total} contradiction${e.total === 1 ? "" : "s"} across both checks.`}
          </p>
          <button onClick={d} className={buttonClass}>
            <RefreshCw className="h-3.5 w-3.5" />
            Re-run
          </button>
        </div>
        {e.total === 0 ? (
          <EmptyState title="Every record is geographically consistent">
            No subject's cell sites imply an impossible journey, and no transfer sits inside a
            window whose tower observations disagree. That is a result, not an absence of data — the
            thresholds are below.
          </EmptyState>
        ) : null}
        {e.geo_financial_conflict.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Account and handset in different places
            </h3>
            <DataTable head={["Entity", "Transfer", "Amount", "Separation", "What it means"]}>
              {e.geo_financial_conflict.map((e) => (
                <TableRow className="bg-risk-bg/20" key={e.txn_rec}>
                  <TableCell className="mono whitespace-nowrap">
                    <Link
                      href={`/profiles/${e.entity_id}`}
                      className="text-accent-bright hover:underline"
                    >
                      {e.entity_id}
                    </Link>
                  </TableCell>
                  <TableCell className="mono whitespace-nowrap text-ink-faint">
                    {e.txn_rec}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-ink">
                    ₹{e.amount.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-risk">
                    {e.separation_km.toFixed(0)} km
                  </TableCell>
                  <TableCell className="text-ink-muted">{e.detail}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          </section>
        ) : null}
        {e.impossible_travel.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Impossible travel between cell sites
            </h3>
            <DataTable head={["Entity", "From → To", "Distance", "Elapsed", "Implied speed"]}>
              {e.impossible_travel.map((e, t) => (
                <TableRow className="bg-risk-bg/20" key={`${e.entity_id}-${t}`}>
                  <TableCell className="mono whitespace-nowrap">
                    <Link
                      href={`/profiles/${e.entity_id}`}
                      className="text-accent-bright hover:underline"
                    >
                      {e.entity_id}
                    </Link>
                  </TableCell>
                  <TableCell className="mono whitespace-nowrap text-[0.75rem] text-ink-faint">
                    {e.from.cell_key} → {e.to.cell_key}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-ink-muted">
                    {e.distance_km.toFixed(0)} km
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-ink-muted">
                    {(e.elapsed_hours * 60).toFixed(0)} min
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    <span className="text-risk">
                      {e.implied_kmh === null
                        ? "simultaneous"
                        : `${e.implied_kmh.toLocaleString()} km/h`}
                    </span>
                    <span className="text-ink-faint"> / {e.threshold_kmh.toLocaleString()}</span>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          </section>
        ) : null}
        <section className="rounded border border-canvas-border bg-canvas-panel/50 p-3">
          <h3 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            How these were judged
          </h3>
          <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {Object.entries(e.thresholds).map((e) => {
              let [t, n] = e;
              return (
                <div className="flex items-baseline justify-between gap-3" key={t}>
                  <dt className="text-[0.75rem] text-ink-muted">{t.replace(/_/g, " ")}</dt>
                  <dd className="mono text-[0.75rem] tabular-nums text-ink-faint">
                    {typeof n == "number" ? n.toLocaleString() : String(n)}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-faint">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {e.note}
          </p>
        </section>
      </div>
    );
  } else {
    return null;
  }
}
let g = [
  {
    id: "sites",
    label: "Sites",
  },
  {
    id: "movement",
    label: "Movement",
  },
  {
    id: "proximity",
    label: "Proximity",
  },
  {
    id: "contradictions",
    label: "Contradictions",
  },
];
export default function GeoPage() {
  let [e, t] = useState("sites");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cell-site geography"
        description="Positions derived from the mast that served each call. A marker is a tower, not a person — treat the radius of its coverage as the real uncertainty."
      />
      <div
        role="tablist"
        aria-label="Geography view"
        className="inline-flex gap-0.5 rounded border border-canvas-border bg-canvas-panel p-0.5"
      >
        {g.map((n) => (
          <button
            role="tab"
            aria-selected={e === n.id}
            onClick={() => t(n.id)}
            className={
              "focus-ring rounded px-2.5 py-1 text-[0.75rem] uppercase tracking-wider transition " +
              (e === n.id
                ? "bg-canvas-hover text-ink shadow-panel"
                : "text-ink-faint hover:text-ink-muted")
            }
            key={n.id}
          >
            {n.label}
          </button>
        ))}
      </div>
      {e === "sites" ? <_Component2 /> : null}
      {e === "movement" ? <_Component3 /> : null}
      {e === "proximity" ? <_Component4 /> : null}
      {e === "contradictions" ? <_Component5 /> : null}
    </div>
  );
}
function _Component2() {
  let [e, t] = useState([]);
  let [n, r] = useState(null);
  let [i, c] = useState(true);
  let [d, m] = useState(null);
  let x = useCallback(async () => {
    c(true);
    m(null);
    try {
      let e = await getGeoTowers();
      t(e.towers);
    } catch (e) {
      m(String(e));
    } finally {
      c(false);
    }
  }, []);
  useEffect(() => {
    x();
  }, [x]);
  let h = e.map((e) => ({
    cell_key: e.cell_key,
    lat: e.lat,
    lon: e.lon,
    weight: e.call_count,
    label: `Cell ${e.cell_key}`,
  }));
  if (i) {
    return <TableSkeleton cols={6} rows={6} />;
  } else if (d) {
    return <ErrorAlert>{d}</ErrorAlert>;
  } else if (e.length === 0) {
    return (
      <EmptyState title="No positioned cell sites" icon={MapPin}>
        No ingested CDR row carried a tower latitude and longitude. Sites appear here as soon as a
        feed with those columns is loaded.
      </EmptyState>
    );
  } else {
    return (
      <div className="space-y-3">
        <_Component6 sites={h} selectedKey={n} onSelect={(e) => r(e.cell_key)} />
        <DataTable head={["Cell", "LAC", "Calls", "Distinct numbers", "First seen", "Last seen"]}>
          {e.map((e) => {
            return (
              <TableRow
                onClick={() => r(e.cell_key)}
                className={"cursor-pointer " + (n === e.cell_key ? "bg-accent/10" : "")}
                key={e.cell_key}
              >
                <TableCell className="mono whitespace-nowrap text-ink">{e.cell_key}</TableCell>
                <TableCell className="mono text-ink-faint">{e.lac ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-ink-muted">{e.call_count}</TableCell>
                <TableCell className="tabular-nums text-ink-muted">{e.distinct_phones}</TableCell>
                <TableCell className="whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint">
                  {S(e.first_seen)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint">
                  {S(e.last_seen)}
                </TableCell>
              </TableRow>
            );
          })}
        </DataTable>
      </div>
    );
  }
}
function _Component3() {
  let [t, n] = useState([]);
  let [i, c] = useState("");
  let [d, m] = useState(null);
  let [x, h] = useState(false);
  let [f, g] = useState(null);
  let { select: k } = useEvidenceSelectActions();
  useEffect(() => {
    getQueue()
      .then((e) => {
        let t = e.items.map((e) => e.entity_id);
        n(t);
        if (t.length > 0) {
          c((e) => e || t[0]);
        }
      })
      .catch(() => n([]));
  }, []);
  let v = useCallback(async () => {
    if (i) {
      h(true);
      g(null);
      try {
        let e = await getGeoMovement(i);
        m(e);
        k({
          entityId: i,
          origin: "Selected on the geography map",
        });
      } catch (e) {
        g(String(e));
        m(null);
      } finally {
        h(false);
      }
    }
  }, [i, k]);
  useEffect(() => {
    v();
  }, [v]);
  let y =
    (d == null
      ? undefined
      : d.sites.map((e) => ({
          cell_key: e.cell_key,
          lat: e.lat,
          lon: e.lon,
          weight: e.weight,
          label: `Cell ${e.cell_key}`,
        }))) ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">Entity</span>
          <select
            value={i}
            onChange={(e) => c(e.target.value)}
            className="focus-ring mono rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
          >
            {t.length === 0 ? <option value="">No scored entities</option> : null}
            {t.map((e) => (
              <option value={e} key={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <button onClick={v} disabled={!i || x} className={buttonClass}>
          <RefreshCw className={"h-3.5 w-3.5 " + (x ? "animate-spin" : "")} />
          Load track
        </button>
      </div>
      {f ? <ErrorAlert>{f}</ErrorAlert> : null}
      {x ? (
        <TableSkeleton cols={4} rows={5} />
      ) : d && d.points.length !== 0 ? (
        <Fragment>
          <div className="flex flex-wrap gap-4 text-[0.75rem] text-ink-muted">
            <_ label="Observations" value={d.observation_count} />
            <_ label="Distinct sites" value={d.distinct_sites} />
            <_ label="Path (lower bound)" value={`${d.path_km_lower_bound.toFixed(1)} km`} />
          </div>
          <_Component6 sites={y} track={d.points} height={420} />
          <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
            The dashed line joins consecutive observations in time order. It is a{" "}
            <strong>lower bound</strong> on movement, not a route: between two calls the subject may
            have gone anywhere. Marker size is the number of calls served by that site, not time
            spent there.
          </p>
          <DataTable head={["Time", "Number", "Cell", "Type", "Duration"]}>
            {d.points.map((e) => {
              return (
                <TableRow key={e.rec_id}>
                  <TableCell className="whitespace-nowrap tabular-nums text-ink-muted">
                    {S(e.ts)}
                  </TableCell>
                  <TableCell className="mono whitespace-nowrap text-ink-muted">
                    {e.msisdn}
                  </TableCell>
                  <TableCell className="mono whitespace-nowrap text-ink-faint">
                    {e.cell_key}
                  </TableCell>
                  <TableCell className="text-ink-faint">{e.call_type ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-ink-faint">{e.duration_sec}s</TableCell>
                </TableRow>
              );
            })}
          </DataTable>
        </Fragment>
      ) : (
        <EmptyState title="No positioned calls for this entity" icon={MapPin}>
          This person has no call served by a mast with a recorded position.
        </EmptyState>
      )}
    </div>
  );
}
function _Component4() {
  let [e, t] = useState([]);
  let [n, r] = useState("");
  let [d, u] = useState("");
  let [m, x] = useState("");
  let [h, f] = useState(30);
  let [j, g] = useState(2);
  let [k, v] = useState(null);
  let [y, w] = useState(false);
  let [_, C] = useState(null);
  useEffect(() => {
    getGeoTowers()
      .then((e) => {
        t(e.towers);
        let n = e.towers[0];
        if (n) {
          r((e) => e || String(n.lat));
          u((e) => e || String(n.lon));
          if (n.first_seen) {
            x((e) => e || n.first_seen.slice(0, 16));
          }
        }
      })
      .catch(() => t([]));
  }, []);
  let L = async () => {
    let e = Number(n);
    let t = Number(d);
    if (!Number.isFinite(e) || !Number.isFinite(t) || !m) {
      C("Latitude, longitude and a time are all required.");
      return;
    }
    w(true);
    C(null);
    try {
      v(
        await getGeoProximity({
          lat: e,
          lon: t,
          at: new Date(m).toISOString(),
          windowMinutes: h,
          radiusKm: j,
        }),
      );
    } catch (e) {
      C(String(e));
      v(null);
    } finally {
      w(false);
    }
  };
  return (
    <div className="space-y-3">
      <section className="rounded border border-canvas-border bg-canvas-panel/50 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Start from a site
            </span>
            <select
              onChange={(t) => {
                let n = e.find((e) => e.cell_key === t.target.value);
                if (n) {
                  r(String(n.lat));
                  u(String(n.lon));
                }
              }}
              className="focus-ring mono rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
            >
              <option value="">—</option>
              {e.map((e) => (
                <option value={e.cell_key} key={e.cell_key}>
                  {e.cell_key}
                </option>
              ))}
            </select>
          </label>
          <N label="Latitude">
            <input
              value={n}
              onChange={(e) => r(e.target.value)}
              className="focus-ring mono w-28 rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
            />
          </N>
          <N label="Longitude">
            <input
              value={d}
              onChange={(e) => u(e.target.value)}
              className="focus-ring mono w-28 rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
            />
          </N>
          <N label="At">
            <input
              type="datetime-local"
              value={m}
              onChange={(e) => x(e.target.value)}
              className="focus-ring rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
            />
          </N>
          <N label={`± ${h} min`}>
            <input
              type="range"
              min={5}
              max={240}
              step={5}
              value={h}
              onChange={(e) => f(Number(e.target.value))}
              className="focus-ring w-28"
            />
          </N>
          <N label={`${j} km radius`}>
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.5}
              value={j}
              onChange={(e) => g(Number(e.target.value))}
              className="focus-ring w-28"
            />
          </N>
          <button onClick={L} disabled={y} className={primaryButtonClass}>
            {y ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Search
          </button>
        </div>
      </section>
      {_ ? <ErrorAlert>{_}</ErrorAlert> : null}
      {k ? (
        k.subjects.length === 0 ? (
          <EmptyState title="Nobody in range" icon={MapPin}>
            No call inside ±{k.window_minutes} minutes was served by a mast within {k.radius_km} km
            of that point.
          </EmptyState>
        ) : (
          <Fragment>
            <p className="text-[0.75rem] text-ink-muted">
              {k.subjects.length} {k.subjects.length === 1 ? "subject" : "subjects"} across{" "}
              {k.total_observations} observations, within {k.radius_km} km and ±{k.window_minutes}{" "}
              minutes.
            </p>
            <DataTable head={["Subject", "Entity", "Observations", "Closest mast", "Nearest time"]}>
              {k.subjects.map((e) => {
                return (
                  <TableRow key={e.key}>
                    <TableCell className="mono whitespace-nowrap text-ink">{e.msisdn}</TableCell>
                    <TableCell className="mono text-ink-faint">{e.entity_id ?? "—"}</TableCell>
                    <TableCell className="tabular-nums text-ink-muted">{e.observations}</TableCell>
                    <TableCell className="tabular-nums text-ink-muted">
                      {e.closest_km.toFixed(2)} km
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-ink-faint">
                      {S(e.closest_ts)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </DataTable>
            <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
              Distance is measured to the <strong>mast</strong>, not to the person. Two subjects on
              the same tower were inside the same coverage cell — that is a co-location, not a
              meeting, and the cell may span kilometres.
            </p>
          </Fragment>
        )
      ) : null}
    </div>
  );
}
function N(e) {
  let { label: t, children: n } = e;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">{t}</span>
      {n}
    </label>
  );
}
function _(e) {
  let { label: t, value: n } = e;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="tabular-nums font-medium text-ink">{n}</span>
      <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">{t}</span>
    </span>
  );
}
function S(e) {
  if (!e) {
    return "—";
  }
  let t = new Date(e);
  if (Number.isNaN(t.getTime())) {
    return e;
  } else {
    return t.toLocaleString();
  }
}
