import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How the Foldline MVP handles account information and uploaded business documents.",
  alternates: { canonical: "/legal/privacy" },
};

export default function Privacy(){return <><SiteHeader/><main className="legalPage container"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Privacy"}]}/><span className="eyebrow">MVP privacy notice</span><h1>Privacy</h1><p><strong>What Foldline processes.</strong> The product processes account information, uploaded business documents, extracted fields, review actions and billing identifiers required to provide the service.</p><p><strong>Storage and processing.</strong> The intended production architecture stores account and structured data in Supabase and original documents in a private Cloudflare R2 bucket. OCR processing may temporarily transfer a document to the configured GPU processing service. Billing is handled through Stripe-hosted flows.</p><p><strong>Access.</strong> Document access is designed around short-lived signed URLs and row-level database policies rather than public object URLs.</p><p><strong>Retention.</strong> A public launch must define and enforce an explicit retention/deletion schedule. Do not promise a retention period until the deployed cleanup jobs actually enforce it.</p><p><strong>Your choices.</strong> Before a public launch, this notice must be completed with the operating legal entity, contact details, applicable user rights, jurisdiction-specific disclosures, subprocessors and retention periods.</p><div className="legalNotice">This is a transparent MVP notice, not a substitute for jurisdiction-specific legal review before accepting production customers.</div></main></>}
