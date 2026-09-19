"use client";

import { CrossMark } from "@/components/landing/primitives";
import { CONTACT_EMAIL } from "@/lib/contact";
let i = [
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
let l = [
  {
    label: "Contact",
    href: "#contact",
  },
  {
    label: "Privacy Policy",
    href: "/landing/privacy",
  },
  {
    label: "Terms of Service",
    href: "/landing/terms",
  },
];
export function SiteFooter() {
  return (
    <footer className="border-t border-[color:rgb(var(--tx-ink-rgb) / 0.12)]">
      <div className="tx-container px-5 py-16 sm:px-7">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
          <div>
            <div className="flex items-center gap-2.5 text-[color:var(--tx-ink)]">
              <CrossMark size={26} />
              <span className="text-[15px] tracking-[0.16em]">TRACE X</span>
            </div>
            <p className="tx-body tx-body--sm mt-5 max-w-[34ch]">
              AI-powered intelligence for modern investigations.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="tx-mono m-0 text-[color:var(--tx-muted)]">Platform</p>
            <ul className="m-0 mt-5 list-none p-0">
              {i.map((e) => (
                <li className="mb-3" key={e.href}>
                  <a
                    className="text-[15px] text-[#555] no-underline transition-colors hover:text-[color:var(--tx-orange)]"
                    href={e.href}
                  >
                    {e.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Institutional">
            <p className="tx-mono m-0 text-[color:var(--tx-muted)]">Institutional</p>
            <ul className="m-0 mt-5 list-none p-0">
              {l.map((e) => (
                <li className="mb-3" key={e.href}>
                  <a
                    className="text-[15px] text-[#555] no-underline transition-colors hover:text-[color:var(--tx-orange)]"
                    href={e.href}
                  >
                    {e.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="tx-mono m-0 text-[color:var(--tx-muted)]">Contact</p>
            <ul className="m-0 mt-5 list-none p-0 text-[15px]">
              <li className="mb-3">
                <a
                  className="text-[#555] no-underline transition-colors hover:text-[color:var(--tx-orange)]"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-[color:rgb(var(--tx-ink-rgb) / 0.12)] pt-7 text-[13px] text-[color:var(--tx-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">© 2026 TRACE X. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
