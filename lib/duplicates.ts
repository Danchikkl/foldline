/**
 * Duplicate and near-duplicate invoice detection.
 *
 * Why this exists (from AP interviews):
 * - ERPs typically block an exact repeat of invoice number (+ date). Change one
 *   character ("INV-123" → "INV-123A") and the invoice can go straight through.
 * - AP teams don't trust invoice number alone; they also compare supplier,
 *   amount and date.
 *
 * Everything here is pure and deterministic: no I/O, no AI. Input is a small
 * fingerprint per invoice so the server can load history cheaply.
 *
 * Severity:
 * - "issue"    → we are confident this is the same invoice again.
 * - "possible" → strong signals, but a human must decide (could be legitimate).
 */
import type { InvoiceData } from "./invoice";

export type InvoiceFingerprint = {
  supplier_bin: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
};

export type PeerDocument = {
  id: string;
  filename: string;
  created_at: string;
  status: string;
  fp: InvoiceFingerprint;
};

export type DuplicateKind = "exact" | "number_reused" | "near_reference" | "same_amount_date";

export type DuplicateMatch = {
  document_id: string;
  filename: string;
  created_at: string;
  status: string;
  kind: DuplicateKind;
  severity: "issue" | "possible";
  reasons: string[];
  other: InvoiceFingerprint;
};

export const DUPLICATE_LABELS: Record<DuplicateKind, string> = {
  exact: "Duplicate invoice",
  number_reused: "Invoice number reused",
  near_reference: "Possible duplicate (changed reference)",
  same_amount_date: "Possible duplicate (same amount and date)",
};

const NEAR_REFERENCE_MAX_DAYS = 60;
const SEQUENCE_MAX_DAYS = 7;
const MAX_MATCHES = 5;

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

// Cyrillic letters that look identical to Latin ones. Kazakh/Russian invoices
// mix both, and OCR picks either at random.
const HOMOGLYPHS: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y",
};

/** "inv-00123 " → "INV123", "INV 123" → "INV123", "АВ-12" (Cyrillic) → "AB12". */
export function normalizeReference(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).toUpperCase().replace(/Ё/g, "Е");
  s = s.replace(/[АВЕКМНОРСТХУ]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
  // Strip leading zeros of every digit group *before* joining groups:
  // "INV-00123" → "INV-123", "2024-0001" → "2024-1".
  s = s.replace(/(^|[^0-9])0+(?=\d)/g, "$1");
  s = s.replace(/[^A-Z0-9А-Я]/g, "");
  return s.length ? s : null;
}

const LEGAL_FORMS = new Set([
  "тоо", "ао", "ип", "оао", "зао", "ооо", "пао", "гу", "кх",
  "too", "llp", "llc", "ltd", "limited", "inc", "incorporated", "corp", "corporation",
  "co", "company", "gmbh", "plc", "jsc", "sa", "bv", "pvt", "private", "the",
]);

export function normalizeSupplierName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tokens = String(raw)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`’“”.,()&/\\|_-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !LEGAL_FORMS.has(t));
  const name = tokens.join(" ").trim();
  return name.length >= 2 ? name : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
};

function dayNumber(y: number, m: number, d: number): number | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const t = Date.UTC(y, m - 1, d);
  const check = new Date(t);
  if (check.getUTCMonth() !== m - 1) return null; // e.g. 31.02
  return Math.floor(t / 86_400_000);
}

/** Parses common invoice date formats into a day number. Day-first for numeric dates. */
export function parseInvoiceDate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return dayNumber(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return dayNumber(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([a-zа-я]{3})[a-zа-я]*\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2]]) return dayNumber(+m[3], MONTHS[m[2]], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1]]) return dayNumber(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Comparisons                                                         */
/* ------------------------------------------------------------------ */

/** Optimal string alignment distance (Levenshtein + adjacent transposition). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

/**
 * Two different normalised references that look like the same document with
 * a small edit. Returns a human-readable reason, or null.
 */
export function nearReferenceReason(a: string, b: string): string | null {
  if (a === b) return null;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return null;
  if (long.startsWith(short) && long.length - short.length <= 2) return "one number is the other with a suffix added";
  if (long.endsWith(short) && long.length - short.length <= 4) return "one number is the other with a prefix added";
  if (short.length >= 4 && editDistance(a, b) <= 1) return "numbers differ by a single character";
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (da.length >= 3 && da === db) return "same digits, different letters";
  return null;
}

function normalizeBin(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 12 ? digits : null;
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

/** Same legal supplier? BIN wins when both have one; otherwise compare names. */
export function supplierMatch(a: InvoiceFingerprint, b: InvoiceFingerprint): { basis: "BIN" | "name" } | null {
  const binA = normalizeBin(a.supplier_bin);
  const binB = normalizeBin(b.supplier_bin);
  if (binA && binB) return binA === binB ? { basis: "BIN" } : null;
  const nameA = normalizeSupplierName(a.supplier_name);
  const nameB = normalizeSupplierName(b.supplier_name);
  if (!nameA || !nameB) return null;
  if (nameA === nameB) return { basis: "name" };
  if (tokenOverlap(nameA, nameB) >= 0.8) return { basis: "name" };
  const [s, l] = nameA.length <= nameB.length ? [nameA, nameB] : [nameB, nameA];
  if (s.length >= 5 && l.includes(s)) return { basis: "name" };
  return null;
}

export function totalsEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.0005);
}

function currencyCompatible(a: string | null, b: string | null): boolean {
  return !a || !b || a.toUpperCase() === b.toUpperCase();
}

function fmtMoney(v: number | null, currency: string | null): string {
  if (v === null) return "—";
  const n = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function fingerprintFromData(data: InvoiceData): InvoiceFingerprint {
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  const numeric = (v: unknown) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  return {
    supplier_bin: str(data.supplier_bin?.value),
    supplier_name: str(data.supplier_name?.value),
    invoice_number: str(data.invoice_number?.value),
    invoice_date: str(data.invoice_date?.value),
    total: numeric(data.total?.value),
    currency: str(data.currency?.value),
  };
}

/** Compares one invoice against one earlier invoice. */
export function compareInvoices(target: InvoiceFingerprint, peer: PeerDocument): DuplicateMatch | null {
  const supplier = supplierMatch(target, peer.fp);
  if (!supplier) return null;

  const supplierReason = supplier.basis === "BIN" ? "Same supplier BIN/IIN" : "Same supplier name";
  const refA = normalizeReference(target.invoice_number);
  const refB = normalizeReference(peer.fp.invoice_number);
  const sameTotal = totalsEqual(target.total, peer.fp.total);
  const dayA = parseInvoiceDate(target.invoice_date);
  const dayB = parseInvoiceDate(peer.fp.invoice_date);
  const bothDates = dayA !== null && dayB !== null;
  const sameDate = bothDates && dayA === dayB;
  const daysApart = bothDates ? Math.abs(dayA - dayB) : null;
  const currencyOk = currencyCompatible(target.currency, peer.fp.currency);
  const total = fmtMoney(target.total, target.currency);

  const base = { document_id: peer.id, filename: peer.filename, created_at: peer.created_at, status: peer.status, other: peer.fp };

  // 1. Same reference after normalisation.
  if (refA && refB && refA === refB) {
    const literal = (target.invoice_number ?? "").trim() === (peer.fp.invoice_number ?? "").trim();
    const numberReason = literal
      ? `Same invoice number ${target.invoice_number}`
      : `Invoice numbers ${target.invoice_number} and ${peer.fp.invoice_number} are the same once spaces, dashes and leading zeros are ignored`;

    const bothTotals = target.total !== null && peer.fp.total !== null;
    if (bothTotals && !sameTotal) {
      return {
        ...base,
        kind: "number_reused",
        severity: "possible",
        reasons: [
          supplierReason,
          numberReason,
          `Totals differ: ${total} vs ${fmtMoney(peer.fp.total, peer.fp.currency)} — this may be a revised invoice or a reused number; confirm which one should be paid`,
        ],
      };
    }
    const reasons = [supplierReason, numberReason];
    if (sameTotal) reasons.push(`Same total ${total}`);
    if (sameDate) reasons.push("Same invoice date");
    return { ...base, kind: "exact", severity: "issue", reasons };
  }

  // 2. Slightly changed reference + same money + close dates.
  if (refA && refB && sameTotal && currencyOk && (daysApart === null || daysApart <= NEAR_REFERENCE_MAX_DAYS)) {
    const why = nearReferenceReason(refA, refB);
    // INV-123 → INV-124 with the same amount is usually the next invoice in a
    // recurring series (rent, subscription), not a duplicate. Only flag a
    // digits-only change when the dates are known and within a week.
    const digitsOnlyChange = refA.replace(/\d/g, "") === refB.replace(/\d/g, "");
    const sequenceLike = digitsOnlyChange && (daysApart === null || daysApart > SEQUENCE_MAX_DAYS);
    if (why && !sequenceLike) {
      const reasons = [
        supplierReason,
        `Invoice numbers ${target.invoice_number} and ${peer.fp.invoice_number} are almost identical (${why})`,
        `Same total ${total}`,
      ];
      if (daysApart !== null) reasons.push(daysApart === 0 ? "Same invoice date" : `Invoice dates ${daysApart} day${daysApart === 1 ? "" : "s"} apart`);
      return { ...base, kind: "near_reference", severity: "possible", reasons };
    }
  }

  // 3. Different (or unreadable) numbers, but same supplier, amount and date.
  if (sameTotal && sameDate && currencyOk) {
    const refNote = refA && refB
      ? `Different invoice numbers (${target.invoice_number} vs ${peer.fp.invoice_number})`
      : "Invoice number missing on one of the documents";
    return {
      ...base,
      kind: "same_amount_date",
      severity: "possible",
      reasons: [supplierReason, `Same total ${total}`, "Same invoice date", refNote],
    };
  }

  return null;
}

/** Compares an invoice against earlier invoices. Strongest matches first. */
export function findDuplicates(target: InvoiceFingerprint, peers: PeerDocument[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const peer of peers) {
    const m = compareInvoices(target, peer);
    if (m) matches.push(m);
  }
  const rank = (m: DuplicateMatch) => (m.kind === "exact" ? 0 : m.kind === "number_reused" ? 1 : m.kind === "near_reference" ? 2 : 3);
  matches.sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at));
  return matches.slice(0, MAX_MATCHES);
}

/** True when the invoice carries enough identity to run a duplicate check at all. */
export function canCheckDuplicates(fp: InvoiceFingerprint): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!normalizeBin(fp.supplier_bin) && !normalizeSupplierName(fp.supplier_name)) missing.push("supplier");
  if (!normalizeReference(fp.invoice_number) && fp.total === null) missing.push("invoice number and total");
  return { ok: missing.length === 0, missing };
}
