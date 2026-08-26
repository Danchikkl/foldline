import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How the Foldline MVP handles account information, pilot requests and uploaded business documents.",
  alternates: { canonical: "/legal/privacy" },
};

export default function Privacy() {
  return <><SiteHeader/><main className="legalPage container"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Privacy"}]}/><span className="eyebrow">MVP privacy notice</span><h1>Privacy</h1>
    <p><strong>What Foldline processes.</strong> Foldline may process account information, uploaded business documents, extracted fields, review actions and the information you voluntarily submit through the pilot request form, such as your name, email, company, role and message.</p>
    <p><strong>Why this information is used.</strong> Account and document data is used to provide the document-review workflow. Pilot request information is used to understand your use case and reply to your request. Foldline does not sell this information to advertisers.</p>
    <p><strong>Storage and processing.</strong> Account data, structured data, pilot requests and original documents are stored using Supabase. Uploaded documents may be converted to machine-readable text through Cloudflare Workers AI as part of the processing workflow.</p>
    <p><strong>Access.</strong> Original documents are kept in private storage and accessed through short-lived signed links. Database access is restricted with authenticated server logic and row-level policies where applicable.</p>
    <p><strong>Retention.</strong> Foldline is still an early-stage MVP. A final production retention schedule has not yet been published. Do not upload data that your organization is not authorized to process, and contact Foldline if you want a pilot request or account-related record reviewed for deletion.</p>
    <p><strong>Contact.</strong> Privacy questions and deletion requests can be sent through the <Link href="/contact">contact and pilot request page</Link>. A dedicated privacy mailbox will be added before broader production use.</p>
    <div className="legalNotice">This is a transparent MVP notice and should be reviewed for the operating entity, launch jurisdictions, subprocessors and final retention rules before accepting production customers at scale.</div>
  </main></>;
}
