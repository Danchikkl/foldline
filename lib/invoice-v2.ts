import {
  extractInvoice as extractInvoiceLegacy,
  type EvidenceValue,
  type InvoiceData,
  type LineItem,
} from "@/lib/invoice";

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const moneyToken = String.raw`(?:\d{1,3}(?:[\s,'’.]\d{3})+|\d+(?:[.,]\d{1,2})?)`;
const currencyToken = String.raw`(?:KZT|USD|EUR|RUB|₸|\$|€|₽)`;

function evidence(value: string | number | null, confidence: number, source = ""): EvidenceValue {
  return { value, confidence, evidence: compact(source).slice(0, 500) };
}

function repairCollapsedLabels(rawText: string) {
  let text = rawText.normalize("NFKC").replace(/\u00a0/g, " ");

  const surround = (pattern: string) => {
    text = text.replace(new RegExp(`(${pattern})`, "gi"), " $1 ");
  };

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
    "ОПИСАНИЕ",
    "QUANTITY",
    "QTY",
    String.raw`КОЛ-?ВО`,
    "КОЛИЧЕСТВО",
    "AMOUNT",
    "СУММА",
    "ЦЕНА",
    "SUBTOTAL",
    "VAT",
    "НДС",
  ].forEach(surround);

  text = text.replace(/(DATE)(?=\s*\d{1,4}[./-])/gi, " $1 ");
  text = text.replace(/(ДАТА)(?=\s*\d{1,4}[./-])/gi, " $1 ");
  text = text.replace(/(^|[^A-Z])(TOTAL)(?=\s*[:：]?\s*(?:KZT|USD|EUR|RUB|₸|\$|€|₽|\d))/gi, "$1 $2 ");
  text = text.replace(/(ИТОГО)(?=\s*[:：]?\s*(?:KZT|USD|EUR|RUB|₸|\$|€|₽|\d))/gi, " $1 ");

  return text;
}

function semanticText(rawText: string) {
  const repaired = repairCollapsedLabels(rawText);
  const normalized = repaired
    .replace(/[|]/g, " ")
    .replace(/[#*_`]+/g, " ");
  const flat = compact(normalized);
  const start = flat.search(/(?:^|\s)(?:INVOICE|СЧ[ЕЁ]Т)(?:\s|\/|$)/i);
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
  const match = text.match(new RegExp(`(?:^|\\s)(?:${label})\\s*[:：]?\\s*(?:${currencyToken})?\\s*(${moneyToken})`, "i"));
  if (!match?.[1]) return evidence(null, 0);
  const value = parseMoney(match[1]);
  return value === null ? evidence(null, 0) : evidence(value, confidence, match[0]);
}

function parseCurrency(text: string): EvidenceValue {
  const labeled = text.match(/(?:CURRENCY|ВАЛЮТА)(?:\s*\/\s*(?:CURRENCY|ВАЛЮТА))?\s*[:：-]?\s*(KZT|USD|EUR|RUB|₸|\$|€|₽)/i);
  if (labeled?.[1]) {
    const token = labeled[1].toUpperCase();
    const value = token === "₸" ? "KZT" : token === "$" ? "USD" : token === "€" ? "EUR" : token === "₽" ? "RUB" : token;
    return evidence(value, 0.98, labeled[0]);
  }
  const fallback = text.match(/(?:^|\s)(KZT|USD|EUR|RUB)(?:\s|$)/i);
  return fallback?.[1] ? evidence(fallback[1].toUpperCase(), 0.9, fallback[0]) : evidence(null, 0);
}

function close(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
}

function makeLineItem(
  description: string,
  rawQuantity: string,
  rawUnitPrice: string,
  rawAmount: string,
  source: string,
  confidence: number,
  requireArithmetic = false,
): LineItem | null {
  const quantity = parseMoney(rawQuantity);
  const unitPrice = parseMoney(rawUnitPrice);
  const amount = parseMoney(rawAmount);
  const cleanDescription = compact(description);
  if (!cleanDescription || quantity === null || unitPrice === null || amount === null) return null;
  if (quantity <= 0 || unitPrice < 0 || amount < 0) return null;
  const arithmeticOk = close(quantity * unitPrice, amount);
  if (requireArithmetic && !arithmeticOk) return null;

  return {
    description: cleanDescription,
    quantity,
    unit_price: unitPrice,
    amount,
    confidence: arithmeticOk ? confidence : Math.min(confidence, 0.88),
    evidence: compact(source).slice(0, 700),
  };
}

function parseFlattenedLineItems(text: string): LineItem[] {
  const descriptionMatch = /(?:DESCRIPTION|ОПИСАНИЕ)/i.exec(text);
  if (!descriptionMatch) return [];

  const headerWindow = text.slice(descriptionMatch.index, descriptionMatch.index + 500);
  const headerPatterns = [
    /(?:DESCRIPTION|ОПИСАНИЕ)/i,
    /(?:QTY|QUANTITY|КОЛ-?ВО|КОЛИЧЕСТВО)/i,
    /(?:UNIT\s*PRICE|ЦЕНА)/i,
    /(?:AMOUNT|СУММА)/i,
  ];
  const headerMatches = headerPatterns
    .map((pattern) => pattern.exec(headerWindow))
    .filter((match): match is RegExpExecArray => Boolean(match));
  if (headerMatches.length < 3) return [];

  // PDF text extraction may reorder header cells even though row values remain in
  // visual column order. Start rows after the furthest detected header label,
  // rather than assuming Description -> Qty -> Unit price -> Amount text order.
  const headerEnd = Math.max(...headerMatches.map((match) => match.index + match[0].length));
  const afterHeader = text.slice(descriptionMatch.index + headerEnd);
  const end = afterHeader.search(/(?:SUBTOTAL|ИТОГО\s+БЕЗ\s+НДС|ПРОМЕЖУТОЧНЫЙ\s+ИТОГ|VAT|НДС|TOTAL)/i);
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

  const descChars = String.raw`A-Za-zА-Яа-яЁё0-9/&(),.+%µμ°²³:_\- `;
  const currencySuffix = String.raw`(?:\s*${currencyToken})?`;

  const spacedRow = new RegExp(
    `([${descChars}]{2,180}?)\\s+(${moneyToken})${currencySuffix}\\s+(${moneyToken})${currencySuffix}\\s+(${moneyToken})${currencySuffix}(?=\\s+[A-Za-zА-Яа-яЁё]|$)`,
    "g",
  );
  for (const candidate of section.matchAll(spacedRow)) {
    const description = compact(candidate[1]);
    if (!/[A-Za-zА-Яа-яЁё]/.test(description)) continue;
    add(makeLineItem(description, candidate[2], candidate[3], candidate[4], candidate[0], 0.93));
  }

  const groupedMoney = String.raw`\d{1,3}(?:[,'’.]\d{3})+(?:[.,]\d{1,2})?`;
  const collapsedRow = new RegExp(
    `([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё/&(),.+%µμ°²³:_\\- ]{1,160}?)(\\d{1,6})(${groupedMoney})(${groupedMoney})(?=[A-Za-zА-Яа-яЁё]|$)`,
    "g",
  );
  for (const candidate of section.matchAll(collapsedRow)) {
    add(makeLineItem(candidate[1], candidate[2], candidate[3], candidate[4], candidate[0], 0.9, true));
  }

  return items.slice(0, 500);
}

function good(value: EvidenceValue) {
  return value.value !== null && value.value !== "";
}

export function extractInvoice(rawText: string): InvoiceData {
  const legacy = extractInvoiceLegacy(rawText);
  const text = semanticText(rawText).slice(0, 250_000);

  const supplierLabel = /(?:SUPPLIER|ПОСТАВЩИК)(?:\s*\/\s*(?:SUPPLIER|ПОСТАВЩИК))?/i;
  const supplierIdLabel = /(?:BIN(?:\s*\/\s*IIN)?|IIN|БИН(?:\s*\/\s*ИИН)?|ИИН)(?:\s*\/\s*(?:BIN(?:\s*\/\s*IIN)?|IIN|БИН(?:\s*\/\s*ИИН)?|ИИН))?/i;
  const invoiceNumberLabel = /(?:INVOICE\s*(?:NUMBER|NO\.?|#|№)|СЧ[ЕЁ]Т\s*(?:НОМЕР|NO\.?|#|№))(?:\s*\/\s*(?:INVOICE\s*(?:NUMBER|NO\.?|#|№)|СЧ[ЕЁ]Т\s*(?:НОМЕР|NO\.?|#|№)))?/i;
  const dateLabel = /(?:DATE|ДАТА)(?:\s*\/\s*(?:DATE|ДАТА))?/i;

  const supplier = captureBetween(
    text,
    supplierLabel,
    /(?:BIN|IIN|БИН|ИИН|INVOICE|СЧ[ЕЁ]Т|DATE|ДАТА|CUSTOMER|BUYER|ПОКУПАТЕЛЬ|CURRENCY|ВАЛЮТА|DESCRIPTION|ОПИСАНИЕ)/i,
  );
  const supplierClean = typeof supplier.value === "string" && !/PDFFormatVersion|metadata/i.test(supplier.value) ? supplier : evidence(null, 0);

  const supplierBin = capturePattern(text, new RegExp(`${supplierIdLabel.source}\\s*[:：-]?\\s*(\\d{12})`, "i"), 0.99);
  const invoiceNumber = capturePattern(text, new RegExp(`${invoiceNumberLabel.source}\\s*[:：-]?\\s*([A-ZА-Я0-9][A-ZА-Я0-9_\\/-]{1,40})(?=\\s|$)`, "i"), 0.98);
  const invoiceDate = capturePattern(text, new RegExp(`${dateLabel.source}\\s*[:：-]?\\s*(\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4})`, "i"), 0.97);
  const poNumber = capturePattern(text, /(?:PURCHASE\s+ORDER|P\.?\s*O\.?|PO|ЗАКАЗ)(?:\s*(?:NUMBER|NO\.?|#|№))?(?:\s*\/\s*(?:PURCHASE\s+ORDER|P\.?\s*O\.?|PO|ЗАКАЗ)(?:\s*(?:NUMBER|NO\.?|#|№))?)?\s*[:：-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/-]{1,40})(?=\s|$)/i, 0.95);

  const subtotal = captureMoney(text, "SUBTOTAL|ИТОГО\\s+БЕЗ\\s+НДС|ПРОМЕЖУТОЧНЫЙ\\s+ИТОГ|БЕЗ\\s+НДС", 0.97);
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
