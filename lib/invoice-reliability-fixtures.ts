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

const lineArithmeticMismatchInvoice = `
INVOICE
SUPPLIER
Nomad Logistics Equipment LLP
BIN / IIN
190740009876
INVOICE NUMBER
NLE-8842
DATE
27.08.2026
CURRENCY
USD
Description Qty Unit price Amount
Handheld barcode scanners 4 120.00 480.00
Thermal label printers 2 210.00 400.00
Thermal label rolls 10 18.00 180.00
Subtotal: 1060.00 USD
VAT: 106.00 USD
TOTAL: 1166.00 USD
`;

const collapsedLineArithmeticMismatchInvoice = `
INVOICE
SUPPLIERNomad Logistics Equipment LLP
BIN / IIN190740009876
INVOICE NUMBERNLE-8842DATE27.08.2026
CURRENCYUSD
DescriptionQtyUnit priceAmount
Handheld barcode scanners4120.00480.00Thermal label printers2210.00400.00Thermal label rolls1018.00180.00Subtotal1060.00 USD
VAT106.00 USD
TOTAL1166.00 USD
`;

const missingLineRowsInvoice = `
INVOICE
SUPPLIER
Steppe Medical Supplies LLP
BIN / IIN
240540001234
INVOICE NUMBER
SMS-2026-1047
DATE
27.08.2026
CURRENCY
KZT
Description Qty Unit price Amount
Subtotal: 184,000 KZT
VAT: 22,080 KZT
TOTAL: 206,080 KZT
`;

const russianInvoice = `
СЧЁТ
ПОСТАВЩИК
ТОО Степь Мед
БИН / ИИН
240540001234
СЧЁТ НОМЕР
RU-1047
ДАТА
27.08.2026
ВАЛЮТА
KZT
Описание Кол-во Цена Сумма
Фильтры 2 10,000 20,000
Перчатки 3 5,000 15,000
Итого без НДС: 35,000 KZT
НДС: 4,200 KZT
ИТОГО: 39,200 KZT
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
      "Line-item arithmetic mismatch",
      lineArithmeticMismatchInvoice,
      (result) => result.risk_level === "medium"
        && result.checks.some((check) => check.id === "line-math" && check.status === "fail")
        && result.checks.some((check) => check.id === "line-sum" && check.status === "pass")
        && result.checks.some((check) => check.id === "totals" && check.status === "pass"),
      "An arithmetic error inside a real row must be preserved and surfaced even when aggregate totals reconcile.",
    ),
    run(
      "Collapsed line-item arithmetic mismatch",
      collapsedLineArithmeticMismatchInvoice,
      (result) => result.risk_level === "medium"
        && result.checks.some((check) => check.id === "line-math" && check.status === "fail")
        && result.checks.some((check) => check.id === "line-sum" && check.status === "pass"),
      "Collapsed converter output must not hide an arithmetic exception by dropping the bad row.",
    ),
    run(
      "Visible line table with zero rows",
      missingLineRowsInvoice,
      (result) => result.extraction.status === "needs_review"
        && result.risk_level === "not_calculated"
        && result.risk_score === null,
      "A visible line-item table with no extracted rows must never produce a low-risk claim.",
    ),
    run(
      "Russian invoice classification",
      russianInvoice,
      (result) => result.extraction.status === "reliable" && result.risk_level === "low",
      "A valid Cyrillic invoice must classify correctly and reconcile without a false VAT mismatch.",
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
