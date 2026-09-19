"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { CrossMark, TxButton } from "@/components/landing/primitives";
import { useThemeMode } from "@/lib/theme";
function _Component3(e) {
  let { className: t = "" } = e;
  let { isDay: r, mounted: a, toggle: i } = useThemeMode();
  let o = r ? "Switch to night mode" : "Switch to day mode";
  return (
    <button type="button" onClick={i} aria-label={o} title={o} className={`tx-theme-switch ${t}`}>
      <span suppressHydrationWarning={true} className="tx-theme-switch__icon">
        {a && r ? (
          <Moon width={15} height={15} strokeWidth={1.5} />
        ) : (
          <Sun width={15} height={15} strokeWidth={1.5} />
        )}
      </span>
    </button>
  );
}
let h = [
  {
    label: "Platform",
    href: "#platform",
  },
  {
    label: "Intelligence",
    href: "#intelligence",
  },
  {
    label: "Capabilities",
    href: "#capabilities",
  },
  {
    label: "Security",
    href: "#security",
  },
  {
    label: "Contact",
    href: "#contact",
  },
];
let u = "/overview";
export function SiteHeader() {
  let [e, t] = useState(false);
  let [r, l] = useState(false);
  useEffect(() => {
    let e = () => t(window.scrollY > 8);
    e();
    window.addEventListener("scroll", e, {
      passive: true,
    });
    return () => window.removeEventListener("scroll", e);
  }, []);
  useEffect(() => {
    if (!r) {
      return;
    }
    let e = (e) => {
      if (e.key === "Escape") {
        l(false);
      }
    };
    window.addEventListener("keydown", e);
    return () => window.removeEventListener("keydown", e);
  }, [r]);
  return (
    <header className="tx-nav" data-stuck={e}>
      <nav
        aria-label="Primary"
        className="tx-container flex h-full items-center gap-4 px-5 sm:px-7 lg:grid lg:grid-cols-[1fr_auto_1fr]"
      >
        <div className="flex items-center gap-3">
          <a
            href="#top"
            className="flex items-center gap-2.5 text-[color:var(--tx-ink)] no-underline"
          >
            <CrossMark size={26} />
            <span className="text-[15px] tracking-[0.16em]">TRACE X</span>
            <span className="sr-only">— home</span>
          </a>
        </div>
        <ul className="hidden list-none items-center gap-8 p-0 lg:flex">
          {h.map((e) => (
            <li key={e.href}>
              <a className="tx-nav__link" href={e.href}>
                {e.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-3">
          <_Component3 />
          <div className="hidden items-center gap-3 lg:flex">
            <TxButton label="Contact us" href="#contact" variant="ghost" />
            <TxButton label="Launch App" href={u} variant="solid" />
          </div>
          <button
            type="button"
            className="tx-burger"
            aria-expanded={r}
            aria-controls="tx-mobile-nav"
            aria-label={r ? "Close menu" : "Open menu"}
            onClick={() => l((e) => !e)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>
      <div id="tx-mobile-nav" className="tx-mobile-panel" data-open={r}>
        <ul className="m-0 list-none px-5 py-2">
          {h.map((e) => (
            <li className="border-b border-[color:rgb(var(--tx-ink-rgb) / 0.08)]" key={e.href}>
              <a
                href={e.href}
                className="block py-4 text-[17px] text-[color:var(--tx-ink)] no-underline"
                onClick={() => l(false)}
              >
                {e.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 px-5 pb-6 pt-4">
          <TxButton label="Launch App" href={u} variant="solid" className="w-full" />
          <TxButton
            label="Contact us"
            href="#contact"
            variant="ghost"
            className="w-full"
          />
        </div>
      </div>
    </header>
  );
}
