"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
} from "d3";
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Camera,
  LoaderCircle,
  Network,
  PhoneCall,
  RefreshCw,
  Route,
  Share2,
  Wifi,
  Zap,
} from "lucide-react";
import { useEvidenceSelectActions } from "@/components/evidence/EvidenceSelection";
import { RiskBadge } from "@/components/RiskBadge";
import {
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import { getGraphNetwork, getGraphPaths, getImeiPersistence, getSubgraph } from "@/lib/api";
import * as utils from "@/lib/utils";
import { cn } from "@/lib/utils";
let h = {
  Person: "#38bdf8",
  Phone: "#7dd3fc",
  Device: "#a78bfa",
  Sim: "#818cf8",
  Account: "#34d399",
  UpiId: "#6ee7b7",
  Ip: "#94a3b8",
  SocialHandle: "#f472b6",
};
let x = {
  high: "#d97706",
  elevated: "#38bdf8",
  low: "#475569",
};
function p(e) {
  if (e.labels.includes("Person")) {
    return 8 + (typeof e.props.risk_score == "number" ? e.props.risk_score : 0) * 6;
  } else {
    return 6;
  }
}
function _Component4(e) {
  let { nodes: t, edges: n, riskIds: s, colorByBand: l, selectedId: i, onSelect: o } = e;
  let c = useRef(null);
  let d = useRef(null);
  let m = useRef(o);
  useEffect(() => {
    m.current = o;
  }, [o]);
  let b = useMemo(() => {
    let e = t.length ? t[0].id : "";
    let r = t.length ? t[t.length - 1].id : "";
    return `${t.length}:${n.length}:${e}:${r}`;
  }, [t, n]);
  useEffect(() => {
    if (!c.current) {
      return;
    }
    let e = select(c.current);
    e.selectAll("*").remove();
    let r = c.current.clientWidth || 800;
    let a = c.current.clientHeight || 600;
    let s = t.map((e) => ({
      ...e,
    }));
    let l = new Map(s.map((e) => [e.id, e]));
    let i = n
      .filter((e) => l.has(e.source) && l.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      }));
    let o = e.append("g");
    let h = zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (e) => o.attr("transform", e.transform));
    e.call(h);
    let x = forceSimulation(s)
      .force(
        "link",
        forceLink(i)
          .id((e) => e.id)
          .distance(70)
          .strength(0.4),
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(r / 2, a / 2))
      .force("collide", forceCollide(22))
      .alphaMin(0.02)
      .alphaDecay(0.045)
      .velocityDecay(0.42);
    let b = o
      .append("g")
      .attr("stroke", "#233047")
      .attr("stroke-width", 1)
      .selectAll("line")
      .data(i)
      .join("line");
    let g = o
      .append("g")
      .selectAll("g")
      .data(s)
      .join("g")
      .style("cursor", "pointer")
      .call(
        drag()
          .on("start", (e, t) => {
            if (!e.active) {
              x.alphaTarget(0.3).restart();
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
              x.alphaTarget(0);
            }
            t.fx = null;
            t.fy = null;
          }),
      )
      .on("click", (e, t) => {
        var n;
        e.stopPropagation();
        if ((n = m.current) !== null && n !== undefined) {
          n.call(m, t);
        }
      });
    d.current = g;
    g.append("circle")
      .attr("class", "sel-ring")
      .attr("fill", "none")
      .attr("stroke", "#38bdf8")
      .attr("stroke-width", 2)
      .attr("r", (e) => p(e) + 4)
      .attr("opacity", 0);
    g.append("circle").attr("class", "node-dot").attr("r", p).attr("stroke-width", 1.5);
    g.append("text")
      .text((e) => f(e))
      .attr("x", 11)
      .attr("y", 3)
      .attr("font-size", "9px")
      .attr("fill", "#94a3b8")
      .attr("font-family", "var(--font-plex-mono), monospace");
    g.append("title").text(
      (e) => `${e.labels.join(":")}
${f(e)}`,
    );
    x.on("tick", () => {
      b.attr("x1", (e) => e.source.x)
        .attr("y1", (e) => e.source.y)
        .attr("x2", (e) => e.target.x)
        .attr("y2", (e) => e.target.y);
      g.attr("transform", (e) => `translate(${e.x},${e.y})`);
    });
    x.on("end", () => x.stop());
    e.on("click", (e) => {
      var t;
      if (e.target === c.current) {
        if ((t = m.current) !== null && t !== undefined) {
          t.call(m, null);
        }
      }
    });
    return () => {
      x.stop();
      d.current = null;
    };
  }, [b]);
  useEffect(() => {
    let e = d.current;
    if (e) {
      e.select("circle.node-dot")
        .attr("fill", (e) => {
          if (s == null ? undefined : s.has(e.id)) {
            return "#d97706";
          } else if (l && e.labels.includes("Person") && typeof e.props.band == "string") {
            return x[e.props.band] ?? h.Person;
          } else {
            return h[e.labels[0]] ?? "#64748b";
          }
        })
        .attr("stroke", (e) =>
          (s == null ? undefined : s.has(e.id)) || (l && e.props.band === "high")
            ? "#7c4a12"
            : "#0f172a",
        );
      e.select("circle.sel-ring").attr("opacity", (e) => (i && e.id === i ? 1 : 0));
    }
  }, [s, l, i, b]);
  return <svg ref={c} className="h-full w-full" />;
}
function f(e) {
  let i = e.props;
  return i.msisdn ?? i.imei ?? i.number ?? i.handle ?? i.addr ?? i.entity_id ?? e.id;
}
let g = Zap;
let j = PhoneCall;
let A = {
  CALL_THEN_DEBIT: {
    label: "Call, then debit",
    colour: "#dc2626",
    icon: g,
    rank: 0,
    describe: (e) =>
      `${e.count} occasion(s) where a call from ${e.source} was followed by money leaving ${e.target} inside the correlation window. Neither the bank nor the telco sees this alone.`,
  },
  MONEY_TO: {
    label: "Money moved",
    colour: "#d97706",
    icon: Banknote,
    rank: 1,
    describe: (e) =>
      `${e.count} transfer(s) totalling ₹${e.value.toLocaleString("en-IN", {
        maximumFractionDigits: 0,
      })} from an account ${e.source} controls to one ${e.target} controls.`,
  },
  SHARED_DEVICE: {
    label: "Shared handset",
    colour: "#a855f7",
    icon: Share2,
    rank: 2,
    describe: (e) => `One handset reaches both. ${e.detail}`,
  },
  SHARED_IP: {
    label: "Shared address",
    colour: "#8b5cf6",
    icon: Wifi,
    rank: 3,
    describe: (e) =>
      `Both were seen on the same address. ${e.detail} — common infrastructure is weak on its own.`,
  },
  SEEN_AT: {
    label: "Same camera",
    colour: "#0891b2",
    icon: Camera,
    rank: 4,
    describe: (e) =>
      `Vehicles registered to both were read by the same camera. ${e.detail} — a camera a vehicle passes routinely places nobody anywhere.`,
  },
  CALLED: {
    label: "Called",
    colour: "#64748b",
    icon: j,
    rank: 5,
    describe: (e) =>
      `${e.count} call(s) placed by ${e.source} to ${e.target}, ${Math.round(e.value / 60)} minutes in total.`,
  },
};
let E = Object.keys(A).sort((e, t) => A[e].rank - A[t].rank);
let z = {
  high: "#d97706",
  elevated: "#38bdf8",
  low: "#64748b",
};
function P() {
  let [e, t] = useState([]);
  let [n, s] = useState([]);
  let [l, i] = useState({});
  let [o, d] = useState(true);
  let [h, x] = useState(null);
  let [p, m] = useState(() => new Set(E.filter((e) => e !== "CALLED")));
  let [f, b] = useState(null);
  let [g, v] = useState(null);
  let [k, y] = useState("");
  let [j, C] = useState("");
  let [P, H] = useState(null);
  let [I, L] = useState(false);
  let { select: T } = useEvidenceSelectActions();
  let O = useRef(null);
  let B = useRef(null);
  let [F, V] = useState(880);
  useEffect(() => {
    getGraphNetwork()
      .then((e) => {
        t(e.nodes);
        s(e.edges);
        i(e.by_type);
        let n = [...e.nodes].sort((e, t) => {
          return (t.risk_score ?? 0) - (e.risk_score ?? 0);
        });
        if (n[0]) {
          y(n[0].entity_id);
        }
        if (n[1]) {
          C(n[1].entity_id);
        }
      })
      .catch((e) => x(e instanceof Error ? e.message : String(e)))
      .finally(() => d(false));
  }, []);
  useEffect(() => {
    let e = B.current;
    if (!e) {
      return;
    }
    let t = new ResizeObserver((e) => {
      let [t] = e;
      return V(Math.max(320, t.contentRect.width));
    });
    t.observe(e);
    return () => t.disconnect();
  }, []);
  let W = useMemo(() => n.filter((e) => p.has(e.type)), [n, p]);
  let U = useMemo(() => {
    let t = P == null ? undefined : P[0];
    if (t) {
      return new Set([t.hops[0]?.from, ...t.hops.map((e) => e.to)].filter(Boolean));
    } else {
      return new Set();
    }
  }, [P]);
  let Y = useMemo(() => {
    let e = P == null ? undefined : P[0];
    if (e) {
      return new Set(e.hops.map((e) => [e.type, e.from, e.to].sort().join("|")));
    } else {
      return new Set();
    }
  }, [P]);
  useEffect(() => {
    let t = O.current;
    if (!t) {
      return;
    }
    let n = select(t);
    n.selectAll("*").remove();
    if (!e.length) {
      return;
    }
    let r = e.filter((e) => W.some((t) => t.source === e.entity_id || t.target === e.entity_id));
    if (!r.length) {
      return;
    }
    let a = r.map((e) => ({
      ...e,
    }));
    let s = new Map(a.map((e) => [e.entity_id, e]));
    let l = W.filter((e) => s.has(e.source) && s.has(e.target)).map((e) => ({
      ...e,
    }));
    let i = n.append("g");
    let o = n.append("defs");
    for (let e of E) {
      o.append("marker")
        .attr("id", `arrow-${e}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L9,0L0,4")
        .attr("fill", A[e].colour)
        .attr("opacity", 0.75);
    }
    let c = i
      .append("g")
      .selectAll("line")
      .data(l)
      .join("line")
      .attr("stroke", (e) => A[e.type].colour)
      .attr("stroke-opacity", (e) =>
        Y.size
          ? Y.has([e.type, e.source, e.target].sort().join("|"))
            ? 0.95
            : 0.1
          : e.type === "CALLED"
            ? 0.25
            : 0.6,
      )
      .attr("stroke-width", (e) => Math.min(4, 0.8 + Math.log1p(e.count)))
      .attr("marker-end", (e) => (e.directed ? `url(#arrow-${e.type})` : null))
      .style("cursor", "pointer")
      .on("click", (e, t) => {
        b(t);
        v(null);
      });
    c.append("title").text((e) => `${A[e.type].label} · ${e.count}`);
    let d = i
      .append("g")
      .selectAll("g")
      .data(a)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (e, t) => {
        v(t);
        b(null);
        T({
          entityId: t.entity_id,
          band: t.band,
          riskScore: t.risk_score,
          origin: "Selected in the behavioural network",
        });
      })
      .call(
        drag()
          .on("start", (e, t) => {
            if (!e.active) {
              h.alphaTarget(0.25).restart();
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
              h.alphaTarget(0);
            }
            t.fx = null;
            t.fy = null;
          }),
      );
    d.append("circle")
      .attr("r", (e) => 6 + Math.min(10, Math.sqrt(e.degree) * 2.2))
      .attr("fill", (e) => {
        return z[e.band ?? "low"] ?? z.low;
      })
      .attr("stroke", (e) => (U.has(e.entity_id) ? "#f8fafc" : "rgba(15,23,42,0.55)"))
      .attr("stroke-width", (e) => (U.has(e.entity_id) ? 2.5 : 1))
      .attr("opacity", (e) => (U.size && !U.has(e.entity_id) ? 0.28 : 1));
    d.append("text")
      .text((e) => e.entity_id)
      .attr("x", 0)
      .attr("y", (e) => -(10 + Math.min(10, Math.sqrt(e.degree) * 2.2)))
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-family", "var(--font-jetbrains-mono), monospace")
      .attr("fill", "currentColor")
      .attr("opacity", (e) => (U.size && !U.has(e.entity_id) ? 0.3 : 0.75))
      .style("pointer-events", "none");
    let h = forceSimulation(a)
      .force(
        "link",
        forceLink(l)
          .id((e) => e.entity_id)
          .distance((e) => (e.type === "CALLED" ? 130 : 80))
          .strength(0.35),
      )
      .force("charge", forceManyBody().strength(-360))
      .force("center", forceCenter(F / 2, 230))
      .force(
        "collide",
        forceCollide().radius((e) => 18 + e.degree * 0.4),
      )
      .on("tick", () => {
        c.attr("x1", (e) => {
          return e.source.x ?? 0;
        })
          .attr("y1", (e) => {
            return e.source.y ?? 0;
          })
          .attr("x2", (e) => {
            return e.target.x ?? 0;
          })
          .attr("y2", (e) => {
            return e.target.y ?? 0;
          });
        d.attr("transform", (e) => {
          return `translate(${e.x ?? 0},${e.y ?? 0})`;
        });
      });
    let x = zoom()
      .scaleExtent([0.4, 4])
      .on("zoom", (e) => i.attr("transform", e.transform.toString()));
    n.call(x);
    return () => {
      h.stop();
    };
  }, [e, W, F, U, Y, T]);
  let X = useCallback(async () => {
    if (k && j && k !== j) {
      L(true);
      x(null);
      try {
        let e = await getGraphPaths(k, j);
        H(e.paths);
      } catch (e) {
        x(e instanceof Error ? e.message : String(e));
        H(null);
      } finally {
        L(false);
      }
    }
  }, [k, j]);
  if (h) {
    return <ErrorAlert>{h}</ErrorAlert>;
  } else if (o) {
    return (
      <div className="flex items-center gap-2 py-10 text-[0.8125rem] text-ink-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden={true} />
        Building the behavioural network…
      </div>
    );
  } else {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            Relations
          </span>
          {E.filter((e) => l[e]).map((e) => {
            let t = A[e];
            let n = p.has(e);
            let _Component = t.icon;
            return (
              <button
                type="button"
                aria-pressed={n}
                onClick={() =>
                  m((t) => {
                    let n = new Set(t);
                    if (n.has(e)) {
                      n.delete(e);
                    } else {
                      n.add(e);
                    }
                    return n;
                  })
                }
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[0.6875rem] transition",
                  n
                    ? "border-canvas-border-strong bg-canvas-hover text-ink"
                    : "border-canvas-border text-ink-faint hover:text-ink-muted",
                )}
                key={e}
              >
                <span
                  aria-hidden={true}
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: t.colour,
                    opacity: n ? 1 : 0.4,
                  }}
                />
                <_Component className="h-3 w-3" aria-hidden={true} />
                {t.label}
                <span className="tabular-nums text-ink-faint">{l[e]}</span>
              </button>
            );
          })}
        </div>
        <div className="rounded border border-canvas-border bg-canvas-panel/50 p-3">
          <h3 className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
            <Route className="h-3.5 w-3.5 text-ink-faint" aria-hidden={true} />
            How are these two connected?
          </h3>
          <p className="mb-2 mt-0.5 text-[0.75rem] leading-relaxed text-ink-faint">
            The question a network is actually asked. Routes come back shortest first, and every hop
            names the rows behind it.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <_Component2 label="From" value={k} onChange={y} nodes={e} />
            <ArrowRight className="mb-2 h-3.5 w-3.5 text-ink-faint" aria-hidden={true} />
            <_Component2 label="To" value={j} onChange={C} nodes={e} />
            <button
              type="button"
              onClick={X}
              disabled={I || !k || !j || k === j}
              className={primaryButtonClass}
            >
              {I ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
              ) : (
                <Route className="h-3.5 w-3.5" aria-hidden={true} />
              )}
              Trace
            </button>
            {P ? (
              <button type="button" onClick={() => H(null)} className={buttonClass}>
                Clear
              </button>
            ) : null}
          </div>
          {P ? (
            P.length === 0 ? (
              <p className="mt-2.5 rounded border border-canvas-border bg-canvas-raised px-3 py-2 text-[0.75rem] leading-relaxed text-ink-muted">
                No route within 4 hops. That is a real answer: on this evidence these two are not
                connected, and nothing here should be read as implying otherwise.
              </p>
            ) : (
              <ol className="mt-2.5 space-y-2">
                {P.map((e, t) => {
                  return (
                    <li
                      className={cn(
                        "rounded border px-2.5 py-2",
                        t === 0
                          ? "border-accent/40 bg-accent/[0.05]"
                          : "border-canvas-border bg-canvas-raised",
                      )}
                      key={t}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem]">
                        <span className="text-[0.625rem] uppercase tracking-wider text-ink-faint">
                          {e.length} hop{e.length === 1 ? "" : "s"}
                        </span>
                        <span className="mono text-ink">{e.hops[0]?.from}</span>
                        {e.hops.map((e, t) => (
                          <span className="flex items-center gap-1.5" key={t}>
                            <span
                              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[0.625rem]"
                              style={{
                                color: A[e.type].colour,
                                background: `${A[e.type].colour}1a`,
                              }}
                              title={
                                e.directed && !e.along_direction
                                  ? "This edge runs the other way; the route walks it backwards."
                                  : undefined
                              }
                            >
                              {A[e.type].label}
                              {e.directed && !e.along_direction ? " ←" : ""}
                            </span>
                            <span className="mono text-ink">{e.to}</span>
                          </span>
                        ))}
                      </div>
                      {e.hops.some((e) => e.detail) ? (
                        <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-faint">
                          {e.hops
                            .filter((e) => e.detail)
                            .map((e) => e.detail)
                            .join(" · ")}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[0.625rem] text-ink-faint">
                        Cites {e.rec_ids.length} source row(s):{" "}
                        <span className="mono">
                          {e.rec_ids.slice(0, 6).join(", ")}
                          {e.rec_ids.length > 6 ? "…" : ""}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ol>
            )
          ) : null}
        </div>
        <div
          ref={B}
          className="relative overflow-hidden rounded border border-canvas-border bg-canvas-panel"
        >
          <svg
            ref={O}
            width={F}
            height={460}
            className="block text-ink-muted"
            role="img"
            aria-label="Behavioural network between resolved people"
          />
          <p className="pointer-events-none absolute bottom-2 left-3 text-[0.625rem] text-ink-faint">
            Node size = number of distinct relations · colour = model band · drag to rearrange,
            scroll to zoom
          </p>
        </div>
        {f ? <R edge={f} onClose={() => b(null)} /> : null}
        {g ? (
          <D
            node={g}
            edges={n}
            onClose={() => v(null)}
            onTrace={(e) => {
              y(g.entity_id);
              C(e);
            }}
          />
        ) : null}
        <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
          An edge is a behaviour the records demonstrate, not a conclusion about a relationship.
          Shared infrastructure is weak and common; a call followed by a debit is not. They are
          drawn differently because they mean different things, and averaging them into a single
          notion of “connected” would destroy the only signal worth having.
        </p>
      </div>
    );
  }
}
function _Component2(e) {
  let { label: t, value: n, onChange: a, nodes: s } = e;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.625rem] uppercase tracking-wider text-ink-faint">{t}</span>
      <select
        value={n}
        onChange={(e) => a(e.target.value)}
        className="focus-ring mono rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
      >
        {s.map((e) => (
          <option value={e.entity_id} key={e.entity_id}>
            {e.entity_id}
            {e.band ? ` — ${e.band}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
function R(e) {
  let { edge: t, onClose: n } = e;
  let a = A[t.type];
  let _Component3 = a.icon;
  return (
    <section className="animate-fade-in rounded border border-canvas-border bg-canvas-panel p-3">
      <div className="flex items-start justify-between gap-3">
        <h3
          className="flex items-center gap-2 text-[0.8125rem] font-medium"
          style={{
            color: a.colour,
          }}
        >
          <_Component3 className="h-3.5 w-3.5" aria-hidden={true} />
          {a.label}
          <span className="mono text-ink">
            {t.source} {t.directed ? "→" : "↔"} {t.target}
          </span>
        </h3>
        <button
          type="button"
          onClick={n}
          className="focus-ring text-[0.6875rem] text-ink-faint hover:text-ink"
        >
          Close
        </button>
      </div>
      <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-muted">{a.describe(t)}</p>
      {t.rec_ids.length > 0 ? (
        <Fragment>
          <h4 className="mt-2 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
            Source rows behind this edge
          </h4>
          <div className="mt-1 flex flex-wrap gap-1">
            {t.rec_ids.map((e) => (
              <span
                className="mono rounded border border-canvas-border px-1.5 py-0.5 text-[0.6875rem] text-ink-muted"
                key={e}
              >
                {e}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[0.625rem] leading-relaxed text-ink-faint">
            Each id resolves to a hash-chained record. This edge can be re-hashed rather than taken
            on trust.
          </p>
        </Fragment>
      ) : (
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
          This edge is structural — it comes from identifiers two people share rather than from a
          dated event, so there is no single row to cite.
        </p>
      )}
    </section>
  );
}
function D(e) {
  let { node: n, edges: a, onClose: l, onTrace: i } = e;
  let o = a
    .filter((e) => e.source === n.entity_id || e.target === n.entity_id)
    .sort((e, t) => A[e.type].rank - A[t.type].rank || t.count - e.count);
  return (
    <section className="animate-fade-in rounded border border-canvas-border bg-canvas-panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
            <span className="mono">{n.entity_id}</span>
            {n.name ? <span className="text-ink-muted">{n.name}</span> : null}
            {n.band ? <RiskBadge band={n.band} score={n.risk_score ?? undefined} /> : null}
          </h3>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.6875rem] text-ink-faint">
            <span>{n.degree} relation(s)</span>
            <span>{n.accounts} account(s)</span>
            <span>{n.phones} phone(s)</span>
            <span>{n.devices} device(s)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/profiles/${n.entity_id}`}
            className="focus-ring rounded border border-canvas-border px-2 py-1 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
          >
            Open dossier
          </Link>
          <button
            type="button"
            onClick={l}
            className="focus-ring text-[0.6875rem] text-ink-faint hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>
      {o.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {o.slice(0, 8).map((e, t) => {
            let a = e.source === n.entity_id ? e.target : e.source;
            let s = A[e.type];
            return (
              <li
                className="flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-muted"
                key={t}
              >
                <span
                  className="rounded px-1.5 py-0.5 text-[0.625rem]"
                  style={{
                    color: s.colour,
                    background: `${s.colour}1a`,
                  }}
                >
                  {s.label}
                </span>
                <span className="mono text-ink">{a}</span>
                <span className="text-ink-faint">{e.count} row(s)</span>
                <button
                  type="button"
                  onClick={() => i(a)}
                  className="focus-ring ml-auto text-[0.625rem] text-accent-bright hover:underline"
                >
                  trace route
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
let H = [100, 250, 500, 1000, 2000];
export default function GraphPage() {
  let [t, n] = useState("behaviour");
  let [s, d] = useState(null);
  let [u, h] = useState(new Map());
  let [x, p] = useState(null);
  let { select: f } = useEvidenceSelectActions();
  let [b, g] = useState(true);
  let [v, k] = useState(null);
  let [y, j] = useState(500);
  let [w, N] = useState("all");
  let [C, Z] = useState(() => new Set());
  let [A, E] = useState(false);
  let z = useCallback(async (e) => {
    g(true);
    k(null);
    try {
      let [t, n] = await Promise.all([getSubgraph(e), getImeiPersistence(3)]);
      d(t);
      h(new Map(n.devices.map((e) => [e.imei, e.sim_count])));
    } catch (e) {
      k(String(e));
    } finally {
      g(false);
    }
  }, []);
  useEffect(() => {
    if (t === "identity") {
      z(y);
    }
  }, [z, y, t]);
  let q = useMemo(() => {
    let t = new Set();
    for (let n of (s == null ? undefined : s.nodes) ?? []) {
      for (let e of n.labels) {
        t.add(e);
      }
    }
    return [...t].sort();
  }, [s]);
  let R = useMemo(() => {
    if (!s) {
      return {
        nodes: [],
        edges: [],
      };
    }
    let e = (e) => {
      if (w === "all" || !e.labels.includes("Person")) {
        return true;
      }
      let t = typeof e.props.band == "string" ? e.props.band : "low";
      if (w === "high") {
        return t === "high";
      } else {
        return t === "high" || t === "elevated";
      }
    };
    let t = s.nodes.filter((t) => !t.labels.some((e) => C.has(e)) && e(t));
    let n = new Set(t.map((e) => e.id));
    let r = s.edges.filter((e) => n.has(e.source) && n.has(e.target));
    if (A) {
      let e = new Set();
      for (let t of r) {
        e.add(t.source);
        e.add(t.target);
      }
      n = new Set((t = t.filter((t) => e.has(t.id))).map((e) => e.id));
      r = r.filter((e) => n.has(e.source) && n.has(e.target));
    }
    return {
      nodes: t,
      edges: r,
    };
  }, [s, w, C, A]);
  let D = useCallback((e) => {
    Z((t) => {
      let n = new Set(t);
      if (n.has(e)) {
        n.delete(e);
      } else {
        n.add(e);
      }
      return n;
    });
  }, []);
  let I = useCallback(() => {
    N("all");
    Z(new Set());
    E(false);
  }, []);
  let L = useMemo(() => {
    let e = new Map();
    if (!s) {
      return e;
    }
    for (let t of s.nodes) {
      if (!t.labels.includes("Device")) {
        continue;
      }
      let n = u.get(String(t.props.imei));
      if (n != null) {
        e.set(t.id, n);
      }
    }
    return e;
  }, [s, u]);
  let B = useMemo(() => new Set(L.keys()), [L]);
  let F = useCallback(
    (e) => {
      p(e);
      if (!e) {
        return f(null);
      }
      let t =
        e.labels.includes("Person") && e.props.entity_id ? String(e.props.entity_id) : undefined;
      f({
        entityId: t,
        labels: e.labels,
        props: t ? undefined : e.props,
        band: typeof e.props.band == "string" ? e.props.band : null,
        riskScore: typeof e.props.risk_score == "number" ? e.props.risk_score : null,
        origin: "Selected in the knowledge graph",
      });
    },
    [f],
  );
  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Knowledge graph"
        description={
          t === "behaviour"
            ? "What the records say these people did to each other — money moved, calls placed, and the call-then-debit join neither the bank nor the telco can see alone. Every edge carries the rows behind it, so a link can be re-hashed rather than believed."
            : "Person · Phone · Device · Sim · Account · UPI · IP · SocialHandle. Person nodes are sized by risk score; amber marks a high-risk person or a device seen with 3+ SIMs. Click a node to inspect it — a scored person links through to its assessment."
        }
        actions={
          t === "identity" ? (
            <button onClick={() => z(y)} className={buttonClass}>
              <RefreshCw className={"h-3.5 w-3.5 " + (b ? "animate-spin" : "")} />
              Reload
            </button>
          ) : null
        }
      />
      <div
        role="tablist"
        aria-label="Graph view"
        className="inline-flex gap-0.5 self-start rounded border border-canvas-border bg-canvas-panel p-0.5"
      >
        <button
          role="tab"
          aria-selected={t === "behaviour"}
          onClick={() => n("behaviour")}
          className={
            "focus-ring inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[0.75rem] uppercase tracking-wider transition " +
            (t === "behaviour"
              ? "bg-canvas-hover text-ink shadow-panel"
              : "text-ink-faint hover:text-ink-muted")
          }
        >
          <Network className="h-3.5 w-3.5" aria-hidden={true} />
          Behaviour
        </button>
        <button
          role="tab"
          aria-selected={t === "identity"}
          onClick={() => n("identity")}
          className={
            "focus-ring inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[0.75rem] uppercase tracking-wider transition " +
            (t === "identity"
              ? "bg-canvas-hover text-ink shadow-panel"
              : "text-ink-faint hover:text-ink-muted")
          }
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden={true} />
          Identity
        </button>
      </div>
      {v && t === "identity" ? <ErrorAlert>{v}</ErrorAlert> : null}
      {t === "behaviour" ? <P /> : null}
      {t === "identity" ? (
        <Fragment>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-canvas-border bg-canvas-panel px-3 py-2 text-[0.75rem]">
            <label className="flex items-center gap-1.5">
              <span className="text-ink-faint">Nodes</span>
              <select
                value={y}
                onChange={(e) => j(Number(e.target.value))}
                className="rounded border border-canvas-border bg-canvas-raised px-1.5 py-0.5 text-ink"
                title="How many nodes to request from the API"
              >
                {H.map((e) => (
                  <option value={e} key={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-ink-faint">Risk</span>
              <div className="flex overflow-hidden rounded border border-canvas-border">
                {[
                  ["all", "All"],
                  ["elevated", "Elevated+"],
                  ["high", "High"],
                ].map((e) => {
                  let [t, n] = e;
                  return (
                    <button
                      onClick={() => N(t)}
                      aria-pressed={w === t}
                      className={
                        "px-2 py-0.5 transition " +
                        (w === t
                          ? "bg-accent/20 text-accent-bright"
                          : "bg-canvas-raised text-ink-muted hover:text-ink")
                      }
                      key={t}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
            {q.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-faint">Show</span>
                {q.map((e) => {
                  let t = !C.has(e);
                  return (
                    <button
                      onClick={() => D(e)}
                      aria-pressed={t}
                      className={
                        "rounded border px-1.5 py-0.5 transition " +
                        (t
                          ? "border-accent/40 bg-accent/15 text-accent-bright"
                          : "border-canvas-border bg-canvas-raised text-ink-faint line-through")
                      }
                      title={t ? `Hide ${e} nodes` : `Show ${e} nodes`}
                      key={e}
                    >
                      {e}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <label className="flex items-center gap-1.5 text-ink-muted">
              <input
                type="checkbox"
                checked={A}
                onChange={(e) => E(e.target.checked)}
                className="accent-current"
              />
              Hide unconnected
            </label>
            <button onClick={I} className="ml-auto text-ink-faint hover:text-ink">
              Reset view
            </button>
          </div>
          <div className="relative flex-1 overflow-hidden rounded border border-canvas-border bg-canvas shadow-panel">
            {b ? (
              <div className="absolute inset-0 flex items-center justify-center text-ink-muted">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </div>
            ) : R.nodes.length > 0 ? (
              <_Component4
                nodes={R.nodes}
                edges={R.edges}
                riskIds={B}
                selectedId={(x == null ? undefined : x.id) ?? null}
                colorByBand={true}
                onSelect={F}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-[0.8125rem] text-ink-faint">
                {s && s.nodes.length > 0 ? (
                  <Fragment>
                    <span>Every node is filtered out by the current view.</span>
                    <button onClick={I} className={buttonClass}>
                      Reset view
                    </button>
                  </Fragment>
                ) : (
                  <span>No graph yet. Ingest data on the Data ingestion page first.</span>
                )}
              </div>
            )}
            {x ? <T node={x} simCount={L.get(x.id)} onClose={() => F(null)} /> : null}
          </div>
          {s ? (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[0.75rem] text-ink-faint">
              <div className="flex flex-wrap items-center gap-3">
                <O color="#d97706" label="High / 3+ SIM device" />
                <O color="#38bdf8" label="Elevated" />
                <O color="#475569" label="Low" />
                <span className="text-ink-faint/70">Node size = risk score</span>
              </div>
              <span className="tabular-nums">
                {R.nodes.length === s.nodes.length
                  ? `${s.nodes.length} nodes`
                  : `${R.nodes.length} of ${s.nodes.length} nodes`}{" "}
                ·{" "}
                {R.edges.length === s.edges.length
                  ? `${s.edges.length} edges`
                  : `${R.edges.length} of ${s.edges.length} edges`}
                {B.size > 0 ? ` · ${B.size} flagged device(s)` : ""}
              </span>
            </div>
          ) : null}
        </Fragment>
      ) : null}
    </div>
  );
}
let L = new Set(["entity_id", "risk_score", "band"]);
function T(e) {
  let { node: t, simCount: n, onClose: a } = e;
  let l = t.labels.includes("Person") && t.props.entity_id ? String(t.props.entity_id) : null;
  let i = t.props.band == null ? null : String(t.props.band);
  let o = typeof t.props.risk_score == "number" ? t.props.risk_score : undefined;
  let c = Object.entries(t.props).filter((e) => {
    let [t] = e;
    return !L.has(t);
  });
  return (
    <div className="animate-fade-in absolute right-3 top-3 w-72 rounded border border-canvas-border bg-canvas-panel p-3 text-[0.8125rem] shadow-float">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
          {t.labels.join(" · ")}
        </span>
        <button onClick={a} className="text-ink-faint hover:text-ink">
          ✕
        </button>
      </div>
      {l ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="mono font-semibold text-ink">{l}</span>
          {i ? <RiskBadge band={i} score={o} /> : null}
        </div>
      ) : null}
      {n != null ? (
        <p className="mb-2 rounded border border-risk-border bg-risk-bg px-2 py-1.5 text-[0.75rem] text-risk">
          Seen with <span className="mono font-semibold">{n}</span> distinct SIMs. Structural flag
          only — a shared household handset trips this too. The count is the discriminator.
        </p>
      ) : null}
      <dl className="space-y-1">
        {c.map((e) => {
          let [t, n] = e;
          return (
            <div className="flex justify-between gap-3" key={t}>
              <dt className="text-ink-faint">{t}</dt>
              <dd className="mono truncate text-right text-ink-muted">{String(n)}</dd>
            </div>
          );
        })}
      </dl>
      {l ? (
        <Link
          href={`/queue/${encodeURIComponent(l)}`}
          className="mt-3 flex items-center justify-between rounded border border-canvas-border px-2 py-1.5 text-[0.8125rem] text-ink-muted hover:bg-canvas-hover hover:text-ink"
        >
          <span>
            {i ? "Open assessment" : "Open entity"}
            {i ? <span className="ml-1 text-ink-faint">— attribution & review</span> : null}
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        </Link>
      ) : t.labels.includes("Person") ? (
        <p className="mt-3 text-[0.75rem] text-ink-faint">
          Not yet scored — run an analysis pass from the risk queue.
        </p>
      ) : null}
    </div>
  );
}
function O(e) {
  let { color: t, label: n } = e;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: t,
        }}
        aria-hidden={true}
      />
      {n}
    </span>
  );
}
