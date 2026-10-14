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
  if (a.length < 4 || b.length < 4) return false;
  return oneEditApart(a, b) || adjacentTransposition(a, b);
}

function duplicateCandidate(current: InvoiceData, candidate: InvoiceData) {
  const currentNumber = normalizeInvoiceNumber(current.invoice_number.value);
  const candidateNumber = normalizeInvoiceNumber(candidate.invoice_number.value);
  if (!currentNumber || !candidateNumber) return null;

  const currentSupplier = supplierKey(current);
  const candidateSupplier = supplierKey(candidate);
  if (!currentSupplier || currentSupplier !== candidateSupplier) return null;

  if (currentNumber === candidateNumber) {
    return { matchType: "exact" as const, signals: ["supplier", "invoice number"] };
  }

  if (!similarInvoiceNumber(currentNumber, candidateNumber)) return null;

  const amountMatches = sameAmount(invoiceTotal(current), invoiceTotal(candidate));
  const currentDate = normalizeInvoiceDate(current.invoice_date.value);
  const candidateDate = normalizeInvoiceDate(candidate.invoice_date.value);
  const bothDatesKnown = Boolean(currentDate && candidateDate);
  const dateMatches = bothDatesKnown && currentDate === candidateDate;
  const currentCurrency = String(current.currency.value ?? "").trim().toUpperCase();
  const candidateCurrency = String(candidate.currency.value ?? "").trim().toUpperCase();
  const bothCurrenciesKnown = Boolean(currentCurrency && candidateCurrency);
  const currencyMatches = bothCurrenciesKnown && currentCurrency === candidateCurrency;

  if (!amountMatches || (bothDatesKnown && !dateMatches) || (bothCurrenciesKnown && !currencyMatches)) return null;

  const signals = ["supplier", "similar invoice number", "total"];
  if (dateMatches) signals.push("date");
  if (currencyMatches) signals.push("currency");
  return { matchType: "similar_reference" as const, signals };
}

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
        matchType: "exact" | "similar_reference";
        signals: string[];
      }
    | null
    | undefined = undefined;

  // Duplicate detection is intentionally local to one review/shipment.
  // A document uploaded in Test-001 must not haunt Test-002/Test-003.
  // If a legacy standalone document has no shipment, we skip duplicate history
  // instead of comparing it against every invoice in the organization.
  if (organizationId && shipmentId && currentNumber && currentSupplier) {
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
