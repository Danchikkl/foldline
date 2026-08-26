import type { InvoiceData, LineItem } from "@/lib/invoice";
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

export const INVOICE_ENGINE_VERSION = "invoice-reliability-2026-08-27.2";

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

function hasValue(value: unknown) {
  return value !== null && value !== undefined && compact(value) !== "";
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
  return value.length >= 2 && value.length <= 50 && /[A-Za-zА-Яа-яЁё0-9]/.test(value);
}

function validTotal(data: InvoiceData) {
  return typeof data.total.value === "number" && Number.isFinite(data.total.value) && data.total.value >= 0;
}

function validRow(item: LineItem) {
  if (!compact(item.description) || item.amount === null || !Number.isFinite(item.amount)) return false;
  if (item.quantity !== null && (!Number.isFinite(item.quantity) || item.quantity <= 0)) return false;
  if (item.unit_price !== null && (!Number.isFinite(item.unit_price) || item.unit_price < 0)) return false;
  if (item.quantity !== null && item.unit_price !== null && !close(item.quantity * item.unit_price, item.amount)) return false;
  return true;
}

function arithmeticSignals(data: InvoiceData) {
  const subtotal = typeof data.subtotal.value === "number" ? data.subtotal.value : null;
  const vat = typeof data.vat.value === "number" ? data.vat.value : null;
  const total = typeof data.total.value === "number" ? data.total.value : null;
  const rows = data.line_items.filter(validRow);
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

function normalizeExtraction(
  data: InvoiceData,
  assessment: ExtractionAssessment,
  humanConfirmed: boolean,
): ExtractionAssessment {
  if (assessment.status === "unsupported" && !humanConfirmed) {
    return { ...assessment, score: 0 };
  }

  const arithmetic = arithmeticSignals(data);
  const issues = assessment.issues.filter((issue) => humanConfirmed ? !/low confidence/i.test(issue) : true);
  const identityConflict = issues.some((issue) => /^(?:supplier name|invoice number):.*strategies disagree/i.test(issue));
  const moneyConflict = issues.some((issue) => /^(?:subtotal|vat|total):.*strategies disagree/i.test(issue));
  const lineConflict = issues.some((issue) => /^line items:.*different row sets/i.test(issue));
  const strongArithmetic = arithmetic.totalsReconcile && (arithmetic.validRows === 0 || arithmetic.lineSumReconciles);

  const missing: string[] = [];
  if (!validSupplier(data)) missing.push("supplier name could not be read reliably.");
  if (!validInvoiceNumber(data)) missing.push("invoice number could not be read reliably.");
  if (!validTotal(data)) missing.push("total could not be read reliably.");

  const unresolvedMoneyConflict = moneyConflict && !strongArithmetic;
  const unresolvedLineConflict = lineConflict && arithmetic.validRows > 0 && !arithmetic.lineSumReconciles;
  const blocking = identityConflict || unresolvedMoneyConflict || unresolvedLineConflict || missing.length > 0;

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
      ...(arithmetic.totalsReconcile ? ["subtotal + VAT = total"] : []),
      ...(arithmetic.lineSumReconciles ? ["line-item sum reconciles"] : []),
      ...(arithmetic.rowMathReconciles ? ["detected line-item arithmetic reconciles"] : []),
      ...(humanConfirmed ? ["human review confirmed the structured values"] : []),
    ])],
  };
}

export function analyzeInvoice(rawText: string) {
  const base = analyzeInvoiceBase(rawText);
  return {
    data: base.data,
    extraction: normalizeExtraction(base.data, base.extraction, false),
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

  const duplicateFailure = base.checks.some((item) => item.id === "duplicate-invoice-number" && item.status === "fail");
  const enoughBusinessEvidence = arithmeticCheckRan(base.checks) || duplicateFailure;

  if (extraction.status !== "reliable") {
    return {
      ...base,
      engine_version: INVOICE_ENGINE_VERSION,
      extraction,
      risk_score: null,
      risk_level: "not_calculated",
      summary: extraction.status === "unsupported"
        ? "This document is outside the invoice workflow supported by the current MVP."
        : "Foldline could not read enough of this invoice reliably, so business risk was not calculated.",
    };
  }

  if (!enoughBusinessEvidence) {
    return {
      ...base,
      engine_version: INVOICE_ENGINE_VERSION,
      extraction,
      risk_score: null,
      risk_level: "not_calculated",
      summary: "The document was read, but there is not enough verifiable arithmetic or history evidence to make a risk claim.",
    };
  }

  return {
    ...base,
    engine_version: INVOICE_ENGINE_VERSION,
    extraction,
  };
}
