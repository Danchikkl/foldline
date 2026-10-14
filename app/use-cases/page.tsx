import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileSpreadsheet, GitCompareArrows, ListChecks } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Use cases",
  description: "Invoice exception control today; deeper AP workflows next.",
  alternates: { canonical: "/use-cases" },
};

export default function UseCasesPage() {
  return <><SiteHeader/><main className="contentPage"><div className="container narrowContent"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Use cases"}]}/><span className="eyebrow">Workflow examples — not fabricated case studies</span><h1>Start with invoice exceptions. Expand only where the pain repeats.</h1><p className="lede">These are product workflows, not fabricated customer case studies. The current MVP stays narrow while duplicate, revision and exception workflows are validated with real AP teams.</p><div className="useCaseGrid"><article><FileSpreadsheet/><span>Available in MVP</span><h2>Incoming invoice → exception check</h2><p>Extract core invoice data, check arithmetic, detect exact duplicates and surface strong near-reference duplicate candidates for human review.</p></article><article><GitCompareArrows/><span>Validation next</span><h2>Exception → revised invoice</h2><p>Track an invoice that needs correction, link the revised copy and keep the unresolved case visible until it is closed. This workflow is being validated before we build it deeply.</p></article><article><ListChecks/><span>Later</span><h2>Invoice ↔ PO / GRN</h2><p>Compare invoices with purchase orders and receipts only after customer evidence shows which matching exceptions are worth automating.</p></article></div><div className="inlineCta"><div><strong>Have a document-heavy workflow?</strong><p>Use the invoice exception MVP first, then show us where the manual rework actually happens.</p></div><Link href="/signup" className="button buttonAccent">Start free <ArrowRight size={16}/></Link></div></div></main></>;
}
