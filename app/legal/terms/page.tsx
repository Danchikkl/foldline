import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { TRIAL_TERMS_VERSION } from "@/lib/trial";

export const metadata: Metadata = {
  title: "Terms",
  description: "MVP terms and important limitations for using Foldline document review.",
  alternates: { canonical: "/legal/terms" },
};

export default function Terms() {
  return <><SiteHeader/><main className="legalPage container"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Terms"}]}/><span className="eyebrow">MVP terms</span><h1>Terms</h1>
    <p><strong>Human review is required.</strong> Foldline is an early-stage document-processing product. Extracted fields and automated checks can be incomplete or wrong. Users remain responsible for reviewing results before relying on them for accounting, legal, tax, customs or operational decisions.</p>
    <p><strong>No professional advice.</strong> Foldline structures and checks document information; it does not provide accounting, legal, customs or tax advice.</p>
    <p><strong>Acceptable content.</strong> Users must have the right to upload and process the documents they submit and must not use the service to violate law, confidentiality obligations or third-party rights.</p>
    <p><strong>Early pilots.</strong> A pilot request is an invitation to discuss a possible test. Submitting the form does not create a paid contract, guarantee support or promise that Foldline will be suitable for a particular workflow.</p>
    <p><strong>Payments.</strong> Any paid offering must show its price and applicable billing terms before payment is taken. Broader production terms will be finalized before live commercial use at scale.</p>
    <section id="trial" className="legalSection">
      <h2>Trial terms</h2>
      <p className="legalVersion">Version {TRIAL_TERMS_VERSION}. You accept these terms with a checkbox before your first upload; the version and time of acceptance are recorded.</p>
      <p><strong>Free evaluation, as is.</strong> Foldline is an early-stage product offered for evaluation, free of charge and &ldquo;as is&rdquo;.</p>
      <p><strong>Use test data.</strong> We strongly recommend uploading only redacted, anonymised or sample invoices during the trial. Remove personal names, bank details and any information you are not authorised to share. By uploading, you confirm you have the right to do so. Built-in sample invoices are fictional.</p>
      <p><strong>No guarantees.</strong> Automated checks can miss duplicates or flag invoices incorrectly. Results are for review only and are not accounting, tax or legal advice. You remain responsible for every payment decision.</p>
      <p><strong>Your data.</strong> Your files are stored privately, are never sold, are not used to train AI models and are visible only to your workspace. Documents are converted to text using Cloudflare Workers AI and stored with Supabase. You can request deletion at any time, and we delete trial documents within 30 days of a request.</p>
      <p><strong>Liability.</strong> To the extent permitted by law, Foldline is not liable for losses arising from use of the trial, including missed or incorrect flags.</p>
      <p><strong>Changes.</strong> These terms may change before paid plans launch. If they change, you will be asked to accept the new version before uploading again.</p>
    </section>
    <p><strong>Contact.</strong> Questions about these terms can be sent through the <Link href="/contact">contact page</Link>.</p>
    <div className="legalNotice">This MVP draft should be reviewed for the operating entity and relevant launch jurisdictions before accepting production customers at scale.</div>
  </main></>;
}
