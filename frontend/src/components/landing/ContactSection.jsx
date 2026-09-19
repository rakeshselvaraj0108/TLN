"use client";

import { useId, useState } from "react";
import { Reveal, TxButton } from "@/components/landing/primitives";
import { SignalField } from "@/components/landing/SignalField";
import { CONTACT_EMAIL } from "@/lib/contact";
let n = CONTACT_EMAIL;
function _Component2() {
  return (
    <svg
      viewBox="0 0 1440 720"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tx-canyon-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tx-bg)" />
          <stop offset="58%" stopColor="#fbe6cd" />
          <stop offset="100%" stopColor="#ffd2a1" />
        </linearGradient>
      </defs>
      <rect width="1440" height="720" fill="url(#tx-canyon-sky)" />
      {[
        {
          d: "M0 300h180l40-32h200l50 32h290l60-50h260l60 46h300V720H0z",
          fill: "#f7e6d2",
        },
        {
          d: "M0 372h260l40-36h260l50 36h290l50-42h250l50 42h240V720H0z",
          fill: "#f3cfa6",
        },
        {
          d: "M0 452h120l50-38h260l50 38h340l60-44h240l60 44h260V720H0z",
          fill: "#eeb178",
        },
        {
          d: "M0 534h340l52-38h268l54 38h306l56-40h224l52 40h88V720H0z",
          fill: "#e78c46",
        },
        {
          d: "M0 612h200l52-34h268l52 34h368l58-38h242l58 38h142V720H0z",
          fill: "#d4681d",
        },
        {
          d: "M0 676h420l50-28h310l52 28h328l56-30h224V720H0z",
          fill: "#ad4a0c",
        },
      ].map((e) => (
        <path d={e.d} fill={e.fill} key={e.fill} />
      ))}
      <g className="tx-svg-label">
        <text x="88" y="126" fill="rgba(120,48,4,0.62)">
          [ 30.7333 N · 76.7794 E ]
        </text>
        <text x="1132" y="108" fill="rgba(120,48,4,0.62)">
          CASE TX-2026-0412
        </text>
        <text x="196" y="486" fill="rgba(255,240,226,0.72)">
          ₹ 4.8L TRACED
        </text>
        <text x="1044" y="586" fill="rgba(255,240,226,0.72)">
          NODE 07 · LINKED
        </text>
        <text x="640" y="212" fill="rgba(120,48,4,0.62)">
          ‹ EVIDENCE ›
        </text>
      </g>
      <g stroke="rgba(150,60,6,0.45)" strokeWidth="1" fill="none">
        <path d="M96 150v18M87 159h18" />
        <path d="M1188 132v18M1179 141h18" />
        <circle cx="640" cy="238" r="7" />
        <path d="M640 224v-8M640 252v8M626 238h-8M654 238h8" />
      </g>
    </svg>
  );
}
export function ContactSection() {
  let e = useId().replace(/:/g, "");
  let [t, a] = useState("");
  let [x, h] = useState("");
  let [m, g] = useState(null);
  let [p, u] = useState(false);
  return (
    <section id="contact" className="relative overflow-hidden">
      <_Component2 />
      <SignalField mode="hero" tone="warm" density={0.65} className="tx-canvas" />
      <div className="tx-container relative z-[1] px-5 py-20 sm:px-7 lg:py-28">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_0.82fr]">
          <Reveal className="drop-shadow-[0_22px_34px_rgba(92,42,6,0.32)]">
            <div className="tx-notch bg-[color:var(--tx-bg)] p-7 sm:p-10">
              <h2 className="tx-h2">Get in touch.</h2>
              <p className="tx-body tx-body--lead mt-4 max-w-[46ch]">
                Bring TRACE X to your investigation workflow.
              </p>
              <form
                className="mt-9"
                onSubmit={(e) => {
                  e.preventDefault();
                  let a = t.trim();
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) {
                    g("Enter a valid work email address so we can reply.");
                    u(false);
                    return;
                  }
                  g(null);
                  let s = encodeURIComponent("TRACE X enquiry");
                  let i =
                    encodeURIComponent(`${x.trim() || "I would like to know more about TRACE X."}

— Sent from ${a}`);
                  window.location.href = `mailto:${n}?subject=${s}&body=${i}`;
                  u(true);
                }}
                noValidate={true}
              >
                <div>
                  <label className="tx-label" htmlFor={`${e}-email`}>
                    Work email<span className="text-[color:var(--tx-orange)]">*</span>
                  </label>
                  <input
                    id={`${e}-email`}
                    className="tx-field"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required={true}
                    placeholder="name@organisation.com"
                    value={t}
                    onChange={(e) => a(e.target.value)}
                    aria-invalid={!!m || undefined}
                    aria-describedby={m ? `${e}-error` : undefined}
                  />
                </div>
                <div className="mt-5">
                  <label className="tx-label" htmlFor={`${e}-comment`}>
                    Comment
                  </label>
                  <textarea
                    id={`${e}-comment`}
                    className="tx-field resize-y"
                    name="comment"
                    rows={4}
                    placeholder="Tell us about the investigations you are running."
                    value={x}
                    onChange={(e) => h(e.target.value)}
                  />
                </div>
                <div aria-live="polite">
                  {m && (
                    <p
                      id={`${e}-error`}
                      className="m-0 mt-4 text-[13px] text-[color:var(--tx-invalid)]"
                    >
                      {m}
                    </p>
                  )}
                  {p && !m && (
                    <p className="m-0 mt-4 text-[13px] text-[#1f6b3a]">
                      Your email client should now be open with the message addressed to the TRACE X team.
                    </p>
                  )}
                </div>
                <div className="mt-7">
                  <TxButton label="Send enquiry" type="submit" variant="solid" />
                </div>
                <p className="tx-body tx-body--fine mt-6">
                  Your information is handled securely and used only for responding to your enquiry.
                  Submitting opens your own email client addressed to the TRACE X team — nothing is
                  stored by this page.
                </p>
              </form>
            </div>
          </Reveal>
          <Reveal delay={120} className="drop-shadow-[0_16px_26px_rgba(92,42,6,0.24)]">
            <div className="tx-notch bg-[color:var(--tx-surface)] p-7 sm:p-10">
              <p className="tx-eyebrow m-0">Contact</p>
              <dl className="m-0 mt-8">
                <dt className="tx-mono text-[color:var(--tx-muted)]">Primary contact</dt>
                <dd className="m-0 mt-2">
                  <a className="tx-link" href={`mailto:${n}`}>
                    {n}
                  </a>
                </dd>
              </dl>
              <div className="mt-9 border-t border-[color:rgb(var(--tx-ink-rgb) / 0.12)] pt-7">
                <a className="tx-link" href={`mailto:${n}`}>
                  Email us
                  <span className="tx-link__arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
