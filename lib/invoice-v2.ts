import {
  extractInvoice as extractInvoiceLegacy,
  type EvidenceValue,
  type InvoiceData,
  type LineItem,
} from "@/lib/invoice";

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const moneyToken = String.raw`(?:\d{1,3}(?:[\s,'’.]\d{3})+|\d+(?:[.,]\d{1,2})?)`;

function evidence(value: string | number | null, confidence: number, source = ""): EvidenceValue {
  return { value, confidence, evidence: compact(source).slice(0, 500) };
}

/**
 * Cloudflare's document-to-Markdown conversion can occasionally flatten adjacent
 * PDF cells without a delimiter (for example
 * `INVOICE NUMBERKZ-2026-0813DATE13.08.2026`).  The extraction layer should not
 * treat that layout artifact as document content.  Restore boundaries around the
 * small set of invoice labels before semantic parsing.
 */
function repairCollapsedLabels(rawText: string) {
  let text = rawText.normalize("NFKC").replace(/\u00a0/g, " ");

  const surround = (pattern: string) => {
    text = text.replace(new RegExp(`(${pattern})`, "gi"), " $1 ");
  };

  // Long/specific labels first. These tokens are distinctive enough that they
  // can be restored even when glued directly to the previous cell value.
  [
    String.raw`INVOICE\s*(?:NUMBER|NO\.?|#|№)`,
    String.raw`СЧ[ЕЁ]Т\s*(?:НОМЕР|NO\.?|#|№)`,
    String.raw`BIN\s*\/\s*IIN`,
    String.raw`БИН\s*\/\s*ИИН`,
    String.raw`PURCHASE\s+ORDER(?:\s*(?:NUMBER|NO\.?|#|№))?`,
    String.raw`P\.?\s*O\.?(?:\s*(?:NUMBER|NO\.?|#|№))?`,
    String.raw`UNIT\s*PRICE`,
    String.raw`GRAND\s+TOTAL`,
    String.raw`TOTAL\s+DUE`,
    String.raw`ИТОГО\s+К\s+ОПЛАТЕ`,
    String.raw`ВСЕГО\s+К\s+ОПЛАТЕ`,
    String.raw`ИТОГО\s+БЕЗ\s+НДС`,
    "SUPPLIER",
    "ПОСТАВЩИК",
    "CUSTOMER",
    "BUYER",
    "ПОКУПАТЕЛЬ",
    "CURRENCY",
    "ВАЛЮТА",
    "DESCRIPTION",
    "QUANTITY",
    "QTY",
    "AMOUNT",
    "SUBTOTAL",
    "VAT",
    "НДС",
  ].forEach(surround);

  // DATE is a common substring in prose (for example "update"), so only split
  // it when it is immediately followed by a date-looking numeric value.
  text = text.replace(/(DATE)(?=\s*\d{1,4}[./-])/gi, " $1 ");
  text = text.replace(/(ДАТА)(?=\s*\d{1,4}[./-])/gi, " $1 ");

  // Avoid splitting the TOTAL substring inside SUBTOTAL.
  text = text.replace(/(?<!SUB)(TOTAL)(?=\s*[:：]?\s*(?:KZT|USD|EUR|RUB|₸|\$|€|₽|\d))/gi, " $1 ");
  text = text.replace(/(ИТОГО)(?=\s*[:：]?\s*(?:KZT|USD|EUR|RUB|₸|\$|€|₽|\d))/gi, " $1 ");

  return text;
}

function semanticText(rawText: string) {
  const repaired = repairCollapsedLabels(rawText);
  const normalized = repaired
    .replace(/[|]/g, " ")
    .replace(/[#*_`]+/g, " ");
  const flat = compact(normalized);
  const start = flat.search(/\b(?:INVOICE|СЧ[ЕЁ]Т)\b/i);
  return start >= 0 ? flat.slice(start) : flat;
}

function captureBetween(text: string, label: RegExp, next: RegExp, confidence = 0.96): EvidenceValue {
  const source = label.source;
  const end = next.source;
  const match = text.match(new RegExp(`(?:${source})\\s*[:：-]?\\s*(.+?)(?=\\s*(?:${end})|$)`, "i"));
  const value = compact(match?.[1] || "");
  if (!value) return evidence(null, 0);
  return evidence(value, confidence, match?.[0] || value);
}

function capturePattern(text: string, pattern: RegExp, confidence: number): EvidenceValue {
  const match = text.match(pattern);
  if (!match?.[1]) return evidence(null, 0);
  return evidence(compact(match[1]), confidence, match[0]);
}

function parseMoney(raw: string): number | null {
  let cleaned = raw.replace(/[\u00a0\s'’]/g, "").replace(/[^0-9,.-]/g, "");
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
    if (fraction === 1 || fraction === 2) {
      normalized = decimal === "," ? cleaned.replace(/\./g, "").replace(/,/g, ".") : cleaned.replace(/,/g, "");
    } else {
      normalized = cleaned.replace(/[.,]/g, "");
    }
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

function captureMoney(text: string, label: string, confidence: number): EvidenceValue {
  const match = text.match(new RegExp(`(?:^|\\s)(?:${label})\\s*[:：]?\\s*(?:KZT|USD|EUR|RUB|₸|\\$|€|₽)?\\s*(${moneyToken})`, "i"));
  if (!match?.[1]) return evidence(null, 0);
  const value = parseMoney(match[1]);
  return value === null ? evidence(null, 0) : evidence(value, confidence, match[0]);
}

function parseCurrency(text: string): EvidenceValue {
  const labeled = text.match(/\b(?:CURRENCY|ВАЛЮТА)\b\s*[:：-]?\s*(KZT|USD|EUR|RUB|₸|\$|€|₽)/i);
  if (labeled?.[1]) {
    const token = labeled[1].toUpperCase();
    const value = token === "₸" ? "KZT" : token === "$" ? "USD" : token === "€" ? "EUR" : token === "₽" ? "RUB" : token;
    return evidence(value, 0.98, labeled[0]);
  }
  const fallback = text.match(/\b(KZT|USD|EUR|RUB)\b/i);
  return fallback?.[1] ? evidence(fallback[1].toUpperCase(), 0.9, fallback[0]) : evidence(null, 0);
}

function close(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
}

function makeLineItem(description: string, rawQuantity: string, rawUnitPrice: string, rawAmount: string, source: string, confidence: number): LineItem | null {
  const quantity = parseMoney(rawQuantity);
  const unitPrice = parseMoney(rawUnitPrice);
  const amount = parseMoney(rawAmount);
  const cleanDescription = compact(description);
  if (!cleanDescription || quantity === null || unitPrice === null || amount === null) return null;
  if (quantity <= 0 || unitPrice < 0 || amount < 0) return null;
  if (!close(quantity * unitPrice, amount)) return null;
  return {
    description: cleanDescription,
    quantity,
    unit_price: unitPrice,
    amount,
    confidence,
    evidence: compact(source).slice(0, 700),
  };
}

function parseFlattenedLineItems(text: string): LineItem[] {
  const header = /\bDESCRIPTION\b\s*\b(?:QTY|QUANTITY)\b\s*\bUNIT\s*PRICE\b\s*\bAMOUNT\b/i;
  const match = header.exec(text);
  if (!match) return [];

  const afterHeader = text.slice(match.index + match[0].length);
  const end = afterHeader.search(/\b(?:SUBTOTAL|ИТОГО\s+БЕЗ\s+НДС|VAT|НДС|TOTAL)\b/i);
  const section = compact(end >= 0 ? afterHeader.slice(0, end) : afterHeader.slice(0, 5000));
  if (!section) return [];

  const items: LineItem[] = [];
  const signatures = new Set<string>();
  const add = (item: LineItem | null) => {
    if (!item) return;
    const signature = `${item.description.toUpperCase()}|${item.quantity}|${item.unit_price}|${item.amount}`;
    if (!signatures.has(signature)) {
      signatures.add(signature);
      items.push(item);
    }
  };

  // Normal text / Markdown output with whitespace between table cells.
  const spacedRow = new RegExp(
    `([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9/&(),.+\\- ]{1,120}?)\\s+(${moneyToken})\\s+(${moneyToken})\\s+(${moneyToken})(?=\\s+[A-Za-zА-Яа-яЁё]|$)`,
    "g",
  );
  for (const candidate of section.matchAll(spacedRow)) {
    add(makeLineItem(candidate[1], candidate[2], candidate[3], candidate[4], candidate[0], 0.93));
  }

  // PDF converters sometimes remove every separator between numeric cells:
  // `Laboratory notebooks103,50035,000`.  This fallback only accepts a split
  // when quantity × unit price = amount, so it cannot manufacture arbitrary rows.
  const groupedMoney = String.raw`\d{1,3}(?:[,'’.]\d{3})+(?:[.,]\d{1,2})?`;
  const collapsedRow = new RegExp(
    `([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё/&(),.+\\- ]{1,120}?)(\\d{1,6})(${groupedMoney})(${groupedMoney})(?=[A-Za-zА-Яа-яЁё]|$)`,
    "g",
  );
  for (const candidate of section.matchAll(collapsedRow)) {
    add(makeLineItem(candidate[1], candidate[2], candidate[3], candidate[4], candidate[0], 0.9));
  }

  return items.slice(0, 500);
}

function good(value: EvidenceValue) {
  return value.value !== null && value.value !== "";
}

export function extractInvoice(rawText: string): InvoiceData {
  const legacy = extractInvoiceLegacy(rawText);
  const text = semanticText(rawText).slice(0, 250_000);

  const supplier = captureBetween(
    text,
    /\b(?:SUPPLIER|ПОСТАВЩИК)\b/i,
    /\b(?:BIN\s*\/\s*IIN|BIN|IIN|БИН\s*\/\s*ИИН|БИН|ИИН|INVOICE\s*(?:NUMBER|NO\.?|#|№)|СЧ[ЕЁ]Т\s*(?:НОМЕР|NO\.?|#|№)|DATE|ДАТА|CUSTOMER|BUYER|ПОКУПАТЕЛЬ|CURRENCY|ВАЛЮТА|DESCRIPTION)\b/i,
  );
  const supplierClean = typeof supplier.value === "string" && !/PDFFormatVersion|metadata/i.test(supplier.value) ? supplier : evidence(null, 0);

  const supplierBin = capturePattern(text, /\b(?:BIN\s*\/\s*IIN|BIN|IIN|БИН\s*\/\s*ИИН|БИН|ИИН)\b\s*[:：-]?\s*(\d{12})/i, 0.99);
  const invoiceNumber = capturePattern(text, /\b(?:INVOICE\s*(?:NUMBER|NO\.?|#|№)|СЧ[ЕЁ]Т\s*(?:НОМЕР|NO\.?|#|№))\b\s*[:：-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})(?=\s|$)/i, 0.98);
  const invoiceDate = capturePattern(text, /\b(?:DATE|ДАТА)\b\s*[:：-]?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/i, 0.97);
  const poNumber = capturePattern(text, /\b(?:PURCHASE\s+ORDER|P\.?\s*O\.?|PO)(?:\s*(?:NUMBER|NO\.?|#|№))?\b\s*[:：-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})(?=\s|$)/i, 0.95);

  const subtotal = captureMoney(text, "SUBTOTAL|ИТОГО\\s+БЕЗ\\s+НДС|БЕЗ\\s+НДС", 0.97);
  const vat = captureMoney(text, "VAT(?:\\s*\\d{1,2}\\s*%)?|НДС(?:\\s*\\d{1,2}\\s*%)?", 0.97);
  const total = captureMoney(text, "GRAND\\s+TOTAL|TOTAL\\s+DUE|ИТОГО\\s+К\\s+ОПЛАТЕ|ВСЕГО\\s+К\\s+ОПЛАТЕ|ИТОГО|TOTAL", 0.98);
  const currency = parseCurrency(text);
  const flattenedItems = parseFlattenedLineItems(text);

  return {
    supplier_name: good(supplierClean) ? supplierClean : legacy.supplier_name,
    supplier_bin: good(supplierBin) ? supplierBin : legacy.supplier_bin,
    invoice_number: good(invoiceNumber) ? invoiceNumber : legacy.invoice_number,
    po_number: good(poNumber) ? poNumber : legacy.po_number,
    invoice_date: good(invoiceDate) ? invoiceDate : legacy.invoice_date,
    currency: good(currency) ? currency : legacy.currency,
    subtotal: good(subtotal) ? subtotal : legacy.subtotal,
    vat: good(vat) ? vat : legacy.vat,
    total: good(total) ? total : legacy.total,
    line_items: flattenedItems.length >= legacy.line_items.length ? flattenedItems : legacy.line_items,
  };
}
