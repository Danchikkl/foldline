// Run: npm run test:checks
// Pure unit tests for duplicate detection and validation outcomes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicates, normalizeReference, parseInvoiceDate, supplierMatch } from "../lib/duplicates.ts";
import { extractInvoice, validateInvoice, outcomeOf } from "../lib/invoice.ts";

const fp = (o = {}) => ({
  supplier_bin: "123456789012",
  supplier_name: "ACME Supply LLP",
  invoice_number: "INV-10234",
  invoice_date: "12.09.2026",
  total: 485900,
  currency: "KZT",
  ...o,
});
const peer = (o = {}, id = "p1", created_at = "2026-09-13T10:00:00Z") => ({ id, filename: `${id}.pdf`, created_at, status: "reviewed", fp: fp(o) });

test("normalizeReference ignores punctuation, case, leading zeros and Cyrillic look-alikes", () => {
  assert.equal(normalizeReference("INV-00123"), "INV123");
  assert.equal(normalizeReference("inv 123"), "INV123");
  assert.equal(normalizeReference("2024-0001"), normalizeReference("2024-1"));
  assert.equal(normalizeReference("АВ-12"), "AB12"); // Cyrillic А, В
});

test("parseInvoiceDate handles numeric and written dates", () => {
  assert.equal(parseInvoiceDate("12.09.2026"), parseInvoiceDate("2026-09-12"));
  assert.equal(parseInvoiceDate("12 September 2026"), parseInvoiceDate("September 12, 2026"));
  assert.equal(parseInvoiceDate("31.02.2026"), null);
});

test("exact duplicate: same supplier + same number is an issue", () => {
  const [m] = findDuplicates(fp(), [peer()]);
  assert.equal(m.kind, "exact");
  assert.equal(m.severity, "issue");
});

test("exact after normalisation: INV-10234 vs INV10234 (what an ERP exact-match misses)", () => {
  const [m] = findDuplicates(fp({ invoice_number: "INV10234" }), [peer()]);
  assert.equal(m.kind, "exact");
  assert.match(m.reasons.join(" "), /ignored/);
});

test("near-duplicate: INV-10234A with same total is flagged as possible", () => {
  const [m] = findDuplicates(fp({ invoice_number: "INV-10234A", invoice_date: "15.09.2026" }), [peer()]);
  assert.equal(m.kind, "near_reference");
  assert.equal(m.severity, "possible");
});

test("near-duplicate needs the same amount", () => {
  assert.equal(findDuplicates(fp({ invoice_number: "INV-10234A", total: 100 }), [peer()]).length, 0);
});

test("recurring invoices (INV-10234 → INV-10235, same amount, a month apart) are NOT flagged", () => {
  assert.equal(findDuplicates(fp({ invoice_number: "INV-10235", invoice_date: "12.10.2026" }), [peer()]).length, 0);
});

test("digit change within a week with same amount IS flagged", () => {
  const [m] = findDuplicates(fp({ invoice_number: "INV-10235", invoice_date: "14.09.2026" }), [peer()]);
  assert.equal(m.kind, "near_reference");
});

test("same supplier + amount + date with a different number is a possible duplicate", () => {
  const [m] = findDuplicates(fp({ invoice_number: "77-XY" }), [peer()]);
  assert.equal(m.kind, "same_amount_date");
});

test("same number but different total → number reused / revised invoice", () => {
  const [m] = findDuplicates(fp({ total: 490000 }), [peer()]);
  assert.equal(m.kind, "number_reused");
  assert.equal(m.severity, "possible");
});

test("different supplier BIN never matches", () => {
  assert.equal(findDuplicates(fp({ supplier_bin: "999999999999" }), [peer()]).length, 0);
});

test("supplier name matching ignores legal form and quotes", () => {
  assert.ok(supplierMatch(fp({ supplier_bin: null, supplier_name: "ТОО «Acme Supply»" }), fp({ supplier_bin: null, supplier_name: "Acme Supply LLP" })));
});

test("validation: exact duplicate → outcome issue", () => {
  const data = extractInvoice("ACME SUPPLY LLP\nBIN 123456789012\nInvoice No: INV-10234\nDate: 12.09.2026\nTotal ₸ 485 900");
  const [m] = findDuplicates(fp(), [peer()]);
  const v = validateInvoice(data, { duplicates: [m], compared: 1 });
  assert.equal(v.outcome, "issue");
  assert.ok(v.checks.some((c) => c.category === "duplicate" && c.status === "issue"));
});

test("validation: clean invoice with no history → checked", () => {
  const data = extractInvoice("Supplier: ACME SUPPLY LLP\nBIN 123456789012\nInvoice No: INV-10234\nInvoice Date: 12.09.2026\nSubtotal 100.00\nVAT 12% 12.00\nTotal 112.00");
  const v = validateInvoice(data, { duplicates: [], compared: 0 });
  assert.equal(v.outcome, "checked", JSON.stringify(v.checks, null, 1));
});

test("validation: low-confidence arithmetic mismatch is 'review', not 'issue' (reliability gate)", () => {
  const data = extractInvoice("Supplier: ACME\nInvoice No: 5\nDate: 01.01.2026\nSubtotal 100\nVAT 12\nTotal 150");
  data.vat.confidence = 0.5;
  const v = validateInvoice(data, { compared: 0 });
  assert.equal(v.outcome, "review");
});

test("validation: reliable arithmetic mismatch is an issue", () => {
  const data = extractInvoice("Supplier: ACME\nInvoice No: 5\nDate: 01.01.2026\nSubtotal 100\nVAT 12\nTotal 150");
  const v = validateInvoice(data, { compared: 0 });
  assert.equal(v.outcome, "issue");
});

test("validation: missing invoice number → review", () => {
  const data = extractInvoice("Supplier: ACME\nBIN 123456789012\nDate: 01.01.2026\nTotal 150");
  const v = validateInvoice(data, { compared: 0 });
  assert.equal(v.outcome, "review");
  assert.ok(v.needs_review.includes("invoice_number"));
});

test("validation: random document → not an invoice", () => {
  const v = validateInvoice(extractInvoice("Meeting notes\nDiscussed roadmap."), {});
  assert.equal(v.outcome, "not_invoice");
});

test("extraction never captures a label word as the invoice number", () => {
  assert.equal(extractInvoice("Invoice Number: INV-2048").invoice_number.value, "INV-2048");
  assert.equal(extractInvoice("Invoice Date: 12.09.2026\nInvoice # 77").invoice_number.value, "77");
  assert.equal(extractInvoice("Счет на оплату № 45 от 12.03.2026").invoice_number.value, "45");
  assert.equal(extractInvoice("Счет на оплату № 45 от 12.03.2026").invoice_date.value, "12.03.2026");
  assert.equal(extractInvoice("PO Box 12, Almaty\nPO Number: 4500012").po_number.value, "4500012");
});

test("money extraction: 'total' inside 'Subtotal', VAT without rate, dash separator, no newline gluing", () => {
  const a = extractInvoice("Subtotal 100.00\nVAT 12.00\nTotal 112.00\n5");
  assert.equal(a.subtotal.value, 100);
  assert.equal(a.vat.value, 12);
  assert.equal(a.total.value, 112);
  assert.equal(extractInvoice("НДС 12% — 51 420,00").vat.value, 51420);
  assert.equal(extractInvoice("Итого к оплате: 485 900,00 ₸").total.value, 485900);
});

test("legacy v0.1 results still map to an outcome", () => {
  assert.equal(outcomeOf({ risk_score: 30, needs_review: [], checks: [{ id: "x", label: "x", status: "fail", message: "", fields: [] }] }), "issue");
  assert.equal(outcomeOf({ risk_score: 10, needs_review: [], checks: [{ id: "x", label: "x", status: "warn", message: "", fields: [] }] }), "review");
});
