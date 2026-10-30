import type { DuplicateMatch } from "./duplicates";

export type EvidenceValue = { value: string | number | null; confidence: number; evidence: string };
export type LineItem = { description: string; quantity: number | null; unit_price: number | null; amount: number | null; confidence: number; evidence: string };
export type InvoiceData = {
  supplier_name: EvidenceValue;
  supplier_bin: EvidenceValue;
  invoice_number: EvidenceValue;
  invoice_date: EvidenceValue;
  po_number?: EvidenceValue;
  currency: EvidenceValue;
  subtotal: EvidenceValue;
  vat: EvidenceValue;
  total: EvidenceValue;
  line_items: LineItem[];
};

/**
 * pass       – check ran and the invoice is fine.
 * issue      – confirmed exception (e.g. exact duplicate, totals wrong on reliably read values).
 * possible   – strong signal a human has to decide on (e.g. near-duplicate).
 * unverified – Foldline could not check reliably. Extraction uncertainty ≠ business risk.
 * na         – check does not apply to this document (e.g. no VAT shown).
 * warn/fail  – legacy statuses from v0.1 documents.
 */
export type CheckStatus = "pass" | "issue" | "possible" | "unverified" | "na" | "warn" | "fail";
export type CheckCategory = "duplicate" | "completeness" | "consistency" | "format" | "document";
export type Outcome = "checked" | "issue" | "review" | "not_invoice";

export type ValidationCheck = { id: string; label: string; status: CheckStatus; message: string; fields: string[]; category?: CheckCategory; document_id?: string };
export type ValidationResult = {
  version?: number;
  outcome?: Outcome;
  summary?: string;
  risk_score: number;
  checks: ValidationCheck[];
  needs_review: string[];
  duplicates?: DuplicateMatch[];
  compared_count?: number;
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  checked: "Checked",
  issue: "Issue found",
  review: "Requires review",
  not_invoice: "Not an invoice",
};

/** Values below this are treated as "we might have misread it". */
export const RELIABLE_CONFIDENCE = 0.8;
/** Present values below this get highlighted for the reviewer. */
const HIGHLIGHT_CONFIDENCE = 0.75;

const empty = (): EvidenceValue => ({ value: null, confidence: 0, evidence: "" });
const compact = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => s.replace(/ /g, " ");

function firstMatch(text: string, patterns: RegExp[], confidence: number, clean: (s: string) => string = (s) => s): EvidenceValue {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const value = clean(compact(m[1]));
      if (value) return { value, confidence, evidence: compact(m[0]).slice(0, 500) };
    }
  }
  return empty();
}

const trimReference = (s: string) => s.replace(/[.\-/_]+$/, "");

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9,.-]/g, "").replace(/\s/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else normalized = cleaned.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function moneyField(text: string, labels: string[], confidence: number): EvidenceValue {
  for (const label of labels) {
    // (?<!letter) stops "total" matching inside "Subtotal".
    // The amount may contain spaces as thousand separators but never a newline,
    // so digits on the next line are not glued on.
    const re = new RegExp(
      `(?<![A-Za-zА-Яа-яЁё])(?:${label})\\s*[:：—–-]?\\s*(?:KZT|₸|USD|\\$|EUR|€|RUB|₽)?[ \\t]*([0-9][0-9 \\u00a0.,]{0,24})`,
      "i",
    );
    const m = text.match(re);
    const value = parseMoney(m?.[1]?.replace(/[  .,]+$/, ""));
    if (value !== null && m) return { value, confidence, evidence: compact(m[0]) };
  }
  return empty();
}

function detectCurrency(text: string): EvidenceValue {
  const candidates: [RegExp, string][] = [
    [/(?:₸|\bKZT\b|тенге)/i, "KZT"],
    [/(?:\$|\bUSD\b)/i, "USD"],
    [/(?:€|\bEUR\b)/i, "EUR"],
    [/(?:₽|\bRUB\b|руб(?:\.|лей)?)/i, "RUB"],
  ];
  for (const [re, value] of candidates) {
    const m = text.match(re);
    if (m) return { value, confidence: 0.94, evidence: compact(m[0]) };
  }
  return empty();
}

function detectSupplier(text: string): EvidenceValue {
  const labelled = firstMatch(
    text,
    [/(?:supplier|vendor|seller|from|поставщик|продавец|исполнитель)\s*[:：]\s*([^\n|]{3,120})/i],
    0.82,
  );
  if (labelled.value) return labelled;
  const lines = text.split(/\r?\n/).map(compact).filter(Boolean).slice(0, 25);
  const ignored = /^(invoice|сч[её]т|счет-фактура|накладная|date|дата|bin|бин|iin|иин|buyer|покупатель|bill to|ship to)/i;
  for (const line of lines) {
    if (
      line.length >= 3 &&
      line.length <= 120 &&
      /[A-Za-zА-Яа-яЁё]/.test(line) &&
      !ignored.test(line) &&
      !/^\|/.test(line)
    ) {
      return { value: line.replace(/^#+\s*/, ""), confidence: 0.58, evidence: line };
    }
  }
  return empty();
}

function parseMarkdownTable(text: string): LineItem[] {
  const rows = text.split(/\r?\n/).filter((line) => /^\s*\|.*\|\s*$/.test(line));
  if (rows.length < 3) return [];

  for (let i = 0; i < rows.length - 2; i++) {
    const header = rows[i].split("|").map((x) => compact(x).toLowerCase()).filter(Boolean);
    const separator = rows[i + 1];
    if (!/---/.test(separator)) continue;

    const descIdx = header.findIndex((h) => /(description|item|наимен|товар|услуг)/i.test(h));
    const qtyIdx = header.findIndex((h) => /(qty|quantity|кол-?во|колич)/i.test(h));
    const unitIdx = header.findIndex((h) => /(unit price|price|цена)/i.test(h));
    const amountIdx = header.findIndex((h) => /(amount|sum|стоим|сумма)/i.test(h));
    if (descIdx < 0 || amountIdx < 0) continue;

    const items: LineItem[] = [];
    for (const row of rows.slice(i + 2)) {
      if (/---/.test(row)) break;
      const rawCells = row.split("|");
      const cells = rawCells.slice(1, -1).map(compact);
      if (cells.length < header.length) continue;
      const description = cells[descIdx] || "";
      const amount = parseMoney(cells[amountIdx]);
      if (!description || amount === null) continue;
      items.push({
        description,
        quantity: qtyIdx >= 0 ? parseMoney(cells[qtyIdx]) : null,
        unit_price: unitIdx >= 0 ? parseMoney(cells[unitIdx]) : null,
        amount,
        confidence: 0.72,
        evidence: compact(row).slice(0, 700),
      });
    }
    if (items.length) return items.slice(0, 500);
  }
  return [];
}

// A reference token must contain at least one digit, so "Invoice Date" or
// "Invoice Number" are never captured as the number itself.
const REF = "((?=[A-ZА-ЯЁ0-9_\\/.\\-]*\\d)[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9_\\/.\\-]{0,40})";
const DATE_NUM = "(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})";
const DATE_WORDS = "(\\d{1,2}\\s+[A-Za-zА-Яа-я]{3,9}\\.?,?\\s+\\d{4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4})";

export function extractInvoice(rawText: string): InvoiceData {
  const text = norm(rawText).slice(0, 250_000);
  return {
    supplier_name: detectSupplier(text),
    supplier_bin: firstMatch(text, [/(?:БИН|BIN)\s*[:№#-]?\s*(\d{12})/i, /(?:ИИН|IIN)\s*[:№#-]?\s*(\d{12})/i], 0.97),
    invoice_number: firstMatch(
      text,
      [
        new RegExp(`(?:invoice|inv)\\.?\\s*(?:number|num\\.?|no\\.?|#|№)\\s*[:.\\-]?\\s*${REF}`, "i"),
        new RegExp(`(?:сч[её]т\\s+на\\s+оплату|сч[её]т[\\s-]*фактура|сч[её]т)\\s*(?:№|N|No\\.?|#)\\s*[:.\\-]?\\s*${REF}`, "i"),
        new RegExp(`\\binvoice\\s*[:\\-]?\\s*${REF}`, "i"),
      ],
      0.88,
      trimReference,
    ),
    invoice_date: firstMatch(
      text,
      [
        new RegExp(`(?:invoice\\s+date|date\\s+of\\s+issue|issue\\s+date|дата\\s+выписки|дата)\\s*[:.\\-]?\\s*${DATE_NUM}`, "i"),
        new RegExp(`(?:сч[её]т[^\\n]{0,60}?)\\sот\\s+${DATE_NUM}`, "i"),
        new RegExp(`\\bdate\\s*[:.\\-]?\\s*${DATE_NUM}`, "i"),
        new RegExp(`(?:invoice\\s+date|issue\\s+date|\\bdate)\\s*[:.\\-]?\\s*${DATE_WORDS}`, "i"),
      ],
      0.9,
    ),
    po_number: firstMatch(
      text,
      [
        new RegExp(`\\b(?:purchase\\s+order|P\\.?\\s?O\\.?)(?:\\s*(?:number|no\\.?|#|№))?\\s*[:.\\-]?\\s*${REF}`, "i"),
        new RegExp(`(?:заказ(?:\\s+на\\s+поставку)?)\\s*(?:№|N|#)\\s*${REF}`, "i"),
      ],
      0.8,
      trimReference,
    ),
    currency: detectCurrency(text),
    subtotal: moneyField(text, ["subtotal", "итого без ндс", "без ндс"], 0.84),
    // The rate ("12%") must end with %, otherwise "VAT 12.00" was read as 2.00.
    vat: moneyField(text, ["vat(?:\\s*\\d{1,2}(?:[.,]\\d+)?\\s*%)?", "ндс(?:\\s*\\d{1,2}(?:[.,]\\d+)?\\s*%)?"], 0.88),
    total: moneyField(text, ["grand total", "total due", "amount due", "итого к оплате", "всего к оплате", "итого", "total"], 0.92),
    line_items: parseMarkdownTable(text),
  };
}

const num = (v: EvidenceValue | undefined) => (v && typeof v.value === "number" && Number.isFinite(v.value) ? v.value : null);
const present = (v: EvidenceValue | undefined) => !!v && v.value !== null && v.value !== undefined && String(v.value).trim() !== "";
const reliable = (v: EvidenceValue | undefined) => present(v) && (v as EvidenceValue).confidence >= RELIABLE_CONFIDENCE;
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ValidationContext = {
  /** Matches against earlier invoices in the same workspace. */
  duplicates?: DuplicateMatch[];
  /** How many earlier invoices were compared. null = duplicate check did not run. */
  compared?: number | null;
  /** Fields that prevent a duplicate check (from canCheckDuplicates). */
  duplicateCheckMissing?: string[];
};

export function validateInvoice(data: InvoiceData, ctx: ValidationContext = {}): ValidationResult {
  const checks: ValidationCheck[] = [];
  const needs = new Set<string>();
  const duplicates = ctx.duplicates ?? [];
  const add = (c: ValidationCheck) => {
    checks.push(c);
    if (c.status !== "pass" && c.status !== "na") c.fields.forEach((f) => needs.add(f));
  };

  // 0. Is this an invoice at all?
  const looksLikeInvoice =
    present(data.invoice_number) || present(data.total) || present(data.supplier_bin) || data.line_items.length > 0;
  if (!looksLikeInvoice) {
    add({
      id: "document-type",
      label: "Document type",
      category: "document",
      status: "unverified",
      message: "This doesn't look like a supplier invoice: no invoice number, supplier ID, total or line items were found.",
      fields: ["invoice_number", "total"],
    });
    return finish("not_invoice");
  }

  // 1. Duplicates — the main reason AP teams use Foldline.
  if (duplicates.length) {
    for (const d of duplicates.slice(0, 3)) {
      add({
        id: `duplicate-${d.document_id}`,
        label: d.kind === "exact" ? "Duplicate invoice" : d.kind === "number_reused" ? "Invoice number reused" : "Possible duplicate",
        category: "duplicate",
        status: d.severity,
        message: `Matches ${d.filename}: ${(d.reasons[1] ?? d.reasons[0]).replace(/ —.*$/, "")}.`,
        fields: ["supplier_name", "invoice_number", "invoice_date", "total"],
        document_id: d.document_id,
      });
    }
  } else if (ctx.duplicateCheckMissing?.length) {
    add({
      id: "duplicate-check",
      label: "Duplicate check",
      category: "duplicate",
      status: "unverified",
      message: `Could not run the duplicate check: ${ctx.duplicateCheckMissing.join(" and ")} not readable. Fill it in and save to re-check.`,
      fields: ctx.duplicateCheckMissing.includes("supplier") ? ["supplier_name", "supplier_bin"] : ["invoice_number", "total"],
    });
  } else if (ctx.compared !== undefined && ctx.compared !== null) {
    add({
      id: "duplicate-check",
      label: "Duplicate check",
      category: "duplicate",
      status: "pass",
      message: ctx.compared === 0
        ? "No earlier invoices in this workspace to compare against yet."
        : `No duplicate or near-duplicate among ${ctx.compared} earlier invoice${ctx.compared === 1 ? "" : "s"}.`,
      fields: [],
    });
  }

  // 2. Completeness of core fields. Missing could mean the supplier left it
  //    out OR we failed to read it, so it is "unverified", not an issue.
  const missing: [string, string][] = [];
  if (!present(data.supplier_name) && !present(data.supplier_bin)) missing.push(["supplier_name", "supplier"]);
  if (!present(data.invoice_number)) missing.push(["invoice_number", "invoice number"]);
  if (!present(data.invoice_date)) missing.push(["invoice_date", "invoice date"]);
  if (!present(data.total)) missing.push(["total", "total amount"]);
  add(
    missing.length
      ? {
          id: "required-fields",
          label: "Required fields",
          category: "completeness",
          status: "unverified",
          message: `Missing or unreadable: ${missing.map(([, l]) => l).join(", ")}. Check the original — if the supplier left it out, request a corrected invoice.`,
          fields: missing.map(([f]) => f),
        }
      : { id: "required-fields", label: "Required fields", category: "completeness", status: "pass", message: "Supplier, invoice number, date and total are present.", fields: [] },
  );

  // 3. Supplier ID format (only when one was found; non-KZ suppliers have none).
  if (present(data.supplier_bin)) {
    const bin = String(data.supplier_bin.value).replace(/\s/g, "");
    const ok = /^\d{12}$/.test(bin);
    add({
      id: "bin-format",
      label: "Supplier ID",
      category: "format",
      status: ok ? "pass" : reliable(data.supplier_bin) ? "issue" : "unverified",
      message: ok ? "BIN/IIN has 12 digits." : "BIN/IIN should contain exactly 12 digits.",
      fields: ok ? [] : ["supplier_bin"],
    });
  }

  // 4. Totals. A mismatch only counts as an issue when every value involved
  //    was read reliably — otherwise it's probably our misread, not theirs.
  const total = num(data.total);
  const subtotal = num(data.subtotal);
  const vat = num(data.vat);
  if (total !== null && subtotal !== null && vat !== null) {
    const ok = close(subtotal + vat, total);
    const trusted = reliable(data.total) && reliable(data.subtotal) && reliable(data.vat);
    add({
      id: "totals",
      label: "Totals reconcile",
      category: "consistency",
      status: ok ? "pass" : trusted ? "issue" : "unverified",
      message: ok
        ? "Subtotal + VAT matches total."
        : `Subtotal + VAT (${fmt(subtotal + vat)}) does not match total (${fmt(total)}).${trusted ? "" : " Some of these values were read with low confidence — confirm on the original."}`,
      fields: ok ? [] : ["subtotal", "vat", "total"],
    });
  } else {
    add({ id: "totals", label: "Totals reconcile", category: "consistency", status: "na", message: "Subtotal or VAT not shown on the document — nothing to reconcile.", fields: [] });
  }

  // 5. Line items.
  if (data.line_items.length) {
    const itemsTrusted = data.line_items.every((i) => i.confidence >= RELIABLE_CONFIDENCE);
    const badLines = data.line_items.filter(
      (i) => i.quantity !== null && i.unit_price !== null && i.amount !== null && !close(i.quantity * i.unit_price, i.amount),
    );
    if (badLines.length) {
      add({
        id: "line-math",
        label: "Line math",
        category: "consistency",
        status: itemsTrusted ? "issue" : "unverified",
        message: `${badLines.length} line${badLines.length === 1 ? "" : "s"} where quantity × unit price ≠ amount (first: “${badLines[0].description.slice(0, 60)}”).`,
        fields: ["line_items"],
      });
    }
    const target = subtotal ?? total;
    if (target !== null) {
      const itemSum = data.line_items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
      const ok = close(itemSum, target);
      add({
        id: "line-sum",
        label: "Line items",
        category: "consistency",
        status: ok ? "pass" : itemsTrusted ? "issue" : "unverified",
        message: ok
          ? "Line-item sum is consistent."
          : `Line items sum to ${fmt(itemSum)}, expected about ${fmt(target)}.${itemsTrusted ? "" : " The table may not have been read completely — confirm on the original."}`,
        fields: ok ? [] : ["line_items", subtotal !== null ? "subtotal" : "total"],
      });
    }
  }

  // Highlight low-confidence values for the reviewer (does not change the outcome).
  const highlight: [string, EvidenceValue | undefined][] = [
    ["supplier_name", data.supplier_name], ["supplier_bin", data.supplier_bin], ["invoice_number", data.invoice_number],
    ["invoice_date", data.invoice_date], ["currency", data.currency], ["subtotal", data.subtotal], ["vat", data.vat], ["total", data.total],
  ];
  for (const [name, field] of highlight) if (field && present(field) && field.confidence < HIGHLIGHT_CONFIDENCE) needs.add(name);

  const hasIssue = checks.some((c) => c.status === "issue" || c.status === "possible");
  const hasUnverified = checks.some((c) => c.status === "unverified");
  return finish(hasIssue ? "issue" : hasUnverified ? "review" : "checked");

  function finish(outcome: Outcome): ValidationResult {
    const issues = checks.filter((c) => c.status === "issue").length;
    const possible = checks.filter((c) => c.status === "possible").length;
    const unverified = checks.filter((c) => c.status === "unverified").length;
    return {
      version: 3,
      outcome,
      summary: summarize(outcome, checks),
      risk_score: Math.min(100, issues * 35 + possible * 25 + unverified * 10),
      checks,
      needs_review: [...needs],
      duplicates,
      compared_count: ctx.compared ?? undefined,
    };
  }
}

function summarize(outcome: Outcome, checks: ValidationCheck[]): string {
  if (outcome === "not_invoice") return "Doesn't look like a supplier invoice.";
  if (outcome === "checked") return "All checks passed.";
  const order: CheckStatus[] = outcome === "issue" ? ["issue", "possible"] : ["unverified"];
  const hits = checks.filter((c) => order.includes(c.status));
  const labels = [...new Set(hits.map((c) => c.label))];
  return labels.length <= 2 ? labels.join(" · ") : `${labels.slice(0, 2).join(" · ")} +${labels.length - 2} more`;
}

/** Works for v0.3 results and older v0.1 results stored without an outcome. */
export function outcomeOf(v: ValidationResult | null | undefined): Outcome | null {
  if (!v) return null;
  if (v.outcome) return v.outcome;
  if (v.checks.some((c) => c.status === "fail" || c.status === "issue")) return "issue";
  if (v.checks.some((c) => c.status === "warn" || c.status === "unverified")) return "review";
  return "checked";
}

/** Maps legacy statuses onto the v0.3 vocabulary for display. */
export function displayStatus(s: CheckStatus): "pass" | "issue" | "possible" | "unverified" | "na" {
  if (s === "fail") return "issue";
  if (s === "warn") return "unverified";
  return s;
}
