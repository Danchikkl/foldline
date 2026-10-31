import { createAdminClient } from "@/lib/supabase/admin";
import type { InvoiceData } from "@/lib/invoice";
import {
  assessStructuredInvoice,
  validateInvoiceBusiness,
  type ExtractionAssessment,
  type ValidationResult,
} from "@/lib/invoice-reliability";

function normalizeInvoiceNumber(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/(^|[^0-9])0+(?=\d)/g, "$1")
    .replace(/[\s._'’`-]+/g, "")
    .replace(/[^A-ZА-ЯЁ0-9]/g, "");
}

function normalizeSupplierName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/\b(?:LLP|LTD|LIMITED|INC|CORP|CORPORATION|TOO|ТОО|ИП)\b/g, "")
    .replace(/[^A-ZА-ЯЁ0-9]/g, "");
}

function supplierKey(data: InvoiceData) {
  const bin = String(data.supplier_bin.value ?? "").trim();
  if (/^\d{12}$/.test(bin)) return `bin:${bin}`;
  const name = normalizeSupplierName(data.supplier_name.value);
  return name.length >= 3 ? `name:${name}` : "";
}

function asInvoiceData(value: unknown): InvoiceData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<InvoiceData>;
  if (!data.invoice_number || !data.supplier_name || !Array.isArray(data.line_items)) return null;
  return data as InvoiceData;
}

function invoiceTotal(data: InvoiceData) {
  return typeof data.total.value === "number" && Number.isFinite(data.total.value) ? data.total.value : null;
}

function sameAmount(a: number | null, b: number | null) {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.001);
}

function normalizeInvoiceDate(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/);
  if (!match) return "";
  const [, a, b, c] = match;
  if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
  if (c.length === 4) return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  return "";
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

const NEAR_DUPLICATE_MAX_DAYS = 60;
const SEQUENCE_MAX_DAYS = 7;

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export function duplicateCandidate(current: InvoiceData, candidate: InvoiceData) {
  const currentNumber = normalizeInvoiceNumber(current.invoice_number.value);
  const candidateNumber = normalizeInvoiceNumber(candidate.invoice_number.value);

  const currentSupplier = supplierKey(current);
  const candidateSupplier = supplierKey(candidate);
  if (!currentSupplier || currentSupplier !== candidateSupplier) return null;

  const amountMatches = sameAmount(invoiceTotal(current), invoiceTotal(candidate));
  const bothTotalsKnown = invoiceTotal(current) !== null && invoiceTotal(candidate) !== null;
  const currentDate = normalizeInvoiceDate(current.invoice_date.value);
  const candidateDate = normalizeInvoiceDate(candidate.invoice_date.value);
  const bothDatesKnown = Boolean(currentDate && candidateDate);
  const dateMatches = bothDatesKnown && currentDate === candidateDate;
  const days = bothDatesKnown ? daysBetween(currentDate, candidateDate) : null;
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
  if (currentNumber && candidateNumber && currentNumber === candidateNumber) {
    if (bothTotalsKnown && !amountMatches) {
      // Same number, different amount: a revised invoice or a reused number.
      return { matchType: "number_reused" as const, signals: ["supplier", "invoice number", "different total"] };
    }
    return { matchType: "exact" as const, signals: ["supplier", "invoice number", ...(amountMatches ? ["total"] : []), ...extras()] };
  }

  // Slightly changed reference + same money + plausible timing.
  if (currentNumber && candidateNumber && amountMatches && currencyCompatible && similarInvoiceNumber(currentNumber, candidateNumber)) {
    // INV-10234 -> INV-10235 with the same amount is usually the next invoice in
    // a recurring series (rent, subscription). Only flag a digits-only change
    // when both dates are known and within a week.
    const digitsOnlyChange = currentNumber.replace(/\d/g, "") === candidateNumber.replace(/\d/g, "");
    const withinWindow = days === null || days <= NEAR_DUPLICATE_MAX_DAYS;
    const sequenceLike = digitsOnlyChange && (days === null || days > SEQUENCE_MAX_DAYS);
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

const MATCH_RANK = { exact: 0, number_reused: 1, similar_reference: 2, same_amount_date: 3 } as const;

export async function validateInvoiceForDocument({
  documentId,
  organizationId,
  shipmentId,
  data,
  extraction,
  humanConfirmed = false,
}: {
  documentId: string;
  organizationId: string | null | undefined;
  shipmentId?: string | null;
  data: InvoiceData;
  extraction?: ExtractionAssessment;
  humanConfirmed?: boolean;
}): Promise<ValidationResult> {
  const currentNumber = normalizeInvoiceNumber(data.invoice_number.value);
  const currentSupplier = supplierKey(data);
  let duplicateInvoice:
    | {
        documentId: string;
        filename: string;
        invoiceNumber: string;
        matchType: "exact" | "similar_reference" | "number_reused" | "same_amount_date";
        signals: string[];
      }
    | null
    | undefined = undefined;

  // Duplicate detection is intentionally local to one review/shipment.
  // A document uploaded in Test-001 must not haunt Test-002/Test-003.
  // If a legacy standalone document has no shipment, we skip duplicate history
  // instead of comparing it against every invoice in the organization.
  if (organizationId && shipmentId && currentSupplier && (currentNumber || invoiceTotal(data) !== null)) {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("documents")
      .select("id,original_filename,extracted_data,status")
      .eq("organization_id", organizationId)
      .eq("shipment_id", shipmentId)
      .neq("id", documentId)
      .in("status", ["ready", "reviewed"])
      .not("extracted_data", "is", null)
      .limit(500);

    if (!error) {
      duplicateInvoice = null;
      for (const row of rows || []) {
        const extracted = asInvoiceData(row.extracted_data);
        if (!extracted) continue;
        const match = duplicateCandidate(data, extracted);
        if (!match) continue;
        // Keep the strongest match: exact > number reused > changed reference > same amount+date.
        if (duplicateInvoice && MATCH_RANK[duplicateInvoice.matchType] <= MATCH_RANK[match.matchType]) continue;
        duplicateInvoice = {
          documentId: row.id,
          filename: row.original_filename,
          invoiceNumber: String(extracted.invoice_number.value ?? ""),
          matchType: match.matchType,
          signals: match.signals,
        };
        if (match.matchType === "exact") break;
      }
    } else {
      console.warn("Could not check invoice history", { documentId, organizationId, shipmentId, error: error.message });
    }
  }

  const effectiveExtraction = extraction ?? assessStructuredInvoice(data, "", humanConfirmed);
  return validateInvoiceBusiness(data, {
    duplicateInvoice,
    humanConfirmed,
    extraction: effectiveExtraction,
  });
}
