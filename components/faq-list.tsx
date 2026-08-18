const faqs = [
  ["Is Foldline just OCR?", "No. OCR is the parsing layer. Foldline adds field extraction, source evidence, deterministic financial checks, human review and export."],
  ["Do I have to check every extracted field?", "No. Proofline can show only low-confidence fields and reconciliation failures, so the reviewer focuses on exceptions."],
  ["Where are original documents stored?", "The intended production setup uses a private Cloudflare R2 bucket with short-lived signed access. Files are not publicly addressable by default."],
  ["Does Foldline make accounting or tax decisions?", "No. It structures and validates document data. A human remains responsible for approving extracted data before operational use."],
  ["Can I export the result?", "Yes. The MVP exports reviewed invoice data as CSV. Additional integrations are intentionally deferred until workflows are validated."],
  ["What document types are supported?", "The first version focuses on invoices. The architecture separates parsing from document schemas so contracts, purchase orders and delivery notes can be added later."],
];

export function FaqList() {
  return <div className="faqList">{faqs.map(([question, answer]) => <details key={question} className="faqItem"><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>;
}
