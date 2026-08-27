import type { InvoiceData, LineItem } from "@/lib/invoice";
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

export const INVOICE_ENGINE_VERSION = "invoice-reliability-2026-08-27.4";

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

/**
 * Extraction decides whether a row is structurally plausible. Arithmetic is a
 * business check and MUST NOT be used to discard a row: a wrong multiplication
 * is exactly the exception Foldline is supposed to surface.
 */
function validRowShape(item: LineItem) {
  if (!compact(item.description) || item.amount === null || !Number.isFinite(item.amount)) return false;
  if (item.quantity !== null && (!Number.isFinite(item.quantity) || item.quantity <= 0)) return false;
  if (item.unit_price !== null && (!Number.isFinite(item.unit_price) || item.unit_price < 0)) return false;
  return true;
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
  const blocking = identityConflict || unresolvedMoneyConflict || unresolvedLineConflict || missing.length > 0;

  issues = issues.filter((issue) => {
    if (/^supplier name:.*strategies disagree/i.test(issue) && !unresolvedSupplierConflict) return false;
    if (/^invoice number:.*strategies disagree/i.test(issue) && !unresolvedInvoiceNumberConflict) return false;
    if (/^(?:subtotal|vat|total):.*strategies disagree/i.test(issue) && !unresolvedMoneyConflict) return false;
    if (/^line items:.*different row sets/i.test(issue) && !unresolvedLineConflict) return false;
    return true;
  });

  let score = assessment.score;
  if (arithmetic.totalsReconcile) score += 10;
  if (arithmetic.lineSumReconciles) score += 10;
  if (arithmetic.rowMathReconciles) score += 5;
  if (humanConfirmed) score += 20;
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
      ...(recoveredResult.recovered ? ["invoice structure recovered despite collapsed converter text"] : []),
      ...(arithmetic.totalsReconcile ? ["subtotal + VAT = total"] : []),
      ...(arithmetic.lineSumReconciles ? ["line-item sum reconciles"] : []),
      ...(arithmetic.rowMathReconciles ? ["detected line-item arithmetic reconciles"] : []),
      ...(humanConfirmed ? ["human review confirmed the structured values"] : []),
    ])],
  };
}

function lineCheck(
  id: string,
  label: string,
  status: CheckStatus,
  severity: ValidationCheck["severity"],
  message: string,
  fields: string[] = [],
): ValidationCheck {
  return { id, label, status, severity, message, fields };
}

function withReliableLineChecks(checks: ValidationCheck[], data: InvoiceData) {
  const rows = data.line_items.filter(validRowShape);
  if (!rows.length) return checks;

  const subtotal = typeof data.subtotal.value === "number" ? data.subtotal.value : null;
  const vat = typeof data.vat.value === "number" ? data.vat.value : null;
  const total = typeof data.total.value === "number" ? data.total.value : null;
  const inconsistent = rows.filter((item) =>
    item.quantity !== null
    && item.unit_price !== null
    && !close(item.quantity * item.unit_price, item.amount ?? 0),
  );

  const replacement: ValidationCheck[] = [
    inconsistent.length
      ? lineCheck(
          "line-math",
          "Line-item arithmetic",
          "fail",
          "medium",
          `${inconsistent.length} line item${inconsistent.length === 1 ? "" : "s"} do not satisfy quantity × unit price = amount.`,
          ["line_items"],
        )
      : lineCheck("line-math", "Line-item arithmetic", "pass", "info", "Detected line items are arithmetically consistent."),
  ];

  const sum = rows.reduce((acc, item) => acc + (item.amount ?? 0), 0);
  const target = subtotal ?? (total !== null && vat !== null ? total - vat : total);
  if (target !== null) {
    replacement.push(close(sum, target)
      ? lineCheck("line-sum", "Line-item sum", "pass", "info", "Line-item amounts reconcile with the invoice subtotal/total.")
      : lineCheck(
          "line-sum",
          "Line-item sum",
          "fail",
          "medium",
          `Line items sum to ${sum.toFixed(2)}, while the expected amount is ${target.toFixed(2)}.`,
          ["line_items", subtotal !== null ? "subtotal" : "total"],
        ));
  } else {
    replacement.push(lineCheck("line-sum", "Line-item sum", "skipped", "info", "No reliable subtotal/total was available for a line-item sum check."));
  }

  const firstLineIndex = checks.findIndex((item) => item.id === "line-math" || item.id === "line-sum");
  const withoutOld = checks.filter((item) => item.id !== "line-math" && item.id !== "line-sum");
  if (firstLineIndex < 0) return [...withoutOld, ...replacement];

  const insertionIndex = Math.min(firstLineIndex, withoutOld.length);
  return [
    ...withoutOld.slice(0, insertionIndex),
    ...replacement,
    ...withoutOld.slice(insertionIndex),
  ];
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
  const data: InvoiceData = useSemanticRows
    ? { ...base.data, line_items: semantic.line_items }
    : base.data;

  const carriedIssues = base.extraction.issues.filter((issue) => !/^line items:/i.test(issue));
  const reassessed = useSemanticRows
    ? assessStructuredInvoiceBase(data, rawText, false, carriedIssues)
    : base.extraction;

  return {
    data,
    extraction: normalizeExtraction(data, reassessed, false),
  };
}

export function assessStructuredInvoice(
  data: InvoiceData,
  rawText = "",
  humanConfirmed = false,
  extraIssues: string[] = [],
) {
  const base = assessStructuredInvoiceBase(data, rawText, false, extraIssues);
  return normalizeExtraction(data, base, humanConfirmed);
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
  const checks = withReliableLineChecks(base.checks, data);
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
      summary: "This document is outside the invoice workflow supported by the current MVP.",
    };
  }

  // A verified exception is useful even when an unrelated extraction field still
  // needs review. We only withhold a LOW-risk claim until extraction is reliable.
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
        summary: "A verified exception was found, although some extracted fields still need review.",
      };
    }

    return {
      ...base,
      engine_version: INVOICE_ENGINE_VERSION,
      extraction,
      checks,
      risk_score: null,
      risk_level: "not_calculated",
      summary: "Foldline could not read enough of this invoice reliably to make a low-risk claim.",
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
      summary: "The document was read, but there is not enough verifiable arithmetic or history evidence to make a risk claim.",
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
      ? "The checks Foldline could verify passed."
      : riskLevel === "medium"
        ? "One or more verified checks need attention."
        : "A verified high-severity exception needs attention.",
  };
}
