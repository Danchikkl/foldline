import {
  extractInvoice as extractInvoiceLegacy,
  type EvidenceValue,
  type InvoiceData,
  type LineItem,
} from "@/lib/invoice";
import { extractInvoice as extractInvoiceSemantic } from "@/lib/invoice-v2";

export const INVOICE_ENGINE_VERSION = "invoice-engine-2026-08-27.1";

export type ExtractionStatus = "reliable" | "needs_review" | "unsupported";
export type RiskLevel = "low" | "medium" | "high" | "not_calculated";
export type CheckStatus = "pass" | "fail" | "info" | "skipped";
export type CheckSeverity = "info" | "low" | "medium" | "high";

export type ExtractionAssessment = {
  status: ExtractionStatus;
  score: number;
  document_type: "invoice" | "unknown";
  issues: string[];
  signals: string[];
};

export type ValidationCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  fields: string[];
};

export type ValidationResult = {
  engine_version: string;
  extraction: ExtractionAssessment;
  risk_score: number | null;
  risk_level: RiskLevel;
  checks: ValidationCheck[];
  needs_review: string[];
  summary: string;
};

export type DuplicateInvoice = {
  documentId: string;
  filename: string;
  invoiceNumber: string;
} | null | undefined;

export type ValidationContext = {
  duplicateInvoice?: DuplicateInvoice;
  humanConfirmed?: boolean;
  extraction?: ExtractionAssessment;
};

type ReconciledField = {
  field: EvidenceValue;
  conflict: boolean;
  signal?: string;
};

const empty = (): EvidenceValue => ({ value: null, confidence: 0, evidence: "" });
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s._'’`-]+/g, "")
    .replace(/[^A-ZА-ЯЁ0-9]/g, "");
}

function sameNumber(a: unknown, b: unknown) {
  return typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.001);
}

function sameValue(a: unknown, b: unknown) {
  if (typeof a === "number" || typeof b === "number") return sameNumber(a, b);
  return normalizeText(a) !== "" && normalizeText(a) === normalizeText(b);
}

function metadataLike(value: unknown) {
  const text = String(value ?? "");
  return /PDFFormatVersion|PDFVersion|metadata|producer|creator|creationdate|moddate|xref|trailer/i.test(text);
}

function plausibleField(key: keyof Omit<InvoiceData, "line_items">, field: EvidenceValue) {
  const value = field.value;
  if (value === null || value === "") return false;
  if (metadataLike(value)) return false;

  if (key === "supplier_name") {
    const text = compact(String(value));
    return text.length >= 2 && text.length <= 140 && /[A-Za-zА-Яа-яЁё]/.test(text) && !/^(?:invoice|supplier|metadata|document)$/i.test(text);
  }
  if (key === "supplier_bin") return /^\d{12}$/.test(String(value).trim());
  if (key === "invoice_number" || key === "po_number") {
    const text = compact(String(value));
    return text.length >= 2 && text.length <= 50 && /[A-Za-zА-Яа-яЁё0-9]/.test(text) && !/^(?:number|invoice|po|n\/a)$/i.test(text);
  }
  if (key === "invoice_date") return /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(String(value));
  if (key === "currency") return /^(?:KZT|USD|EUR|RUB)$/i.test(String(value).trim());
  if (["subtotal", "vat", "total"].includes(key)) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1e15;
  }
  return true;
}

function chooseField(
  key: keyof Omit<InvoiceData, "line_items">,
  primary: EvidenceValue,
  secondary: EvidenceValue,
): ReconciledField {
  const a = plausibleField(key, primary) ? primary : null;
  const b = plausibleField(key, secondary) ? secondary : null;

  if (!a && !b) return { field: empty(), conflict: false };
  if (a && b && sameValue(a.value, b.value)) {
    const preferred = a.confidence >= b.confidence ? a : b;
    return {
      field: { ...preferred, confidence: Math.max(preferred.confidence, 0.97) },
      conflict: false,
      signal: `${key}: extraction strategies agree`,
    };
  }
  if (a && b) {
    const preferred = a.confidence >= b.confidence ? a : b;
    return {
      field: { ...preferred, confidence: Math.min(preferred.confidence, 0.82) },
      conflict: true,
      signal: `${key}: extraction strategies disagree`,
    };
  }

  const only = a || b!;
  return {
    field: { ...only, confidence: Math.min(only.confidence, 0.9) },
    conflict: false,
    signal: `${key}: one extraction strategy produced a plausible value`,
  };
}

function close(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
}

function saneLineItem(item: LineItem) {
  const description = compact(item.description || "");
  if (description.length < 2 || description.length > 180) return false;
  if (!/[A-Za-zА-Яа-яЁё]/.test(description)) return false;
  if (/PDFFormatVersion|metadata|synthetic test document.*invoice|invoice.*supplier.*date/i.test(description)) return false;
  if (item.amount === null || !Number.isFinite(item.amount) || item.amount < 0 || item.amount >= 1e15) return false;
  if (item.quantity !== null && (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity >= 1e9)) return false;
  if (item.unit_price !== null && (!Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price >= 1e15)) return false;
  // Structural extraction must preserve business exceptions. A row where
  // quantity × unit price != amount is still a real row and is validated later.
  return true;
}

function normalizeLineItem(item: LineItem): LineItem {
  return {
    ...item,
    description: compact(item.description),
    confidence: Math.min(Math.max(item.confidence, 0), 0.97),
    evidence: compact(item.evidence || "").slice(0, 1200),
  };
}

function uniqueItems(items: LineItem[]) {
  const out: LineItem[] = [];
  for (const raw of items) {
    if (!saneLineItem(raw)) continue;
    const item = normalizeLineItem(raw);
    const duplicate = out.some((existing) =>
      normalizeText(existing.description) === normalizeText(item.description)
      && sameNumber(existing.amount, item.amount)
      && (existing.quantity === null || item.quantity === null || sameNumber(existing.quantity, item.quantity)),
    );
    if (!duplicate) out.push(item);
  }
  return out;
}

function scoreItemSet(items: LineItem[], subtotal: number | null, total: number | null, vat: number | null) {
  if (!items.length) return 0;
  let score = items.length * 3;
  const mathematicallyConsistent = items.filter((item) =>
    item.quantity !== null && item.unit_price !== null && item.amount !== null && close(item.quantity * item.unit_price, item.amount),
  ).length;
  score += mathematicallyConsistent * 2;
  const sum = items.reduce((acc, item) => acc + (item.amount ?? 0), 0);
  if (subtotal !== null && close(sum, subtotal)) score += 12;
  else if (total !== null && vat !== null && close(sum + vat, total)) score += 10;
  else if (total !== null && close(sum, total)) score += 5;
  return score;
}

function reconcileLineItems(
  primary: LineItem[],
  secondary: LineItem[],
  totals: { subtotal: number | null; total: number | null; vat: number | null },
) {
  const a = uniqueItems(primary);
  const b = uniqueItems(secondary);
  const scoreA = scoreItemSet(a, totals.subtotal, totals.total, totals.vat);
  const scoreB = scoreItemSet(b, totals.subtotal, totals.total, totals.vat);
  const chosen = scoreA >= scoreB ? a : b;

  const signatures = (items: LineItem[]) => items
    .map((item) => `${normalizeText(item.description)}:${item.quantity ?? ""}:${item.unit_price ?? ""}:${item.amount ?? ""}`)
    .sort()
    .join("|");

  return {
    items: chosen,
    conflict: a.length > 0 && b.length > 0 && signatures(a) !== signatures(b),
    signal: chosen.length ? `line_items: selected ${chosen.length} structurally valid row${chosen.length === 1 ? "" : "s"}` : undefined,
  };
}

function invoiceLike(rawText: string) {
  const text = rawText.normalize("NFKC");
  const boundary = String.raw`(?:^|[^A-Za-zА-Яа-яЁё0-9])`;
  const endBoundary = String.raw`(?=$|[^A-Za-zА-Яа-яЁё0-9])`;
  const has = (pattern: string) => new RegExp(`${boundary}(?:${pattern})${endBoundary}`, "i").test(text);

  const title = has(String.raw`invoice|сч[её]т(?:-фактура)?`);
  const businessLabels = [
    String.raw`supplier|поставщик`,
    String.raw`invoice\s*(?:number|no\.?|#|№)|сч[её]т\s*(?:номер|no\.?|#|№)`,
    String.raw`subtotal|итого\s+без\s+ндс|total|итого`,
    String.raw`description|описание|qty|quantity|кол-?во|количество|amount|сумма|unit\s*price|цена`,
  ].filter(has).length;
  return title && businessLabels >= 2;
}

export function assessStructuredInvoice(data: InvoiceData, rawText = "", humanConfirmed = false, extraIssues: string[] = []): ExtractionAssessment {
  if (!humanConfirmed && rawText && !invoiceLike(rawText)) {
    return {
      status: "unsupported",
      score: 0,
      document_type: "unknown",
      issues: ["This document does not look like an invoice supported by the current review engine."],
      signals: [],
    };
  }

  const issues = [...extraIssues];
  const signals: string[] = [];
  let score = 0;

  const present = (key: keyof Omit<InvoiceData, "line_items">, points: number, critical = false) => {
    const field = data[key];
    if (plausibleField(key, field)) {
      score += points;
      signals.push(`${key}: present`);
      if (field.confidence < 0.75 && !humanConfirmed) issues.push(`${key.replaceAll("_", " ")} was extracted with low confidence.`);
    } else if (critical) {
      issues.push(`${key.replaceAll("_", " ")} could not be read reliably.`);
    }
  };

  present("supplier_name", 12, true);
  present("supplier_bin", 5, false);
  present("invoice_number", 14, true);
  present("invoice_date", 8, false);
  present("currency", 8, false);
  present("subtotal", 10, false);
  present("vat", 6, false);
  present("total", 16, true);

  const items = uniqueItems(data.line_items);
  if (items.length) {
    score += Math.min(15, 7 + items.length * 2);
    signals.push(`line_items: ${items.length} structurally valid`);
    const consistent = items.filter((item) => item.quantity !== null && item.unit_price !== null && close(item.quantity * item.unit_price, item.amount ?? 0)).length;
    if (consistent === items.length) score += 6;
    else if (!humanConfirmed) issues.push("One or more line items could not be verified as quantity × unit price = amount.");
  }

  const subtotal = typeof data.subtotal.value === "number" ? data.subtotal.value : null;
  const vat = typeof data.vat.value === "number" ? data.vat.value : null;
  const total = typeof data.total.value === "number" ? data.total.value : null;
  if (subtotal !== null && vat !== null && total !== null) {
    score += 5;
    signals.push("totals: enough values to verify arithmetic");
  }

  if (humanConfirmed) {
    return {
      status: "reliable",
      score: 100,
      document_type: "invoice",
      issues: [],
      signals: [...signals, "human review confirmed the extracted values"],
    };
  }

  const criticalMissing = !plausibleField("supplier_name", data.supplier_name)
    || !plausibleField("invoice_number", data.invoice_number)
    || !plausibleField("total", data.total);
  const hasConflict = issues.some((issue) => /strategies disagree|conflict/i.test(issue));
  const status: ExtractionStatus = !criticalMissing && !hasConflict && score >= 72 ? "reliable" : "needs_review";

  return {
    status,
    score: Math.max(0, Math.min(100, score)),
    document_type: "invoice",
    issues: [...new Set(issues)],
    signals: [...new Set(signals)],
  };
}

export function analyzeInvoice(rawText: string) {
  const semantic = extractInvoiceSemantic(rawText);
  const legacy = extractInvoiceLegacy(rawText);
  const issues: string[] = [];
  const signals: string[] = [];

  const keys: (keyof Omit<InvoiceData, "line_items">)[] = [
    "supplier_name",
    "supplier_bin",
    "invoice_number",
    "po_number",
    "invoice_date",
    "currency",
    "subtotal",
    "vat",
    "total",
  ];

  const data = {} as InvoiceData;
  for (const key of keys) {
    const result = chooseField(key, semantic[key], legacy[key]);
    data[key] = result.field as never;
    if (result.conflict) issues.push(`${key.replaceAll("_", " ")}: extraction strategies disagree.`);
    if (result.signal) signals.push(result.signal);
  }

  const subtotal = typeof data.subtotal.value === "number" ? data.subtotal.value : null;
  const vat = typeof data.vat.value === "number" ? data.vat.value : null;
  const total = typeof data.total.value === "number" ? data.total.value : null;
  const lineResult = reconcileLineItems(semantic.line_items, legacy.line_items, { subtotal, vat, total });
  data.line_items = lineResult.items;
  if (lineResult.conflict) issues.push("line items: extraction strategies produced different row sets.");
  if (lineResult.signal) signals.push(lineResult.signal);

  const extraction = assessStructuredInvoice(data, rawText, false, issues);
  extraction.signals = [...new Set([...extraction.signals, ...signals])];
  return { data, extraction };
}

function check(
  id: string,
  label: string,
  status: CheckStatus,
  severity: CheckSeverity,
  message: string,
  fields: string[] = [],
): ValidationCheck {
  return { id, label, status, severity, message, fields };
}

export function validateInvoiceBusiness(data: InvoiceData, context: ValidationContext = {}): ValidationResult {
  const humanConfirmed = Boolean(context.humanConfirmed);
  const extraction = context.extraction ?? assessStructuredInvoice(data, "", humanConfirmed);
  const effectiveExtraction = humanConfirmed ? assessStructuredInvoice(data, "", true) : extraction;
  const checks: ValidationCheck[] = [];
  const needsReview = new Set<string>();

  if (effectiveExtraction.status !== "reliable") {
    for (const issue of effectiveExtraction.issues) {
      const key = issue.split(":")[0]?.trim().replaceAll(" ", "_");
      if (key && ["supplier_name", "supplier_bin", "invoice_number", "invoice_date", "currency", "subtotal", "vat", "total", "line_items"].includes(key)) {
        needsReview.add(key);
      }
    }
  }

  const bin = String(data.supplier_bin.value ?? "").trim();
  if (bin) {
    checks.push(/^\d{12}$/.test(bin)
      ? check("supplier-id", "Supplier ID", "pass", "info", "Supplier BIN/IIN has 12 digits.")
      : check("supplier-id", "Supplier ID", "fail", "medium", "Supplier BIN/IIN is present but does not have 12 digits.", ["supplier_bin"]));
  } else {
    checks.push(check("supplier-id", "Supplier ID", "info", "info", "No BIN/IIN was found. This is not treated as an error because international invoices may use other identifiers."));
  }

  checks.push(data.invoice_number.value
    ? check("invoice-number", "Invoice number", "pass", "info", "Invoice number is present.")
    : check("invoice-number", "Invoice number", "skipped", "info", "Invoice number could not be verified from the extraction.", ["invoice_number"]));

  checks.push(data.po_number.value
    ? check("po-number", "PO reference", "pass", "info", "PO reference is present.")
    : check("po-number", "PO reference", "info", "info", "No PO reference was found. Foldline does not treat PO as mandatory unless a workspace rule requires it."));

  if (context.duplicateInvoice === null) {
    checks.push(check("duplicate-invoice-number", "Duplicate invoice", "pass", "info", "No matching invoice from the same supplier was found in this workspace."));
  } else if (context.duplicateInvoice) {
    checks.push(check(
      "duplicate-invoice-number",
      "Duplicate invoice",
      "fail",
      "high",
      `The same supplier and invoice number already appear in ${context.duplicateInvoice.filename}.`,
      ["invoice_number", "supplier_name"],
    ));
  } else {
    checks.push(check("duplicate-invoice-number", "Duplicate invoice", "skipped", "info", "Duplicate detection was not run because the supplier or invoice number was not reliable enough."));
  }

  const total = typeof data.total.value === "number" ? data.total.value : null;
  const subtotal = typeof data.subtotal.value === "number" ? data.subtotal.value : null;
  const vat = typeof data.vat.value === "number" ? data.vat.value : null;

  if (subtotal !== null && vat !== null && total !== null) {
    const ok = close(subtotal + vat, total);
    checks.push(ok
      ? check("totals", "Totals reconcile", "pass", "info", "Subtotal + VAT matches total.")
      : check("totals", "Totals reconcile", "fail", "high", `Subtotal + VAT (${(subtotal + vat).toFixed(2)}) does not match total (${total.toFixed(2)}).`, ["subtotal", "vat", "total"]));
  } else {
    checks.push(check("totals", "Totals reconcile", "skipped", "info", "Not enough reliable values were extracted to verify subtotal + VAT = total.", ["subtotal", "vat", "total"]));
  }

  const items = uniqueItems(data.line_items);
  if (items.length) {
    const inconsistentRows = items.filter((item) => item.quantity !== null && item.unit_price !== null && !close(item.quantity * item.unit_price, item.amount ?? 0));
    if (inconsistentRows.length) {
      checks.push(check("line-math", "Line-item arithmetic", "fail", "medium", `${inconsistentRows.length} line item${inconsistentRows.length === 1 ? "" : "s"} do not satisfy quantity × unit price = amount.`, ["line_items"]));
    } else {
      checks.push(check("line-math", "Line-item arithmetic", "pass", "info", "Detected line items are arithmetically consistent."));
    }

    const sum = items.reduce((acc, item) => acc + (item.amount ?? 0), 0);
    const target = subtotal ?? (total !== null && vat !== null ? total - vat : total);
    if (target !== null) {
      checks.push(close(sum, target)
        ? check("line-sum", "Line-item sum", "pass", "info", "Line-item amounts reconcile with the invoice subtotal/total.")
        : check("line-sum", "Line-item sum", "fail", "medium", `Line items sum to ${sum.toFixed(2)}, while the expected amount is ${target.toFixed(2)}.`, ["line_items", subtotal !== null ? "subtotal" : "total"]));
    } else {
      checks.push(check("line-sum", "Line-item sum", "skipped", "info", "No reliable subtotal/total was available for a line-item sum check."));
    }
  } else {
    checks.push(check("line-math", "Line items", "skipped", "info", "Line items could not be read reliably enough for arithmetic checks.", ["line_items"]));
  }

  for (const item of checks) if (item.status === "fail") item.fields.forEach((field) => needsReview.add(field));

  if (effectiveExtraction.status !== "reliable") {
    return {
      engine_version: INVOICE_ENGINE_VERSION,
      extraction: effectiveExtraction,
      risk_score: null,
      risk_level: "not_calculated",
      checks,
      needs_review: [...needsReview],
      summary: effectiveExtraction.status === "unsupported"
        ? "This document is outside the invoice workflow supported by the current MVP."
        : "Foldline could not read enough of this invoice reliably, so business risk was not calculated.",
    };
  }

  const failures = checks.filter((item) => item.status === "fail");
  const hasHigh = failures.some((item) => item.severity === "high");
  const hasMedium = failures.some((item) => item.severity === "medium");
  const riskLevel: RiskLevel = hasHigh ? "high" : hasMedium ? "medium" : "low";
  const riskScore = hasHigh ? 80 : hasMedium ? 50 : 0;

  return {
    engine_version: INVOICE_ENGINE_VERSION,
    extraction: effectiveExtraction,
    risk_score: riskScore,
    risk_level: riskLevel,
    checks,
    needs_review: [...needsReview],
    summary: riskLevel === "low"
      ? "The checks Foldline could verify passed."
      : riskLevel === "medium"
        ? "One or more verified checks need attention."
        : "A verified high-severity exception needs attention.",
  };
}
