export type EvidenceValue = { value: string | number | null; confidence: number; evidence: string };
export type LineItem = { description: string; quantity: number | null; unit_price: number | null; amount: number | null; confidence: number; evidence: string };
export type InvoiceData = {
  supplier_name: EvidenceValue;
  supplier_bin: EvidenceValue;
  invoice_number: EvidenceValue;
  po_number: EvidenceValue;
  invoice_date: EvidenceValue;
  currency: EvidenceValue;
  subtotal: EvidenceValue;
  vat: EvidenceValue;
  total: EvidenceValue;
  line_items: LineItem[];
};
export type ValidationCheck = { id: string; label: string; status: "pass" | "warn" | "fail"; message: string; fields: string[] };
export type ValidationResult = { risk_score: number; checks: ValidationCheck[]; needs_review: string[] };
export type InvoiceValidationContext = {
  duplicateInvoice?: {
    documentId: string;
    filename: string;
    invoiceNumber: string;
  } | null;
};

const empty = (): EvidenceValue => ({ value: null, confidence: 0, evidence: "" });
const compact = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => s.replace(/\u00a0/g, " ");

function firstMatch(text: string, patterns: RegExp[], confidence: number): EvidenceValue {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return { value: compact(m[1]), confidence, evidence: compact(m[0]).slice(0, 500) };
  }
  return empty();
}

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;

  let cleaned = raw
    .replace(/[\u00a0\s'’]/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/(?!^)-/g, "");

  if (!cleaned || cleaned === "-" || !/\d/.test(cleaned)) return null;

  const sign = cleaned.startsWith("-") ? -1 : 1;
  cleaned = cleaned.replace(/^-/, "");

  const commas = (cleaned.match(/,/g) || []).length;
  const dots = (cleaned.match(/\./g) || []).length;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized = cleaned;

  if (commas && dots) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const decimalIndex = Math.max(lastComma, lastDot);
    const fractionDigits = cleaned.length - decimalIndex - 1;

    if (fractionDigits === 1 || fractionDigits === 2) {
      if (decimalSeparator === ",") normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
      else normalized = cleaned.replace(/,/g, "");
    } else {
      normalized = cleaned.replace(/[.,]/g, "");
    }
  } else if (commas) {
    const parts = cleaned.split(",");
    const last = parts.at(-1) || "";
    const looksLikeThousands = last.length === 3 && parts.slice(1).every((part) => part.length === 3);
    normalized = looksLikeThousands ? parts.join("") : (last.length === 1 || last.length === 2 ? `${parts.slice(0, -1).join("")}.${last}` : parts.join(""));
  } else if (dots) {
    const parts = cleaned.split(".");
    const last = parts.at(-1) || "";
    const looksLikeThousands = last.length === 3 && parts.slice(1).every((part) => part.length === 3);
    normalized = looksLikeThousands ? parts.join("") : (last.length === 1 || last.length === 2 ? `${parts.slice(0, -1).join("")}.${last}` : parts.join(""));
  }

  const value = Number(normalized) * sign;
  return Number.isFinite(value) ? value : null;
}

function moneyField(text: string, labels: string[], confidence: number): EvidenceValue {
  for (const label of labels) {
    const re = new RegExp(
      `(?:${label})\\s*[:：]?\\s*(?:KZT|₸|USD|\\$|EUR|€|RUB|₽)?\\s*([0-9][0-9\\s.,'’-]{0,24})`,
      "i",
    );
    const m = text.match(re);
    const value = parseMoney(m?.[1]);
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

function isSupplierCandidate(line: string) {
  if (line.length < 2 || line.length > 120) return false;
  if (!/[A-Za-zА-Яа-яЁё]/.test(line)) return false;
  if (/\.(?:pdf|png|jpe?g|webp)$/i.test(line)) return false;
  if (/^(?:#+\s*)?(?:invoice|сч[её]т|счет-фактура|накладная|supplier|поставщик|date|дата|bin|бин|iin|иин|buyer|покупатель|currency|валюта|description|subtotal|vat|total)\b/i.test(line)) return false;
  if (/synthetic test document|expected foldline outcome/i.test(line)) return false;
  if (/^\|/.test(line)) return false;
  return true;
}

function detectSupplier(text: string): EvidenceValue {
  const lines = text.split(/\r?\n/).map(compact).filter(Boolean).slice(0, 80);

  for (let i = 0; i < lines.length; i++) {
    if (!/(?:^|\b)(?:supplier|поставщик)(?:\b|$)/i.test(lines[i])) continue;

    const inline = lines[i].match(/(?:supplier|поставщик)(?:\s*\/\s*(?:supplier|поставщик))?\s*[:：-]\s*(.+)$/i)?.[1];
    if (inline && isSupplierCandidate(compact(inline))) {
      return { value: compact(inline), confidence: 0.95, evidence: lines[i] };
    }

    for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
      const candidate = lines[j].replace(/^#+\s*/, "");
      if (isSupplierCandidate(candidate)) {
        return { value: candidate, confidence: 0.92, evidence: `${lines[i]} ${candidate}` };
      }
    }
  }

  for (const line of lines.slice(0, 25)) {
    const candidate = line.replace(/^#+\s*/, "");
    if (isSupplierCandidate(candidate)) {
      return { value: candidate, confidence: 0.58, evidence: line };
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
        confidence: 0.82,
        evidence: compact(row).slice(0, 700),
      });
    }
    if (items.length) return items.slice(0, 500);
  }
  return [];
}

function parsePlainTextLineItems(text: string): LineItem[] {
  const lines = text.split(/\r?\n/).map(compact).filter(Boolean);
  const items: LineItem[] = [];
  const numeric = "-?[0-9][0-9\\s.,'’]*";
  const rowPattern = new RegExp(`^(.+?)\\s+(${numeric})\\s+(${numeric})\\s+(${numeric})(?:\\s+(?:KZT|USD|EUR|RUB|₸|\\$|€|₽))?$`, "i");

  for (const line of lines) {
    if (/^(?:description|item|наимен|товар|subtotal|vat|total|итого|ндс)\b/i.test(line)) continue;
    const match = line.match(rowPattern);
    if (!match) continue;

    const description = compact(match[1]);
    const quantity = parseMoney(match[2]);
    const unitPrice = parseMoney(match[3]);
    const amount = parseMoney(match[4]);

    if (!description || quantity === null || unitPrice === null || amount === null) continue;
    if (!/[A-Za-zА-Яа-яЁё]/.test(description)) continue;

    items.push({
      description,
      quantity,
      unit_price: unitPrice,
      amount,
      confidence: 0.76,
      evidence: line.slice(0, 700),
    });
  }

  return items.slice(0, 500);
}

function parseLineItems(text: string): LineItem[] {
  const markdownItems = parseMarkdownTable(text);
  if (markdownItems.length) return markdownItems;
  return parsePlainTextLineItems(text);
}

export function extractInvoice(rawText: string): InvoiceData {
  const text = norm(rawText).slice(0, 250_000);
  return {
    supplier_name: detectSupplier(text),
    supplier_bin: firstMatch(text, [/(?:БИН|BIN)\s*[:№#-]?\s*(\d{12})/i, /(?:ИИН|IIN)\s*[:№#-]?\s*(\d{12})/i], 0.97),
    invoice_number: firstMatch(text, [/(?:сч[её]т)\s*(?:no\.?|№|#)\s*[:.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i, /(?:invoice)\s*(?:no\.?|№|#)\s*[:.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i], 0.9),
    po_number: firstMatch(text, [
      /(?:purchase\s+order|p\.?\s*o\.?|po)\s*(?:number|no\.?|№|#)\s*[:.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i,
      /(?:purchase\s+order|p\.?\s*o\.?|po)\s*[:.-]\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i,
    ], 0.9),
    invoice_date: firstMatch(text, [/(?:date|дата)\s*[:.-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i, /(?:date|дата)\s*[:.-]?\s*(\d{4}-\d{2}-\d{2})/i], 0.9),
    currency: detectCurrency(text),
    subtotal: moneyField(text, ["subtotal", "итого без ндс", "без ндс"], 0.84),
    vat: moneyField(text, ["vat(?:\\s*\\d{1,2}%?)?", "ндс(?:\\s*\\d{1,2}%?)?"], 0.88),
    total: moneyField(text, ["grand total", "total due", "итого к оплате", "всего к оплате", "итого", "total"], 0.92),
    line_items: parseLineItems(text),
  };
}

const num = (v: EvidenceValue) => (typeof v.value === "number" ? v.value : null);
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);

export function validateInvoice(data: InvoiceData, context: InvoiceValidationContext = {}): ValidationResult {
  const checks: ValidationCheck[] = [];
  const needs = new Set<string>();
  const add = (c: ValidationCheck) => {
    checks.push(c);
    if (c.status !== "pass") c.fields.forEach((f) => needs.add(f));
  };

  const bin = String(data.supplier_bin.value ?? "");
  add(
    bin
      ? {
          id: "bin-format",
          label: "Supplier ID",
          status: /^\d{12}$/.test(bin) ? "pass" : "fail",
          message: /^\d{12}$/.test(bin) ? "BIN/IIN has 12 digits." : "BIN/IIN should contain exactly 12 digits.",
          fields: ["supplier_bin"],
        }
      : { id: "bin-missing", label: "Supplier ID", status: "warn", message: "Supplier BIN/IIN was not detected.", fields: ["supplier_bin"] },
  );

  add(
    data.invoice_number.value
      ? { id: "invoice-number", label: "Invoice number", status: "pass", message: "Invoice number detected.", fields: [] }
      : { id: "invoice-number", label: "Invoice number", status: "warn", message: "Invoice number needs review.", fields: ["invoice_number"] },
  );

  add(
    data.po_number.value
      ? { id: "po-number", label: "PO reference", status: "pass", message: "PO number detected.", fields: [] }
      : { id: "po-number", label: "PO reference", status: "warn", message: "PO number was not detected. Confirm whether this invoice requires a PO reference.", fields: ["po_number"] },
  );

  if (context.duplicateInvoice !== undefined && data.invoice_number.value) {
    add(
      context.duplicateInvoice
        ? {
            id: "duplicate-invoice-number",
            label: "Duplicate invoice number",
            status: "fail",
            message: `Invoice #${String(data.invoice_number.value)} already appears in ${context.duplicateInvoice.filename}.`,
            fields: ["invoice_number"],
          }
        : {
            id: "duplicate-invoice-number",
            label: "Duplicate invoice number",
            status: "pass",
            message: "No matching invoice number was found in this workspace.",
            fields: [],
          },
    );
  }

  const total = num(data.total);
  const subtotal = num(data.subtotal);
  const vat = num(data.vat);
  if (total !== null && subtotal !== null && vat !== null) {
    const ok = close(subtotal + vat, total);
    add({
      id: "totals",
      label: "Totals reconcile",
      status: ok ? "pass" : "fail",
      message: ok ? "Subtotal + VAT matches total." : `Subtotal + VAT (${(subtotal + vat).toFixed(2)}) does not match total (${total.toFixed(2)}).`,
      fields: ok ? [] : ["subtotal", "vat", "total"],
    });
  } else {
    add({ id: "totals", label: "Totals reconcile", status: "warn", message: "Not enough values to verify subtotal + VAT = total.", fields: ["subtotal", "vat", "total"] });
  }

  if (data.line_items.length && total !== null) {
    const itemSum = data.line_items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const target = subtotal ?? total;
    const ok = close(itemSum, target);
    add({
      id: "line-sum",
      label: "Line items",
      status: ok ? "pass" : "fail",
      message: ok ? "Line-item sum is consistent." : `Line items sum to ${itemSum.toFixed(2)}, expected about ${target.toFixed(2)}.`,
      fields: ok ? [] : ["line_items", subtotal !== null ? "subtotal" : "total"],
    });
  } else {
    add({ id: "line-sum", label: "Line items", status: "warn", message: "Line items could not be fully reconciled.", fields: ["line_items"] });
  }

  const confidenceFields: [string, EvidenceValue][] = [
    ["supplier_name", data.supplier_name],
    ["supplier_bin", data.supplier_bin],
    ["invoice_number", data.invoice_number],
    ["invoice_date", data.invoice_date],
    ["currency", data.currency],
    ["subtotal", data.subtotal],
    ["vat", data.vat],
    ["total", data.total],
  ];
  for (const [name, field] of confidenceFields) if (field.confidence < 0.75) needs.add(name);
  if (data.po_number.value && data.po_number.confidence < 0.75) needs.add("po_number");

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const lowConfidence = confidenceFields.filter(([, f]) => f.confidence < 0.75).length;
  const risk = Math.min(100, failCount * 28 + warnCount * 10 + lowConfidence * 7);
  return { risk_score: risk, checks, needs_review: [...needs] };
}
