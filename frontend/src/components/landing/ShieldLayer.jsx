"use client";

import { Fragment, useRef } from "react";
import { Reveal } from "@/components/landing/primitives";
import { SignalField } from "@/components/landing/SignalField";
import { usePrefersReducedMotion, useScrollStage } from "@/lib/motion";
let c = [
  {
    key: "chaos",
    title: "Chaos",
    body: "Thousands of unlinked records, alerts and evidence fragments.",
  },
  {
    key: "connection",
    title: "Connection",
    body: "Identities, devices and accounts resolve to the same entities.",
  },
  {
    key: "intelligence",
    title: "Intelligence",
    body: "Relationships across cases assemble into a single picture.",
  },
  {
    key: "intelligence-2",
    title: "Intelligence",
    body: "The network behind the alerts becomes legible.",
  },
  {
    key: "action",
    title: "Action",
    body: "Investigators know exactly where to move first.",
  },
];
let o = [
  {
    label: "Financial Fraud",
    left: "9%",
    top: "26%",
    delay: "0s",
  },
  {
    label: "Cyber Crime",
    left: "84%",
    top: "20%",
    delay: "0.8s",
  },
  {
    label: "Identity Fraud",
    left: "18%",
    top: "52%",
    delay: "1.6s",
    compact: true,
  },
  {
    label: "Account Takeover",
    left: "87%",
    top: "44%",
    delay: "2.4s",
  },
  {
    label: "Insider Threats",
    left: "11%",
    top: "66%",
    delay: "3.2s",
  },
  {
    label: "Mule Networks",
    left: "78%",
    top: "64%",
    delay: "0.4s",
    compact: true,
  },
  {
    label: "Digital Evidence",
    left: "50%",
    top: "10%",
    delay: "1.2s",
    compact: true,
  },
  {
    label: "Suspicious Transactions",
    left: "26%",
    top: "64%",
    delay: "2s",
  },
  {
    label: "Criminal Networks",
    left: "70%",
    top: "31%",
    delay: "2.8s",
  },
];
export function ShieldLayer() {
  let t = useRef(null);
  let { progressRef: a, stage: d } = useScrollStage(t);
  let x = usePrefersReducedMotion();
  let h = c[x ? c.length - 1 : d] ?? c[0];
  let m = x || d >= 1;
  return (
    <Fragment>
      <div
        id="intelligence"
        ref={t}
        className="relative"
        style={{
          height: x ? "auto" : "340vh",
        }}
      >
        <div className={`${x ? "relative" : "sticky top-0"} h-[100dvh] overflow-hidden`}>
          <SignalField mode="shield" progressRef={a} className="tx-canvas" />
          <div className="pointer-events-none absolute inset-0">
            {o.map((e) => (
              <span
                className={`tx-tag transition-opacity duration-700 ${m ? "opacity-100" : "opacity-0"} ${e.compact ? "" : "hidden sm:inline-block"}`}
                style={{
                  left: e.left,
                  top: e.top,
                  "--tx-float-delay": e.delay,
                }}
                key={e.label}
              >
                {e.label}
              </span>
            ))}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-[color:var(--tx-bg)] via-[color:var(--tx-bg)] via-55% to-transparent px-6 pb-12 pt-28 text-center"
            aria-live="polite"
          >
            <p className="tx-mono m-0 text-[color:var(--tx-muted)]">
              The TRACE X Intelligence Layer
            </p>
            <p className="tx-statement mt-3">{h.title}</p>
            <p className="tx-body tx-body--sm mx-auto mt-3 max-w-[420px]">{h.body}</p>
            {!x && (
              <div className="mx-auto mt-7 h-px w-[180px] bg-[color:rgb(var(--tx-ink-rgb) / 0.14)]">
                <div
                  className="h-px bg-[color:var(--tx-orange)] transition-[width] duration-500 ease-out"
                  style={{
                    width: `${(d / 4) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <section className="tx-section">
        <div className="tx-container tx-container--narrow">
          <Reveal>
            <p className="tx-statement m-0">
              Criminal networks are <span className="tx-hi">increasingly sophisticated</span> —
              investigations need intelligence that can see beyond individual alerts.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <p className="tx-body tx-body--lead mt-8 max-w-[640px]">
              TRACE X <span className="tx-hi">proactively connects</span> evidence, entities,
              events, and relationships to reveal patterns hidden across the investigation queue.
            </p>
          </Reveal>
        </div>
      </section>
    </Fragment>
  );
}
