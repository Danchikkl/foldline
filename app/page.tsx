import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, CopyX, FileSpreadsheet, LockKeyhole, ScanText, ShieldCheck, TimerReset } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { FaqList } from "@/components/faq-list";
import { MobileCta } from "@/components/mobile-cta";
import { VerifiedReviews } from "@/components/verified-reviews";

export default function Home() {
  return <><SiteHeader /><main itemScope itemType="https://schema.org/SoftwareApplication">
    <meta itemProp="name" content="Foldline" />
    <meta itemProp="applicationCategory" content="BusinessApplication" />
    <meta itemProp="operatingSystem" content="Web" />

    <section className="hero"><div className="container heroGrid"><div className="heroCopy">
      <span className="eyebrow"><span className="liveDot" />Invoice exception control for Accounts Payable</span>
      <h1 itemProp="headline">Catch the duplicate invoice<br /><em>your ERP lets through.</em></h1>
      <p itemProp="description">Foldline checks every incoming supplier invoice against the ones you already have — including near-duplicates with a slightly changed invoice number — and flags missing data and totals that don't add up. Your AP team reviews the exceptions, not the whole batch.</p>
      <div className="heroActions"><Link className="button buttonAccent" href="/signup">Check your last batch <ArrowRight size={17} /></Link><Link className="button buttonGhost" href="#duplicates">How duplicates slip through</Link></div>
      <div className="trustRow"><span><Check size={15} />Near-duplicate detection</span><span><Check size={15} />Uncertain reads go to review, not to alarms</span><span><ShieldCheck size={15} />Private storage</span></div>
    </div>
      <div className="heroArtifact" aria-label="Illustration: Foldline flags a possible duplicate invoice"><div className="paperFold" /><div className="artifactTop"><span>INV-10234A.pdf</span><span className="riskPill alert">Possible duplicate</span></div><div className="artifactBody"><div className="scanPane"><div className="fakeInvoice"><b>ACME SUPPLY LLP</b><p>BIN 123456789012</p><p>Invoice # INV-10234A</p><div className="fakeLines"><i /><i /><i /><i /></div><strong>Total ₸ 485,900</strong></div></div><div className="proofPane"><span className="miniLabel">COMPARED WITH 214 EARLIER INVOICES</span><div className="proofCard bad"><CopyX size={15} /><div><b>Possible duplicate</b><span>INV-10234 · same supplier · same total · 3 days apart</span></div></div><div className="proofCard good"><Check size={15} /><div><b>Required fields</b><span>Supplier, number, date, total present</span></div></div><div className="proofCard good"><Check size={15} /><div><b>Totals reconcile</b><span>Subtotal + VAT = total</span></div></div></div></div></div>
    </div></section>

    <section id="how-it-works" className="metricStrip" aria-labelledby="workflow-title"><h2 id="workflow-title" className="srOnly">How Foldline works</h2><div className="container metricGrid">
      <div><b>01</b><span>Upload a batch</span><p>PDFs or scans, up to 50 at once.</p></div>
      <div><b>02</b><span>Read</span><p>Supplier, number, date, totals and lines — each with evidence.</p></div>
      <div><b>03</b><span>Compare</span><p>Against every earlier invoice in your workspace.</p></div>
      <div><b>04</b><span>Review exceptions</span><p>Approve the clean ones, resolve the rest.</p></div>
    </div></section>

    <section id="duplicates" className="featureSection"><div className="container split"><div>
      <span className="eyebrow">Why exact-match isn't enough</span>
      <h2>Change one character and the invoice gets paid twice.</h2>
      <p>ERPs typically block an exact repeat of invoice number and date. AP practitioners we interviewed described what happens next: if the reference is slightly modified, it goes straight through — and surfaces weeks later at reconciliation, after the money has left.</p>
      <div className="refCompare" aria-label="Examples of what Foldline compares">
        <div><span>INV-10234</span><small>already approved</small></div>
        <div><span>INV10234 · INV-010234</span><em>same number</em></div>
        <div><span>INV-10234A · KZ-10234</span><em>possible duplicate</em></div>
        <div><span>no. 77-XY, same amount & date</span><em>possible duplicate</em></div>
        <div><span>INV-10235, next month</span><small>not flagged — recurring bill</small></div>
      </div>
      <Link href="/use-cases" className="inlineLink">What is checked today <ArrowRight size={15} /></Link>
    </div>
      <div className="proofDemo"><div className="proofDemoHeader"><span>Example batch · 24 invoices</span><b>3 need attention</b></div>
        <div className="exceptionCard"><span className="riskDot" /><div><b>Duplicate invoice</b><p>INV-10234 — already approved on 12 Sep</p><small>Same BIN · same number · same total</small></div></div>
        <div className="exceptionCard"><span className="riskDot" /><div><b>Possible duplicate</b><p>INV-10234A vs INV-10234</p><small>Same supplier · same total ₸ 485,900 · 3 days apart</small></div></div>
        <div className="exceptionCard"><span className="warnDot" /><div><b>Requires review</b><p>Invoice date unreadable on the scan</p><small>Unsure ≠ wrong — a person confirms</small></div></div>
        <div className="allGood"><Check />21 invoices checked — nothing to do</div>
      </div></div></section>

    <section className="workflowSection"><div className="container"><div className="sectionIntro"><span className="eyebrow">What else gets flagged</span><h2>A normal invoice is cheap. An exception invoice is expensive.</h2><p>One bad invoice pulls in AP, procurement and the vendor: emails, follow-ups, a revised copy, reprocessing. Foldline finds those invoices on arrival.</p></div><div className="workflowCards">
      <article><FileSpreadsheet /><span>Incomplete invoices</span><h3>Missing supplier, number, date or total.</h3><p>Caught before the invoice gets stuck in processing, so you can ask the supplier for a corrected copy right away.</p></article>
      <article><ScanText /><span>Inconsistent totals</span><h3>Subtotal + VAT ≠ total. Line math that's off.</h3><p>Counted as an issue only when the numbers were read reliably — otherwise it goes to review.</p></article>
      <article><TimerReset /><span>Reliability gate</span><h3>Unsure is not the same as wrong.</h3><p>When Foldline can't read something confidently, the invoice is marked Requires review. It never raises a false alarm about your supplier.</p></article>
    </div></div></section>

    <section id="security" className="securityBand"><div className="container split"><div className="securityVisual"><LockKeyhole size={35} /><strong>Private by default</strong><span>Signed access · RLS isolation · server-only secrets</span></div><div><span className="eyebrow">Security</span><h2>Start with redacted invoices. No ERP, bank or inbox access.</h2><p>Foldline only needs the invoice files. Originals live in private storage with short-lived signed access, and database policies isolate each workspace.</p><Link href="/security" className="inlineLink">Read the security architecture <ArrowRight size={15} /></Link></div></div></section>

    <section id="faq" className="faqSection"><div className="container split faqSplit"><div><span className="eyebrow">FAQ</span><h2>Before you upload the first batch.</h2><p>What counts as a duplicate, what gets ignored, and what still needs a human decision.</p></div><FaqList /></div></section>

    <VerifiedReviews />

    <section className="ctaSection"><div className="container ctaCard"><div><span className="eyebrow"><AlertTriangle size={13} /> Try it on real data</span><h2>Run last month's invoices through it.</h2><p>Redacted or anonymised copies are fine. If it finds nothing, you've lost ten minutes. If it finds one duplicate, it has paid for itself.</p></div><Link href="/signup" className="button buttonAccent">Start free <ArrowRight size={17} /></Link></div></section>
  </main><footer className="footer"><div className="container"><span>© 2026 Foldline</span><div><Link href="/use-cases">What's checked</Link><Link href="/case-studies">Case studies</Link><Link href="/security">Security</Link><Link href="/pricing">Pricing</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link></div></div></footer><MobileCta /></>;
}
