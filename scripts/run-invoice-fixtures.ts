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

// Cloudflare PDF → Markdown output starts with a metadata block. The supplier
// name must come from the document, not from "PDFFormatVersion=1.4".
const cloudflareWrapped = [
  "# 01_original.pdf", "## Metadata", "- PDFFormatVersion=1.4", "- IsLinearized=false",
  "- Producer=ReportLab PDF Library - www.reportlab.com", "- Title=untitled", "## Contents", "### Page 1",
  kzInvoice("INV-10234", "12.09.2026", kzRows, "433 839,29", "52 060,71", "485 900,00"),
].join("\n");
const cloudflareAnalysis = analyzeInvoice(cloudflareWrapped);
const cloudflareCheck = validateInvoiceBusiness(cloudflareAnalysis.data, { extraction: cloudflareAnalysis.extraction, duplicateInvoice: null });
expect(
  "Supplier name is read from the line above its BIN, not from converter metadata",
  cloudflareAnalysis.data.supplier_name.value === "Steppe Build Supply LLP" && cloudflareAnalysis.data.supplier_name.confidence >= 0.8,
  `Got ${JSON.stringify(cloudflareAnalysis.data.supplier_name)}.`,
);
expect(
  "Clean invoice wrapped in Cloudflare metadata is Checked, not Review",
  cloudflareAnalysis.extraction.status === "reliable" && cloudflareCheck.risk_level === "low",
  `Got extraction=${cloudflareAnalysis.extraction.status} (${cloudflareAnalysis.extraction.issues.join("; ")}), risk=${cloudflareCheck.risk_level}.`,
);


// ---- English-language invoices (US / UK / AU / CA) ----
const intl = (text: string) => {
  const a = analyzeInvoice(text);
  const check = validateInvoiceBusiness(a.data, { extraction: a.extraction, duplicateInvoice: null });
  return { ...a, check, f: (k: "supplier_name" | "invoice_number" | "invoice_date" | "currency" | "subtotal" | "vat" | "total") => a.data[k].value };
};
const fields = (r: ReturnType<typeof intl>) => JSON.stringify([r.f("supplier_name"), r.f("invoice_number"), r.f("invoice_date"), r.f("currency"), r.f("subtotal"), r.f("vat"), r.f("total"), r.extraction.status, r.check.risk_level]);

const usInvoice = intl(`Greenfield Plumbing LLC
1200 Oak Street, Austin, TX 78701

INVOICE
Invoice #: GP-20418
Invoice Date: 11/25/2026
Due Date: 12/25/2026
Terms: Net 30

Bill To:
Lakeside Property Management Inc.

Description                 Qty   Rate      Amount
Emergency leak repair       3     $185.00   $555.00
Replacement valve           1     $94.50    $94.50

Subtotal   $649.50
Sales Tax (8.25%)   $53.58
Total   $703.08
Amount Due   $703.08`);
expect("US invoice: Sales Tax is read and 'Net 30' is not money",
  usInvoice.f("subtotal") === 649.5 && usInvoice.f("vat") === 53.58 && usInvoice.f("total") === 703.08 && usInvoice.extraction.status === "reliable" && usInvoice.check.risk_level === "low", fields(usInvoice));

const ukInvoice = intl(`Northgate Cleaning Services Ltd
VAT Reg No: GB 123 4567 89
Invoice No. NCS/2026/0871
Date: 3 November 2026
To: Mint Offices Limited

Office cleaning - October 2026     1   £1,250.00   £1,250.00
Net   £1,250.00
VAT @ 20%   £250.00
Total due   £1,500.00
Please pay within 14 days. Sort code 20-00-00 Account 12345678`);
expect("UK invoice: £ totals, written date, VAT number is not the VAT amount",
  ukInvoice.f("subtotal") === 1250 && ukInvoice.f("vat") === 250 && ukInvoice.f("total") === 1500 && ukInvoice.f("invoice_date") === "2026-11-03" && ukInvoice.f("currency") === "GBP", fields(ukInvoice));

const auInvoice = intl(`TAX INVOICE
Coastal Electrical Pty Ltd  ABN 51 824 753 556
Invoice Number: INV-00932
Issue Date: 14/10/2026
Customer: Harbour Cafe Group
Switchboard upgrade  1  2,400.00  2,400.00
Subtotal 2,400.00
GST 10% 240.00
Total AUD 2,640.00
Balance Due AUD 2,640.00`);
expect("AU invoice: heading is not the supplier, ABN is not the GST amount",
  auInvoice.f("supplier_name") === "Coastal Electrical Pty Ltd" && auInvoice.f("vat") === 240 && auInvoice.f("total") === 2640 && auInvoice.f("currency") === "AUD" && auInvoice.check.risk_level === "low", fields(auInvoice));

const caInvoice = intl(`Maple Leaf Janitorial Ltd.
INVOICE
Invoice No: ML-2291
Invoice Date: 2026-09-15
Bill To: Harbourfront Realty
Description Qty Rate Amount
Nightly cleaning - September 1 1,000.00 1,000.00
Subtotal 1,000.00
GST (5%) 50.00
PST (7%) 70.00
Total CAD 1,120.00`);
expect("CA invoice: GST + PST are added together", caInvoice.f("vat") === 120 && caInvoice.f("total") === 1120 && caInvoice.check.risk_level === "low", fields(caInvoice));

const partPaid = intl(`Summit HVAC Services Inc.
INVOICE
Invoice # 7731
Date: 10/02/2026
Bill To: Oakwood Dental Group
Description Qty Unit Price Amount
Quarterly maintenance 1 $500.00 $500.00
Subtotal $500.00
Tax $0.00
Total $500.00
Amount Paid $200.00
Balance Due $300.00
Terms: Net 30`);
expect("Part-paid invoice: the invoice total is used, not the balance due", partPaid.f("total") === 500 && partPaid.check.risk_level === "low", fields(partPaid));

const twoColumn = intl(`Brightline Landscaping LLC
Invoice
Invoice Number: BL-0456            Invoice Date: Oct 7, 2026
Bill To: Cedar Park HOA            Due Date: Nov 6, 2026
Item Description Qty Price Amount
Mowing and edging 4 75.00 300.00
Mulch delivery 1 220.00 220.00
Thank you for your business!       Subtotal 520.00
Payment due within 30 days         Sales Tax 8% 41.60
Make checks payable to Brightline  Total Due $561.60`);
expect("Two-column footer: totals and the invoice date (not the due date) are read",
  twoColumn.f("total") === 561.6 && twoColumn.f("vat") === 41.6 && twoColumn.f("invoice_date") === "2026-10-07", fields(twoColumn));

const wrongSum = intl(`Delta Office Supply Inc.
INVOICE
Invoice #: D-5512
Date: 09/18/2026
Bill To: Northside Clinic
Description Qty Unit Price Amount
Paper A4 20 6.00 120.00
Toner 2 80.00 160.00
Subtotal $280.00
Sales Tax $22.40
Total $322.40`);
expect("A $20 arithmetic error on a US invoice is an issue", wrongSum.check.risk_level === "high", fields(wrongSum));

const smallGap = intl(`Delta Office Supply Inc.
INVOICE
Invoice #: D-5513
Date: 09/18/2026
Bill To: Northside Clinic
Description Qty Unit Price Amount
Paper A4 20 6.00 120.00
Toner 2 80.00 160.00
Subtotal $280.00
Sales Tax $22.40
Total $304.40`);
expect("A $2 overcharge is caught (no 1% tolerance)", smallGap.check.risk_level === "high", fields(smallGap));

const padded = intl(`Delta Office Supply Inc.
INVOICE
Invoice #: D-5514
Date: 09/18/2026
Bill To: Northside Clinic
Description Qty Unit Price Amount
Paper A4 20 $6.00 $120.00
Toner 2 $80.00 $160.00
Subtotal $300.00
Sales Tax $24.00
Total $324.00`);
expect("Padded subtotal (rows sum to 280, subtotal says 300) is an issue when every row was read",
  padded.data.line_items.length === 2 && ["medium", "high"].includes(padded.check.risk_level), fields(padded) + JSON.stringify(padded.extraction.signals));

// ---- Duplicate rules for international data ----
const us = (number: string, date: string, total: string, supplier = "Greenfield Plumbing LLC") => analyzeInvoice(`${supplier}
INVOICE
Invoice #: ${number}
Invoice Date: ${date}
Bill To: Lakeside Property Management Inc.
Description Qty Rate Amount
Leak repair 1 ${total} ${total}
Total ${total}`).data;
const kind = (a: ReturnType<typeof us>, b: ReturnType<typeof us>) => duplicateCandidate(a, b)?.matchType ?? "none";
const usBase = us("GP-20418", "11/25/2026", "$703.08");
expect("US date 11/25/2026: a suffixed resend three days later is flagged", kind(us("GP-20418A", "11/28/2026", "$703.08"), usBase) === "similar_reference", kind(us("GP-20418A", "11/28/2026", "$703.08"), usBase));
expect("Letter O typed for zero (GP-2O418) is the same invoice", kind(us("GP-2O418", "11/25/2026", "$703.08"), usBase) === "exact", kind(us("GP-2O418", "11/25/2026", "$703.08"), usBase));
expect("'Greenfield Plumbing, L.L.C.' is the same supplier as 'Greenfield Plumbing LLC'", kind(us("GP-20418", "11/25/2026", "$703.08", "Greenfield Plumbing, L.L.C."), usBase) === "exact", kind(us("GP-20418", "11/25/2026", "$703.08", "Greenfield Plumbing, L.L.C."), usBase));
expect("Same day, $9.50 vs $10.20 from one supplier is NOT a duplicate", kind(us("A-100", "11/25/2026", "$9.50"), us("B-200", "11/25/2026", "$10.20")) === "none", kind(us("A-100", "11/25/2026", "$9.50"), us("B-200", "11/25/2026", "$10.20")));
expect("Written and numeric dates for the same day match", kind(us("X-1", "November 25, 2026", "$703.08"), us("Y-2", "11/25/2026", "$703.08")) === "same_amount_date", kind(us("X-1", "November 25, 2026", "$703.08"), us("Y-2", "11/25/2026", "$703.08")));
expect("Next month's GP-20419 with the same amount is NOT a duplicate", kind(us("GP-20419", "12/25/2026", "$703.08"), usBase) === "none", kind(us("GP-20419", "12/25/2026", "$703.08"), usBase));

if (results.some((result) => !result.passed) || regressionFailed) process.exit(1);
