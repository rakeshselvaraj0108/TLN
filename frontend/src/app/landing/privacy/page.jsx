import Link from "next/link";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = {
  title: "Privacy Policy — TRACE X",
  description:
    "How this page handles the information you enter, and where the governing privacy policy for TRACE X comes from.",
};

export default function LandingPrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <section className="tx-section">
          <div className="tx-container tx-container--narrow">
            <p className="tx-eyebrow">TRACE X</p>
            <h1 className="tx-h2 mt-6">Privacy Policy</h1>
            <p className="tx-body tx-body--lead mt-7 max-w-[62ch]">
              TRACE X is a prototype investigative-analytics platform. The governing privacy policy for any deployment is issued by the deploying organisation, not by this page — request the current document from the contact below.
            </p>
            <ul className="mt-10 list-none border-t border-[color:rgb(var(--tx-ink-rgb) / 0.12)] p-0">
              <li
                key="This marketing page has no backend. The enquiry form does not transmit or store anything: it opens your own email client with a message addressed to the TRACE X team."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                This marketing page has no backend. The enquiry form does not transmit or store
                anything: it opens your own email client with a message addressed to the TRACE X team.
              </li>
              <li
                key="Nothing on this page is analytics-instrumented, and it sets no cookies of its own."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                Nothing on this page is analytics-instrumented, and it sets no cookies of its own.
              </li>
              <li
                key="Investigative data handled inside the TRACE X platform is governed by the deploying organisation's own data-protection, retention and disclosure rules."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                Investigative data handled inside the TRACE X platform is governed by the
                deploying organisation's own data-protection, retention and disclosure rules.
              </li>
              <li
                key="Requests to access, correct or erase personal data held in a deployment should be addressed to the deploying organisation, or to the TRACE X team using the contact below."
                className="tx-body tx-body--sm border-b border-[color:rgb(var(--tx-ink-rgb) / 0.12)] py-5"
              >
                Requests to access, correct or erase personal data held in a deployment should be
                addressed to the deploying organisation, or to the TRACE X team using the contact below.
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
