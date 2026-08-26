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
const cleanCell = (s: string) => compact(s.replace(/^#+\s*/, "").replace(/[*_`]/g, ""));

function firstMatch(text: string, patterns: RegExp[], confidence: number): EvidenceValue {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return { value: cleanCell(m[1]), confidence, evidence: compact(m[0]).slice(0, 500) };
  }
  return empty();
}

function splitPipeRow(line: string): string[] {
  if (!line.includes("|")) return [];
  let cells = line.split("|").map(cleanCell);
  if (!cells[0]) cells = cells.slice(1);
  if (!cells.at(-1)) cells = cells.slice(0, -1);
  return cells;
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function findLabeledValue(text: string, labels: RegExp[]): EvidenceValue {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const matchesLabel = (value: string) => labels.some((label) => label.test(cleanCell(value)));

  // Markdown tables can represent metadata as either "label | value" or
  // as a header row followed by a value row. Support both forms.
  for (let i = 0; i < lines.length; i++) {
    const cells = splitPipeRow(lines[i]);
    if (!cells.length || isSeparatorRow(cells)) continue;

    for (let column = 0; column < cells.length; column++) {
      if (!matchesLabel(cells[column])) continue;

      const inline = cells[column + 1];
      if (inline && !matchesLabel(inline) && !/^value$/i.test(inline)) {
        return { value: inline, confidence: 0.96, evidence: compact(lines[i]).slice(0, 500) };
      }

      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const nextCells = splitPipeRow(lines[j]);
        if (!nextCells.length || isSeparatorRow(nextCells)) continue;
        const candidate = nextCells[column];
        if (candidate && !matchesLabel(candidate) && !/^value$/i.test(candidate)) {
          return {
            value: candidate,
            confidence: 0.94,
            evidence: `${compact(lines[i])} ${compact(lines[j])}`.slice(0, 500),
          };
        }
        break;
      }
    }
  }

  // Plain text / Markdown headings: LABEL: value or LABEL on one line and value on the next.
  for (let i = 0; i < lines.length; i++) {
    const line = cleanCell(lines[i]);
    for (const label of labels) {
      const source = label.source.replace(/^\^/, "").replace(/\$$/, "");
      const inline = line.match(new RegExp(`^(?:${source})\\s*[:：-]\\s*(.+)$`, "i"));
      if (inline?.[1]) {
        return { value: cleanCell(inline[1]), confidence: 0.95, evidence: compact(lines[i]).slice(0, 500) };
      }
    }

    if (!matchesLabel(line)) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
      const candidate = cleanCell(lines[j]);
      if (!candidate || /^:?-{3,}:?$/.test(candidate) || matchesLabel(candidate) || candidate.includes("|")) continue;
      return { value: candidate, confidence: 0.93, evidence: `${line} ${candidate}`.slice(0, 500) };
    }
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

function moneyField(text: string, labels: RegExp[], confidence: number): EvidenceValue {
  const labeled = findLabeledValue(text, labels);
  const value = parseMoney(typeof labeled.value === "string" ? labeled.value : undefined);
  if (value !== null) return { value, confidence, evidence: labeled.evidence };
  return empty();
}

function detectCurrency(text: string): EvidenceValue {
  const labeled = findLabeledValue(text, [/^currency$/i, /^валюта$/i]);
  if (typeof labeled.value === "string") {
    const value = labeled.value.toUpperCase();
    if (/\bKZT\b|₸|ТЕНГЕ/i.test(value)) return { value: "KZT", confidence: 0.97, evidence: labeled.evidence };
    if (/\bUSD\b|\$/i.test(value)) return { value: "USD", confidence: 0.97, evidence: labeled.evidence };
    if (/\bEUR\b|€/i.test(value)) return { value: "EUR", confidence: 0.97, evidence: labeled.evidence };
    if (/\bRUB\b|₽|РУБ/i.test(value)) return { value: "RUB", confidence: 0.97, evidence: labeled.evidence };
  }

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
  if (/^(?:metadata|details?|document|field|value)$/i.test(line)) return false;
  if (/^(?:#+\s*)?(?:invoice|сч[её]т|счет-фактура|накладная|supplier|поставщик|date|дата|bin|бин|iin|иин|buyer|покупатель|customer|currency|валюта|description|subtotal|vat|total)\b/i.test(line)) return false;
  if (/synthetic test document|expected foldline outcome/i.test(line)) return false;
  if (/^\|/.test(line)) return false;
  return true;
}

function detectSupplier(text: string): EvidenceValue {
  const labeled = findLabeledValue(text, [/^supplier$/i, /^поставщик$/i]);
  if (typeof labeled.value === "string" && isSupplierCandidate(cleanCell(labeled.value))) {
    return { value: cleanCell(labeled.value), confidence: 0.96, evidence: labeled.evidence };
  }

  const lines = text.split(/\r?\n/).map(cleanCell).filter(Boolean).slice(0, 80);
  for (const line of lines.slice(0, 25)) {
    const candidate = line.replace(/^#+\s*/, "");
    if (isSupplierCandidate(candidate)) {
      return { value: candidate, confidence: 0.58, evidence: line };
    }
  }

  return empty();
}

function parseMarkdownTable(text: string): LineItem[] {
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const header = splitPipeRow(lines[i]).map((cell) => cell.toLowerCase());
    if (header.length < 2) continue;

    const descIdx = header.findIndex((h) => /(description|item|наимен|товар|услуг)/i.test(h));
    const qtyIdx = header.findIndex((h) => /^(qty|quantity|кол-?во|колич)/i.test(h));
    const unitIdx = header.findIndex((h) => /(unit\s*price|price|цена)/i.test(h));
    const amountIdx = header.findIndex((h) => /^(amount|sum|стоим|сумма)/i.test(h));
    if (descIdx < 0 || amountIdx < 0) continue;

    const items: LineItem[] = [];
    let misses = 0;

    for (let j = i + 1; j < lines.length && misses < 3; j++) {
      const cells = splitPipeRow(lines[j]);
      if (!cells.length) {
        if (lines[j].trim()) misses += 1;
        continue;
      }
      if (isSeparatorRow(cells)) continue;
      if (cells.length <= Math.max(descIdx, amountIdx)) {
        misses += 1;
        continue;
      }

      const description = cells[descIdx] || "";
      if (/^(?:subtotal|vat|total|итого|ндс)$/i.test(description)) break;

      const amount = parseMoney(cells[amountIdx]);
      if (!description || amount === null) {
        misses += 1;
        continue;
      }

      items.push({
        description,
        quantity: qtyIdx >= 0 ? parseMoney(cells[qtyIdx]) : null,
        unit_price: unitIdx >= 0 ? parseMoney(cells[unitIdx]) : null,
        amount,
        confidence: 0.86,
        evidence: compact(lines[j]).slice(0, 700),
      });
      misses = 0;
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
      confidence: 0.78,
      evidence: line.slice(0, 700),
    });
  }

  return items.slice(0, 500);
}

function parseLineItems(text: string): LineItem[] {
  const markdownItems = parseMarkdownTable(text);
  const plainItems = parsePlainTextLineItems(text);
  const combined = [...markdownItems];

  for (const item of plainItems) {
    const duplicate = combined.some((existing) =>
      existing.description.toLowerCase() === item.description.toLowerCase()
      && existing.amount === item.amount
      && existing.quantity === item.quantity,
    );
    if (!duplicate) combined.push(item);
  }

  return combined.slice(0, 500);
}

export function extractInvoice(rawText: string): InvoiceData {
  const text = norm(rawText).slice(0, 250_000);

  const supplierBinLabel = findLabeledValue(text, [/^bin\s*\/\s*iin$/i, /^bin$/i, /^iin$/i, /^бин\s*\/\s*иин$/i, /^бин$/i, /^иин$/i]);
  const supplierBinValue = typeof supplierBinLabel.value === "string"
    ? supplierBinLabel.value.match(/\b(\d{12})\b/)?.[1]
    : undefined;

  const invoiceNumberLabel = findLabeledValue(text, [
    /^invoice\s*(?:number|no\.?|#|№)$/i,
    /^сч[её]т\s*(?:номер|no\.?|#|№)$/i,
  ]);

  const invoiceDateLabel = findLabeledValue(text, [/^date$/i, /^дата$/i]);

  return {
    supplier_name: detectSupplier(text),
    supplier_bin: supplierBinValue
      ? { value: supplierBinValue, confidence: 0.98, evidence: supplierBinLabel.evidence }
      : firstMatch(text, [/(?:БИН|BIN)(?:\s*\/\s*(?:ИИН|IIN))?\s*[:№#-]?\s*(\d{12})/i, /(?:ИИН|IIN)\s*[:№#-]?\s*(\d{12})/i], 0.97),
    invoice_number: typeof invoiceNumberLabel.value === "string"
      ? { value: cleanCell(invoiceNumberLabel.value), confidence: 0.96, evidence: invoiceNumberLabel.evidence }
      : firstMatch(text, [
          /(?:сч[её]т)\s*(?:номер|no\.?|№|#)\s*[:.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i,
          /(?:invoice)\s*(?:number|no\.?|№|#)\s*[:.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i,
        ], 0.9),
    po_number: firstMatch(text, [
      /(?:purchase\s+order|p\.?\s*o\.?|po)\s*(?:number|no\.?|№|#)\s*[:.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i,
      /(?:purchase\s+order|p\.?\s*o\.?|po)\s*[:.-]\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})/i,
    ], 0.9),
    invoice_date: typeof invoiceDateLabel.value === "string" && /\d/.test(invoiceDateLabel.value)
      ? { value: cleanCell(invoiceDateLabel.value), confidence: 0.95, evidence: invoiceDateLabel.evidence }
      : firstMatch(text, [/(?:date|дата)\s*[:.-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i, /(?:date|дата)\s*[:.-]?\s*(\d{4}-\d{2}-\d{2})/i], 0.9),
    currency: detectCurrency(text),
    subtotal: moneyField(text, [/^subtotal$/i, /^итого без ндс$/i, /^без ндс$/i], 0.9),
    vat: moneyField(text, [/^vat(?:\s*\d{1,2}%?)?$/i, /^ндс(?:\s*\d{1,2}%?)?$/i], 0.92),
    total: moneyField(text, [/^grand total$/i, /^total due$/i, /^итого к оплате$/i, /^всего к оплате$/i, /^итого$/i, /^total$/i], 0.95),
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
