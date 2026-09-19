"use client";

import { Reveal } from "@/components/landing/primitives";
let l = [
  "Police Records",
  "FIR Systems",
  "Case Management",
  "Cyber Crime",
  "Financial Data",
  "Transaction Systems",
  "CCTV",
  "Digital Evidence",
  "Mobile Data",
  "Device Intelligence",
  "Identity Systems",
  "Email",
  "Documents",
  "Cloud Data",
  "Maps",
  "Public Records",
  "Social Intelligence",
  "Threat Intelligence",
  "Databases",
  "APIs",
];
function _Component3(e) {
  let { variant: t } = e;
  let a = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
  };
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      {t === 0 && <rect x="3" y="3" width="10" height="10" {...a} />}
      {t === 1 && <circle cx="8" cy="8" r="5.2" {...a} />}
      {t === 2 && <path d="M8 2.6 13.6 13H2.4z" {...a} />}
      {t === 3 && <path d="M8 2.4 13.6 8 8 13.6 2.4 8z" {...a} />}
      {t === 4 && <path d="M5.4 3h5.2L13.6 8l-3 5H5.4l-3-5z" {...a} />}
    </svg>
  );
}
function _Component4(e) {
  let { reverse: t = false } = e;
  let a = t ? [...l].reverse() : l;
  let i = (e) => (
    <div className="tx-marquee__row" aria-hidden={e || undefined}>
      {a.map((e, t) => (
        <span className="tx-marquee__item" key={`${e}-${t}`}>
          <_Component3 variant={t % 5} />
          {e}
        </span>
      ))}
    </div>
  );
  return (
    <div
      className="tx-marquee py-5"
      style={{
        "--tx-marquee-duration": t ? "64s" : "52s",
      }}
    >
      <div className={`tx-marquee__track ${t ? "tx-marquee__track--reverse" : ""}`}>
        {i(false)}
        {i(true)}
      </div>
    </div>
  );
}
export function Integrations() {
  return (
    <section className="tx-section tx-section--tight overflow-hidden">
      <div className="tx-container">
        <Reveal>
          <p className="tx-eyebrow m-0">Connect everything</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="tx-h2 mt-6 max-w-[20ch]">
            One intelligence layer across your investigation ecosystem.
          </h2>
        </Reveal>
      </div>
      <div className="mt-14 border-y border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-4">
        <_Component4 />
        <_Component4 reverse={true} />
      </div>
    </section>
  );
}
