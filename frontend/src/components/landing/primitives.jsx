"use client";

import { useId } from "react";
import { useInView } from "@/lib/motion";
export function Reveal(e) {
  let { children: t, delay: n = 0, as: _Component1 = "div", className: s = "" } = e;
  let [l, c] = useInView();
  return (
    <_Component1
      ref={l}
      className={`tx-reveal ${c ? "is-in" : ""} ${s}`.trim()}
      style={{
        "--tx-delay": `${n}ms`,
      }}
    >
      {t}
    </_Component1>
  );
}
export function TxButton(e) {
  let {
    label: t,
    href: n,
    variant: r = "solid",
    type: i = "button",
    onClick: s,
    className: l = "",
    target: c,
    rel: o,
    disabled: d,
  } = e;
  let u = `tx-btn tx-btn--${r} ${l}`.trim();
  let h = (
    <span className="tx-btn__swap">
      <span className="tx-btn__stack">
        <span>{t}</span>
        <span aria-hidden="true">{t}</span>
        <span aria-hidden="true">{t}</span>
      </span>
    </span>
  );
  if (n) {
    return (
      <a href={n} className={u} target={c} rel={o}>
        {h}
      </a>
    );
  } else {
    return (
      <button type={i} className={u} onClick={s} disabled={d}>
        {h}
      </button>
    );
  }
}
export function CrossMark(e) {
  let { size: t = 26, className: n } = e;
  return (
    <svg
      width={t}
      height={t}
      viewBox="0 0 28 28"
      fill="none"
      className={n}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6.5 6.5 21.5 21.5M21.5 6.5 6.5 21.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M6.5 6.5H14v15h7.5"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeOpacity="0.28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        [6.5, 6.5],
        [21.5, 6.5],
        [6.5, 21.5],
        [21.5, 21.5],
      ].map((e) => {
        let [t, n] = e;
        return (
          <circle
            cx={t}
            cy={n}
            r="2.3"
            fill="var(--tx-bg)"
            stroke="currentColor"
            strokeWidth="1.3"
            key={`${t}-${n}`}
          />
        );
      })}
      <circle cx="14" cy="14" r="3.1" fill="var(--tx-orange)" />
    </svg>
  );
}
export function ShieldMark(e) {
  let { size: t = 104, className: n = "" } = e;
  let i = useId().replace(/:/g, "");
  return (
    <svg
      width={t}
      height={t}
      viewBox="0 0 120 120"
      fill="none"
      className={n}
      role="img"
      aria-label="TRACE X — secure intelligence for investigation"
    >
      <defs>
        <path id={i} d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
      </defs>
      <g className="tx-seal">
        <circle cx="60" cy="60" r="52" stroke="rgb(var(--tx-ink-rgb) / 0.14)" strokeWidth="1" />
        <text
          fill="var(--tx-muted)"
          style={{
            fontSize: "7.4px",
            letterSpacing: "1.3px",
            fontFamily: "var(--font-jetbrains-mono), monospace",
          }}
        >
          <textPath href={`#${i}`} startOffset="0">
            TRACE X · SECURE · INTELLIGENCE · INVESTIGATION ·
          </textPath>
        </text>
      </g>
      <path
        d="M52 27h16l11.3 11.3v16L68 65.6H52L40.7 54.3v-16z"
        transform="translate(0 14.2)"
        stroke="rgb(var(--tx-ink-rgb) / 0.2)"
        strokeWidth="1"
        fill="none"
      />
      <circle cx="60" cy="60" r="4.6" fill="var(--tx-orange)" />
      <path
        d="M49 49 71 71M71 49 49 71"
        stroke="rgb(var(--tx-ink-rgb) / 0.22)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
