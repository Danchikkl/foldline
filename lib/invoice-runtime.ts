import type { EvidenceValue, InvoiceData } from "@/lib/invoice";
import {
  analyzeInvoice as analyzeInvoiceBase,
  assessStructuredInvoice,
  type ExtractionAssessment,
} from "@/lib/invoice-reliability";

export const INVOICE_ENGINE_VERSION = "invoice-runtime-2026-08-30.2";

const MONEY = String.raw`(?:\d{1,3}(?:[\s,'’.]\d{3})+|\d+(?:[.,]\d{1,2})?)`;
const CURRENCY = String.raw`(?:KZT|USD|EUR|RUB|₸|\$|€|₽)`;

function compact(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseMoney(raw: string | undefined) {
  if (!raw) return null;
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
    const decimalIndex = Math.max(lastComma, lastDot);
    const decimalIsComma = lastComma > lastDot;
    const fraction = cleaned.length - decimalIndex - 1;
    normalized = fraction === 1 || fraction === 2
      ? (decimalIsComma ? cleaned.replace(/\./g, "").replace(/,/g, ".") : cleaned.replace(/,/g, ""))
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

function evidence(value: number, source: string, confidence = 0.96): EvidenceValue {
  return { value, confidence, evidence: compact(source).slice(0, 500) };
}

const subtotalLabels = [
  "SUBTOTAL",
  "NET TOTAL",
  "NET AMOUNT",
  "ИТОГО БЕЗ НДС",
  "ПРОМЕЖУТОЧНЫЙ ИТОГ",
];
const vatLabels = ["VAT", "TAX", "НДС"];
const totalLabels = [
  "GRAND TOTAL",
  "TOTAL DUE",
  "AMOUNT DUE",
  "INVOICE TOTAL",
  "ИТОГО К ОПЛАТЕ",
  "ВСЕГО К ОПЛАТЕ",
  "К ОПЛАТЕ",
  "TOTAL",
  "ИТОГО",
];

function escaped(label: string) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, String.raw`\s*`);
}

function findDirectAmount(rawText: string, labels: string[]) {
  const text = rawText.normalize("NFKC").replace(/\u00a0/g, " ");
  for (const label of labels) {
    const labelPattern = escaped(label);
    const regex = new RegExp(
      `(?:^|[^A-ZА-ЯЁ])(${labelPattern})\\s*[:：#|=-]*\\s*(?:${CURRENCY}\\s*)?(${MONEY})(?:\\s*${CURRENCY})?`,
      "i",
    );
    const match = text.match(regex);
    if (!match?.[2]) continue;
    const value = parseMoney(match[2]);
    if (value !== null) return evidence(value, match[0], 0.96);
  }
  return null;
}

function classifyHeaderCell(value: string) {
  const cell = compact(value).toUpperCase();
  if (subtotalLabels.some((label) => cell === label)) return "subtotal" as const;
  if (vatLabels.some((label) => cell === label || cell.startsWith(`${label} `))) return "vat" as const;
  if (totalLabels.some((label) => cell === label)) return "total" as const;
  return null;
}

function splitPipeRow(line: string) {
  if (!line.includes("|")) return [];
  let cells = line.split("|").map((cell) => compact(cell.replace(/[*_`#]+/g, "")));
  if (!cells[0]) cells = cells.slice(1);
  if (!cells.at(-1)) cells = cells.slice(0, -1);
  return cells;
}

function recoverTableTotals(rawText: string) {
  const lines = rawText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const header = splitPipeRow(lines[i]);
    if (!header.length) continue;
    const roles = header.map(classifyHeaderCell);
    if (roles.filter(Boolean).length < 2) continue;

    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      const values = splitPipeRow(lines[j]);
      if (!values.length || values.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      const result: Partial<Record<"subtotal" | "vat" | "total", EvidenceValue>> = {};
      for (let column = 0; column < roles.length; column += 1) {
        const role = roles[column];
        if (!role || !values[column]) continue;
        const amount = parseMoney(values[column]);
        if (amount !== null) result[role] = evidence(amount, `${lines[i]} ${lines[j]}`, 0.97);
      }
      if (Object.keys(result).length >= 2) return result;
      break;
    }
  }
  return {} as Partial<Record<"subtotal" | "vat" | "total", EvidenceValue>>;
}

function recoverGroupedTotals(rawText: string) {
  const flat = rawText
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[*_`#|\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const subtotal = String.raw`(?:SUBTOTAL|NET\s*TOTAL|NET\s*AMOUNT|ИТОГО\s*БЕЗ\s*НДС|ПРОМЕЖУТОЧНЫЙ\s*ИТОГ)`;
  const vat = String.raw`(?:VAT(?:\s*\d{1,2}\s*%)?|TAX(?:\s*\d{1,2}\s*%)?|НДС(?:\s*\d{1,2}\s*%)?)`;
  const total = String.raw`(?:GRAND\s*TOTAL|TOTAL\s*DUE|AMOUNT\s*DUE|INVOICE\s*TOTAL|ИТОГО\s*К\s*ОПЛАТЕ|ВСЕГО\s*К\s*ОПЛАТЕ|К\s*ОПЛАТЕ|TOTAL|ИТОГО)`;
  const separator = String.raw`[^0-9A-ZА-ЯЁ]{0,12}`;

  const regex = new RegExp(
    `${subtotal}${separator}${vat}${separator}${total}${separator}(${MONEY})(?:\\s*${CURRENCY})?${separator}(${MONEY})(?:\\s*${CURRENCY})?${separator}(${MONEY})(?:\\s*${CURRENCY})?`,
    "i",
  );
  const match = flat.match(regex);
  if (!match) return {} as Partial<Record<"subtotal" | "vat" | "total", EvidenceValue>>;
  const values = [match[1], match[2], match[3]].map(parseMoney);
  if (values.some((value) => value === null)) return {} as Partial<Record<"subtotal" | "vat" | "total", EvidenceValue>>;
  return {
    subtotal: evidence(values[0]!, match[0], 0.96),
    vat: evidence(values[1]!, match[0], 0.96),
    total: evidence(values[2]!, match[0], 0.96),
  };
}

function recoverMoneyFields(rawText: string, data: InvoiceData): InvoiceData {
  const table = recoverTableTotals(rawText);
  const grouped = recoverGroupedTotals(rawText);
  const subtotal = typeof data.subtotal.value === "number"
    ? data.subtotal
    : table.subtotal ?? grouped.subtotal ?? findDirectAmount(rawText, subtotalLabels) ?? data.subtotal;
  const vat = typeof data.vat.value === "number"
    ? data.vat
    : table.vat ?? grouped.vat ?? findDirectAmount(rawText, vatLabels) ?? data.vat;
  const total = typeof data.total.value === "number"
    ? data.total
    : table.total ?? grouped.total ?? findDirectAmount(rawText, totalLabels) ?? data.total;
  return { ...data, subtotal, vat, total };
}

function explicitNonInvoice(rawText: string) {
  const text = rawText.normalize("NFKC").replace(/[*_`#|]+/g, " ").replace(/[-–—]+/g, " ");
  return /\bNOT\s+AN?\s+INVOICE\b/i.test(text)
    || /\bTHIS\s+IS\s+NOT\s+AN?\s+INVOICE\b/i.test(text)
    || /НЕ\s+ЯВЛЯЕТСЯ\s+(?:СЧ[ЕЁ]ТОМ|ИНВОЙСОМ)/i.test(text);
}

function looksLikeInvoice(rawText: string, data: InvoiceData) {
  if (explicitNonInvoice(rawText)) return false;

  const text = rawText.normalize("NFKC");
  const validNumber = compact(data.invoice_number.value).length >= 2;
  const validTotal = typeof data.total.value === "number" && Number.isFinite(data.total.value);
  const validSupplier = compact(data.supplier_name.value).length >= 2;
  const validRows = data.line_items.some((item) => typeof item.amount === "number" && Number.isFinite(item.amount));

  const structureSignals = [
    /(?:^|\n)\s*(?:INVOICE|COMMERCIAL\s+INVOICE|TAX\s+INVOICE|СЧ[ЕЁ]Т(?:-ФАКТУРА)?|СЧЕТ(?:-ФАКТУРА)?)(?:\s|$)/im.test(text),
    /INVOICE\s*(?:NUMBER|NO\.?|#|№)|СЧ[ЕЁ]Т\s*(?:НОМЕР|NO\.?|#|№)/i.test(text),
    /(?:SUBTOTAL|NET\s+AMOUNT|ИТОГО\s+БЕЗ\s+НДС)/i.test(text),
    /(?:GRAND\s+TOTAL|TOTAL\s+DUE|AMOUNT\s+DUE|\bTOTAL\b|\bИТОГО\b)/i.test(text),
    /(?:DESCRIPTION|ITEM|ОПИСАНИЕ|НАИМЕНОВАНИЕ).*(?:QTY|QUANTITY|КОЛ-?ВО|КОЛИЧЕСТВО)/is.test(text),
    /(?:SUPPLIER|VENDOR|SELLER|ПОСТАВЩИК|ПРОДАВЕЦ)/i.test(text),
  ].filter(Boolean).length;

  const dataSignals = [validNumber, validTotal, validSupplier, validRows].filter(Boolean).length;
  if (validNumber && (validTotal || validRows || validSupplier)) return true;
  if (validTotal && validRows) return true;
  return structureSignals >= 3 && dataSignals >= 1;
}

function unsupportedAssessment(reason: string): ExtractionAssessment {
  return {
    status: "unsupported",
    score: 0,
    document_type: "unknown",
    issues: [reason],
    signals: ["document lacks enough invoice-specific structure"],
  };
}

export function analyzeInvoice(rawText: string) {
  const base = analyzeInvoiceBase(rawText);
  const data = recoverMoneyFields(rawText, base.data);

  if (!looksLikeInvoice(rawText, data)) {
    return {
      data,
      extraction: unsupportedAssessment(
        explicitNonInvoice(rawText)
          ? "The source identifies itself as not being an invoice."
          : "Foldline could not find enough invoice-specific structure in this document.",
      ),
    };
  }

  const extraction = assessStructuredInvoice(data, rawText, false, base.extraction.issues);
  return { data, extraction };
}
