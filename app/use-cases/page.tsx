import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileSpreadsheet, GitCompareArrows, ListChecks } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Use cases",
  description: "Invoice extraction today; reconciliation and document-heavy workflows next.",
  alternates: { canonical: "/use-cases" },
};

export default function UseCasesPage() {
  return <><SiteHeader/><main className="contentPage"><div className="container narrowContent"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Use cases"}]}/><span className="eyebrow">Workflow examples — not fabricated case studies</span><h1>Start with invoices. Expand into decisions.</h1><p className="lede">We will publish actual customer case studies only after customers approve them. Until then, these are transparent product workflows rather than invented success stories.</p><div className="useCaseGrid"><article><FileSpreadsheet/><span>Available in MVP</span><h2>Invoice → reviewed data</h2><p>Extract supplier, BIN/IIN, dates, line items, VAT and totals. Reconcile arithmetic and send only exceptions to a human.</p></article><article><GitCompareArrows/><span>Next workflow</span><h2>Invoice ↔ purchase order</h2><p>Compare quantity, unit price and totals across related documents and flag mismatches that could cause overpayment or rework.</p></article><article><ListChecks/><span>Research candidate</span><h2>Tender → requirement checklist</h2><p>Convert long tender packs into requirements, deadlines and evidence-linked checklists. This is a candidate, not a shipping promise.</p></article></div><div className="inlineCta"><div><strong>Have a document-heavy workflow?</strong><p>Use the invoice MVP first, then tell us where the expensive manual step actually is.</p></div><Link href="/signup" className="button buttonAccent">Start free <ArrowRight size={16}/></Link></div></div></main></>;
}
