import { analyzeInvoice, validateInvoiceBusiness } from "@/lib/invoice-reliability";

type FixtureResult = {
  name: string;
  passed: boolean;
  extractionStatus: string;
  riskLevel: string;
  details: string;
};

const cleanInvoice = `
INVOICE
Synthetic test document for Foldline - no real company or transaction
SUPPLIER
Qazaq Office Supply LLP
BIN / IIN
123456789012
INVOICE NUMBER
KZ-2026-0813
DATE
13.08.2026
CUSTOMER
North Steppe Labs
CURRENCY
KZT
Description Qty Unit price Amount
Laboratory notebooks 10 3,500 35,000
Nitrile gloves, boxes 15 2,500 37,500
Pipette tip racks 8 5,000 40,000
Subtotal: 112,500 KZT
VAT: 13,500 KZT
TOTAL: 126,000 KZT
`;

// Mirrors the real Cloudflare toMarkdown failure seen in production: adjacent
// PDF cells can arrive without separators even though the source PDF is clean.
const collapsedCleanInvoice = `
INVOICE
Synthetic test document for Foldline - no real company or transaction
SUPPLIERQazaq Office Supply LLP
BIN / IIN123456789012
INVOICE NUMBERKZ-2026-0813DATE13.08.2026
CUSTOMERNorth Steppe LabsCURRENCYKZT
DescriptionQtyUnit priceAmount
Laboratory notebooks103,50035,000Nitrile gloves, boxes152,50037,500Pipette tip racks85,00040,000Subtotal112,500 KZT
VAT13,500 KZT
TOTAL126,000 KZT
`;

const mismatchInvoice = `
INVOICE
SUPPLIER
Steppe Tech Trade
BIN / IIN
987654321098
INVOICE NUMBER
ST-4407
DATE
13.08.2026
CURRENCY
KZT
Description Qty Unit price Amount
USB-C hubs 10 3,000 30,000
Wireless keyboards 4 5,000 20,000
Subtotal: 50,000 KZT
VAT: 6,000 KZT
TOTAL: 59,000 KZT
`;

const unrelatedDocument = `
PROJECT NOTES
Meeting agenda for the product team.
Discuss onboarding copy, launch timing and interview schedule.
No invoice or payable document is attached.
`;

const pollutedButValidInvoice = `
PDFFormatVersion=1.4 Producer=Example Metadata CreationDate=20260813
INVOICE SUPPLIER Qazaq Office Supply LLP BIN / IIN 123456789012 INVOICE NUMBER KZ-2026-0813 DATE 13.08.2026 CUSTOMER North Steppe Labs CURRENCY KZT Description Qty Unit price Amount Laboratory notebooks 10 3,500 35,000 Nitrile gloves, boxes 15 2,500 37,500 Pipette tip racks 8 5,000 40,000 Subtotal: 112,500 KZT VAT: 13,500 KZT TOTAL: 126,000 KZT
`;

function run(name: string, raw: string, expectation: (risk: ReturnType<typeof validateInvoiceBusiness>) => boolean, details: string): FixtureResult {
  const analysis = analyzeInvoice(raw);
  const validation = validateInvoiceBusiness(analysis.data, { extraction: analysis.extraction, duplicateInvoice: null });
  return {
    name,
    passed: expectation(validation),
    extractionStatus: validation.extraction.status,
    riskLevel: validation.risk_level,
    details,
  };
}

export function runInvoiceReliabilityFixtures(): FixtureResult[] {
  return [
    run(
      "Clean invoice",
      cleanInvoice,
      (result) => result.extraction.status === "reliable" && result.risk_level === "low",
      "A complete internally consistent invoice must be low risk.",
    ),
    run(
      "Collapsed converter output",
      collapsedCleanInvoice,
      (result) => result.extraction.status === "reliable" && result.risk_level === "low",
      "A clean invoice must remain verifiable when document conversion glues adjacent PDF cells together.",
    ),
    run(
      "Totals mismatch",
      mismatchInvoice,
      (result) => result.extraction.status === "reliable" && result.risk_level === "high" && result.checks.some((check) => check.id === "totals" && check.status === "fail"),
      "A verified subtotal + VAT mismatch must be surfaced as a high-severity exception.",
    ),
    run(
      "Unsupported document",
      unrelatedDocument,
      (result) => result.extraction.status === "unsupported" && result.risk_level === "not_calculated" && result.risk_score === null,
      "A non-invoice must never receive an invented invoice risk result.",
    ),
    run(
      "Polluted extraction",
      pollutedButValidInvoice,
      (result) => result.risk_level === "low" || result.risk_level === "not_calculated",
      "PDF metadata or flattened text may lower extraction confidence, but must never create a false medium/high business risk by itself.",
    ),
  ];
}
