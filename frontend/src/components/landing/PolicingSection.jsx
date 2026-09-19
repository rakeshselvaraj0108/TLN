"use client";

import { Reveal } from "@/components/landing/primitives";
function _Component6(e) {
  let { className: t = "" } = e;
  let a = Array.from(
    {
      length: 8,
    },
    (e, t) => 62 + t * 42,
  );
  return (
    <svg
      viewBox="0 0 420 300"
      className={t}
      role="img"
      aria-label="Abstract line drawing: a parasol roof over a colonnade, above a planned grid of city sectors"
    >
      <path
        d="M34 100C118 46 302 46 386 100l0 20C302 66 118 66 34 120z"
        fill="rgba(255,103,0,0.1)"
        stroke="rgb(var(--tx-ink-rgb) / 0.6)"
        strokeWidth="1.2"
      />
      <g fill="rgb(var(--tx-ink-rgb) / 0.3)">
        {a.map((e) => (
          <rect x={e} y="122" width="5" height="88" key={e} />
        ))}
      </g>
      <path d="M28 212h364" stroke="rgb(var(--tx-ink-rgb) / 0.45)" strokeWidth="1.2" />
      <g>
        {Array.from({
          length: 3,
        }).flatMap((e, t) =>
          Array.from({
            length: 16,
          }).map((e, a) => {
            let i = t === 1 && a === 9;
            return (
              <rect
                x={40 + a * 22}
                y={236 + t * 16}
                width={i ? 7 : 5}
                height={i ? 7 : 5}
                fill={i ? "var(--tx-orange)" : "rgb(var(--tx-ink-rgb) / 0.26)"}
                key={`${a}-${t}`}
              />
            );
          }),
        )}
      </g>
    </svg>
  );
}
let n = [
  {
    title: "Chain of custody by default",
    body: "Every record carries its source, its hash and the time it was ingested, so evidence can be traced back to where it came from.",
  },
  {
    title: "Access follows the case",
    body: "What an officer can see is bounded by their role and their case assignment, not by who happens to know the URL.",
  },
  {
    title: "Auditable by design",
    body: "Queries, exports and dispositions are written to an append-only log that can be reviewed after the fact.",
  },
  {
    title: "Retention the force controls",
    body: "Retention windows and purge rules are configured by the department, and enforced by the platform.",
  },
];
export function PolicingSection() {
  return (
    <section id="security" className="tx-section overflow-hidden">
      <div className="tx-container relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_0.85fr] lg:gap-20">
          <div>
            <Reveal>
              <p className="tx-eyebrow m-0">Built for modern policing</p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="tx-h2 mt-6 max-w-[18ch]">
                Technology that helps investigators see the bigger picture.
              </h2>
            </Reveal>
            <Reveal delay={150}>
              <p className="tx-body tx-body--lead mt-7 max-w-[56ch]">
                TRACE X is designed around the needs of modern law enforcement teams — helping
                investigators connect information, reduce investigative complexity, and surface
                meaningful relationships across cases.
              </p>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <_Component6 className="mx-auto block w-full max-w-[440px]" />
          </Reveal>
        </div>
        <ul className="mt-20 grid list-none gap-px border border-[color:rgb(var(--tx-ink-rgb) / 0.12)] bg-[color:rgb(var(--tx-ink-rgb) / 0.12)] p-0 sm:grid-cols-2 lg:grid-cols-4">
          {n.map((e, t) => (
            <Reveal as="li" delay={t * 80} className="bg-[color:var(--tx-bg)] p-7" key={e.title}>
              <h3 className="tx-h3 tx-h3--sm">{e.title}</h3>
              <p className="tx-body tx-body--xs mt-3">{e.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
