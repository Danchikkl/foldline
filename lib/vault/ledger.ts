/**
 * Audit of a payment / bill export (CSV or Excel) for invoices that were
 * entered or paid twice. Everything here is pure and runs in the browser: the
 * file is parsed, checked and discarded on the user's device.
 */
import { unzipSync, strFromU8 } from "fflate";
import type { InvoiceData } from "@/lib/invoice";
import { dateCandidates, excelSerialToIso, inferDateOrder, type DateOrder } from "@/lib/dates";
import { duplicateCandidate, invoiceNumberKey, supplierNameKey, MATCH_RANK, type DuplicateMatchType } from "@/lib/invoice-duplicates";

export const MAX_LEDGER_BYTES = 25 * 1024 * 1024;
export const MAX_LEDGER_ROWS = 200_000;
const MAX_UNZIPPED_BYTES = 150 * 1024 * 1024;

export type Grid = string[][];
export class LedgerError extends Error {}

// ---------- reading files ----------

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function sniffDelimiter(text: string) {
  const sample = text.slice(0, 20_000).split(/\r?\n/).slice(0, 25);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = sample.map((line) => line.split(d).length - 1).filter((n) => n > 0);
    if (!counts.length) continue;
    // A real delimiter appears on most lines, about the same number of times.
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const score = counts.filter((n) => n === mode).length * Math.min(mode, 30);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** RFC 4180 CSV (quotes, escaped quotes, newlines inside quotes) with delimiter detection. */
export function parseCsv(text: string): Grid {
  const delimiter = sniffDelimiter(text);
  const rows: Grid = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; continue; }
    if (ch === delimiter) { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      rows.push(row); row = [];
      if (rows.length > MAX_LEDGER_ROWS + 50) throw new LedgerError(`This file has more than ${MAX_LEDGER_ROWS.toLocaleString("en-US")} rows. Split it by year and check each part.`);
      continue;
    }
    cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function xmlText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_ENTITIES[name])
    .replace(/_x000D_/g, "");
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Reads the first worksheet of an .xlsx file as text cells. Dates become ISO strings. */
export function parseXlsx(bytes: Uint8Array): Grid {
  let files: Record<string, Uint8Array>;
  try {
    let total = 0;
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(file.name)) return false;
        total += file.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new LedgerError("This workbook is too large to check in the browser. Export the sheet as CSV instead.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    throw new LedgerError("This file could not be opened as an Excel workbook. Old .xls files are not supported: save it as .xlsx or CSV.");
  }

  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const date1904 = /<workbookPr[^>]*date1904="(?:1|true)"/.test(workbook);
  let sheetPath = "";
  const firstSheet = workbook.match(/<sheet\s[^>]*>/)?.[0];
  const relId = firstSheet ? attr(firstSheet, "r:id") : undefined;
  if (relId && files["xl/_rels/workbook.xml.rels"]) {
    const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
    const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((tag) => attr(tag, "Id") === relId);
    const target = rel ? attr(rel, "Target") : undefined;
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  if (!files[sheetPath]) sheetPath = Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort()[0] ?? "";
  if (!files[sheetPath]) throw new LedgerError("No worksheet was found in this workbook.");

  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    for (const si of strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) {
      const body = (si[1] ?? "").replace(/<rPh[\s\S]*?<\/rPh>/g, "");
      shared.push([...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join(""));
    }
  }

  const dateStyles = new Set<number>();
  if (files["xl/styles.xml"]) {
    const styles = strFromU8(files["xl/styles.xml"]);
    const custom = new Map<number, string>();
    for (const m of styles.matchAll(/<numFmt\s[^>]*>/g)) custom.set(Number(attr(m[0], "numFmtId")), xmlText(attr(m[0], "formatCode") ?? ""));
    const cellXfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
    [...cellXfs.matchAll(/<xf\s[^>]*>/g)].forEach((m, index) => {
      const id = Number(attr(m[0], "numFmtId") ?? 0);
      const code = custom.get(id);
      const isDate = code !== undefined
        ? /[dmyh]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""))
        : BUILTIN_DATE_FORMATS.has(id);
      if (isDate) dateStyles.add(index);
    });
  }

  const sheet = strFromU8(files[sheetPath]);
  const grid: Grid = [];
  for (const rowMatch of sheet.matchAll(/<row(\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    // Empty rows are omitted from the file; keep them so row numbers match what Excel shows.
    const rowNumber = Number(attr(rowMatch[1] ?? "", "r") ?? grid.length + 1);
    while (grid.length < rowNumber - 1 && grid.length <= MAX_LEDGER_ROWS + 50) grid.push([]);
    const row: string[] = [];
    let next = 0;
    for (const c of rowMatch[2].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? "";
      const ref = attr(attrs, "r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      if (col < 0 || col > 500) continue;
      const type = attr(attrs, "t") ?? "n";
      const body = c[2] ?? "";
      const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "inlineStr") value = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join("");
      else if (raw === undefined) value = "";
      else if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "str" || type === "e") value = type === "e" ? "" : xmlText(raw);
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (type === "d") value = raw.slice(0, 10);
      else {
        const n = Number(raw);
        if (!Number.isFinite(n)) value = raw;
        else if (dateStyles.has(Number(attr(attrs, "s") ?? -1))) value = excelSerialToIso(date1904 ? n + 1462 : n) ?? String(n);
        else value = String(Math.round(n * 1e6) / 1e6);
      }
      while (row.length < col) row.push("");
      row[col] = value.trim();
    }
    grid.push(row);
    if (grid.length > MAX_LEDGER_ROWS + 50) throw new LedgerError(`This sheet has more than ${MAX_LEDGER_ROWS.toLocaleString("en-US")} rows. Split it by year and check each part.`);
  }
  return grid;
}

/** Picks the parser from the file's first bytes, not from its name. */
export function readLedgerFile(bytes: Uint8Array, filename: string): Grid {
  if (bytes.byteLength > MAX_LEDGER_BYTES) throw new LedgerError("This file is larger than 25 MB. Export a shorter period and check it in parts.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseXlsx(bytes); // PK.. zip → xlsx
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new LedgerError("Old .xls files are not supported. In Excel choose File → Save As → .xlsx or CSV.");
  if (/\.(?:pdf|png|jpe?g|docx?)$/i.test(filename)) throw new LedgerError("This is not a spreadsheet. Upload a CSV or .xlsx export of paid invoices or bills.");
  return parseCsv(decodeText(bytes));
}

// ---------- understanding columns ----------

export type LedgerField = "vendor" | "number" | "date" | "amount" | "currency";
export type ColumnMap = Record<LedgerField, number | null>;

const SYNONYMS: Record<LedgerField, string[]> = {
  vendor: ["vendor name", "supplier name", "vendor", "supplier", "payee", "payee name", "contact name", "contact", "creditor", "company", "name", "поставщик", "контрагент", "наименование поставщика"],
  number: ["invoice number", "invoice no", "invoice #", "invoice num", "inv number", "inv no", "inv #", "bill number", "bill no", "bill #", "document number", "doc number", "doc no", "invoice", "reference", "ref number", "ref no", "ref", "num", "number", "no", "номер счета", "номер документа", "номер", "№"],
  date: ["invoice date", "bill date", "document date", "doc date", "transaction date", "txn date", "posting date", "date", "дата счета", "дата документа", "дата"],
  amount: ["invoice amount", "gross amount", "total amount", "invoice total", "bill amount", "original amount", "amount", "gross", "total", "debit", "value", "net amount", "net", "сумма", "итого", "сумма документа"],
  currency: ["currency", "currency code", "curr", "ccy", "валюта"],
};
const EXCLUDE: Record<LedgerField, RegExp | null> = {
  vendor: /customer|client|bank|account/,
  number: /\bpo\b|purchase|order|account|acct|check|cheque|phone|tax|vat|line/,
  date: /due|paid|payment|pay date|clear|created|modified|entered|delivery/,
  amount: /balance|paid|payment|tax|vat|gst|discount|due|open|credit|qty|quantity|rate|price/,
  currency: /rate/,
};

function headerKey(cell: string) {
  return cell.normalize("NFKC").toLowerCase().replace(/[._:()\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function mapRow(row: string[]): { map: ColumnMap; score: number } {
  const map: ColumnMap = { vendor: null, number: null, date: null, amount: null, currency: null };
  const taken = new Set<number>();
  let score = 0;
  for (const field of ["vendor", "date", "amount", "currency", "number"] as LedgerField[]) {
    let best: { col: number; rank: number } | null = null;
    row.forEach((cell, col) => {
      if (taken.has(col)) return;
      const key = headerKey(cell);
      if (!key || key.length > 40) return;
      if (EXCLUDE[field]?.test(key)) return;
      const rank = SYNONYMS[field].indexOf(key);
      if (rank >= 0 && (!best || rank < best.rank)) best = { col, rank };
    });
    if (best) { map[field] = (best as { col: number }).col; taken.add((best as { col: number }).col); score += 1; }
  }
  return { map, score };
}

/** Finds the header row (exports often start with a title block) and maps its columns. */
export function detectColumns(grid: Grid): { headerRow: number; map: ColumnMap; headers: string[] } {
  let best = { headerRow: -1, map: { vendor: null, number: null, date: null, amount: null, currency: null } as ColumnMap, score: 0 };
  for (let i = 0; i < Math.min(grid.length, 40); i += 1) {
    const { map, score } = mapRow(grid[i]);
    if (map.amount === null || (map.vendor === null && map.number === null)) continue;
    if (score > best.score) best = { headerRow: i, map, score };
  }
  if (best.headerRow < 0) {
    // No recognizable header: let the user map columns by hand from the first non-empty row.
    const first = grid.findIndex((r) => r.filter(Boolean).length >= 2);
    return { headerRow: Math.max(first, 0), map: best.map, headers: grid[Math.max(first, 0)] ?? [] };
  }
  return { headerRow: best.headerRow, map: best.map, headers: grid[best.headerRow] };
}

// ---------- rows ----------

export type LedgerRow = {
  line: number; // row number in the file, 1-based, as the user sees it
  vendor: string;
  number: string;
  dateRaw: string;
  date: string; // ISO when certain, "" otherwise
  amount: number;
  currency: string;
  merged: number; // how many split lines were combined into this invoice
};

export type Skipped = { noAmount: number; credits: number; noIdentity: number; totals: number };

export function parseAmount(raw: string): number | null {
  const text = raw.normalize("NFKC").replace(/ /g, " ").trim();
  if (!text || !/\d/.test(text)) return null;
  const negative = /^\(.*\)$/.test(text) || /^-|-$/.test(text.replace(/[^\d().,-]/g, "")) || /\bCR\b/i.test(text);
  let s = text.replace(/[^\d.,]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = Math.max(lastComma, lastDot);
    s = `${s.slice(0, decimal).replace(/[.,]/g, "")}.${s.slice(decimal + 1)}`;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const last = parts.at(-1) ?? "";
    // 1,234 → thousands; 12,5 or 12,50 → decimals; 1.234.567 → thousands.
    s = parts.length > 2 || (last.length === 3 && parts[0].length <= 3 && sep === ",") ? parts.join("") : `${parts.slice(0, -1).join("")}.${last}`;
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export function buildRows(grid: Grid, headerRow: number, map: ColumnMap, order: DateOrder | null, combineSplit: boolean | null = null) {
  const skipped: Skipped = { noAmount: 0, credits: 0, noIdentity: 0, totals: 0 };
  if (map.amount === null) throw new LedgerError("Choose which column holds the invoice amount.");
  if (map.vendor === null && map.number === null) throw new LedgerError("Choose the supplier column or the invoice number column.");
  const body = grid.slice(headerRow + 1);
  // Day/month order: the user's choice, else proof from the column (a 25 in one
  // position). Without proof it defaults to month-first and is reported as
  // uncertain so the user is asked to confirm it.
  const dateColumn = map.date !== null ? body.map((r) => r[map.date!]) : [];
  const proven = order ?? inferDateOrder(dateColumn);
  const effectiveOrder: DateOrder = proven ?? "mdy";
  const orderCertain = proven !== null || !dateColumn.some((v) => dateCandidates(v).length > 1);
  const cellAt = (r: string[], col: number | null) => (col === null ? "" : (r[col] ?? "").trim());

  const raw: LedgerRow[] = [];
  let dataRows = 0;
  body.forEach((r, index) => {
    if (!r.some(Boolean)) return;
    dataRows += 1;
    const vendor = cellAt(r, map.vendor);
    const number = cellAt(r, map.number);
    const amount = parseAmount(cellAt(r, map.amount));
    const firstText = (r.find(Boolean) ?? "").toLowerCase();
    if (/^(?:grand\s+)?total\b|^итого|^всего|^subtotal/.test(firstText) || /^total\b/i.test(vendor)) { skipped.totals += 1; return; }
    if (amount === null) { skipped.noAmount += 1; return; }
    if (amount <= 0) { skipped.credits += 1; return; }
    if (!vendor && !number) { skipped.noIdentity += 1; return; }
    const dateRaw = cellAt(r, map.date);
    const candidates = dateCandidates(dateRaw, effectiveOrder);
    raw.push({
      line: headerRow + index + 2,
      vendor: map.vendor === null ? "(all rows)" : vendor,
      number,
      dateRaw,
      date: candidates.length === 1 ? candidates[0] : "",
      amount: Math.round(amount * 100) / 100,
      currency: cellAt(r, map.currency).toUpperCase(),
      merged: 1,
    });
  });

  // Some exports list one bill on several lines (one per expense account). When
  // that is clearly the file's style, the lines are combined into one invoice;
  // otherwise same-number rows stay separate so a re-entered bill is not hidden.
  const sameBill = (x: LedgerRow, y: LedgerRow) => Boolean(x.number && y.number)
    && invoiceNumberKey(x.number) === invoiceNumberKey(y.number)
    && (supplierNameKey(x.vendor) || x.vendor) === (supplierNameKey(y.vendor) || y.vendor)
    && (x.date || x.dateRaw) === (y.date || y.dateRaw);
  const splitPairs = raw.filter((row, i) => i > 0 && row.line - raw[i - 1].line === 1 && sameBill(row, raw[i - 1]) && row.amount !== raw[i - 1].amount).length;
  const combine = combineSplit ?? (raw.length >= 10 && splitPairs / raw.length > 0.15);
  if (!combine) return { rows: raw, skipped, order: effectiveOrder, orderCertain, dataRows, combined: false, splitPairs };

  const rows: LedgerRow[] = [];
  let lastLine = -1;
  for (const row of raw) {
    const previous = rows.at(-1);
    if (previous && row.line - lastLine === 1 && sameBill(row, previous)) {
      previous.amount = Math.round((previous.amount + row.amount) * 100) / 100;
      previous.merged += 1;
    } else rows.push({ ...row });
    lastLine = row.line;
  }
  return { rows, skipped, order: effectiveOrder, orderCertain, dataRows, combined: true, splitPairs };
}

// ---------- findings ----------

export type FindingType = DuplicateMatchType | "unusual_frequency";
export type Finding = {
  type: FindingType;
  vendor: string;
  rows: LedgerRow[];
  signals: string[];
  /** Money that may have been paid more than once; null when the amounts differ. */
  exposure: number | null;
};

const field = (value: string | number | null) => ({ value, confidence: 1, evidence: "" });

function asInvoice(row: LedgerRow): InvoiceData {
  return {
    supplier_name: field(row.vendor),
    supplier_bin: field(null),
    invoice_number: field(row.number || null),
    po_number: field(null),
    invoice_date: field(row.date || row.dateRaw || null),
    currency: field(row.currency || null),
    subtotal: field(null),
    vat: field(null),
    total: field(row.amount),
    line_items: [],
  };
}

const FINDING_RANK: Record<FindingType, number> = { ...MATCH_RANK, unusual_frequency: 4 };
const BIG_BUCKET = 300;
const NEIGHBOURS = 30;

export function findLedgerDuplicates(rows: LedgerRow[]): Finding[] {
  const invoices = rows.map(asInvoice);
  const byVendor = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const key = supplierNameKey(row.vendor) || `raw:${row.vendor.toLowerCase()}`;
    let list = byVendor.get(key);
    if (!list) byVendor.set(key, list = []);
    list.push(i);
  });

  const pairs = new Map<string, { a: number; b: number; type: DuplicateMatchType; signals: string[] }>();
  const compare = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (pairs.has(key)) return;
    const match = duplicateCandidate(invoices[a], invoices[b]);
    if (match) pairs.set(key, { a: Math.min(a, b), b: Math.max(a, b), type: match.matchType, signals: match.signals });
  };
  const compareBucket = (bucket: number[]) => {
    if (bucket.length < 2) return;
    if (bucket.length <= BIG_BUCKET) {
      for (let i = 0; i < bucket.length; i += 1) for (let j = i + 1; j < bucket.length; j += 1) compare(bucket[i], bucket[j]);
      return;
    }
    // A supplier with hundreds of identical amounts (a flat fee): compare neighbours in time only.
    const sorted = [...bucket].sort((x, y) => (rows[x].date || "").localeCompare(rows[y].date || ""));
    for (let i = 0; i < sorted.length; i += 1) for (let j = i + 1; j < Math.min(sorted.length, i + 1 + NEIGHBOURS); j += 1) compare(sorted[i], sorted[j]);
  };

  for (const indexes of byVendor.values()) {
    if (indexes.length < 2) continue;
    const byAmount = new Map<number, number[]>();
    const byNumber = new Map<string, number[]>();
    for (const i of indexes) {
      const cents = Math.round(rows[i].amount * 100);
      (byAmount.get(cents) ?? byAmount.set(cents, []).get(cents)!).push(i);
      const numberKey = invoiceNumberKey(rows[i].number);
      if (numberKey) (byNumber.get(numberKey) ?? byNumber.set(numberKey, []).get(numberKey)!).push(i);
    }
    for (const bucket of byAmount.values()) compareBucket(bucket);
    for (const bucket of byNumber.values()) compareBucket(bucket);
  }

  // Three copies of one invoice are one finding, not three pairs.
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const p of pairs.values()) parent[find(p.a)] = find(p.b);
  const groups = new Map<number, { members: Set<number>; type: DuplicateMatchType; signals: Set<string> }>();
  for (const p of pairs.values()) {
    const root = find(p.a);
    let g = groups.get(root);
    if (!g) groups.set(root, g = { members: new Set(), type: p.type, signals: new Set() });
    g.members.add(p.a); g.members.add(p.b);
    if (MATCH_RANK[p.type] < MATCH_RANK[g.type]) g.type = p.type;
    p.signals.forEach((s) => g!.signals.add(s));
  }

  const findings: Finding[] = [];
  const flagged = new Set<number>();
  for (const g of groups.values()) {
    const members = [...g.members].sort((a, b) => rows[a].line - rows[b].line).map((i) => { flagged.add(i); return rows[i]; });
    const amounts = members.map((r) => r.amount);
    const sameMoney = Math.max(...amounts) - Math.min(...amounts) <= 0.011;
    findings.push({
      type: g.type,
      vendor: members[0].vendor,
      rows: members,
      signals: [...g.signals],
      exposure: g.type !== "number_reused" && sameMoney ? Math.round(amounts[0] * (members.length - 1) * 100) / 100 : null,
    });
  }

  // A supplier who bills the same amount monthly and then twice within days:
  // the references differ, so nothing above fires, but the rhythm is broken.
  for (const indexes of byVendor.values()) {
    const byAmount = new Map<number, number[]>();
    for (const i of indexes) if (rows[i].date) {
      const cents = Math.round(rows[i].amount * 100);
      (byAmount.get(cents) ?? byAmount.set(cents, []).get(cents)!).push(i);
    }
    for (const bucket of byAmount.values()) {
      if (bucket.length < 4 || bucket.length > BIG_BUCKET) continue;
      const sorted = [...bucket].sort((x, y) => rows[x].date.localeCompare(rows[y].date));
      const gaps = sorted.slice(1).map((i, k) => (Date.parse(rows[i].date) - Date.parse(rows[sorted[k]].date)) / 86_400_000);
      const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
      if (median < 20) continue;
      gaps.forEach((gap, k) => {
        const a = sorted[k];
        const b = sorted[k + 1];
        if (gap > Math.max(3, median * 0.25) || (flagged.has(a) && flagged.has(b))) return;
        findings.push({
          type: "unusual_frequency",
          vendor: rows[a].vendor,
          rows: [rows[a], rows[b]].sort((x, y) => x.line - y.line),
          signals: ["supplier", "total", `usually billed every ~${Math.round(median)} days, here ${Math.round(gap)} day${Math.round(gap) === 1 ? "" : "s"} apart`],
          exposure: rows[a].amount,
        });
      });
    }
  }

  return findings.sort((x, y) => FINDING_RANK[x.type] - FINDING_RANK[y.type] || (y.exposure ?? 0) - (x.exposure ?? 0));
}

export type LedgerSummary = {
  dataRows: number;
  invoices: number;
  vendors: number;
  skipped: Skipped;
  findings: Record<FindingType, number>;
  /** Exact and changed-reference duplicates only: the strongest evidence. */
  likelyOverpaid: number;
  dateOrder: DateOrder;
  /** False when every date could be read both ways and the order is a guess. */
  dateOrderCertain: boolean;
  undatedRows: number;
  /** True when several lines of one bill were combined into one invoice. */
  combinedSplitLines: boolean;
};

export function summarize(rows: LedgerRow[], findings: Finding[], skipped: Skipped, dataRows: number, dateOrder: DateOrder, dateOrderCertain: boolean, combinedSplitLines = false): LedgerSummary {
  const counts: Record<FindingType, number> = { exact: 0, number_reused: 0, similar_reference: 0, same_amount_date: 0, unusual_frequency: 0 };
  let likelyOverpaid = 0;
  for (const f of findings) {
    counts[f.type] += 1;
    if ((f.type === "exact" || f.type === "similar_reference") && f.exposure) likelyOverpaid += f.exposure;
  }
  return {
    dataRows,
    invoices: rows.length,
    vendors: new Set(rows.map((r) => supplierNameKey(r.vendor) || r.vendor.toLowerCase())).size,
    skipped,
    findings: counts,
    likelyOverpaid: Math.round(likelyOverpaid * 100) / 100,
    dateOrder,
    dateOrderCertain,
    undatedRows: rows.filter((r) => !r.date).length,
    combinedSplitLines,
  };
}

function safeCell(value: unknown) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula-injection defense
  return `"${s.replace(/"/g, '""')}"`;
}

export const FINDING_LABELS: Record<FindingType, string> = {
  exact: "Same invoice entered twice",
  number_reused: "Same number, different amount",
  similar_reference: "Slightly changed invoice number",
  same_amount_date: "Same supplier, amount and date",
  unusual_frequency: "Billed sooner than usual",
};

export function findingsCsv(findings: Finding[]) {
  const lines = [["finding", "type", "supplier", "file_row", "invoice_number", "invoice_date", "amount", "currency", "possible_overpayment", "why"]];
  findings.forEach((f, index) => {
    f.rows.forEach((r, k) => lines.push([
      String(index + 1), FINDING_LABELS[f.type], r.vendor, String(r.line), r.number, r.date || r.dateRaw, r.amount.toFixed(2), r.currency,
      k === 0 && f.exposure !== null ? f.exposure.toFixed(2) : "", k === 0 ? f.signals.join("; ") : "",
    ]));
  });
  return "﻿" + lines.map((row) => row.map(safeCell).join(",")).join("\r\n");
}

/** Whole pipeline for one file with automatic column and date-order detection. */
export function auditLedger(grid: Grid, overrides?: { headerRow?: number; map?: ColumnMap; order?: DateOrder | null; combineSplit?: boolean | null }) {
  const detected = detectColumns(grid);
  const headerRow = overrides?.headerRow ?? detected.headerRow;
  const map = overrides?.map ?? detected.map;
  const built = buildRows(grid, headerRow, map, overrides?.order ?? null, overrides?.combineSplit ?? null);
  const findings = findLedgerDuplicates(built.rows);
  return { headerRow, map, headers: grid[headerRow] ?? [], rows: built.rows, findings, summary: summarize(built.rows, findings, built.skipped, built.dataRows, built.order, built.orderCertain, built.combined) };
}
