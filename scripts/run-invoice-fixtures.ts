import { analyzeInvoice } from "../lib/invoice-runtime";
import { validateInvoiceBusiness } from "../lib/invoice-reliability";
import { runInvoiceReliabilityFixtures } from "../lib/invoice-reliability-fixtures";
import { duplicateCandidate } from "../lib/invoice-history";

const results = runInvoiceReliabilityFixtures();
for (const result of results) {
  const mark = result.passed ? "PASS" : "FAIL";
  console.log(`${mark} ${result.name} — extraction=${result.extractionStatus}, risk=${result.riskLevel}`);
  if (!result.passed) console.error(`  ${result.details}`);
}

let regressionFailed = false;
const expect = (name: string, condition: boolean, details: string) => {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`${mark} ${name}`);
  if (!condition) {
    regressionFailed = true;
    console.error(`  ${details}`);
  }
};

const reorderedClean = `
INVOICE
SUPPLIER Qazaq Office Supply LLP
BIN / IIN 123456789012
INVOICE NUMBER KZ-2026-0813
DATE 13.08.2026
CURRENCY KZT
Description Qty Unit price Amount
Laboratory notebooks 10 3,500 35,000
Nitrile gloves boxes 15 2,500 37,500
Pipette tip racks 8 5,000 40,000
Subtotal VAT TOTAL 112,500 KZT 13,500 KZT 126,000 KZT
`;
const reorderedCleanAnalysis = analyzeInvoice(reorderedClean);
const reorderedCleanValidation = validateInvoiceBusiness(reorderedCleanAnalysis.data, {
  extraction: reorderedCleanAnalysis.extraction,
  duplicateInvoice: null,
});
expect(
  "Reordered footer totals recover clean total",
  reorderedCleanAnalysis.data.subtotal.value === 112500
    && reorderedCleanAnalysis.data.vat.value === 13500
    && reorderedCleanAnalysis.data.total.value === 126000
    && reorderedCleanValidation.checks.some((check) => check.id === "totals" && check.status === "pass"),
  `Expected 112500/13500/126000 with totals pass; got ${String(reorderedCleanAnalysis.data.subtotal.value)}/${String(reorderedCleanAnalysis.data.vat.value)}/${String(reorderedCleanAnalysis.data.total.value)}.`,
);

const reorderedMismatch = `
INVOICE
SUPPLIER Steppe Tech Trade
BIN / IIN 987654321098
INVOICE NUMBER ST-4407
DATE 13.08.2026
CURRENCY KZT
Description Qty Unit price Amount
USB-C hubs 10 3,000 30,000
Wireless keyboards 4 5,000 20,000
Subtotal VAT TOTAL 50,000 KZT 6,000 KZT 59,000 KZT
`;
const mismatchAnalysis = analyzeInvoice(reorderedMismatch);
const mismatchValidation = validateInvoiceBusiness(mismatchAnalysis.data, {
  extraction: mismatchAnalysis.extraction,
  duplicateInvoice: null,
});
expect(
  "Reordered footer preserves totals mismatch",
  mismatchAnalysis.data.total.value === 59000
    && mismatchValidation.risk_level === "high"
    && mismatchValidation.checks.some((check) => check.id === "totals" && check.status === "fail"),
  `Expected total=59000 and verified high-risk totals failure; got total=${String(mismatchAnalysis.data.total.value)}, risk=${mismatchValidation.risk_level}.`,
);

const markdownTableMismatch = `
INVOICE
| SUPPLIER | Steppe Tech Trade |
| BIN / IIN | 987654321098 |
| INVOICE NUMBER | ST-4407-MARKDOWN |
| DATE | 13.08.2026 |
| CURRENCY | KZT |
| Description | Qty | Unit price | Amount |
| --- | ---: | ---: | ---: |
| USB-C hubs | 10 | 3,000 | 30,000 |
| Wireless keyboards | 4 | 5,000 | 20,000 |
| Subtotal | VAT | TOTAL |
| 50,000 KZT | 6,000 KZT | 59,000 KZT |
`;
const markdownMismatchAnalysis = analyzeInvoice(markdownTableMismatch);
const markdownMismatchValidation = validateInvoiceBusiness(markdownMismatchAnalysis.data, {
  extraction: markdownMismatchAnalysis.extraction,
  duplicateInvoice: null,
});
expect(
  "Markdown totals row preserves mismatch",
  markdownMismatchAnalysis.data.subtotal.value === 50000
    && markdownMismatchAnalysis.data.vat.value === 6000
    && markdownMismatchAnalysis.data.total.value === 59000
    && markdownMismatchValidation.checks.some((check) => check.id === "totals" && check.status === "fail"),
  `Expected markdown totals 50000/6000/59000; got ${String(markdownMismatchAnalysis.data.subtotal.value)}/${String(markdownMismatchAnalysis.data.vat.value)}/${String(markdownMismatchAnalysis.data.total.value)}.`,
);

const gluedTotals = `
INVOICE
SUPPLIER Steppe Tech Trade
INVOICE NUMBER ST-GLUED-1
CURRENCY KZT
Description Qty Unit price Amount
USB-C hubs 10 3,000 30,000
Wireless keyboards 4 5,000 20,000
Subtotal50,000KZTVAT6,000KZTTOTAL59,000KZT
`;
const gluedAnalysis = analyzeInvoice(gluedTotals);
const gluedValidation = validateInvoiceBusiness(gluedAnalysis.data, {
  extraction: gluedAnalysis.extraction,
  duplicateInvoice: null,
});
expect(
  "Glued converter totals are recovered",
  gluedAnalysis.data.total.value === 59000
    && gluedValidation.checks.some((check) => check.id === "totals" && check.status === "fail"),
  `Expected glued total=59000 and totals failure; got total=${String(gluedAnalysis.data.total.value)}.`,
);

const falsePo = `
INVOICE
SUPPLIER Qazaq Office Supply LLP
BIN / IIN 123456789012
INVOICE NUMBER KZ-PO-NOISE-1
DATE 13.08.2026
CURRENCY KZT
PO rtLab
Description Qty Unit price Amount
Notebook 1 1,000 1,000
Subtotal 1,000 KZT
VAT 120 KZT
TOTAL 1,120 KZT
`;
const falsePoAnalysis = analyzeInvoice(falsePo);
expect(
  "Alphabetic PO OCR noise is discarded",
  falsePoAnalysis.data.po_number.value === null,
  `Expected PO=null, got ${String(falsePoAnalysis.data.po_number.value)}.`,
);

const explicitNonInvoice = `
PROJECT NOTES
SYNTHETIC QA DOCUMENT - NOT AN INVOICE
No supplier, invoice number, payable total, VAT amount, or billing table is present.
Discuss onboarding copy and parser QA priorities.
`;
const nonInvoiceAnalysis = analyzeInvoice(explicitNonInvoice);
const nonInvoiceValidation = validateInvoiceBusiness(nonInvoiceAnalysis.data, {
  extraction: nonInvoiceAnalysis.extraction,
  duplicateInvoice: undefined,
});
expect(
  "Explicit non-invoice stays unsupported",
  nonInvoiceAnalysis.extraction.status === "unsupported"
    && nonInvoiceValidation.risk_level === "not_calculated",
  `Expected unsupported/not_calculated, got ${nonInvoiceAnalysis.extraction.status}/${nonInvoiceValidation.risk_level}.`,
);

const weakNonInvoice = `
PROJECT NOTES
Meeting agenda for the product team.
Discuss invoice parser QA, dashboard usability, launch timing and pilot interviews.
No payable document is attached.
`;
const weakNonInvoiceAnalysis = analyzeInvoice(weakNonInvoice);
expect(
  "Document mentioning invoice without invoice structure is unsupported",
  weakNonInvoiceAnalysis.extraction.status === "unsupported",
  `Expected unsupported, got ${weakNonInvoiceAnalysis.extraction.status}.`,
);

// --- Kazakh number format, buyer BIN, custdev duplicate rules (2026-10-31) ---
const kzInvoice = (number: string, date: string | null, rows: string, subtotal: string, vat: string, total: string) => `
Steppe Build Supply LLP
BIN 123456789012
Almaty, Kazakhstan
INVOICE
Invoice No: ${number}
${date ? `Invoice Date: ${date}` : ""}
Bill to: Example Buyer LLP, BIN 111222333444
Currency: KZT
Description Qty Unit Price Amount
${rows}
Subtotal KZT ${subtotal}
VAT 12% KZT ${vat}
Total due KZT ${total}
`;
const kzRows = "Cement M400, 50 kg bag 100 2 500,00 250 000,00\nRebar 12 mm, tonnes 1.2 153 199,41 183 839,29";
const kzBase = analyzeInvoice(kzInvoice("INV-10234", "12.09.2026", kzRows, "433 839,29", "52 060,71", "485 900,00"));
const kzBaseCheck = validateInvoiceBusiness(kzBase.data, { extraction: kzBase.extraction, duplicateInvoice: null });
expect(
  "Space-grouped thousands (250 000,00) are read as whole numbers",
  kzBase.data.line_items.length === 2 && kzBase.data.line_items[0].amount === 250000 && kzBase.data.line_items[1].quantity === 1.2,
  `Got ${JSON.stringify(kzBase.data.line_items.map((i) => [i.quantity, i.unit_price, i.amount]))}.`,
);
expect(
  "Clean KZ-format invoice is not flagged",
  kzBaseCheck.risk_level === "low" && kzBase.extraction.status === "reliable",
  `Got extraction=${kzBase.extraction.status}, risk=${kzBaseCheck.risk_level}.`,
);
expect(
  "Buyer BIN after 'Bill to' is never taken as the supplier BIN",
  kzBase.data.supplier_bin.value === "123456789012",
  `Got ${kzBase.data.supplier_bin.value}.`,
);
const kzVariant = (number: string, date: string | null, total = "485 900,00") =>
  analyzeInvoice(kzInvoice(number, date, kzRows, "433 839,29", "52 060,71", total)).data;
const dupKind = (data: ReturnType<typeof kzVariant>) => duplicateCandidate(data, kzBase.data)?.matchType ?? "none";
expect("INV10234 vs INV-10234 is an exact duplicate", dupKind(kzVariant("INV10234", "12.09.2026")) === "exact", dupKind(kzVariant("INV10234", "12.09.2026")));
expect("INV-10234A three days later is a possible duplicate", dupKind(kzVariant("INV-10234A", "15.09.2026")) === "similar_reference", dupKind(kzVariant("INV-10234A", "15.09.2026")));
expect("Different number, same supplier+amount+date is a possible duplicate", dupKind(kzVariant("77-XY", "12.09.2026")) === "same_amount_date", dupKind(kzVariant("77-XY", "12.09.2026")));
expect("Next month's INV-10235 with the same amount is NOT a duplicate", dupKind(kzVariant("INV-10235", "12.10.2026")) === "none", dupKind(kzVariant("INV-10235", "12.10.2026")));
const missingDate = analyzeInvoice(kzInvoice("INV-20001", null, kzRows, "433 839,29", "52 060,71", "485 900,00"));
expect("Invoice without a date requires review", missingDate.extraction.status === "needs_review", `Got ${missingDate.extraction.status}.`);

if (results.some((result) => !result.passed) || regressionFailed) process.exit(1);
