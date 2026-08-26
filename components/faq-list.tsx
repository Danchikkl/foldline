const faqs = [
  ["Is Foldline just OCR?", "No. Document conversion is only the parsing layer. Foldline adds structured fields, source evidence, a reliability gate, deterministic invoice checks and human review."],
  ["What happens if Foldline is not sure it read the invoice correctly?", "It does not turn extraction uncertainty into a business-risk score. The document is marked as needing review, the uncertain fields remain editable beside the original, and risk stays uncalculated until the extraction is reliable enough or a person confirms the data."],
  ["Do I have to check every extracted field?", "Not when the extraction passes the reliability gate. Proofline focuses attention on verified exceptions. If extraction itself is uncertain, Foldline makes that clear and asks for a human review instead of pretending the result is reliable."],
  ["Is a missing PO number automatically an error?", "No. A PO reference is informational by default because not every invoice requires one. A future workspace rule can make it mandatory for a specific workflow."],
  ["How does duplicate detection work?", "Foldline does not flag an invoice as a duplicate from the invoice number alone. The current check also requires the same supplier identity in the workspace."],
  ["Where are original documents stored?", "Original documents are stored in a private Supabase Storage bucket. Browser access uses short-lived signed URLs rather than permanent public file links."],
  ["Does Foldline make accounting or tax decisions?", "No. Foldline structures and checks document data. A person remains responsible for reviewing the result before relying on it."],
  ["Can I export the result?", "Yes, but uncertain extraction must be reviewed first. Unsupported documents are not exported as invoices."],
  ["What document types are supported?", "Invoice review is the current MVP path. Related documents can be stored in a review packet, while broader cross-document checks are still being tested and are not presented as a finished capability."],
];

export function FaqList() {
  return <div className="faqList">{faqs.map(([question, answer]) => <details key={question} className="faqItem"><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>;
}
