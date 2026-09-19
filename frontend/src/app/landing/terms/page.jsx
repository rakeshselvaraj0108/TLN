import Link from "next/link";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = {
  title: "Terms of Service — TRACE X",
  description:
    "What this page is, and where the governing terms for a TRACE X deployment come from.",
};

export default function LandingTermsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <section className="tx-section">
          <div className="tx-container tx-container--narrow">
            <p className="tx-eyebrow">TRACE X</p>
            <h1 className="tx-h2 mt-6">Terms of Service</h1>
            <p className="tx-body tx-body--lead mt-7 max-w-[62ch]">
              Use of TRACE X is governed by the agreement between the deploying department and the
              platform operator. This page describes the product; it is not itself that agreement.
            </p>
            <ul className="mt-10 list-none border-t border-[color:rgb(var(--tx-ink-rgb) / 0.12)] p-0">
              <li
                key="Figures, case identifiers and entity names shown on this site are illustrative. They are not live case data and are not drawn from any police record."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                Figures, case identifiers and entity names shown on this site are illustrative. They
                are not live case data and are not drawn from any police record.
              </li>
              <li
                key="Descriptions of platform behaviour reflect how TRACE X is designed to operate in a configured deployment, not a warranty of results in any particular investigation."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                Descriptions of platform behaviour reflect how TRACE X is designed to operate in a
                configured deployment, not a warranty of results in any particular investigation.
              </li>
              <li
                key="TRACE X supports investigators; it does not make investigative or prosecutorial decisions, which remain with authorised officers."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                TRACE X supports investigators; it does not make investigative or prosecutorial
                decisions, which remain with authorised officers.
              </li>
              <li
                key="The governing terms, service levels and security schedules for a deployment are issued with that deployment — request them from the deploying organisation or the TRACE X team, using the contact below."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                The governing terms, service levels and security schedules for a deployment are
                issued with that deployment — request them from the deploying organisation or the TRACE X team, using the contact below.
              </li>
            </ul>
            <div className="mt-12 flex flex-wrap items-center gap-6">
              <a className="tx-link" href={`mailto:${CONTACT_EMAIL}`}>
                Email us
                <span className="tx-link__arrow" aria-hidden="true">
                  →
                </span>
              </a>
              <Link className="tx-link" href="/landing">
                Back to TRACE X
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
