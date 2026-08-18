import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start Foldline free with 10 documents per month, then upgrade when document review becomes part of your workflow.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing(){return <><SiteHeader/><main className="pricingPage"><div className="container"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Pricing"}]}/><div className="pricingIntro"><span className="eyebrow">Simple MVP pricing</span><h1>Pay for documents, not seats.</h1><p>Start free, upgrade when Foldline becomes part of the workflow.</p></div><div className="pricingGrid"><div className="priceCard"><span>Free</span><h2>$0</h2><p>For testing the workflow.</p><ul><li><Check/>10 documents / month</li><li><Check/>Proof Mode</li><li><Check/>CSV export</li></ul><Link className="button buttonGhost buttonWide" href="/signup">Start free</Link></div><div className="priceCard featured"><span>Pro</span><h2>$29<small>/mo</small></h2><p>For real operational use.</p><ul><li><Check/>500 documents / month</li><li><Check/>Priority processing</li><li><Check/>Full audit trail</li></ul><Link className="button buttonAccent buttonWide" href="/signup">Create account</Link></div><div className="priceCard"><span>Team</span><h2>Later</h2><p>After the workflow is validated.</p><ul><li><Check/>Multi-user review</li><li><Check/>ERP integrations</li><li><Check/>Custom retention</li></ul><button className="button buttonGhost buttonWide" disabled>Coming soon</button></div></div></div></main></>}
