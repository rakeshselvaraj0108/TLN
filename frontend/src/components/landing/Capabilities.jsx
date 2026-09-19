"use client";

import { useId } from "react";
import { Reveal } from "@/components/landing/primitives";
let l = "rgb(var(--tx-ink-rgb) / 0.55)";
let r = "rgb(var(--tx-ink-rgb) / 0.22)";
let n = "var(--tx-orange)";
function _Component(e) {
  let { children: t, label: a } = e;
  return (
    <svg viewBox="0 0 320 200" className="absolute inset-0 h-full w-full" role="img" aria-label={a}>
      {t}
    </svg>
  );
}
let d = [
  {
    id: "investigations",
    title: "AI-Assisted Investigations",
    body: "TRACE X helps investigators conduct thorough investigations by connecting transactions, identities, devices, locations, and signals into a unified evidence trail.",
    Visual: function () {
      return (
        <_Component label="An evidence node linked through intermediate entities into a case node">
          <path
            d="M56 100C82 100 92 62 116 62s34 70 56 70 28-64 54-64c14 0 20 29 33 29"
            fill="none"
            stroke={r}
            strokeWidth="1.2"
          />
          <path
            d="M56 100C82 100 92 62 116 62s34 70 56 70 28-64 54-64c14 0 20 29 33 29"
            fill="none"
            stroke={n}
            strokeWidth="1.2"
            strokeDasharray="4 8"
            className="tx-path-flow"
          />
          <rect
            x="34"
            y="86"
            width="26"
            height="26"
            fill="var(--tx-surface)"
            stroke={l}
            strokeWidth="1.3"
          />
          <path d="M42 99h10M47 94v10" stroke={l} strokeWidth="1.1" />
          <text x="47" y="130" textAnchor="middle" className="tx-svg-label">
            EVIDENCE
          </text>
          {[
            [116, 62],
            [172, 132],
            [226, 68],
          ].map((e, t) => {
            let [a, i] = e;
            return (
              <g key={`${a}-${i}`}>
                <circle cx={a} cy={i} r="9" fill="var(--tx-surface)" stroke={l} strokeWidth="1.3" />
                <circle cx={a} cy={i} r="2.6" fill={l} />
                <text
                  x={a}
                  y={i + (t === 1 ? 28 : -18)}
                  textAnchor="middle"
                  className="tx-svg-label"
                >
                  {["ACCOUNT", "DEVICE", "IDENTITY"][t]}
                </text>
              </g>
            );
          })}
          <path d="M270 78h16l11.3 11.3v16L286 116.6h-16l-11.3-11.3v-16z" fill={n} />
          <path
            d="M272.5 92.5 283.5 103.5M283.5 92.5 272.5 103.5"
            stroke="var(--tx-on-orange)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <text x="278" y="136" textAnchor="middle" className="tx-svg-label">
            CASE
          </text>
        </_Component>
      );
    },
  },
  {
    id: "reports",
    title: "Investigation-Ready Reports",
    body: "Turn complex investigative activity into structured reports with evidence, timelines, relationships, findings, and actionable intelligence presented clearly.",
    Visual: function () {
      let e = useId().replace(/:/g, "");
      return (
        <_Component label="An investigation report containing a timeline, evidence markers, a relationship graph and findings">
          <defs>
            <clipPath id={`${e}-sheet`}>
              <path d="M62 22h168l28 28v128H62z" />
            </clipPath>
          </defs>
          <path d="M62 22h168l28 28v128H62z" fill="var(--tx-field)" stroke={l} strokeWidth="1.3" />
          <path d="M230 22v28h28" fill="none" stroke={l} strokeWidth="1.3" />
          <g clipPath={`url(#${e}-sheet)`}>
            <rect x="78" y="42" width="74" height="6" fill={n} />
            <rect x="78" y="56" width="118" height="4" fill={r} />
            <path d="M78 84h164" stroke={r} strokeWidth="1.2" />
            {[78, 118, 158, 198, 238].map((e, t) => (
              <g key={e}>
                <path d={`M${e} 78v12`} stroke={l} strokeWidth="1.2" />
                {t === 2 && <circle cx={e} cy="84" r="4" fill={n} />}
              </g>
            ))}
            <g stroke={r} strokeWidth="1.1" fill="none">
              <path d="M92 118 128 106M128 106 164 122M92 118 132 138M164 122 132 138" />
            </g>
            {[
              [92, 118],
              [128, 106],
              [164, 122],
              [132, 138],
            ].map((e, t) => {
              let [a, i] = e;
              return (
                <circle
                  cx={a}
                  cy={i}
                  r="4.4"
                  fill={t === 1 ? n : "var(--tx-surface)"}
                  stroke={t === 1 ? n : l}
                  strokeWidth="1.2"
                  key={`${a}-${i}`}
                />
              );
            })}
            <rect x="188" y="106" width="54" height="3.5" fill={r} />
            <rect x="188" y="116" width="42" height="3.5" fill={r} />
            <rect x="188" y="126" width="50" height="3.5" fill={r} />
            <rect x="78" y="158" width="164" height="1" fill={r} />
            <rect x="78" y="166" width="88" height="6" fill={n} />
          </g>
        </_Component>
      );
    },
  },
  {
    id: "realtime",
    title: "Real-Time Intelligence",
    body: "Identify emerging patterns and suspicious activity as intelligence changes, helping investigators prioritise threats before they become larger operations.",
    Visual: function () {
      let e = new Set(["4-2", "7-3", "5-5", "9-4", "2-4"]);
      let t = (e) => {
        let [t, a] = e.split("-").map(Number);
        return {
          x: 46 + t * 17 + 3,
          y: 34 + a * 17 + 3,
        };
      };
      return (
        <_Component label="A dotted sector grid with several linked hotspots and one marked location">
          <g>
            {Array.from({
              length: 8,
            }).flatMap((t, a) =>
              Array.from({
                length: 13,
              }).map((t, i) => {
                let l = `${i}-${a}`;
                let r = e.has(l);
                if ((i * 7 + a * 5) % 11 != 0 || r) {
                  return (
                    <rect
                      x={46 + i * 17}
                      y={34 + a * 17}
                      width={r ? 7 : 5}
                      height={r ? 7 : 5}
                      fill={r ? n : "rgb(var(--tx-ink-rgb) / 0.2)"}
                      key={l}
                    />
                  );
                } else {
                  return null;
                }
              }),
            )}
          </g>
          <g stroke={n} strokeWidth="1" strokeOpacity="0.7" fill="none">
            {[
              ["4-2", "7-3"],
              ["7-3", "9-4"],
              ["4-2", "5-5"],
              ["5-5", "2-4"],
            ].map((e) => {
              let [a, i] = e;
              let l = t(a);
              let r = t(i);
              return <path d={`M${l.x} ${l.y}L${r.x} ${r.y}`} key={`${a}-${i}`} />;
            })}
          </g>
          <g stroke={n} strokeWidth="1.2" fill="none">
            <circle cx={t("7-3").x} cy={t("7-3").y} r="16" />
            <path
              d={`M${t("7-3").x} ${t("7-3").y - 22}v9M${t("7-3").x} ${t("7-3").y + 13}v9M${t("7-3").x - 22} ${t("7-3").y}h9M${t("7-3").x + 13} ${t("7-3").y}h9`}
            />
          </g>
          <text x="46" y="22" className="tx-svg-label">
            SECTOR GRID
          </text>
          <text x="274" y="22" textAnchor="end" className="tx-svg-label">
            30.73N 76.77E
          </text>
          <path d="M46 174h228" stroke={r} strokeWidth="1" />
          <text x="46" y="190" className="tx-svg-label">
            5 ACTIVE CLUSTERS
          </text>
        </_Component>
      );
    },
  },
  {
    id: "attribution",
    title: "Threat Attribution",
    body: "Connect accounts, devices, identities, locations, and behavioural fingerprints to reveal the operation behind seemingly isolated incidents.",
    Visual: function () {
      return (
        <_Component label="A device fingerprint linked by a trail of digital traces to a cluster of related accounts">
          <g fill="none" stroke={l} strokeWidth="1.2">
            <path d="M52 128a30 30 0 0 1 0-56" />
            <path d="M60 122a21 21 0 0 1 0-44" strokeOpacity="0.8" />
            <path d="M68 116a13 13 0 0 1 0-32" strokeOpacity="0.6" />
          </g>
          <path d="M76 110a6 6 0 0 1 0-20" fill="none" stroke={n} strokeWidth="1.6" />
          <text x="60" y="152" textAnchor="middle" className="tx-svg-label">
            DEVICE
          </text>
          <g fill={n}>
            {[
              [104, 96, 0.85],
              [124, 86, 0.62],
              [144, 100, 0.44],
              [164, 90, 0.28],
            ].map((e) => {
              let [t, a, i] = e;
              return (
                <g opacity={i} key={`${t}-${a}`}>
                  <rect x={t} y={a} width="9" height="5" rx="2.5" />
                  <rect x={t + 1.5} y={a + 7} width="6" height="3" rx="1.5" />
                </g>
              );
            })}
          </g>
          <path
            d="M100 104C124 92 140 108 168 94"
            fill="none"
            stroke={r}
            strokeWidth="1"
            strokeDasharray="2 5"
          />
          <g stroke={r} strokeWidth="1.1" fill="none">
            <path d="M244 96 210 62M244 96 206 108M244 96 216 142M244 96 268 54M244 96 272 140" />
          </g>
          {[
            [210, 62],
            [206, 108],
            [216, 142],
            [268, 54],
            [272, 140],
          ].map((e) => {
            let [t, a] = e;
            return (
              <circle
                cx={t}
                cy={a}
                r="5.4"
                fill="var(--tx-surface)"
                stroke={l}
                strokeWidth="1.2"
                key={`${t}-${a}`}
              />
            );
          })}
          <circle cx="244" cy="96" r="10" fill={n} />
          <text x="244" y="122" textAnchor="middle" className="tx-svg-label">
            OPERATOR
          </text>
        </_Component>
      );
    },
  },
];
export function Capabilities() {
  return (
    <section id="capabilities" className="tx-section">
      <div className="tx-container">
        <Reveal>
          <p className="tx-eyebrow m-0">Core capabilities</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="tx-h2 mt-6 max-w-[18ch]">How TRACE X helps investigators stay ahead.</h2>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:gap-7">
          {d.map((e, t) => (
            <Reveal as="article" delay={(t % 2) * 100} key={e.id}>
              <div className="tx-card h-full">
                <div className="tx-card__media">
                  <e.Visual />
                </div>
                <div className="tx-card__body">
                  <h3 className="tx-h3">{e.title}</h3>
                  <p className="tx-body tx-body--sm mt-4">{e.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
