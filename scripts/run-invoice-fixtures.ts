import { analyzeInvoice } from "../lib/invoice-runtime";
import { validateInvoiceBusiness } from "../lib/invoice-reliability";
import { runInvoiceReliabilityFixtures } from "../lib/invoice-reliability-fixtures";

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

if (results.some((result) => !result.passed) || regressionFailed) process.exit(1);
