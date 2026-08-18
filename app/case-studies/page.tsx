import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Case studies",
  description: "Verified Foldline customer case studies will be published after pilots with customer approval.",
  alternates: { canonical: "/case-studies" },
};

export default function CaseStudiesPage() {
  return <><SiteHeader/><main className="contentPage"><div className="container narrowContent"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Case studies"}]}/><span className="eyebrow">Evidence before marketing</span><h1>No invented case studies.</h1><p className="lede">Foldline is pre-pilot. We will publish a customer story only when the workflow has been used on real documents, the result is measurable, and the customer approves the quote and numbers.</p><div className="disclosureCard"><BadgeCheck size={20}/><strong>What the first case study should measure</strong><p>Documents per month, manual minutes per document, exception rate, correction rate, time-to-approved-export and the specific workflow that changed.</p></div><div className="inlineCta"><div><strong>Until then, inspect the workflow itself.</strong><p>See exactly what is shipping versus what is still a research candidate.</p></div><Link href="/use-cases" className="button buttonAccent">View use cases <ArrowRight size={16}/></Link></div></div></main></>;
}
