"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  min,
  polygonHull,
  select,
  zoom,
} from "d3";
import { useEvidenceSelectActions } from "@/components/evidence/EvidenceSelection";
let i = {
  Phone: "var(--series-1)",
  Device: "var(--series-5)",
  Account: "var(--series-2)",
  SocialHandle: "var(--series-4)",
  Sim: "var(--series-3)",
  Ip: "var(--text-faint)",
  UpiId: "var(--series-2)",
};
let o = {
  high: "var(--band-high)",
  elevated: "var(--band-elevated)",
  low: "var(--band-low)",
};
let c = {
  TRANSFERRED_TO: "var(--series-2)",
  LINKED_TO: "var(--series-4)",
  CONTROLS: "var(--chart-axis)",
  USED_SIM: "var(--series-3)",
  HAS_NUMBER: "var(--series-3)",
  USED_IP: "var(--text-faint)",
  HAS_UPI: "var(--series-2)",
};
let d = {
  high: "var(--band-high)",
  elevated: "var(--band-elevated)",
  low: "var(--text-faint)",
};
function u(e) {
  if (e.labels.includes("Person")) {
    return 7 + (typeof e.props.risk_score == "number" ? e.props.risk_score : 0) * 7;
  } else {
    return 4.5;
  }
}
function p(e) {
  let o = e.props;
  return o.name ?? o.msisdn ?? o.number ?? o.handle ?? o.imei ?? o.addr ?? o.entity_id ?? e.id;
}
function _Component5(e) {
  let { nodes: t, edges: n, clusters: l, selectedId: x, onSelect: m, focusedCluster: f } = e;
  let h = useRef(null);
  let v = useRef(null);
  let b = useRef(null);
  let g = useRef(m);
  useEffect(() => {
    g.current = m;
  }, [m]);
  let y = useMemo(() => {
    return `${t.length}:${n.length}:${t[0]?.id ?? ""}:${t[t.length - 1]?.id ?? ""}`;
  }, [t, n]);
  useEffect(() => {
    if (!h.current) {
      return;
    }
    let e = select(h.current);
    e.selectAll("*").remove();
    let r = h.current.clientWidth || 900;
    let s = h.current.clientHeight || 620;
    let x = t.map((e) => ({
      ...e,
    }));
    let m = new Map(x.map((e) => [e.id, e]));
    let f = n
      .filter((e) => m.has(e.source) && m.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      }));
    let y = l.map((e) => {
      let t = new Set(e.entity_ids.map((e) => `Person:${e}`));
      for (let e of n) {
        if (e.type === "CONTROLS" && t.has(e.source)) {
          t.add(e.target);
        }
      }
      return {
        cluster: e,
        ids: t,
        points: [],
      };
    });
    let k = new Map();
    for (let e of [...y].sort((e, t) => e.ids.size - t.ids.size)) {
      for (let t of e.ids) {
        if (!k.has(t)) {
          k.set(t, e.cluster.id);
        }
      }
    }
    let j = e.append("g");
    let w = j.append("g").attr("class", "hulls");
    let N = j.append("g").attr("class", "links");
    let S = j.append("g").attr("class", "nodes");
    let C = zoom()
      .scaleExtent([0.25, 4])
      .on("zoom", (e) => j.attr("transform", e.transform));
    e.call(C);
    let A = forceSimulation(x)
      .force(
        "link",
        forceLink(f)
          .id((e) => e.id)
          .distance((e) => (e.type === "CONTROLS" ? 34 : 80))
          .strength(0.45),
      )
      .force("charge", forceManyBody().strength(-190))
      .force("center", forceCenter(r / 2, s / 2))
      .force(
        "collide",
        forceCollide((e) => u(e) + 9),
      )
      .force(
        "cluster",
        (function (e, t) {
          let n = [];
          function r(t) {
            let r = new Map();
            for (let t of n) {
              let n = e.get(t.id);
              if (!n || t.x == null || t.y == null) {
                continue;
              }
              let a = r.get(n) ?? {
                x: 0,
                y: 0,
                n: 0,
              };
              a.x += t.x;
              a.y += t.y;
              a.n += 1;
              r.set(n, a);
            }
            for (let e of r.values()) {
              e.x /= e.n;
              e.y /= e.n;
            }
            for (let s of n) {
              let n = e.get(s.id);
              let a = n ? r.get(n) : undefined;
              if (a && s.x != null && s.y != null && s.vx != null && s.vy != null) {
                s.vx += (a.x - s.x) * 0.15 * t;
                s.vy += (a.y - s.y) * 0.15 * t;
              }
            }
          }
          r.initialize = (e) => {
            n = e;
          };
          return r;
        })(k, 0),
      )
      .alphaMin(0.02)
      .alphaDecay(0.045)
      .velocityDecay(0.42);
    let M = w
      .selectAll("path")
      .data(y)
      .join("path")
      .attr("fill", (e) => {
        return d[e.cluster.severity] ?? d.low;
      })
      .attr("fill-opacity", (e) =>
        Math.max(0.03, 0.11 - (e.ids.size / Math.max(x.length, 1)) * 0.09),
      )
      .attr("stroke", (e) => {
        return d[e.cluster.severity] ?? d.low;
      })
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 3")
      .style("pointer-events", "none");
    let _ = w
      .selectAll("text")
      .data(y)
      .join("text")
      .text((e) => e.cluster.label.toUpperCase())
      .attr("font-size", "8.5px")
      .attr("letter-spacing", "0.09em")
      .style("fill", (e) => {
        return d[e.cluster.severity] ?? d.low;
      })
      .attr("fill-opacity", 0.85)
      .style("pointer-events", "none");
    let E = N.selectAll("line")
      .data(f)
      .join("line")
      .style("stroke", (e) => {
        return c[e.type] ?? "var(--chart-grid)";
      })
      .attr("stroke-opacity", (e) => (e.type === "CONTROLS" ? 0.28 : 0.6))
      .attr("stroke-width", (e) => (e.type === "TRANSFERRED_TO" ? 1.5 : 1));
    let R = S.selectAll("g")
      .data(x)
      .join("g")
      .style("cursor", "pointer")
      .call(
        drag()
          .on("start", (e, t) => {
            if (!e.active) {
              A.alphaTarget(0.3).restart();
            }
            t.fx = t.x;
            t.fy = t.y;
          })
          .on("drag", (e, t) => {
            t.fx = e.x;
            t.fy = e.y;
          })
          .on("end", (e, t) => {
            if (!e.active) {
              A.alphaTarget(0);
            }
            t.fx = null;
            t.fy = null;
          }),
      )
      .on("click", (e, t) => {
        var n;
        e.stopPropagation();
        if ((n = g.current) !== null && n !== undefined) {
          n.call(g, t);
        }
      });
    v.current = R;
    R.append("circle")
      .attr("class", "sel-ring")
      .attr("fill", "none")
      .style("stroke", "var(--accent)")
      .attr("stroke-width", 2)
      .attr("r", (e) => u(e) + 4)
      .attr("opacity", 0);
    R.append("circle")
      .attr("class", "node-dot")
      .attr("r", u)
      .attr("stroke-width", 1)
      .style("stroke", "var(--bg-color)")
      .style("fill", (e) => {
        if (e.labels.includes("Person")) {
          return o[String(e.props.band ?? "low")] ?? o.low;
        } else {
          return i[e.labels[0]] ?? "var(--text-faint)";
        }
      });
    R.filter((e) => e.labels.includes("Person"))
      .append("text")
      .text((e) => p(e))
      .attr("x", (e) => u(e) + 4)
      .attr("y", 3)
      .attr("font-size", "8.5px")
      .style("fill", "var(--text-secondary)")
      .style("pointer-events", "none");
    R.append("title").text(
      (e) => `${e.labels.join(":")}
${p(e)}`,
    );
    A.on("tick", () => {
      E.attr("x1", (e) => e.source.x)
        .attr("y1", (e) => e.source.y)
        .attr("x2", (e) => e.target.x)
        .attr("y2", (e) => e.target.y);
      R.attr("transform", (e) => `translate(${e.x},${e.y})`);
      for (let t of y) {
        var e;
        let n = [];
        for (let e of x) {
          if (t.ids.has(e.id) && e.x != null && e.y != null) {
            let t = u(e) + 10;
            n.push([e.x - t, e.y - t], [e.x + t, e.y - t], [e.x + t, e.y + t], [e.x - t, e.y + t]);
          }
        }
        t.points = n.length >= 3 && (e = polygonHull(n)) !== null && e !== undefined ? e : [];
      }
      M.attr("d", (e) =>
        e.points.length ? `M${e.points.map((e) => e.join(",")).join("L")}Z` : null,
      );
      _.attr("x", (e) => (e.points.length ? min(e.points, (e) => e[0]) + 4 : -9999)).attr(
        "y",
        (e) => (e.points.length ? min(e.points, (e) => e[1]) - 5 : -9999),
      );
    });
    A.on("end", () => A.stop());
    e.on("click", (e) => {
      var t;
      if (e.target === h.current) {
        if ((t = g.current) !== null && t !== undefined) {
          t.call(g, null);
        }
      }
    });
    b.current = M;
    return () => {
      A.stop();
      v.current = null;
      b.current = null;
    };
  }, [y]);
  useEffect(() => {
    let e = v.current;
    if (!e) {
      return;
    }
    let t = f ? l.find((e) => e.id === f) : null;
    let n = new Set(t ? t.entity_ids.map((e) => `Person:${e}`) : []);
    e.select("circle.sel-ring").attr("opacity", (e) => (x && e.id === x ? 1 : 0));
    e.attr("opacity", (e) => (!t || n.has(e.id) ? 1 : 0.22));
  }, [x, f, l, y]);
  return (
    <svg ref={h} className="h-full w-full" role="img" aria-label="Multi-source evidence graph" />
  );
}
export function EvidenceGraphPanel(e) {
  let { nodes: n, edges: a, clusters: i } = e;
  let [o, c] = useState(null);
  let [d, u] = useState(null);
  let { select: m } = useEvidenceSelectActions();
  let h = useCallback(
    (e) => {
      c(e);
      if (!e) {
        return m(null);
      }
      let t =
        e.labels.includes("Person") && e.props.entity_id ? String(e.props.entity_id) : undefined;
      m({
        entityId: t,
        labels: e.labels,
        props: t ? undefined : e.props,
        band: typeof e.props.band == "string" ? e.props.band : null,
        riskScore: typeof e.props.risk_score == "number" ? e.props.risk_score : null,
        origin: "Selected in the evidence graph",
      });
    },
    [m],
  );
  useEffect(() => () => m(null), [m]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <_Component5
          nodes={n}
          edges={a}
          clusters={i}
          selectedId={(o == null ? undefined : o.id) ?? null}
          onSelect={h}
          focusedCluster={d}
        />
        {o ? (
          <div className="absolute left-3 top-3 max-w-[15rem] rounded border border-canvas-border bg-canvas-raised/95 p-2.5 shadow-raised">
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="eyebrow">Resolved entity</span>
              <button
                onClick={() => h(null)}
                aria-label="Close entity detail"
                className="focus-ring -mt-0.5 text-ink-faint hover:text-ink"
              >
                ×
              </button>
            </div>
            <p className="truncate text-[0.8125rem] font-medium text-ink">{p(o)}</p>
            <p className="mono mt-0.5 text-[0.6875rem] text-ink-faint">{o.labels.join(" · ")}</p>
            {typeof o.props.risk_score == "number" ? (
              <p className="mt-1.5 text-[0.75rem] text-ink-muted">
                Risk {o.props.risk_score.toFixed(2)}{" "}
                <span className="text-ink-faint">({String(o.props.band)})</span>
              </p>
            ) : null}
            {o.props.member_count ? (
              <p className="text-[0.75rem] text-ink-muted">
                {String(o.props.member_count)} linked identifiers
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <_Component6 clusters={i} focused={d} onFocus={u} />
    </div>
  );
}
function _Component6(e) {
  let { clusters: t, focused: n, onFocus: s } = e;
  return (
    <div className="shrink-0 space-y-2 border-t border-canvas-border px-3 pb-1 pt-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {[
          ["TRANSFERRED_TO", "Money movement"],
          ["CONTROLS", "Controls identifier"],
          ["LINKED_TO", "Social link"],
        ].map((e) => {
          let [t, n] = e;
          return (
            <span className="flex items-center gap-1.5 text-[0.6875rem] text-ink-muted" key={t}>
              <span
                aria-hidden={true}
                className="h-px w-4"
                style={{
                  backgroundColor: c[t],
                }}
              />
              {n}
            </span>
          );
        })}
        <span className="ml-auto flex items-center gap-x-3">
          {["high", "elevated", "low"].map((e) => (
            <span className="flex items-center gap-1.5 text-[0.6875rem] text-ink-muted" key={e}>
              <span
                aria-hidden={true}
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: o[e],
                }}
              />
              {e}
            </span>
          ))}
        </span>
      </div>
      {t.length ? (
        <div className="flex flex-wrap gap-1.5">
          {t.map((e) => {
            let t = n === e.id;
            return (
              <button
                onClick={() => s(t ? null : e.id)}
                aria-pressed={t}
                title={e.evidence}
                className={
                  "focus-ring rounded border px-1.5 py-0.5 text-[0.6875rem] transition " +
                  (t
                    ? "border-accent/50 bg-accent/10 text-accent-bright"
                    : "border-canvas-border text-ink-muted hover:border-canvas-border-strong hover:text-ink")
                }
                key={e.id}
              >
                <span
                  aria-hidden={true}
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{
                    backgroundColor: d[e.severity],
                  }}
                />
                {e.label}
                <span className="ml-1 text-ink-faint">{e.size}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
