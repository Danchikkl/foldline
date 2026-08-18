export type EvidenceValue = { value: string | number | null; confidence: number; evidence: string };
export type LineItem = { description: string; quantity: number | null; unit_price: number | null; amount: number | null; confidence: number; evidence: string };
export type InvoiceData = {
  supplier_name: EvidenceValue;
  supplier_bin: EvidenceValue;
  invoice_number: EvidenceValue;
  invoice_date: EvidenceValue;
  currency: EvidenceValue;
  subtotal: EvidenceValue;
  vat: EvidenceValue;
  total: EvidenceValue;
  line_items: LineItem[];
};
export type ValidationCheck = { id: string; label: string; status: "pass" | "warn" | "fail"; message: string; fields: string[] };
export type ValidationResult = { risk_score: number; checks: ValidationCheck[]; needs_review: string[] };

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
    const re = new RegExp(
      `(?:${label})\\s*[:：]?\\s*(?:KZT|₸|USD|\\$|EUR|€|RUB|₽)?\\s*([0-9][0-9\\s.,-]{0,24})`,
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

function detectSupplier(text: string): EvidenceValue {
  const lines = text.split(/\r?\n/).map(compact).filter(Boolean).slice(0, 25);
  const ignored = /^(invoice|сч[её]т|счет-фактура|накладная|date|дата|bin|бин|iin|иин|buyer|покупатель)/i;
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

export function extractInvoice(rawText: string): InvoiceData {
  const text = norm(rawText).slice(0, 250_000);
  return {
    supplier_name: detectSupplier(text),
    supplier_bin: firstMatch(text, [/(?:БИН|BIN)\s*[:№#-]?\s*(\d{12})/i, /(?:ИИН|IIN)\s*[:№#-]?\s*(\d{12})/i], 0.97),
    invoice_number: firstMatch(text, [/(?:invoice|сч[её]т(?:-фактура)?)\s*(?:no\.?|№|#)?\s*[:.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i], 0.88),
    invoice_date: firstMatch(text, [/(?:date|дата)\s*[:.-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i, /(?:date|дата)\s*[:.-]?\s*(\d{4}-\d{2}-\d{2})/i], 0.9),
    currency: detectCurrency(text),
    subtotal: moneyField(text, ["subtotal", "итого без ндс", "без ндс"], 0.84),
    vat: moneyField(text, ["vat(?:\\s*\\d{1,2}%?)?", "ндс(?:\\s*\\d{1,2}%?)?"], 0.88),
    total: moneyField(text, ["grand total", "total due", "итого к оплате", "всего к оплате", "итого", "total"], 0.92),
    line_items: parseMarkdownTable(text),
  };
}

const num = (v: EvidenceValue) => (typeof v.value === "number" ? v.value : null);
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);

export function validateInvoice(data: InvoiceData): ValidationResult {
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

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const lowConfidence = confidenceFields.filter(([, f]) => f.confidence < 0.75).length;
  const risk = Math.min(100, failCount * 28 + warnCount * 10 + lowConfidence * 7);
  return { risk_score: risk, checks, needs_review: [...needs] };
}
