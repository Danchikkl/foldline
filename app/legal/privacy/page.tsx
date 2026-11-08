import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RETENTION_DAYS } from "@/lib/retention";

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
    <section id="private-workspace" className="legalSection">
      <h2>Private workspace (zero-knowledge)</h2>
      <p><strong>What stays on your device.</strong> In the private workspace, invoice files are read and checked in your browser. The file and its text are not sent to Foldline or to Cloudflare Workers AI.</p>
      <p><strong>What we store.</strong> Only encrypted records, plus the salt and wrapped key needed to unlock them with your passphrase. Records are encrypted with AES-256-GCM using a key derived from your workspace passphrase. We never receive the passphrase and cannot decrypt the records.</p>
      <p><strong>What we can still see.</strong> Your account email, which workspace the records belong to, how many records exist, their approximate size and when they were saved.</p>
      <p><strong>Recovery.</strong> Because we cannot decrypt your data, we cannot recover it if the passphrase is lost.</p>
    </section>
    <section id="retention" className="legalSection">
      <h2>Standard workspace: where your files go and how long they are kept</h2>
      <p><strong>Storage.</strong> Original documents and extracted data are stored privately with Supabase. Documents are visible only to members of your workspace, enforced by database row-level security, and opened through signed links that expire after 5 minutes.</p>
      <p><strong>Processing.</strong> Documents are converted to text using Cloudflare Workers AI. They are not used to train AI models and are never sold or shared for marketing.</p>
      <p><strong>Retention.</strong> The original file and its full extracted text are deleted automatically {RETENTION_DAYS} days after upload. Extracted fields (supplier, invoice number, date, amounts, line items) and check results are kept while your account is active, because duplicate checks and the review audit trail depend on them.</p>
      <p><strong>Deletion.</strong> You can delete any document at any time from its review page. This removes the original file from active storage, verifies it is gone, and deletes everything extracted from it. You can also ask us to delete your whole account and its data; we do this within 30 days. Provider backups expire on the provider&apos;s own schedule.</p>
    </section>
    <p><strong>Contact.</strong> Privacy questions and deletion requests can be sent through the <Link href="/contact">contact and pilot request page</Link>. A dedicated privacy mailbox will be added before broader production use.</p>
    <div className="legalNotice">This is a transparent MVP notice and should be reviewed for the operating entity, launch jurisdictions, subprocessors and final retention rules before accepting production customers at scale.</div>
  </main></>;
}
