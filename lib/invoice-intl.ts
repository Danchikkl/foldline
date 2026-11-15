/**
 * Second opinion for fields the base extractors get wrong on US / UK / AU /
 * CA style invoices: totals behind £ or A$, "Sales Tax" / "GST", written
 * dates ("3 November 2026"), and a heading ("TAX INVOICE") taken as supplier.
 *
 * It never invents certainty. Values are replaced only when this reading is
 * arithmetically consistent or the base value is clearly impossible; any other
 * disagreement is reported as a conflict so the invoice goes to review.
 * Pure: no I/O, runs on the server and in the browser.
 */
import type { EvidenceValue, InvoiceData } from "@/lib/invoice";
import { dateCandidates } from "@/lib/dates";

type Money = { value: number; line: string; strong: boolean };

const SYMBOL = String.raw`(?:(?:US|AU|A|CA|C|NZ|S|HK)?\$|£|€|₸|₽|₹)`;
const CODE = String.raw`(?:USD|AUD|CAD|NZD|GBP|EUR|KZT|RUB|INR|AED|CHF|SGD|ZAR|HKD|JPY|SEK|NOK|DKK|PLN)`;
const NUMBER = String.raw`\(?-?\d{1,3}(?:[ ,.'’]\d{3})+(?:[.,]\d{1,2})?\)?|\(?-?\d+(?:[.,]\d{1,2})?\)?`;
const MONEY_RE = new RegExp(`(${SYMBOL}|${CODE})?\\s*(${NUMBER})\\s*(${CODE}|₸|₽)?(\\s*%)?`, "gi");

function clean(line: string) {
  return line.normalize("NFKC").replace(/ /g, " ").replace(/[|\t]/g, " ").replace(/[*_`#]+/g, " ").replace(/\s+/g, " ").trim();
}

function toNumber(raw: string): number | null {
  let s = raw.replace(/[()\s'’]/g, "");
  const negative = /^\(.*\)$/.test(raw.trim()) || s.startsWith("-");
  s = s.replace(/^-/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = Math.max(lastComma, lastDot);
    s = s.length - decimal - 1 <= 2
      ? `${s.slice(0, decimal).replace(/[.,]/g, "")}.${s.slice(decimal + 1)}`
      : s.replace(/[.,]/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const last = parts.at(-1) ?? "";
    s = parts.length > 2 || last.length === 3 ? parts.join("") : `${parts.slice(0, -1).join("")}.${last}`;
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Money tokens on a line, left to right. Percentages and bare small integers are skipped. */
function moneyTokens(text: string): { value: number; strong: boolean }[] {
  const out: { value: number; strong: boolean }[] = [];
  MONEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MONEY_RE.exec(text))) {
    if (!m[2]) continue;
    if (m[4]) continue; // 20 %
    const hasCurrency = Boolean(m[1] || m[3]);
    const hasDecimals = /[.,]\d{2}\)?$/.test(m[2]);
    const grouped = /\d[ ,.'’]\d{3}/.test(m[2]);
    const value = toNumber(m[2]);
    if (value === null) continue;
    out.push({ value, strong: hasCurrency || hasDecimals || grouped });
  }
  return out;
}

const ID_CONTEXT = /\b(?:REG(?:ISTRATION)?|NO\.?|NUMBER|NUM|ID|IDENTIFICATION|ABN|ACN|EIN|TIN|TRN|UTR|CODE)\b|[#№]/i;

const LABELS = {
  subtotal: /(?<![A-ZА-ЯЁ])(?:SUB[\s-]?TOTAL|NET\s+(?:TOTAL|AMOUNT)|TOTAL\s+(?:NET|EXCL?\.?|EXCLUDING|EX\.?|BEFORE)\b(?:\s+(?:OF\s+)?(?:VAT|GST|TAX))?|AMOUNT\s+(?:EXCL?\.?|EXCLUDING|BEFORE)\s+(?:VAT|GST|TAX)|ИТОГО\s+БЕЗ\s+НДС)(?![A-ZА-ЯЁ])/i,
  net: /^(?:NET)(?![A-ZА-ЯЁ])/i,
  tax: /(?<![A-ZА-ЯЁ])(?:(?:TOTAL\s+)?(?:SALES\s+TAX|VAT|GST|HST|PST|QST|TAX)(?:\s+AMOUNT)?|НДС)(?![A-ZА-ЯЁ])/i,
  grand: /(?<![A-ZА-ЯЁ])(?:GRAND\s+TOTAL|INVOICE\s+TOTAL|TOTAL\s+(?:INCL?\.?|INCLUDING|INC\.?)\b(?:\s+(?:OF\s+)?(?:VAT|GST|TAX))?|ИТОГО\s+К\s+ОПЛАТЕ|ВСЕГО\s+К\s+ОПЛАТЕ)(?![A-ZА-ЯЁ])/i,
  total: /(?<![A-ZА-ЯЁ-])(?<!SUB\s?)(?<!NET\s)(?:TOTAL|ИТОГО)(?![A-ZА-ЯЁ])(?!\s+(?:NET|EXCL?\.?|EXCLUDING|EX\.?|BEFORE|VAT|GST|TAX|SALES|HST|PST|QST|DUE|PAYABLE|PAID|DISCOUNT|QTY|QUANTITY|HOURS|ITEMS|UNITS|БЕЗ)\b)/i,
  due: /(?<![A-ZА-ЯЁ])(?:TOTAL\s+DUE|AMOUNT\s+DUE|BALANCE\s+DUE|TOTAL\s+PAYABLE|AMOUNT\s+PAYABLE|PLEASE\s+PAY|К\s+ОПЛАТЕ)(?![A-ZА-ЯЁ])/i,
} as const;

type LabelKind = keyof typeof LABELS;

function labeledMoney(lines: string[], kind: LabelKind): Money[] {
  const found: Money[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(LABELS[kind]);
    if (!match || match.index === undefined) continue;
    const after = line.slice(match.index + match[0].length);
    if (kind === "tax") {
      if (/^\s*INVOICE\b/i.test(after)) continue; // "TAX INVOICE" heading
      if (ID_CONTEXT.test(after.slice(0, 24)) || /\b(?:ABN|EIN|TIN)\b/i.test(line)) continue; // VAT Reg No 123...
    }
    if (kind === "total" && (LABELS.grand.test(line) || LABELS.due.test(line) || LABELS.subtotal.test(line))) continue;
    const atStart = match.index <= 2;
    let tokens = moneyTokens(after);
    let source = line;
    // A header row ("Subtotal | VAT | Total") names several amounts; its values
    // belong to columns, which the table-aware extractors handle.
    const kindsOnLine = [LABELS.subtotal, LABELS.tax, /TOTAL|ИТОГО|DUE|PAYABLE/i].filter((re) => re.test(line.replace(/SUB[\s-]?TOTAL/gi, kind === "subtotal" ? "SUBTOTAL" : " "))).length;
    if (!tokens.length && kindsOnLine > 1) continue;
    if (!tokens.length && lines[i + 1] && /^[^A-Za-zА-Яа-я]*$/.test(lines[i + 1].replace(new RegExp(`${SYMBOL}|${CODE}`, "gi"), ""))) {
      tokens = moneyTokens(lines[i + 1]); // label on one line, amount on the next
      source = `${line} ${lines[i + 1]}`;
    }
    const usable = tokens.filter((t) => t.strong || atStart);
    const token = usable.at(-1);
    if (!token || token.value < 0) continue;
    // A bare integer far from a line-start label is more likely "14 days" than money.
    if (!token.strong && !/^\s*[:：=-]?\s*\S+\s*$/.test(after)) continue;
    found.push({ value: token.value, line: source, strong: token.strong });
  }
  return found;
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.min(2, Math.abs(b) * 0.001));

function ev(m: Money, confidence: number): EvidenceValue {
  return { value: m.value, confidence, evidence: m.line.slice(0, 500) };
}

const num = (f: EvidenceValue) => (typeof f.value === "number" && Number.isFinite(f.value) ? f.value : null);
const NONE: EvidenceValue = { value: null, confidence: 0, evidence: "" };

function refineMoney(lines: string[], data: InvoiceData, issues: string[]): Pick<InvoiceData, "subtotal" | "vat" | "total"> {
  const subs = [...labeledMoney(lines, "subtotal"), ...labeledMoney(lines, "net")];
  const taxes = labeledMoney(lines, "tax");
  const grands = labeledMoney(lines, "grand");
  const totals = labeledMoney(lines, "total");
  const dues = labeledMoney(lines, "due");

  const sub = subs.at(-1) ?? null;
  // GST + PST style invoices list several tax lines; a repeated identical line is one tax.
  const distinctTaxes = taxes.filter((t, i) => taxes.findIndex((o) => o.line === t.line) === i);
  const tax: Money | null = distinctTaxes.length > 1 && new Set(distinctTaxes.map((t) => t.line.match(LABELS.tax)?.[0].toUpperCase())).size > 1
    ? { value: Math.round(distinctTaxes.reduce((s, t) => s + t.value, 0) * 100) / 100, line: distinctTaxes.map((t) => t.line).join(" + "), strong: distinctTaxes.every((t) => t.strong) }
    : distinctTaxes.at(-1) ?? null;

  const totalPool = [...grands, ...totals, ...dues];
  let total: Money | null = null;
  if (sub && tax) total = totalPool.find((t) => near(sub.value + tax.value, t.value)) ?? null;
  // Otherwise: an explicit invoice total beats "amount due" (which shrinks after part payment).
  total ??= grands.at(-1) ?? totals.at(-1) ?? dues.at(-1) ?? null;

  const base = { subtotal: num(data.subtotal), vat: num(data.vat), total: num(data.total) };
  const mineReconciles = Boolean(sub && tax && total && near(sub.value + tax.value, total.value));
  const baseReconciles = base.subtotal !== null && base.vat !== null && base.total !== null && near(base.subtotal + base.vat, base.total);

  if (mineReconciles) {
    return { subtotal: ev(sub!, 0.97), vat: ev(tax!, 0.97), total: ev(total!, 0.97) };
  }

  const out = { subtotal: data.subtotal, vat: data.vat, total: data.total };
  const merge = (key: "subtotal" | "vat" | "total", mine: Money | null) => {
    const current = base[key];
    if (!mine) return;
    if (current === null) { out[key] = ev(mine, mine.strong ? 0.9 : 0.8); return; }
    if (near(current, mine.value) || baseReconciles) return;
    out[key] = ev(mine, 0.7);
    issues.push(`${key}: extraction strategies disagree (${current} vs ${mine.value}).`);
  };
  merge("total", total);
  merge("subtotal", sub);
  merge("vat", tax);

  // Impossible values are dropped rather than reported as an arithmetic "issue":
  // a tax above the total is a registration number or a year, not a tax.
  const t = num(out.total);
  const v = num(out.vat);
  const s = num(out.subtotal);
  if (t !== null && v !== null && (v > t || (v >= 1900 && v <= 2100 && Number.isInteger(v) && !tax))) out.vat = NONE;
  if (t !== null && s !== null && s > t * 1.0005 + 0.05 && (num(out.vat) ?? 0) >= 0) out.subtotal = NONE;
  // Tax line says 0 / "exempt": subtotal equals total, tax is zero.
  if (num(out.vat) === null && t !== null && num(out.subtotal) !== null && near(num(out.subtotal)!, t) && taxes.length === 0) {
    out.vat = { value: 0, confidence: 0.85, evidence: "No tax line; subtotal equals total." };
  }
  return out;
}

const HEADING = /^(?:(?:TAX|COMMERCIAL|SALES|PRO[\s-]?FORMA|ORIGINAL)\s+)?(?:INVOICE|BILL|STATEMENT|RECEIPT|CREDIT\s+NOTE|PURCHASE\s+ORDER|REMITTANCE(?:\s+ADVICE)?|QUOTE|ESTIMATE|ORIGINAL|COPY|СЧ[ЕЁ]Т(?:[\s-]ФАКТУРА)?(?:\s+НА\s+ОПЛАТУ)?)$|^PAGE\s+\d+/i;
const LEGAL = /(?<![A-Za-z])(?:LLC|L\.L\.C\.?|LTD\.?|LIMITED|INC\.?|INCORPORATED|CORP\.?|CORPORATION|PLC|PTY\.?(?:\s+LTD\.?)?|GMBH|LLP|CO\.|COMPANY|S\.?A\.?|B\.?V\.?|ТОО|ИП|ООО|АО)(?![A-Za-z])/i;
const RECIPIENT = /^(?:BILL(?:ED)?\s+TO|INVOICE\s+TO|SOLD\s+TO|SHIP(?:PED)?\s+TO|DELIVER(?:Y)?\s+TO|CUSTOMER|CLIENT|BUYER|TO|ATTN|ATTENTION|ПОКУПАТЕЛЬ|ЗАКАЗЧИК)\s*[:：]?/i;

function stripRegistration(name: string) {
  return name.replace(/\s+(?:ABN|ACN|EIN|TIN|VAT|GST|REG(?:ISTRATION)?|COMPANY\s+NO)\b.*$/i, "").replace(/[\s,;:-]+$/, "").trim();
}

function refineSupplier(lines: string[], data: InvoiceData): EvidenceValue {
  const current = String(data.supplier_name.value ?? "").trim();
  const stripped = stripRegistration(current);
  if (stripped && !HEADING.test(stripped)) {
    return stripped === current ? data.supplier_name : { ...data.supplier_name, value: stripped };
  }
  const end = lines.findIndex((l) => RECIPIENT.test(l));
  const head = lines.slice(0, end > 0 ? end : 12);
  const usable = head
    .map(stripRegistration)
    .filter((l) => l.length >= 2 && l.length <= 120 && /[A-Za-zА-Яа-я]/.test(l))
    .filter((l) => !HEADING.test(l) && !/^[^:]{1,30}[:：#№]\s*\S/.test(l) && !/@|https?:|www\.|^\+?\d[\d\s()-]{6,}$|^\d+\s/.test(l));
  const pick = usable.find((l) => LEGAL.test(l)) ?? usable[0];
  if (!pick) return { value: null, confidence: 0, evidence: "" };
  return { value: pick, confidence: LEGAL.test(pick) ? 0.88 : 0.8, evidence: pick };
}

const DATE_LABEL = /(?<![A-ZА-ЯЁ])(?:INVOICE\s+DATE|TAX\s+(?:POINT|DATE)|(?:DATE\s+OF\s+)?ISSUE(?:D)?(?:\s+DATE)?|DATE\s+OF\s+INVOICE|BILL(?:ING)?\s+DATE|DATED?|ДАТА(?:\s+СЧ[ЕЁ]ТА)?|ОТ)(?![A-ZА-ЯЁ])\s*[:：.-]?\s*/i;
const NOT_INVOICE_DATE = /\b(?:DUE|DELIVERY|DELIVERED|SHIP(?:PED|PING)?|ORDER|PAYMENT|PAID|PRINT(?:ED)?|PERIOD|SERVICE|EXPIR\w*|VALID|START|END|FROM|UNTIL|СРОК)\b/i;

function refineDate(lines: string[], data: InvoiceData): EvidenceValue {
  if (dateCandidates(data.invoice_date.value).length) return data.invoice_date;
  for (const strict of [true, false]) {
    for (const line of lines) {
      const label = line.match(DATE_LABEL);
      if (strict && !label) continue;
      if (NOT_INVOICE_DATE.test(line.slice(0, (label?.index ?? 0) + (label?.[0].length ?? 0)))) continue;
      if (!strict && NOT_INVOICE_DATE.test(line)) continue;
      const rest = label && label.index !== undefined ? line.slice(label.index + label[0].length) : line;
      const candidates = dateCandidates(rest);
      if (!candidates.length) continue;
      // Written dates are unambiguous → store ISO. Numeric dates keep their original text.
      const numeric = rest.match(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/)?.[0];
      const isNumericFirst = numeric && rest.indexOf(numeric) <= 2;
      return { value: isNumericFirst ? numeric : candidates[0], confidence: strict ? 0.92 : 0.8, evidence: line.slice(0, 300) };
    }
  }
  return data.invoice_date;
}

function refineCurrency(text: string, data: InvoiceData): EvidenceValue {
  const upper = text.toUpperCase();
  const hit = (value: string, evidence: string): EvidenceValue => ({ value, confidence: 0.94, evidence });
  const current = String(data.currency.value ?? "").toUpperCase();
  if (current && current !== "USD") return data.currency;
  // "$" alone is ambiguous: an explicit code or a national tax label decides.
  const code = upper.match(/(?<![A-ZА-ЯЁ])(AUD|CAD|NZD|SGD|HKD)(?![A-ZА-ЯЁ])/)?.[1];
  if (code) return hit(code, code);
  if (/(?:^|[^A-Z])(?:AU|A)\$/.test(upper) || (/\bABN\b/.test(upper) && /\$/.test(upper))) return hit("AUD", "A$ / ABN");
  if (/(?:^|[^A-Z])(?:CA|C)\$/.test(upper) || (/\b(?:HST|QST)\b/.test(upper) && /\$/.test(upper))) return hit("CAD", "C$ / HST");
  if (/NZ\$/.test(upper)) return hit("NZD", "NZ$");
  if (current) return data.currency;
  if (/£|(?<![A-ZА-ЯЁ])GBP(?![A-ZА-ЯЁ])/.test(upper)) return hit("GBP", "£");
  if (/₹|(?<![A-ZА-ЯЁ])INR(?![A-ZА-ЯЁ])/.test(upper)) return hit("INR", "₹");
  const other = upper.match(/(?<![A-ZА-ЯЁ])(AED|CHF|ZAR|JPY|SEK|NOK|DKK|PLN)(?![A-ZА-ЯЁ])/)?.[1];
  if (other) return hit(other, other);
  return data.currency;
}

function refineInvoiceNumber(lines: string[], data: InvoiceData): EvidenceValue {
  const current = String(data.invoice_number.value ?? "").trim();
  if (current.length >= 2) return data.invoice_number;
  const re = /(?<![A-ZА-ЯЁ])(?:(?:TAX\s+)?INVOICE|INV|BILL|СЧ[ЕЁ]Т(?:\s+НА\s+ОПЛАТУ)?)\s*(?:NUMBER|NUM|NO\.?|REF(?:ERENCE)?|#|№)\s*[:：#.-]?\s*([A-ZА-Я0-9][A-ZА-Я0-9_\/.-]{1,40})/i;
  for (const line of lines) {
    const m = line.match(re);
    if (m && /\d/.test(m[1])) return { value: m[1].replace(/[.,;]+$/, ""), confidence: 0.88, evidence: line.slice(0, 300) };
  }
  return data.invoice_number;
}

export function refineInternational(rawText: string, data: InvoiceData): { data: InvoiceData; issues: string[] } {
  if (!rawText) return { data, issues: [] };
  const lines = rawText.slice(0, 250_000).split(/\r?\n/).map(clean).filter(Boolean);
  const issues: string[] = [];
  const money = refineMoney(lines, data, issues);
  return {
    data: {
      ...data,
      ...money,
      supplier_name: refineSupplier(lines, data),
      invoice_number: refineInvoiceNumber(lines, data),
      invoice_date: refineDate(lines, data),
      currency: refineCurrency(lines.join("\n"), data),
    },
    issues,
  };
}

const ROW_JUNK = /(?<![A-ZА-ЯЁ])(?:ABN|ACN|EIN|TIN|VAT\s+REG|GST\s+(?:NO|REG)|REG(?:ISTRATION)?\s+NO|PHONE|TEL|FAX|ACCOUNT|ACCT|SORT\s*CODE|IBAN|BSB|SWIFT|BIC|ROUTING|P\.?O\.?\s*BOX|SUITE|БИН|ИИН|ИИК|БИК)(?![A-ZА-ЯЁ])/i;

/** Rows that are really registration numbers, bank details or addresses. */
export function isJunkRow(description: string) {
  return ROW_JUNK.test(description.normalize("NFKC"));
}

/** Currency symbols glued to amounts ("$185.00") confuse the row parsers; this copy is for row parsing only. */
export function stripCurrencySymbols(rawText: string) {
  return rawText.replace(new RegExp(`${SYMBOL}\\s*(?=\\(?-?\\d)`, "g"), "");
}

const ROW_HEADER = [/(?:DESCRIPTION|ITEM|PARTICULARS|SERVICE|ОПИСАНИЕ|НАИМЕНОВАНИЕ)/i, /(?:QTY|QUANTITY|HOURS|HRS|UNITS|КОЛ-?ВО|КОЛИЧЕСТВО)/i, /(?:UNIT\s*PRICE|PRICE|RATE|ЦЕНА)/i, /(?:AMOUNT|TOTAL|СУММА)/i];
const TABLE_END = /(?<![A-ZА-ЯЁ])(?:SUB[\s-]?TOTAL|NET|TOTAL|VAT|GST|TAX|SALES\s+TAX|ИТОГО|НДС|AMOUNT\s+DUE|BALANCE)(?![A-ZА-ЯЁ])/i;

/**
 * How many rows the line-item table visibly has: lines between the column
 * header and the totals block that end in an amount. null when no table header
 * is found. Used to tell "rows don't add up" from "we missed a row".
 */
export function countTableRows(rawText: string): number | null {
  const lines = rawText.slice(0, 250_000).split(/\r?\n/).map(clean).filter(Boolean);
  const start = lines.findIndex((l) => ROW_HEADER.filter((re) => re.test(l)).length >= 3);
  if (start < 0) return null;
  let rows = 0;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^[\s:|-]+$/.test(line)) continue;
    const beforeNumber = line.replace(new RegExp(`(?:${SYMBOL}|${CODE})?\\s*[\\d(][\\d\\s.,'’()%-]*$`), "");
    if (TABLE_END.test(beforeNumber) && !/[A-Za-zА-Яа-я]{3,}\s+[A-Za-zА-Яа-я]{3,}\s+[A-Za-zА-Яа-я]{3,}/.test(beforeNumber)) break;
    const tokens = moneyTokens(line);
    if (tokens.length && /[\d)]\s*(?:[A-Z]{3}|₸|₽)?$/.test(line) && /[A-Za-zА-Яа-я]{2}/.test(line)) rows += 1;
  }
  return rows;
}
