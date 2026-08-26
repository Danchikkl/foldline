import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

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
    <p><strong>Contact.</strong> Questions about these terms can be sent through the <Link href="/contact">contact page</Link>.</p>
    <div className="legalNotice">This MVP draft should be reviewed for the operating entity and relevant launch jurisdictions before accepting production customers at scale.</div>
  </main></>;
}
