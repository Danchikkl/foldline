import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Terms",
  description: "MVP terms and important limitations for using Foldline document extraction.",
  alternates: { canonical: "/legal/terms" },
};

export default function Terms(){return <><SiteHeader/><main className="legalPage container"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Terms"}]}/><span className="eyebrow">MVP terms</span><h1>Terms</h1><p><strong>Human review is required.</strong> Foldline is an early-stage document-processing product. Extracted fields and automated checks can be incomplete or wrong. Users remain responsible for reviewing data before relying on it for accounting, legal, tax or operational decisions.</p><p><strong>No professional advice.</strong> Foldline structures information; it does not provide accounting, legal or tax advice.</p><p><strong>Acceptable content.</strong> Users must have the right to upload and process the documents they submit and must not use the service to violate law or third-party rights.</p><p><strong>Payments.</strong> Paid plans use Stripe-hosted billing. Production terms must specify renewal, cancellation, refunds, taxes and the contracting legal entity before live payments are enabled.</p><div className="legalNotice">Replace this MVP draft with terms reviewed for the operating entity and launch jurisdiction before accepting production customers.</div></main></>}
