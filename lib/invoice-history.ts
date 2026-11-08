import { createAdminClient } from "@/lib/supabase/admin";
import type { InvoiceData } from "@/lib/invoice";
import {
  assessStructuredInvoice,
  validateInvoiceBusiness,
  type ExtractionAssessment,
  type ValidationResult,
} from "@/lib/invoice-reliability";

import { asInvoiceData, findStrongestDuplicate, invoiceTotal, normalizeInvoiceNumber, supplierKey, type DuplicateHit } from "@/lib/invoice-duplicates";

export { duplicateCandidate } from "@/lib/invoice-duplicates";


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
  let duplicateInvoice: DuplicateHit | null | undefined = undefined;

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
      const candidates = (rows || []).flatMap((row) => {
        const extracted = asInvoiceData(row.extracted_data);
        return extracted ? [{ id: row.id as string, filename: row.original_filename as string, data: extracted }] : [];
      });
      duplicateInvoice = findStrongestDuplicate(data, candidates);
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
