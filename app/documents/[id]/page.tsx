import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InvoiceData } from "@/lib/invoice";
import {
  analyzeInvoice,
  INVOICE_ENGINE_VERSION,
} from "@/lib/invoice-runtime";
import type { ValidationResult } from "@/lib/invoice-reliability";
import { validateInvoiceForDocument } from "@/lib/invoice-history";
import { DashboardShell } from "@/components/dashboard-shell";
import { DocumentReview } from "@/components/document-review";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function needsEngineRefresh(validation: unknown) {
  if (!validation || typeof validation !== "object") return true;
  return (validation as { engine_version?: unknown }).engine_version !== INVOICE_ENGINE_VERSION;
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
  const readyForValidation = Boolean(document.raw_ocr_text) && ["ready", "reviewed"].includes(document.status);

  if (readyForValidation && needsEngineRefresh(document.validation_data)) {
    const analysis = analyzeInvoice(document.raw_ocr_text || "");
    const validation = await validateInvoiceForDocument({
      documentId: id,
      organizationId: document.organization_id,
      data: analysis.data,
      extraction: analysis.extraction,
    });
    const versionedValidation = { ...validation, engine_version: INVOICE_ENGINE_VERSION };

    document = {
      ...document,
      extracted_data: analysis.data,
      validation_data: versionedValidation,
    };

    try {
      const admin = createAdminClient();
      await admin
        .from("documents")
        .update({ extracted_data: analysis.data, validation_data: versionedValidation })
        .eq("id", id)
        .eq("owner_id", user.id);
    } catch (error) {
      console.warn("Could not persist refreshed document analysis", { documentId: id, error });
    }
  } else if (readyForValidation && document.extracted_data) {
    const existingValidation = document.validation_data as ValidationResult | null;
    const validation = await validateInvoiceForDocument({
      documentId: id,
      organizationId: document.organization_id,
      data: document.extracted_data as unknown as InvoiceData,
      extraction: existingValidation?.extraction,
      humanConfirmed: document.status === "reviewed",
    });
    document = { ...document, validation_data: { ...validation, engine_version: INVOICE_ENGINE_VERSION } };
  }

  return (
    <DashboardShell email={user.email || "account"}>
      <DocumentReview document={document as any} />
    </DashboardShell>
  );
}
