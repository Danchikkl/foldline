import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PilotRequestForm } from "@/components/pilot-request-form";

export const metadata: Metadata = {
  title: "Request a pilot",
  description: "Ask to test Foldline on a real document-checking workflow.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="contentPage">
        <div className="container narrowContent">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Request a pilot" }]} />
          <span className="eyebrow">Early pilot</span>
          <h1>Have a document workflow that still needs a second pair of eyes?</h1>
          <p className="lede">
            Tell me what you currently check by hand. If Foldline is a reasonable fit, I’ll reply and we can test the workflow on a small anonymized document set.
          </p>
          <PilotRequestForm />
        </div>
      </main>
    </>
  );
}
