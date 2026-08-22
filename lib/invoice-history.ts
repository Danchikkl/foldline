import { createAdminClient } from "@/lib/supabase/admin";
import { validateInvoice, type InvoiceData, type ValidationResult } from "@/lib/invoice";

function normalizeInvoiceNumber(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function validateInvoiceForDocument({
  documentId,
  organizationId,
  data,
}: {
  documentId: string;
  organizationId: string | null | undefined;
  data: InvoiceData;
}): Promise<ValidationResult> {
  const currentNumber = normalizeInvoiceNumber(data.invoice_number.value);
  let duplicateInvoice:
    | { documentId: string; filename: string; invoiceNumber: string }
    | null
    | undefined = undefined;

  if (organizationId && currentNumber) {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("documents")
      .select("id,original_filename,extracted_data")
      .eq("organization_id", organizationId)
      .neq("id", documentId)
      .not("extracted_data", "is", null)
      .limit(500);

    if (!error) {
      duplicateInvoice = null;
      for (const row of rows || []) {
        const extracted = row.extracted_data as { invoice_number?: { value?: unknown } } | null;
        const candidate = normalizeInvoiceNumber(extracted?.invoice_number?.value);
        if (candidate && candidate === currentNumber) {
          duplicateInvoice = {
            documentId: row.id,
            filename: row.original_filename,
            invoiceNumber: String(extracted?.invoice_number?.value ?? ""),
          };
          break;
        }
      }
    } else {
      console.warn("Could not check invoice history", { documentId, organizationId, error: error.message });
    }
  }

  return validateInvoice(data, { duplicateInvoice });
}
