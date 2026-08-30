import type { EvidenceValue, InvoiceData, LineItem } from "@/lib/invoice";
import { extractInvoice as extractInvoiceSemantic } from "@/lib/invoice-v2";
import {
  analyzeInvoice as analyzeInvoiceBase,
  assessStructuredInvoice as assessStructuredInvoiceBase,
  validateInvoiceBusiness as validateInvoiceBusinessBase,
  type CheckStatus,
  type ExtractionAssessment,
  type ExtractionStatus,
  type RiskLevel,
  type ValidationCheck,
  type ValidationContext,
  type ValidationResult,
} from "@/lib/invoice-engine";

export const INVOICE_ENGINE_VERSION = "invoice-reliability-2026-08-30.1";

export type {
  CheckStatus,
  ExtractionAssessment,
  ExtractionStatus,
  RiskLevel,
  ValidationCheck,
  ValidationContext,
  ValidationResult,
};

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function close(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
}

function parseMoneyToken(raw: string) {
  let cleaned = raw
    .normalize("NFKC")
    .replace(/[\u00a0\s'’]/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const commas = (cleaned.match(/,/g) || []).length;
  const dots = (cleaned.match(/\./g) || []).length;
  let normalized = cleaned;

  if (commas && dots) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimal = lastComma > lastDot ? "," : ".";
    const index = Math.max(lastComma, lastDot);
    const fraction = cleaned.length - index - 1;
    normalized = fraction === 1 || fraction === 2
      ? (decimal === "," ? cleaned.replace(/\./g, "").replace(/,/g, ".") : cleaned.replace(/,/g, ""))
      : cleaned.replace(/[.,]/g, "");
  } else if (commas) {
    const parts = cleaned.split(",");
    const last = parts.at(-1) || "";
    normalized = last.length === 3 ? parts.join("") : (last.length <= 2 ? `${parts.slice(0, -1).join("")}.${last}` : parts.join(""));
  } else if (dots) {
    const parts = cleaned.split(".");
    const last = parts.at(-1) || "";
    normalized = last.length === 3 ? parts.join("") : (last.length <= 2 ? `${parts.slice(0, -1).join("")}.${last}` : parts.join(""));
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const moneyToken = String.raw`(?:\d{1,3}(?:[\s,'’.]\d{3})+|\d+(?:[.,]\d{1,2})?)`;
const currencyToken = String.raw`(?:KZT|USD|EUR|RUB|₸|\$|€|₽)`;
const subtotalLabel = String.raw`(?:SUBTOTAL|NET\s+TOTAL|NET\s+AMOUNT|ИТОГО\s+БЕЗ\s+НДС|ПРОМЕЖУТОЧНЫЙ\s+ИТОГ)`;
const vatLabel = String.raw`(?:VAT(?:\s*\d{1,2}\s*%)?|TAX(?:\s*\d{1,2}\s*%)?|НДС(?:\s*\d{1,2}\s*%)?)`;
const totalLabel = String.raw`(?:GRAND\s+TOTAL|TOTAL\s+DUE|AMOUNT\s+DUE|INVOICE\s+TOTAL|ИТОГО\s+К\s+ОПЛАТЕ|ВСЕГО\s+К\s+ОПЛАТЕ|К\s+ОПЛАТЕ|TOTAL|ИТОГО)`;

function moneyEvidence(value: number, source: string, confidence = 0.94): EvidenceValue {
  return { value, confidence, evidence: compact(source).slice(0, 500) };
}

function converterLine(value: string) {
  return compact(value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/[|\t]/g, " ").replace(/[*_`#]+/g, " "));
}

function recoverMoneyAroundLabel(rawText: string, labelPattern: string): EvidenceValue | null {
  const text = rawText.normalize("NFKC").replace(/\u00a0/g, " ");
  const lines = text.split(/\r?\n/).map(converterLine).filter(Boolean);
  const forward = new RegExp(`(?:^|\\s)(?:${labelPattern})\\s*[:：-]?\\s*(?:${currencyToken}\\s*)?(${moneyToken})(?:\\s*${currencyToken})?(?=\\s|$)`, "i");
  const reverse = new RegExp(`(?:^|\\s)(${moneyToken})(?:\\s*${currencyToken})?\\s+(?:${labelPattern})(?=\\s|$)`, "i");
  const target = new RegExp(`(?:^|\\s)(?:${labelPattern})(?=\\s|$)`, "i");
  const anyMoneyLabel = new RegExp(`${subtotalLabel}|${vatLabel}|${totalLabel}`, "ig");
  const token = new RegExp(`(?:${currencyToken}\\s*)?(${moneyToken})(?:\\s*${currencyToken})?`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const direct = line.match(forward) || line.match(reverse);
    if (direct?.[1]) {
      const value = parseMoneyToken(direct[1]);
      if (value !== null) return moneyEvidence(value, direct[0], 0.95);
    }

    if (!target.test(line)) continue;
    target.lastIndex = 0;
    const labelsOnLine = line.match(anyMoneyLabel)?.length ?? 0;
    anyMoneyLabel.lastIndex = 0;
    if (labelsOnLine !== 1) continue;

    for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 4); nextIndex += 1) {
      const next = lines[nextIndex];
      if (anyMoneyLabel.test(next)) {
        anyMoneyLabel.lastIndex = 0;
        break;
      }
      anyMoneyLabel.lastIndex = 0;
      const candidate = next.match(token);
      if (!candidate?.[1]) continue;
      const value = parseMoneyToken(candidate[1]);
      if (value !== null) return moneyEvidence(value, `${line} ${next}`, 0.9);
    }
  }

  const flat = compact(text.replace(/[|\t]/g, " "));
  const direct = flat.match(forward) || flat.match(reverse);
  if (direct?.[1]) {
    const value = parseMoneyToken(direct[1]);
    if (value !== null) return moneyEvidence(value, direct[0], 0.92);
  }
  return null;
}

function recoverReorderedTotals(rawText: string) {
  const text = compact(rawText.normalize("NFKC").replace(/\u00a0/g, " ").replace(/[|\t]/g, " ").replace(/[*_`#]+/g, " "));

  const grouped = text.match(new RegExp(
    `${subtotalLabel}\\s+${vatLabel}\\s+${totalLabel}\\s+(${moneyToken})(?:\\s*${currencyToken})?\\s+(${moneyToken})(?:\\s*${currencyToken})?\\s+(${moneyToken})(?:\\s*${currencyToken})?`,
    "i",
  ));
  const reverseGrouped = !grouped ? text.match(new RegExp(
    `(${moneyToken})(?:\\s*${currencyToken})?\\s+(${moneyToken})(?:\\s*${currencyToken})?\\s+(${moneyToken})(?:\\s*${currencyToken})?\\s+${subtotalLabel}\\s+${vatLabel}\\s+${totalLabel}`,
    "i",
  )) : null;
  const source = grouped || reverseGrouped;

  const groupedValues = source
    ? [source[1], source[2], source[3]].map((token) => parseMoneyToken(token))
    : [null, null, null];
  const groupedReliable = Boolean(source && groupedValues.every((value) => value !== null));

  return {
    grouped: groupedReliable,
    subtotal: groupedValues[0] !== null
      ? moneyEvidence(groupedValues[0]!, source?.[0] || "", 0.95)
      : recoverMoneyAroundLabel(rawText, subtotalLabel),
    vat: groupedValues[1] !== null
      ? moneyEvidence(groupedValues[1]!, source?.[0] || "", 0.95)
      : recoverMoneyAroundLabel(rawText, vatLabel),
    total: groupedValues[2] !== null
      ? moneyEvidence(groupedValues[2]!, source?.[0] || "", 0.95)
      : recoverMoneyAroundLabel(rawText, totalLabel),
  };
}

function explicitlyNotInvoice(rawText: string) {
  const text = rawText.normalize("NFKC");
  return /\bNOT\s+AN?\s+INVOICE\b/i.test(text)
    || /\bTHIS\s+IS\s+NOT\s+AN?\s+INVOICE\b/i.test(text)
    || /НЕ\s+ЯВЛЯЕТСЯ\s+(?:СЧ[ЕЁ]ТОМ|ИНВОЙСОМ)/i.test(text);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizePoReference(data: InvoiceData, rawText: string): InvoiceData {
  const po = compact(data.po_number.value);
  if (!po) return data;

  const hasDigit = /\d/.test(po);
  const explicitLabel = new RegExp(
    `(?:^|[\\s|])(?:PURCHASE\\s+ORDER|P\\.?\\s*O\\.?|PO)(?:\\s*(?:NUMBER|NO\\.?|#|№))?\\s*[:：#-]?\\s*${escapeRegex(po)}(?=$|[\\s|])`,
    "i",
  ).test(rawText.normalize("NFKC"));

  if (hasDigit && explicitLabel) return data;
  return {
    ...data,
    po_number: { value: null, confidence: 0, evidence: "" },
  };
}

function recoverCriticalMoney(rawText: string, data: InvoiceData): InvoiceData {
  const recovered = recoverReorderedTotals(rawText);
  if (recovered.grouped) {
    return {
      ...data,
      subtotal: recovered.subtotal ?? data.subtotal,
      vat: recovered.vat ?? data.vat,
      total: recovered.total ?? data.total,
    };
  }
  return {
    ...data,
    subtotal: typeof data.subtotal.value === "number" ? data.subtotal : (recovered.subtotal ?? data.subtotal),
    vat: typeof data.vat.value === "number" ? data.vat : (recovered.vat ?? data.vat),
    total: typeof data.total.value === "number" ? data.total : (recovered.total ?? data.total),
  };
}

function validSupplier(data: InvoiceData) {
  const value = compact(data.supplier_name.value);
  return value.length >= 2
    && value.length <= 140
    && /[A-Za-zА-Яа-яЁё]/.test(value)
    && !/PDFFormatVersion|metadata|producer|creator|creationdate|moddate/i.test(value);
}

function validInvoiceNumber(data: InvoiceData) {
  const value = compact(data.invoice_number.value);
  return value.length >= 2
    && value.length <= 50
    && /[A-Za-zА-Яа-яЁё0-9]/.test(value)
    && !/(?:DATE|ДАТА|SUPPLIER|ПОСТАВЩИК|CUSTOMER|BUYER|CURRENCY|SUBTOTAL|VAT|TOTAL|НДС|ИТОГО)/i.test(value);
}

function validTotal(data: InvoiceData) {
  return typeof data.total.value === "number" && Number.isFinite(data.total.value) && data.total.value >= 0;
}

function validRowShape(item: LineItem) {
  const description = compact(item.description);
  if (description.length < 2 || description.length > 180) return false;
  if (!/[A-Za-zА-Яа-яЁё]/.test(description)) return false;
  if (/PDFFormatVersion|metadata|synthetic test document.*invoice|invoice.*supplier.*date/i.test(description)) return false;
  if (item.amount === null || !Number.isFinite(item.amount) || item.amount < 0 || item.amount >= 1e15) return false;
  if (item.quantity !== null && (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity >= 1e9)) return false;
  if (item.unit_price !== null && (!Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price >= 1e15)) return false;
  return true;
}

function lineTableExpected(rawText: string) {
  const text = rawText.normalize("NFKC");
  const signals = [
    /(?:DESCRIPTION|ОПИСАНИЕ)/i,
    /(?:QTY|QUANTITY|КОЛ-?ВО|КОЛИЧЕСТВО)/i,
    /(?:UNIT\s*PRICE|ЦЕНА)/i,
    /(?:AMOUNT|СУММА)/i,
  ].filter((pattern) => pattern.test(text)).length;
  return signals >= 3;
}

function guardMissingLineItems(rawText: string, data: InvoiceData, assessment: ExtractionAssessment) {
  if (!rawText || data.line_items.some(validRowShape) || !lineTableExpected(rawText)) return assessment;
  return {
    ...assessment,
    status: assessment.status === "unsupported" ? "unsupported" : "needs_review",
    issues: [...new Set([
      ...assessment.issues,
      "Line-item table was detected, but no rows were extracted reliably.",
    ])],
    signals: [...new Set([...assessment.signals, "line-item table detected in source"])]
  } satisfies ExtractionAssessment;
}

function arithmeticSignals(data: InvoiceData) {
  const subtotal = typeof data.subtotal.value === "number" ? data.subtotal.value : null;
  const vat = typeof data.vat.value === "number" ? data.vat.value : null;
  const total = typeof data.total.value === "number" ? data.total.value : null;
  const rows = data.line_items.filter(validRowShape);
  const rowSum = rows.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  const totalsReconcile = subtotal !== null && vat !== null && total !== null && close(subtotal + vat, total);
  const lineSumReconciles = rows.length > 0 && (
    (subtotal !== null && close(rowSum, subtotal))
    || (subtotal === null && total !== null && vat !== null && close(rowSum + vat, total))
    || (subtotal === null && vat === null && total !== null && close(rowSum, total))
  );
  const rowMathReconciles = rows.length > 0 && rows.every((item) =>
    item.quantity === null || item.unit_price === null || close(item.quantity * item.unit_price, item.amount ?? 0),
  );

  return { totalsReconcile, lineSumReconciles, rowMathReconciles, validRows: rows.length };
}

function strongStructuredInvoiceEvidence(data: InvoiceData) {
  const secondarySignals = [
    validSupplier(data),
    /^\d{12}$/.test(compact(data.supplier_bin.value)),
    /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(compact(data.invoice_date.value)),
    /^(?:KZT|USD|EUR|RUB)$/i.test(compact(data.currency.value)),
    validTotal(data),
    data.line_items.some(validRowShape),
  ].filter(Boolean).length;

  return validInvoiceNumber(data) && secondarySignals >= 2;
}

function recoverFalseUnsupported(data: InvoiceData, assessment: ExtractionAssessment) {
  if (assessment.signals.includes("explicit non-invoice statement in source")) {
    return { assessment, recovered: false };
  }
  if (assessment.status !== "unsupported" || !strongStructuredInvoiceEvidence(data)) {
    return { assessment, recovered: false };
  }

  const recovered = assessStructuredInvoiceBase(
    data,
    "",
    false,
    assessment.issues.filter((issue) => !/does not look like an invoice supported/i.test(issue)),
  );
  return { assessment: recovered, recovered: true };
}

function normalizeExtraction(
  data: InvoiceData,
  originalAssessment: ExtractionAssessment,
  humanConfirmed: boolean,
): ExtractionAssessment {
  const recoveredResult = humanConfirmed
    ? { assessment: originalAssessment, recovered: false }
    : recoverFalseUnsupported(data, originalAssessment);
  const assessment = recoveredResult.assessment;

  if (assessment.status === "unsupported" && !humanConfirmed) {
    return { ...assessment, score: 0 };
  }

  const arithmetic = arithmeticSignals(data);
  let issues = assessment.issues.filter((issue) => humanConfirmed ? !/low confidence/i.test(issue) : true);

  const supplierConflict = issues.some((issue) => /^supplier name:.*strategies disagree/i.test(issue));
  const invoiceNumberConflict = issues.some((issue) => /^invoice number:.*strategies disagree/i.test(issue));
  const moneyConflict = issues.some((issue) => /^(?:subtotal|vat|total):.*strategies disagree/i.test(issue));
  const lineConflict = issues.some((issue) => /^line items:.*different row sets/i.test(issue));
  const strongArithmetic = arithmetic.totalsReconcile && (arithmetic.validRows === 0 || arithmetic.lineSumReconciles);

  const unresolvedSupplierConflict = supplierConflict
    && !(validSupplier(data) && data.supplier_name.confidence >= 0.8);
  const unresolvedInvoiceNumberConflict = invoiceNumberConflict
    && !(validInvoiceNumber(data) && data.invoice_number.confidence >= 0.8);
  const identityConflict = unresolvedSupplierConflict || unresolvedInvoiceNumberConflict;

  const missing: string[] = [];
  if (!validSupplier(data)) missing.push("supplier name could not be read reliably.");
  if (!validInvoiceNumber(data)) missing.push("invoice number could not be read reliably.");
  if (!validTotal(data)) missing.push("total could not be read reliably.");

  const unresolvedMoneyConflict = moneyConflict && !strongArithmetic;
  const unresolvedLineConflict = lineConflict && arithmetic.validRows > 0 && !arithmetic.lineSumReconciles;
  const missingDetectedLineItems = issues.some((issue) => /line-item table was detected, but no rows were extracted reliably/i.test(issue));
  const blocking = identityConflict
    || unresolvedMoneyConflict
    || unresolvedLineConflict
    || missingDetectedLineItems
    || missing.length > 0;

  issues = issues.filter((issue) => {
    if (/^supplier name:.*strategies disagree/i.test(issue) && !unresolvedSupplierConflict) return false;
    if (/^invoice number:.*strategies disagree/i.test(issue) && !unresolvedInvoiceNumberConflict) return false;
    if (/^(?:subtotal|vat|total):.*strategies disagree/i.test(issue) && !unresolvedMoneyConflict) return false;
    if (/^line items:.*different row sets/i.test(issue) && !unresolvedLineConflict) return false;
    return true;
  });

  let score = assessment.score;
  if (arithmetic.totalsReconcile && !assessment.signals.includes("subtotal + VAT = total")) score += 10;
  if (arithmetic.lineSumReconciles && !assessment.signals.includes("line-item sum reconciles")) score += 10;
  if (arithmetic.rowMathReconciles && !assessment.signals.includes("detected line-item arithmetic reconciles")) score += 5;
  if (humanConfirmed && !assessment.signals.includes("human review confirmed the structured values")) score += 20;
  score = Math.max(0, Math.min(100, score));

  const status: ExtractionStatus = !blocking && (score >= 72 || humanConfirmed) ? "reliable" : "needs_review";
  const normalizedIssues = [...new Set([
    ...issues,
    ...missing,
    ...(unresolvedMoneyConflict ? ["Money fields conflict and the arithmetic does not resolve the disagreement."] : []),
    ...(unresolvedLineConflict ? ["Line-item extraction conflicts and the detected rows do not reconcile with the invoice totals."] : []),
  ])];

  return {
    ...assessment,
    status,
    score,
    document_type: "invoice",
    issues: status === "reliable" && humanConfirmed ? [] : normalizedIssues,
    signals: [...new Set([
      ...assessment.signals,
      ...(recoveredResult.recovered ? ["invoice structure recovered despite converter layout"] : []),
      ...(arithmetic.totalsReconcile ? ["subtotal + VAT = total"] : []),
      ...(arithmetic.lineSumReconciles ? ["line-item sum reconciles"] : []),
      ...(arithmetic.rowMathReconciles ? ["detected line-item arithmetic reconciles"] : []),
      ...(humanConfirmed ? ["human review confirmed the structured values"] : []),
    ])],
  };
}

function riskFromChecks(checks: ValidationCheck[]) {
  const failures = checks.filter((item) => item.status === "fail");
  const hasHigh = failures.some((item) => item.severity === "high");
  const hasMedium = failures.some((item) => item.severity === "medium");
  const riskLevel: RiskLevel = hasHigh ? "high" : hasMedium ? "medium" : "low";
  const riskScore = hasHigh ? 80 : hasMedium ? 50 : 0;
  return { failures, riskLevel, riskScore };
}

export function analyzeInvoice(rawText: string) {
  const base = analyzeInvoiceBase(rawText);
  const semantic = extractInvoiceSemantic(rawText);
  const useSemanticRows = semantic.line_items.length > 0
    && semantic.line_items.length >= base.data.line_items.length;
  const selected: InvoiceData = useSemanticRows
    ? { ...base.data, line_items: semantic.line_items }
    : base.data;
  const data = recoverCriticalMoney(rawText, sanitizePoReference(selected, rawText));

  if (explicitlyNotInvoice(rawText)) {
    return {
      data,
      extraction: {
        status: "unsupported",
        score: 0,
        document_type: "unknown",
        issues: ["The source explicitly states that it is not an invoice."],
        signals: ["explicit non-invoice statement in source"],
      } satisfies ExtractionAssessment,
    };
  }

  const carriedIssues = base.extraction.issues.filter((issue) => !/^line items:/i.test(issue));
  const reassessed = assessStructuredInvoiceBase(data, rawText, false, carriedIssues);
  const normalized = normalizeExtraction(data, reassessed, false);

  return {
    data,
    extraction: guardMissingLineItems(rawText, data, normalized),
  };
}

export function assessStructuredInvoice(
  data: InvoiceData,
  rawText = "",
  humanConfirmed = false,
  extraIssues: string[] = [],
) {
  const base = assessStructuredInvoiceBase(data, rawText, false, extraIssues);
  const normalized = normalizeExtraction(data, base, humanConfirmed);
  return humanConfirmed ? normalized : guardMissingLineItems(rawText, data, normalized);
}

function arithmeticCheckRan(checks: ValidationCheck[]) {
  return checks.some((item) =>
    ["totals", "line-sum", "line-math"].includes(item.id)
    && (item.status === "pass" || item.status === "fail"),
  );
}

export function validateInvoiceBusiness(data: InvoiceData, context: ValidationContext = {}): ValidationResult {
  const humanConfirmed = Boolean(context.humanConfirmed);
  const extraction = normalizeExtraction(
    data,
    context.extraction ?? assessStructuredInvoiceBase(data, "", false),
    humanConfirmed,
  );

  const base = validateInvoiceBusinessBase(data, {
    ...context,
    humanConfirmed: false,
    extraction,
  });
  const checks = base.checks;
  const { failures, riskLevel, riskScore } = riskFromChecks(checks);
  const duplicateFailure = checks.some((item) => item.id === "duplicate-invoice-number" && item.status === "fail");
  const enoughBusinessEvidence = arithmeticCheckRan(checks) || duplicateFailure;

  if (extraction.status === "unsupported") {
    return {
      ...base,
      engine_version: INVOICE_ENGINE_VERSION,
      extraction,
      checks,
      risk_score: null,
      risk_level: "not_calculated",
      summary: "Foldline does not recognize this document as a supported invoice.",
    };
  }

  if (extraction.status !== "reliable") {
    if (failures.length > 0 && enoughBusinessEvidence) {
      return {
        ...base,
        engine_version: INVOICE_ENGINE_VERSION,
        extraction,
        checks,
        risk_score: riskScore,
        risk_level: riskLevel,
        needs_review: [...new Set([...base.needs_review, ...failures.flatMap((item) => item.fields)])],
        summary: "A verified issue was found. Some other fields still need review.",
      };
    }

    return {
      ...base,
      engine_version: INVOICE_ENGINE_VERSION,
      extraction,
      checks,
      risk_score: null,
      risk_level: "not_calculated",
      summary: "Foldline could not verify enough of this invoice to claim that the checks passed.",
    };
  }

  if (!enoughBusinessEvidence) {
    return {
      ...base,
      engine_version: INVOICE_ENGINE_VERSION,
      extraction,
      checks,
      risk_score: null,
      risk_level: "not_calculated",
      summary: "The invoice was read, but there is not enough verifiable arithmetic or history evidence to finish the check.",
    };
  }

  return {
    ...base,
    engine_version: INVOICE_ENGINE_VERSION,
    extraction,
    checks,
    risk_score: riskScore,
    risk_level: riskLevel,
    needs_review: [...new Set([...base.needs_review, ...failures.flatMap((item) => item.fields)])],
    summary: riskLevel === "low"
      ? "Verified checks passed."
      : "A verified issue needs attention.",
  };
}