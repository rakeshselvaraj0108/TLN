import { Capabilities } from "@/components/landing/Capabilities";
import { ContactSection } from "@/components/landing/ContactSection";
import { EntityGraph } from "@/components/landing/EntityGraph";
import { Hero } from "@/components/landing/Hero";
import { Integrations } from "@/components/landing/Integrations";
import { InvestigationTimeline } from "@/components/landing/InvestigationTimeline";
import { Platform } from "@/components/landing/Platform";
import { PolicingSection } from "@/components/landing/PolicingSection";
import { ShieldLayer } from "@/components/landing/ShieldLayer";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";

export const metadata = {
  title: "TRACE X — AI intelligence for modern investigations",
  description:
    "TRACE X helps investigators connect evidence, uncover hidden relationships, and accelerate fraud and cybercrime investigations with AI-powered intelligence.",
};

export default function LandingPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <ShieldLayer />
        <Platform />
        <Integrations />
        <Capabilities />
        <EntityGraph />
        <InvestigationTimeline />
        <PolicingSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </>
  );
}
