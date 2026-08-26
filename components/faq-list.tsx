const faqs = [
  ["Is Foldline just OCR?", "No. Document conversion is only the parsing layer. Foldline adds structured fields, source evidence, invoice checks and human review."],
  ["Do I have to check every extracted field?", "No. Proofline is designed to focus attention on uncertainty, arithmetic problems and missing or duplicate references."],
  ["Where are original documents stored?", "Original documents are stored in a private Supabase Storage bucket. Browser access uses short-lived signed URLs rather than permanent public file links."],
  ["Does Foldline make accounting or tax decisions?", "No. Foldline structures and checks document data. A person remains responsible for reviewing the result before relying on it."],
  ["Can I export the result?", "Yes. The current MVP can export reviewed invoice data as CSV."],
  ["What document types are supported?", "Invoice review is the current validated MVP path. Shipment packets can hold related documents, while broader cross-document checks are still being tested before being presented as a finished capability."],
];

export function FaqList() {
  return <div className="faqList">{faqs.map(([question, answer]) => <details key={question} className="faqItem"><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>;
}
