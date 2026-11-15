/**
 * Pure duplicate matching. No I/O, no server imports: runs on the server and,
 * for the zero-knowledge workspace, in the browser against decrypted history.
 */
import type { InvoiceData } from "@/lib/invoice";
import { dateCandidates, dayDistance } from "@/lib/dates";

// Cyrillic letters that look identical to Latin ones (typed on the wrong layout).
const CYRILLIC_LOOKALIKES: Record<string, string> = { "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y" };

export function normalizeInvoiceNumber(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[АВЕКМНОРСТХУ]/g, (c) => CYRILLIC_LOOKALIKES[c] ?? c)
    .replace(/(^|[^0-9])0+(?=\d)/g, "$1")
    .replace(/[\s._'’`-]+/g, "")
    .replace(/[^A-ZА-ЯЁ0-9]/g, "");
}

function normalizeSupplierName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/(?<![A-ZА-ЯЁ0-9])(?:LLP|LLC|L\.L\.C|LTD|LIMITED|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|PLC|PTY|GMBH|AG|BV|NV|SA|SRL|SARL|OY|AB|AS|THE|AND|TOO|ТОО|ИП|ООО|АО)(?![A-ZА-ЯЁ0-9])\.?/g, " ")
    .replace(/[^A-ZА-ЯЁ0-9]/g, "");
}

/** Supplier name with legal forms, case and punctuation removed; "" when too short to trust. */
export function supplierNameKey(value: unknown) {
  const key = normalizeSupplierName(value);
  return key.length >= 3 ? key : "";
}

/** Invoice reference with punctuation, leading zeros and look-alike characters folded. */
export function invoiceNumberKey(value: unknown) {
  return foldConfusables(normalizeInvoiceNumber(value));
}

/**
 * Letters and digits that get swapped when a number is retyped or re-read:
 * O/0, I/L/1, S/5, B/8, Z/2. Folding both sides catches INV-1O234 vs INV-10234.
 */
function foldConfusables(normalized: string): string {
  return normalized.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
}

function supplierBin(data: InvoiceData) {
  const bin = String(data.supplier_bin.value ?? "").replace(/\s/g, "");
  return /^\d{9,12}$/.test(bin) ? bin : "";
}

/** Same registration number, or (when either side has none) the same normalized name. */
export function sameSupplier(a: InvoiceData, b: InvoiceData) {
  const binA = supplierBin(a);
  const binB = supplierBin(b);
  if (binA && binB) return binA === binB;
  const nameA = normalizeSupplierName(a.supplier_name.value);
  const nameB = normalizeSupplierName(b.supplier_name.value);
  return nameA.length >= 3 && nameA === nameB;
}

export function supplierKey(data: InvoiceData) {
  const bin = String(data.supplier_bin.value ?? "").trim();
  if (/^\d{12}$/.test(bin)) return `bin:${bin}`;
  const name = normalizeSupplierName(data.supplier_name.value);
  return name.length >= 3 ? `name:${name}` : "";
}

export function asInvoiceData(value: unknown): InvoiceData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<InvoiceData>;
  if (!data.invoice_number || !data.supplier_name || !Array.isArray(data.line_items)) return null;
  return data as InvoiceData;
}

export function invoiceTotal(data: InvoiceData) {
  return typeof data.total.value === "number" && Number.isFinite(data.total.value) ? data.total.value : null;
}

function sameAmount(a: number | null, b: number | null) {
  if (a === null || b === null) return false;
  // Cent-level rounding only: $9.50 and $10.20 are different invoices.
  return Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.0001);
}

function oneEditApart(a: string, b: string) {
  if (!a || !b || a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits === 1;
}

function adjacentTransposition(a: string, b: string) {
  if (a.length !== b.length || a.length < 4) return false;
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diffs.push(i);
  if (diffs.length !== 2 || diffs[1] !== diffs[0] + 1) return false;
  const [i, j] = diffs;
  return a[i] === b[j] && a[j] === b[i];
}

function similarInvoiceNumber(a: string, b: string) {
  if (a === b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return false;
  // INV10234 -> INV10234A / INV102341 (suffix added on resend)
  if (long.startsWith(short) && long.length - short.length <= 2) return true;
  // 10234 -> INV10234 / KZ10234 (prefix added)
  if (long.endsWith(short) && long.length - short.length <= 4) return true;
  if (short.length >= 4 && (oneEditApart(a, b) || adjacentTransposition(a, b))) return true;
  // A-10234 vs B-10234: same digits, different letters
  const digitsA = a.replace(/\D/g, "");
  return digitsA.length >= 3 && digitsA === b.replace(/\D/g, "");
}

/** True when the trailing numbers differ by exactly one (…1001 / …1002). */
function consecutiveNumbers(a: string, b: string) {
  const tailA = a.match(/(\d+)$/)?.[1];
  const tailB = b.match(/(\d+)$/)?.[1];
  if (!tailA || !tailB || a.slice(0, a.length - tailA.length) !== b.slice(0, b.length - tailB.length)) return false;
  return Math.abs(Number(tailA) - Number(tailB)) === 1;
}

const NEAR_DUPLICATE_MAX_DAYS = 60;
const SEQUENCE_MAX_DAYS = 7;

export function duplicateCandidate(current: InvoiceData, candidate: InvoiceData) {
  const currentNumber = normalizeInvoiceNumber(current.invoice_number.value);
  const candidateNumber = normalizeInvoiceNumber(candidate.invoice_number.value);

  if (!sameSupplier(current, candidate)) return null;

  const amountMatches = sameAmount(invoiceTotal(current), invoiceTotal(candidate));
  const bothTotalsKnown = invoiceTotal(current) !== null && invoiceTotal(candidate) !== null;
  // Ambiguous dates (03/04/2026) carry both readings; they match if any reading matches.
  const currentDates = dateCandidates(current.invoice_date.value);
  const candidateDates = dateCandidates(candidate.invoice_date.value);
  const days = dayDistance(currentDates, candidateDates);
  const dateMatches = days === 0;
  const currentCurrency = String(current.currency.value ?? "").trim().toUpperCase();
  const candidateCurrency = String(candidate.currency.value ?? "").trim().toUpperCase();
  const bothCurrenciesKnown = Boolean(currentCurrency && candidateCurrency);
  const currencyMatches = bothCurrenciesKnown && currentCurrency === candidateCurrency;
  const currencyCompatible = !bothCurrenciesKnown || currencyMatches;
  const extras = () => [
    ...(dateMatches ? ["date"] : []),
    ...(currencyMatches ? ["currency"] : []),
  ];

  // Same reference (after ignoring spaces, dashes, leading zeros).
  const identical = Boolean(currentNumber && candidateNumber && currentNumber === candidateNumber);
  // INV-1O234 vs INV-10234: the same reference once look-alike characters are folded.
  const lookAlike = !identical && currentNumber.length >= 3 && candidateNumber.length >= 3
    && foldConfusables(currentNumber) === foldConfusables(candidateNumber);
  if (identical || lookAlike) {
    const numberSignal = lookAlike ? "invoice number (look-alike characters: 0/O, 1/I)" : "invoice number";
    if (bothTotalsKnown && !amountMatches) {
      // Same number, different amount: a revised invoice or a reused number.
      return { matchType: "number_reused" as const, signals: ["supplier", numberSignal, "different total"] };
    }
    return { matchType: "exact" as const, signals: ["supplier", numberSignal, ...(amountMatches ? ["total"] : []), ...extras()] };
  }

  // Slightly changed reference + same money + plausible timing.
  if (currentNumber && candidateNumber && amountMatches && currencyCompatible && similarInvoiceNumber(currentNumber, candidateNumber)) {
    // INV-10234 -> INV-10235 with the same amount is usually the next invoice in
    // a recurring series (rent, subscription). Only flag a digits-only change
    // when both dates are known and within a week.
    const digitsOnlyChange = currentNumber.replace(/\d/g, "") === candidateNumber.replace(/\d/g, "");
    const withinWindow = days === null || days <= NEAR_DUPLICATE_MAX_DAYS;
    // 1001 and 1002 are the next invoice in the supplier's own numbering, not a
    // changed copy: they are never a "changed reference". Issued on the same day
    // for the same amount they still fall through to the weaker same-day rule.
    const consecutive = digitsOnlyChange && consecutiveNumbers(currentNumber, candidateNumber);
    const sequenceLike = consecutive || (digitsOnlyChange && (days === null || days > SEQUENCE_MAX_DAYS));
    if (withinWindow && !sequenceLike) {
      return { matchType: "similar_reference" as const, signals: ["supplier", "similar invoice number", "total", ...extras()] };
    }
  }

  // Different (or unreadable) number, but same supplier, amount and date.
  if (amountMatches && dateMatches && currencyCompatible) {
    return { matchType: "same_amount_date" as const, signals: ["supplier", "total", "date", ...(currencyMatches ? ["currency"] : [])] };
  }

  return null;
}


export type DuplicateMatchType = "exact" | "similar_reference" | "number_reused" | "same_amount_date";

export const MATCH_RANK: Record<DuplicateMatchType, number> = { exact: 0, number_reused: 1, similar_reference: 2, same_amount_date: 3 };

export type DuplicateHit = {
  documentId: string;
  filename: string;
  invoiceNumber: string;
  matchType: DuplicateMatchType;
  signals: string[];
};

/** Strongest match among candidates: exact > number reused > changed reference > same amount+date. */
export function findStrongestDuplicate(
  data: InvoiceData,
  candidates: { id: string; filename: string; data: InvoiceData }[],
): DuplicateHit | null {
  let best: DuplicateHit | null = null;
  for (const candidate of candidates) {
    const match = duplicateCandidate(data, candidate.data);
    if (!match) continue;
    if (best && MATCH_RANK[best.matchType] <= MATCH_RANK[match.matchType]) continue;
    best = {
      documentId: candidate.id,
      filename: candidate.filename,
      invoiceNumber: String(candidate.data.invoice_number.value ?? ""),
      matchType: match.matchType,
      signals: match.signals,
    };
    if (match.matchType === "exact") break;
  }
  return best;
}
