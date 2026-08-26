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

export async function validateInvoiceForDocument({
  documentId,
  organizationId,
  data,
  extraction,
  humanConfirmed = false,
}: {
  documentId: string;
  organizationId: string | null | undefined;
  data: InvoiceData;
  extraction?: ExtractionAssessment;
  humanConfirmed?: boolean;
}): Promise<ValidationResult> {
  const currentNumber = normalizeInvoiceNumber(data.invoice_number.value);
  const currentSupplier = supplierKey(data);
  let duplicateInvoice:
    | { documentId: string; filename: string; invoiceNumber: string }
    | null
    | undefined = undefined;

  if (organizationId && currentNumber && currentSupplier) {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("documents")
      .select("id,original_filename,extracted_data,status")
      .eq("organization_id", organizationId)
      .neq("id", documentId)
      .in("status", ["ready", "reviewed"])
      .not("extracted_data", "is", null)
      .limit(500);

    if (!error) {
      duplicateInvoice = null;
      for (const row of rows || []) {
        const extracted = asInvoiceData(row.extracted_data);
        if (!extracted) continue;
        const candidateNumber = normalizeInvoiceNumber(extracted.invoice_number.value);
        const candidateSupplier = supplierKey(extracted);
        if (candidateNumber && candidateSupplier && candidateNumber === currentNumber && candidateSupplier === currentSupplier) {
          duplicateInvoice = {
            documentId: row.id,
            filename: row.original_filename,
            invoiceNumber: String(extracted.invoice_number.value ?? ""),
          };
          break;
        }
      }
    } else {
      console.warn("Could not check invoice history", { documentId, organizationId, error: error.message });
    }
  }

  const effectiveExtraction = extraction ?? assessStructuredInvoice(data, "", humanConfirmed);
  return validateInvoiceBusiness(data, {
    duplicateInvoice,
    humanConfirmed,
    extraction: effectiveExtraction,
  });
}
