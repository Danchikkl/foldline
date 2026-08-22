import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractInvoice, type InvoiceData } from "@/lib/invoice";
import { validateInvoiceForDocument } from "@/lib/invoice-history";
import { DashboardShell } from "@/components/dashboard-shell";
import { DocumentReview } from "@/components/document-review";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function needsParserRefresh(document: any) {
  if (!document.extracted_data) return true;
  if (!("po_number" in document.extracted_data)) return true;

  const supplier = document.extracted_data?.supplier_name?.value;
  if (typeof supplier === "string" && /\.(?:pdf|png|jpe?g|webp)$/i.test(supplier.trim())) return true;

  const lineItems = document.extracted_data?.line_items;
  const raw = String(document.raw_ocr_text || "");
  if (Array.isArray(lineItems) && lineItems.length === 0 && /description\s+qty\s+unit\s+price\s+amount/i.test(raw)) return true;

  return false;
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("documents")
    .select("id,organization_id,original_filename,content_type,status,raw_ocr_text,extracted_data,validation_data,error_message,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  let document = data;
  const readyForValidation = document.raw_ocr_text && ["ready", "reviewed"].includes(document.status);

  if (readyForValidation && needsParserRefresh(document)) {
    const extracted = extractInvoice(document.raw_ocr_text || "");
    const validation = await validateInvoiceForDocument({
      documentId: id,
      organizationId: document.organization_id,
      data: extracted,
    });

    document = {
      ...document,
      extracted_data: extracted,
      validation_data: validation,
    };

    try {
      const admin = createAdminClient();
      await admin
        .from("documents")
        .update({ extracted_data: extracted, validation_data: validation })
        .eq("id", id)
        .eq("owner_id", user.id);
    } catch (error) {
      console.warn("Could not persist refreshed structured OCR data", { documentId: id, error });
    }
  } else if (readyForValidation && document.extracted_data) {
    const validation = await validateInvoiceForDocument({
      documentId: id,
      organizationId: document.organization_id,
      data: document.extracted_data as unknown as InvoiceData,
    });
    document = { ...document, validation_data: validation };
  }

  return (
    <DashboardShell email={user.email || "account"}>
      <DocumentReview document={document as any} />
    </DashboardShell>
  );
}
