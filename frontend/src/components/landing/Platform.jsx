"use client";

import { useId } from "react";
import { Reveal } from "@/components/landing/primitives";
function _Component5(e) {
  let { className: t = "" } = e;
  let a = useId().replace(/:/g, "");
  let l = `${a}-glow`;
  let r = `${a}-shadow`;
  let n = Array.from(
    {
      length: 8,
    },
    (e, t) => {
      let a = ((t * 45 + 22.5) * Math.PI) / 180;
      return {
        x: 200 + Math.cos(a) * 96,
        y: 170 + Math.sin(a) * 34,
      };
    },
  );
  let c = (e) => `${e.x.toFixed(1)},${e.y.toFixed(1)}`;
  let o = (e) => `${e.x.toFixed(1)},${(e.y + 76).toFixed(1)}`;
  let d = [
    [4, 3, "#ff9a52"],
    [3, 2, "#ffb27a"],
    [2, 1, "#ff7d2b"],
    [1, 0, "var(--tx-orange)"],
    [0, 7, "#d94f00"],
  ];
  let x = [
    [3, 2, "#e15400"],
    [2, 1, "#c74600"],
    [1, 0, "#a83a00"],
  ];
  return (
    <svg
      viewBox="0 0 400 400"
      className={t}
      role="img"
      aria-label="Abstract TRACE X intelligence core: a faceted orange crystal with evidence pathways converging into it"
    >
      <defs>
        <radialGradient id={l} cx="50%" cy="46%" r="46%">
          <stop offset="0%" stopColor="var(--tx-orange)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--tx-orange)" stopOpacity="0" />
        </radialGradient>
        <filter id={r} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>
      <path
        d={`${n
          .map((e, t) => {
            let a = {
              x: 200 + (e.x - 200) * 1.62,
              y: 200 + (e.y - 170) * 3.4,
            };
            return `${t === 0 ? "M" : "L"}${c(a)}`;
          })
          .join(" ")} Z`}
        fill="none"
        stroke="rgb(var(--tx-ink-rgb) / 0.1)"
        strokeWidth="1"
      />
      <ellipse cx="200" cy="200" rx="168" ry="150" fill={`url(#${l})`} />
      <g
        stroke="var(--tx-orange)"
        strokeWidth="1.1"
        fill="none"
        strokeOpacity="0.55"
        className="tx-path-flow"
      >
        <path d="M22 96 C 96 108, 118 150, 168 168" />
        <path d="M378 118 C 312 128, 288 158, 240 172" />
        <path d="M34 306 C 108 292, 132 268, 172 246" />
        <path d="M366 296 C 300 288, 268 264, 234 244" />
      </g>
      <g fill="var(--tx-orange)">
        {[
          [22, 96],
          [378, 118],
          [34, 306],
          [366, 296],
        ].map((e) => {
          let [t, a] = e;
          return <rect x={t - 3.5} y={a - 3.5} width="7" height="7" key={`${t}-${a}`} />;
        })}
      </g>
      <g fill="none" stroke="rgb(var(--tx-ink-rgb) / 0.26)" strokeWidth="1">
        {[
          [108, 122],
          [292, 138],
          [118, 282],
          [288, 276],
        ].map((e) => {
          let [t, a] = e;
          return <circle cx={t} cy={a} r="4" key={`${t}-${a}`} />;
        })}
      </g>
      <ellipse
        cx="200"
        cy="292"
        rx="118"
        ry="20"
        fill="rgb(var(--tx-ink-rgb) / 0.22)"
        filter={`url(#${r})`}
      />
      <g className="tx-core-float">
        {x.map((e) => {
          let [t, a, i] = e;
          return (
            <polygon
              points={`${c(n[t])} ${c(n[a])} ${o(n[a])} ${o(n[t])}`}
              fill={i}
              key={`side-${t}-${a}`}
            />
          );
        })}
        <polygon
          points={n.map(c).join(" ")}
          fill="#ff8a3d"
          stroke="rgb(var(--tx-ink-rgb) / 0.12)"
          strokeWidth="0.8"
        />
        {d.map((e) => {
          let [t, a, i] = e;
          return (
            <polygon
              points={`${c(n[t])} ${c(n[a])} ${200},${54}`}
              fill={i}
              key={`peak-${t}-${a}`}
            />
          );
        })}
        <g stroke="rgb(var(--tx-ink-rgb) / 0.2)" strokeWidth="0.8" fill="none">
          {d.map((e) => {
            let [t] = e;
            return <line x1={n[t].x} y1={n[t].y} x2={200} y2={54} key={`seam-${t}`} />;
          })}
          {x.map((e) => {
            let [t] = e;
            return <line x1={n[t].x} y1={n[t].y} x2={n[t].x} y2={n[t].y + 76} key={`drop-${t}`} />;
          })}
        </g>
        <circle cx="200" cy="196" r="9" fill="var(--tx-on-orange)" fillOpacity="0.9" />
        <circle
          cx="200"
          cy="196"
          r="16"
          fill="none"
          stroke="var(--tx-on-orange)"
          strokeOpacity="0.4"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}
let n = [
  {
    index: "01",
    title: "Investigate from one place.",
    body: "Records, transactions, devices and case files in a single workspace, instead of six systems and a spreadsheet.",
  },
  {
    index: "02",
    title: "Connect evidence across systems.",
    body: "Entities are resolved across sources, so the same person, account or handset is recognised wherever it appears.",
  },
  {
    index: "03",
    title: "Move from alerts to intelligence.",
    body: "Signals are assembled into a ranked, explainable picture an officer can act on and a court can follow.",
  },
];
export function Platform() {
  return (
    <section id="platform" className="tx-section">
      <div className="tx-container">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <Reveal>
              <p className="tx-eyebrow m-0">TRACE X Platform</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="tx-h2 mt-6 max-w-[16ch]">
                Secure, intelligent, and built for investigation.
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <p className="tx-body tx-body--lead mt-7 max-w-[54ch]">
                TRACE X connects <span className="tx-hi">investigative data</span>,{" "}
                <span className="tx-hi">digital evidence</span>, transactions, identities, devices,
                locations, and case intelligence into one{" "}
                <span className="tx-hi">unified investigative layer</span>.
              </p>
            </Reveal>
          </div>
          <Reveal delay={120} className="relative">
            <_Component5 className="mx-auto block w-full max-w-[460px]" />
          </Reveal>
        </div>
        <ul className="mt-20 grid list-none gap-px border border-[color:rgb(var(--tx-ink-rgb) / 0.12)] bg-[color:rgb(var(--tx-ink-rgb) / 0.12)] p-0 md:grid-cols-3">
          {n.map((e, t) => (
            <Reveal
              as="li"
              delay={t * 90}
              className="bg-[color:var(--tx-bg)] p-7 lg:p-9"
              key={e.index}
            >
              <span className="tx-mono text-[color:var(--tx-orange)]">{e.index}</span>
              <h3 className="tx-h3 mt-5">{e.title}</h3>
              <p className="tx-body tx-body--sm mt-4">{e.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
