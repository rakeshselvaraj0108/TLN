"use client";

import { BrandMark } from "@/components/landing/Emblem";
import { Reveal, ShieldMark, TxButton } from "@/components/landing/primitives";
import { SignalField } from "@/components/landing/SignalField";
export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[calc(100svh-var(--tx-nav-h))] items-center overflow-hidden px-5 py-16 sm:px-7"
    >
      <SignalField mode="hero" className="tx-canvas" density={1} />
      <div className="tx-container tx-container--narrow relative z-[1] text-center">
        <Reveal>
          <p className="m-0 flex justify-center">
            <span className="tx-badge tx-badge--crest">
              <BrandMark height={38} />
              <span className="tx-badge__rule" aria-hidden="true" />
              Built for fraud and cybercrime investigators
            </span>
          </p>
        </Reveal>
        <Reveal delay={90}>
          <h1 className="tx-display mt-8 text-balance">
            AI intelligence for modern <span className="tx-hi">investigations.</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="tx-statement mx-auto mt-6 max-w-[760px] text-[color:var(--tx-ink)]">
            TRACE X turns complex evidence into{" "}
            <span className="tx-hi">actionable intelligence.</span>
          </p>
        </Reveal>
        <Reveal delay={230}>
          <p className="tx-body tx-body--lead mx-auto mt-7 max-w-[680px]">
            TRACE X helps investigators <span className="tx-hi">connect evidence</span>,{" "}
            <span className="tx-hi">uncover hidden relationships</span>, analyze suspicious
            activity, and accelerate fraud and cybercrime investigations with{" "}
            <span className="tx-hi">AI-powered intelligence</span>.
          </p>
        </Reveal>
        <Reveal delay={300}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            <TxButton label="Launch App" href="/overview" variant="solid" />
            <TxButton label="Explore TRACE X" href="#platform" variant="ghost" />
            <a className="tx-link" href="#intelligence">
              See how it works
              <span className="tx-link__arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </Reveal>
        <Reveal delay={380}>
          <div className="mt-14 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <ShieldMark size={92} />
            <div className="text-left">
              <p className="m-0 text-[15px] text-[color:var(--tx-ink)]">
                Built for secure investigations
              </p>
              <p className="tx-mono m-0 mt-1.5 text-[color:var(--tx-muted)]">
                Evidence integrity · Access control · Full audit trail
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
