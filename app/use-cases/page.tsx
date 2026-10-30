import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CopyX, FileSpreadsheet, GitCompareArrows, ListChecks, ScanText, TimerReset } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "What's checked",
  description: "Which invoice exceptions Foldline catches today, and what comes next only if AP teams ask for it.",
  alternates: { canonical: "/use-cases" },
};

export default function UseCasesPage() {
  return <><SiteHeader /><main className="contentPage"><div className="container narrowContent"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "What's checked" }]} />
    <span className="eyebrow">Shipping vs. next — no invented case studies</span>
    <h1>Built from conversations with AP teams.</h1>
    <p className="lede">Every check below exists because an AP practitioner described doing it by hand. Things on the “next” list get built only after more teams confirm the same problem.</p>
    <div className="useCaseGrid">
      <article><CopyX /><span>Available now</span><h2>Duplicates & near-duplicates</h2><p>Exact repeats, numbers that only differ in spaces, dashes or leading zeros, a suffix or prefix added, same supplier + amount + date under a new number, and the same number with a different amount.</p></article>
      <article><FileSpreadsheet /><span>Available now</span><h2>Incomplete invoices</h2><p>Supplier, invoice number, date and total must be present. Missing or unreadable fields send the invoice to review, so you can request a corrected copy early.</p></article>
      <article><ScanText /><span>Available now</span><h2>Inconsistent totals</h2><p>Subtotal + VAT vs total, line sums and quantity × unit price — reported as an issue only when the numbers were read reliably.</p></article>
      <article><ListChecks /><span>Next, if confirmed</span><h2>Required fields per client</h2><p>Some accounts can't be processed without a PO number, service ID or circuit ID. Configure what's mandatory for each client.</p></article>
      <article><TimerReset /><span>Next, if confirmed</span><h2>Revised invoice tracking</h2><p>Open → waiting for vendor → revised copy received → resolved, with the original and the revision linked.</p></article>
      <article><GitCompareArrows /><span>Later</span><h2>Invoice ↔ PO / receipt matching</h2><p>Quantity and price against purchase orders and goods receipts. Deliberately deferred until the simpler checks prove their value.</p></article>
    </div>
    <div className="inlineCta"><div><strong>Seeing a different exception every week?</strong><p>Upload a batch, then tell us which flag mattered and which one was noise. That decides what gets built next.</p></div><Link href="/signup" className="button buttonAccent">Start free <ArrowRight size={16} /></Link></div>
  </div></main></>;
}
