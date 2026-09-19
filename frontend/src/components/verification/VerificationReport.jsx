"use client";

import { useState } from "react";
import {
  ChevronRight,
  CircleHelp,
  FileWarning,
  Scale,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sigma,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
let l = FileWarning;
let d = ShieldAlert;
let u = Sigma;
let f = {
  verified: {
    label: "Cross-verified",
    icon: ShieldCheck,
    text: "text-[color:var(--ok)]",
    ring: "border-[color:var(--ok)]/35 bg-[color:var(--ok)]/[0.07]",
  },
  partial: {
    label: "Partly verified",
    icon: ShieldQuestion,
    text: "text-accent-bright",
    ring: "border-accent/40 bg-accent/[0.06]",
  },
  unsupported: {
    label: "Not supported by evidence",
    icon: l,
    text: "text-risk",
    ring: "border-risk-border bg-risk-bg",
  },
  compromised: {
    label: "Citation did not resolve",
    icon: d,
    text: "text-risk",
    ring: "border-risk-border bg-risk-bg",
  },
  unavailable: {
    label: "Unverified",
    icon: CircleHelp,
    text: "text-ink-muted",
    ring: "border-canvas-border bg-canvas-panel",
  },
};
let v = {
  verified: {
    label: "Verified",
    text: "text-[color:var(--ok)]",
    icon: ShieldCheck,
  },
  supported: {
    label: "Supported",
    text: "text-[color:var(--ok)]",
    icon: ShieldCheck,
  },
  computed: {
    label: "Computed from records",
    text: "text-[color:var(--ok)]",
    icon: u,
  },
  uncited: {
    label: "No evidence cited",
    text: "text-ink-muted",
    icon: ShieldQuestion,
  },
  unverifiable: {
    label: "Unchecked",
    text: "text-ink-muted",
    icon: CircleHelp,
  },
  unsupported: {
    label: "Unsupported",
    text: "text-risk",
    icon: l,
  },
  disputed: {
    label: "Judges disagreed",
    text: "text-accent-bright",
    icon: Scale,
  },
  tampered: {
    label: "Evidence altered",
    text: "text-risk",
    icon: TriangleAlert,
  },
  fabricated: {
    label: "Fabricated citation",
    text: "text-risk",
    icon: d,
  },
};
function _Component4(e) {
  var t;
  let { check: i } = e;
  let [s, c] = useState(false);
  let l = v[(t = i.verdict)] ?? {
    label: t,
    text: "text-ink-muted",
    icon: CircleHelp,
  };
  let _Component2 = l.icon;
  let u = i.judges.filter((e) => e.vote === "supported" || e.vote === "unsupported");
  let h = i.evidence.length > 0 || u.length > 0;
  return (
    <div className="border-b border-canvas-border last:border-b-0">
      <button
        type="button"
        onClick={() => h && c((e) => !e)}
        aria-expanded={h ? s : undefined}
        disabled={!h}
        className={cn(
          "flex w-full items-start gap-2 px-2.5 py-2 text-left transition",
          h && "focus-ring hover:bg-canvas-hover",
        )}
      >
        {h ? (
          <ChevronRight
            className={cn(
              "mt-0.5 h-3 w-3 shrink-0 text-ink-faint transition-transform",
              s && "rotate-90",
            )}
            aria-hidden={true}
          />
        ) : (
          <span className="w-3 shrink-0" aria-hidden={true} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[0.75rem] leading-relaxed text-ink">{i.claim}</p>
          <p className={cn("mt-0.5 text-[0.6875rem] leading-relaxed", l.text)}>{i.reason}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[0.625rem] font-medium",
            l.text,
          )}
        >
          <_Component2 className="h-3 w-3" strokeWidth={2} aria-hidden={true} />
          {l.label}
        </span>
      </button>
      {s && h ? (
        <div className="animate-fade-in space-y-2 bg-canvas-panel/50 px-2.5 py-2 pl-7">
          {i.evidence.length ? (
            <div>
              <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Evidence resolved
              </div>
              <ul className="space-y-1">
                {i.evidence.map((e, t) => (
                  <li className="flex gap-2 text-[0.6875rem] leading-relaxed" key={t}>
                    <span
                      aria-hidden={true}
                      className={cn(
                        "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                        e.found && e.hash_ok ? "bg-[color:var(--ok)]" : "bg-risk",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="font-mono text-ink-muted">{e.cited}</span>{" "}
                      <span className="text-ink-faint">{e.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {u.length ? (
            <div>
              <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Judges
              </div>
              <ul className="space-y-0.5">
                {u.map((e, t) => (
                  <li className="text-[0.6875rem] leading-relaxed text-ink-faint" key={t}>
                    <span className="font-mono text-ink-muted">{e.judge}</span> —{" "}
                    <span className={e.vote === "unsupported" ? "text-risk" : undefined}>
                      {e.vote}
                    </span>
                    {e.reason ? `: ${e.reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
export function VerificationReport(e) {
  let { result: c, defaultOpen: l } = e;
  let d = f[c.verdict] ?? f.unavailable;
  let _Component3 = d.icon;
  let [u, h] = useState(l ?? (c.verdict === "compromised" || c.verdict === "unsupported"));
  let m = (c.counts.verified ?? 0) + (c.counts.supported ?? 0) + (c.counts.computed ?? 0);
  let v = c.claims.length;
  return (
    <div className={cn("animate-fade-in rounded border", d.ring)}>
      <button
        type="button"
        onClick={() => h((e) => !e)}
        aria-expanded={u}
        className="focus-ring flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <_Component3
          className={cn("mt-0.5 h-4 w-4 shrink-0", d.text)}
          strokeWidth={2}
          aria-hidden={true}
        />
        <div className="min-w-0 flex-1">
          <div className={cn("text-[0.8125rem] font-medium", d.text)}>{d.label}</div>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-muted">{c.headline}</p>
          {v > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-ink-faint">
              <span>
                {m}/{v} claims backed by the record store
              </span>
              <span>{c.evidence_resolved} records resolved</span>
              <span>{c.independent_checks} independent checks</span>
            </div>
          ) : null}
        </div>
        <ChevronRight
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform",
            u && "rotate-90",
          )}
          aria-hidden={true}
        />
      </button>
      {u ? (
        <div className="animate-fade-in border-t border-canvas-border">
          {c.claims.length ? (
            <div>
              {c.claims.map((e, t) => (
                <_Component4 check={e} key={t} />
              ))}
            </div>
          ) : (
            <p className="px-3 py-2.5 text-[0.75rem] text-ink-muted">
              Nothing in this answer asserts a checkable fact.
            </p>
          )}
          <div className="space-y-1 border-t border-canvas-border px-3 py-2">
            {c.judges_used.length ? (
              <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
                Settled without a model: <em>verified</em> means every cited record was re-hashed
                and matched, and <em>computed</em> means the figure came from a query over those
                records. Only claims resting on interpretation reach the judge panel (
                {c.judges_used.join(", ")}).
              </p>
            ) : null}
            {c.caveats.map((e, t) => (
              <p className="text-[0.6875rem] leading-relaxed text-ink-faint" key={t}>
                {e}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
