import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Foldline is validating early-access pricing for invoice exception control. Test the MVP before any paid plan exists.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing(){return <><SiteHeader/><main className="pricingPage"><div className="container"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Pricing"}]}/><div className="pricingIntro"><span className="eyebrow">Early access</span><h1>Test the exception workflow before paying for anything.</h1><p>Paid plans are not live yet. Early users can reserve a preorder with no card and no charge.</p></div><div className="pricingGrid"><div className="priceCard"><span>Free MVP</span><h2>$0</h2><p>For testing the current workflow.</p><ul><li><Check/>Invoice exception review</li><li><Check/>Exact + strong near-duplicate checks</li><li><Check/>Arithmetic and extraction exceptions</li></ul><Link className="button buttonGhost buttonWide" href="/signup">Start free</Link></div><div className="priceCard featured"><span>Early preorder</span><h2>No charge</h2><p>Reserve a place while the production plan and pricing are being validated.</p><ul><li><Check/>No card required</li><li><Check/>No automatic subscription</li><li><Check/>Contact before any payment starts</li></ul><Link className="button buttonAccent buttonWide" href="/signup">Create account to reserve</Link></div><div className="priceCard"><span>Team</span><h2>Later</h2><p>After the workflow is validated.</p><ul><li><Check/>Multi-user review</li><li><Check/>Integrations</li><li><Check/>Custom retention</li></ul><button className="button buttonGhost buttonWide" disabled>Coming later</button></div></div></div></main></>}
