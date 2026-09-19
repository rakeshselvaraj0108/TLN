"use client";

import { Fragment, useMemo, useState } from "react";
import { Reveal } from "@/components/landing/primitives";
let r = [
  {
    id: "person",
    label: "Person",
    ref: "PER-4471",
    detail: "Subject of interest across three linked complaints.",
    x: 214,
    y: 214,
  },
  {
    id: "account",
    label: "Account",
    ref: "ACC-88213",
    detail: "Receiving account; 31 inbound transfers in 9 days.",
    x: 344,
    y: 118,
  },
  {
    id: "device",
    label: "Device",
    ref: "DEV-0917",
    detail: "Handset seen on two networks under different identities.",
    x: 330,
    y: 306,
  },
  {
    id: "phone",
    label: "Phone",
    ref: "MSN-6620",
    detail: "Number registered to a since-closed retail KYC.",
    x: 122,
    y: 92,
  },
  {
    id: "location",
    label: "Location",
    ref: "LOC-Sector 34",
    detail: "Cell site common to four cash-out events.",
    x: 128,
    y: 338,
  },
  {
    id: "transaction",
    label: "Transaction",
    ref: "TXN-51902",
    detail: "₹4.8L layered through six accounts in 40 minutes.",
    x: 476,
    y: 92,
  },
  {
    id: "ip",
    label: "IP",
    ref: "IP-103.21.x",
    detail: "Session origin shared with two unrelated complaints.",
    x: 470,
    y: 252,
  },
  {
    id: "case",
    label: "Case",
    ref: "TX-2026-0412",
    detail: "Active investigation consolidating all linked entities.",
    x: 578,
    y: 176,
  },
];
let n = [
  ["person", "account"],
  ["person", "device"],
  ["person", "phone"],
  ["person", "location"],
  ["account", "transaction"],
  ["account", "case"],
  ["account", "ip"],
  ["device", "ip"],
  ["device", "phone"],
  ["device", "location"],
  ["transaction", "case"],
  ["ip", "case"],
];
let c = [
  {
    label: "Connected entities",
    value: "18",
  },
  {
    label: "Transactions",
    value: "47",
  },
  {
    label: "Devices",
    value: "6",
  },
  {
    label: "Locations",
    value: "4",
  },
];
export function EntityGraph() {
  let [t, a] = useState(null);
  let o = useMemo(() => new Map(r.map((e) => [e.id, e])), []);
  let d = useMemo(() => {
    let e = new Map();
    for (let t of r) {
      e.set(t.id, new Set());
    }
    for (let [s, i] of n) {
      var t;
      var a;
      if ((t = e.get(s)) !== null && t !== undefined) {
        t.add(i);
      }
      if ((a = e.get(i)) !== null && a !== undefined) {
        a.add(s);
      }
    }
    return e;
  }, []);
  let x = t ? o.get(t) : undefined;
  let h = t ? d.get(t) : undefined;
  let m = (e) =>
    t ? (e === t ? "active" : (h == null ? undefined : h.has(e)) ? "linked" : "dimmed") : "idle";
  return (
    <section className="tx-section">
      <div className="tx-container">
        <Reveal>
          <p className="tx-eyebrow m-0">Connected intelligence</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="tx-h2 mt-6 max-w-[17ch]">
            From isolated evidence to connected intelligence.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:gap-8">
          <Reveal>
            <div className="border border-[color:rgb(var(--tx-ink-rgb) / 0.12)] bg-[color:var(--tx-surface)]">
              <div className="overflow-x-auto">
                <svg
                  viewBox="0 0 640 420"
                  className="block h-auto w-full min-w-[560px]"
                  role="group"
                  aria-label="Investigation graph: eight entity types connected by evidence links"
                  onMouseLeave={() => a(null)}
                >
                  <g>
                    {n.map((e) => {
                      let [a, i] = e;
                      let l = o.get(a);
                      let r = o.get(i);
                      if (!l || !r) {
                        return null;
                      }
                      let n = t !== null && (a === t || i === t);
                      return (
                        <line
                          className="tx-edge"
                          x1={l.x}
                          y1={l.y}
                          x2={r.x}
                          y2={r.y}
                          stroke={n ? "var(--tx-orange)" : "rgb(var(--tx-ink-rgb) / 0.9)"}
                          strokeWidth={n ? 1.6 : 1}
                          strokeOpacity={n ? 0.9 : t ? 0.08 : 0.18}
                          key={`${a}-${i}`}
                        />
                      );
                    })}
                  </g>
                  {r.map((e) => {
                    let t = m(e.id);
                    let i = t === "active";
                    let l = t === "linked";
                    return (
                      <g
                        className="tx-node"
                        tabIndex={0}
                        role="button"
                        aria-label={`${e.label}, ${e.ref}. ${e.detail}`}
                        opacity={t === "dimmed" ? 0.3 : 1}
                        onMouseEnter={() => a(e.id)}
                        onFocus={() => a(e.id)}
                        onBlur={() => a(null)}
                        key={e.id}
                      >
                        <circle
                          cx={e.x}
                          cy={e.y}
                          r={i ? 26 : 22}
                          fill={i ? "var(--tx-orange)" : "var(--tx-bg)"}
                          stroke={i || l ? "var(--tx-orange)" : "rgb(var(--tx-ink-rgb) / 0.55)"}
                          strokeWidth={i || l ? 1.6 : 1.2}
                        />
                        <circle
                          cx={e.x}
                          cy={e.y}
                          r="3"
                          fill={i ? "var(--tx-on-orange)" : "rgb(var(--tx-ink-rgb) / 0.6)"}
                        />
                        <text
                          x={e.x}
                          y={e.y + 40}
                          textAnchor="middle"
                          className="tx-graph-label"
                          fill={i ? "var(--tx-orange)" : "rgb(var(--tx-ink-rgb) / 0.62)"}
                        >
                          {e.label.toUpperCase()}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <p className="tx-mono m-0 border-t border-[color:rgb(var(--tx-ink-rgb) / 0.12)] px-4 py-3 text-[color:var(--tx-muted)]">
                Illustrative visualisation · sample entities, not live case data
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <aside
              className="h-full border border-[color:rgb(var(--tx-ink-rgb) / 0.12)] bg-[color:var(--tx-surface)] p-6"
              aria-live="polite"
            >
              <p className="tx-mono m-0 text-[color:var(--tx-muted)]">Case</p>
              <p className="tx-h3 mt-2">TX-2026-0412</p>
              <p className="m-0 mt-3 flex items-center gap-2 text-[13px] text-[#555]">
                <span
                  className="inline-block h-1.5 w-1.5 bg-[color:var(--tx-orange)]"
                  aria-hidden="true"
                />
                Active Investigation
              </p>
              <dl className="mt-7 grid grid-cols-2 gap-px border border-[color:rgb(var(--tx-ink-rgb) / 0.1)] bg-[color:rgb(var(--tx-ink-rgb) / 0.1)]">
                {c.map((e) => (
                  <div className="bg-[color:var(--tx-surface)] p-4" key={e.label}>
                    <dt className="tx-mono text-[color:var(--tx-muted)]">{e.label}</dt>
                    <dd className="tx-serif m-0 mt-2 text-[26px] leading-none">{e.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-7 border-t border-[color:rgb(var(--tx-ink-rgb) / 0.12)] pt-5">
                <p className="tx-mono m-0 text-[color:var(--tx-muted)]">
                  {x ? "Selected entity" : "Select an entity"}
                </p>
                {x ? (
                  <Fragment>
                    <p className="m-0 mt-3 text-[15px] text-[color:var(--tx-ink)]">
                      {x.label} ·{" "}
                      <span className="tx-mono tracking-[0.06em] text-[color:var(--tx-orange)]">
                        {x.ref}
                      </span>
                    </p>
                    <p className="tx-body tx-body--xs mt-2">{x.detail}</p>
                    <p className="tx-body tx-body--fine mt-4">
                      Linked to{" "}
                      <span className="text-[color:var(--tx-ink)]">
                        {(h == null ? undefined : h.size) ?? 0}
                      </span>{" "}
                      entities:{" "}
                      {[...(h ?? [])]
                        .map((e) => {
                          return o.get(e)?.label;
                        })
                        .filter(Boolean)
                        .join(", ")}
                      .
                    </p>
                  </Fragment>
                ) : (
                  <p className="tx-body tx-body--xs mt-3">
                    Hover or focus any node in the graph to see how it connects to the rest of the
                    investigation.
                  </p>
                )}
              </div>
            </aside>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
