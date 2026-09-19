"use client";

import { Reveal } from "@/components/landing/primitives";
let l = [
  {
    stamp: "T+0",
    title: "Evidence discovered",
    body: "A complaint arrives with a statement, a screenshot and a number.",
  },
  {
    stamp: "T+11m",
    title: "Account connected",
    body: "The beneficiary account resolves to a subject already on file.",
  },
  {
    stamp: "T+26m",
    title: "Device linked",
    body: "A handset identifier ties that account to a second complaint.",
  },
  {
    stamp: "T+48m",
    title: "Transaction detected",
    body: "Layering is traced across six accounts inside forty minutes.",
  },
  {
    stamp: "T+2h",
    title: "Network identified",
    body: "Eighteen entities resolve into one operating structure.",
  },
  {
    stamp: "T+3h",
    title: "Investigation escalated",
    body: "A ranked, evidence-backed brief goes to the investigating officer.",
  },
];
export function InvestigationTimeline() {
  return (
    <section className="tx-section tx-section--tight">
      <div className="tx-container">
        <Reveal>
          <p className="tx-eyebrow m-0">Investigation timeline</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="tx-h2 mt-6 max-w-[20ch]">
            History becomes a narrative an officer can follow.
          </h2>
        </Reveal>
        <ol className="mt-14 grid list-none gap-7 p-0 md:grid-cols-6 md:gap-5">
          {l.map((e, t) => {
            let a = t === l.length - 1;
            return (
              <Reveal as="li" delay={t * 70} className="tx-step flex gap-4 md:block" key={e.title}>
                <div className="flex shrink-0 flex-col items-center md:mb-6 md:h-2.5 md:flex-row md:items-center">
                  <span
                    className="tx-step__dot mt-2 h-2.5 w-2.5 shrink-0 bg-[color:var(--tx-ink)] md:mt-0"
                    aria-hidden="true"
                  />
                  {!a && (
                    <span
                      className="mt-2 w-px flex-1 bg-[color:rgb(var(--tx-ink-rgb) / 0.16)] md:ml-2 md:mt-0 md:h-px md:w-full"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="pb-1">
                  <p className="tx-mono m-0 text-[color:var(--tx-orange)]">{e.stamp}</p>
                  <h3 className="tx-h3 tx-h3--sm mt-2">{e.title}</h3>
                  <p className="tx-body tx-body--xs mt-2">{e.body}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
