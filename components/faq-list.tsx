const faqs = [
  ["My ERP already blocks duplicate invoices. Why do I need this?", "Most ERP checks are exact-match: same invoice number (and date). Foldline also catches the near-misses — INV-10234 vs INV10234 vs INV-10234A, a different number with the same supplier, amount and date, or the same number with a different amount."],
  ["Will it flag every monthly invoice from the same supplier?", "No. Consecutive numbers with the same amount (rent, subscriptions) are only flagged when they are dated within a week of each other. A near-duplicate always needs the same supplier and the same total."],
  ["What's the difference between “Issue found” and “Requires review”?", "Issue found means a check failed on values Foldline read reliably — for example an exact duplicate. Requires review means Foldline wasn't sure what it read. Uncertainty is never reported as a supplier error."],
  ["What does it compare against?", "Every invoice uploaded earlier into your workspace. The more history you upload, the more duplicates it can catch — start with last month's batch."],
  ["Do you need access to our ERP, bank or inbox?", "No. You upload invoice files. Redacted or anonymised copies are fine for a first test."],
  ["Does Foldline decide whether to pay?", "No. It flags exceptions and shows the evidence. A person approves, and every approval — including approving despite a flag — is recorded in the audit log."],
];

export function FaqList() {
  return <div className="faqList">{faqs.map(([question, answer]) => <details key={question} className="faqItem"><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>;
}
